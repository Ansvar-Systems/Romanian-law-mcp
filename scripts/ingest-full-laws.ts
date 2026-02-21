#!/usr/bin/env tsx
/**
 * Full-corpus ingestion for Romanian LEGE documents (DocumentType=1).
 *
 * Source portal:
 *   https://legislatie.just.ro/Public/RezultateCautare?page={N}&rezultatePerPagina=5&tipdoc=1
 *
 * Notes:
 * - Uses the official portal only.
 * - Uses global request rate limiting from fetcher.ts (>=1200ms/request).
 * - Is resumable by page and idempotent by seed file existence.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchLegislation } from './lib/fetcher.js';
import { parseRomanianLawHtml, TARGET_LAWS, type LawTarget } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const SOURCE_DIR = path.resolve(__dirname, '../data/source/full-laws');
const STATE_DIR = path.resolve(__dirname, '../data/full-corpus');
const INDEX_PATH = path.join(STATE_DIR, 'full-laws-index.ndjson');
const SKIP_PATH = path.join(STATE_DIR, 'full-laws-skipped.ndjson');

// rezultatePerPagina codes in portal:
// 1 -> 10 rows, 2 -> 20 rows, 3 -> 30 rows, 4 -> 40 rows, 5 -> 50 rows
// Different codes may fail on isolated pages (HTTP 500).
// We therefore support reruns with different codes and dedupe document IDs.
const DEFAULT_PAGE_SIZE_CODE = 3;

interface CliArgs {
  pageSizeCode: number;
  signedFrom?: string;
  signedTo?: string;
  startPage?: number;
  endPage?: number;
  maxDocs?: number;
  indexOnly: boolean;
  resume: boolean;
  refreshIndex: boolean;
  forceRefetch: boolean;
  quiet: boolean;
}

interface RunState {
  lastCompletedPage: number;
  totalPages: number;
  processedDocs: number;
  skippedDocs: number;
  pageSizeCode: number;
  updatedAt: string;
}

interface SearchEntry {
  documentId: number;
  listPosition: number;
  listingLabel: string;
  page: number;
}

interface TargetProfile {
  id: string;
  seedFile: string;
  documentId: number;
  title_en: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  description: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    pageSizeCode: DEFAULT_PAGE_SIZE_CODE,
    indexOnly: false,
    resume: true,
    refreshIndex: false,
    forceRefetch: false,
    quiet: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--start-page' && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isNaN(parsed) && parsed > 0) result.startPage = parsed;
      i += 1;
      continue;
    }

    if (arg === '--page-size-code' && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 5) result.pageSizeCode = parsed;
      i += 1;
      continue;
    }

    if (arg === '--signed-from' && next) {
      result.signedFrom = next;
      i += 1;
      continue;
    }

    if (arg === '--signed-to' && next) {
      result.signedTo = next;
      i += 1;
      continue;
    }

    if (arg === '--end-page' && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isNaN(parsed) && parsed > 0) result.endPage = parsed;
      i += 1;
      continue;
    }

    if (arg === '--max-docs' && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isNaN(parsed) && parsed > 0) result.maxDocs = parsed;
      i += 1;
      continue;
    }

    if (arg === '--index-only') {
      result.indexOnly = true;
      continue;
    }

    if (arg === '--no-resume') {
      result.resume = false;
      continue;
    }

    if (arg === '--refresh-index') {
      result.refreshIndex = true;
      continue;
    }

    if (arg === '--force-refetch') {
      result.forceRefetch = true;
      continue;
    }

    if (arg === '--quiet') {
      result.quiet = true;
      continue;
    }
  }

  return result;
}

function ensureDirs(): void {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function decodeHtmlEntities(text: string): string {
  const map: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    shy: '',
  };

  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const cp = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    if (entity.startsWith('#')) {
      const cp = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return map[entity] ?? m;
  });
}

function normalizeWhitespace(text: string): string {
  return decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();
}

function sanitizeStateSuffix(value: string): string {
  return value.replace(/[^0-9A-Za-z]+/g, '-').replace(/^-+|-+$/g, '');
}

function statePathForContext(pageSizeCode: number, signedFrom?: string, signedTo?: string): string {
  const parts = [`p${pageSizeCode}`];
  if (signedFrom) parts.push(`sf-${sanitizeStateSuffix(signedFrom)}`);
  if (signedTo) parts.push(`st-${sanitizeStateSuffix(signedTo)}`);
  return path.join(STATE_DIR, `full-laws-state-${parts.join('-')}.json`);
}

function searchBaseForCode(pageSizeCode: number, signedFrom?: string, signedTo?: string): string {
  let url = `https://legislatie.just.ro/Public/RezultateCautare?rezultatePerPagina=${pageSizeCode}&tipdoc=1`;
  if (signedFrom) url += `&semnatinceputtext=${encodeURIComponent(signedFrom)}`;
  if (signedTo) url += `&semnatsfarsittext=${encodeURIComponent(signedTo)}`;
  return url;
}

function loadState(pageSizeCode: number, signedFrom?: string, signedTo?: string): RunState | null {
  const statePath = statePathForContext(pageSizeCode, signedFrom, signedTo);
  if (!fs.existsSync(statePath)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as RunState;
    if (state.pageSizeCode !== pageSizeCode) return null;
    return state;
  } catch {
    return null;
  }
}

function saveState(pageSizeCode: number, state: RunState, signedFrom?: string, signedTo?: string): void {
  fs.writeFileSync(statePathForContext(pageSizeCode, signedFrom, signedTo), `${JSON.stringify(state, null, 2)}\n`);
}

function appendNdjson(filePath: string, record: unknown): void {
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

async function fetchSearchPage(pageSizeCode: number, page: number, signedFrom?: string, signedTo?: string): Promise<string> {
  const url = `${searchBaseForCode(pageSizeCode, signedFrom, signedTo)}&page=${page}`;
  const response = await fetchLegislation(url);
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  return response.body;
}

function parseTotalPages(html: string): number {
  const lastLink = html.match(/PagedList-skipToLast\"><a href=\"[^\"]*page=(\d+)/i);
  if (lastLink?.[1]) return Number.parseInt(lastLink[1], 10);

  const pages = Array.from(html.matchAll(/\/Public\/RezultateCautare\?[^"]*page=(\d+)/gi))
    .map(m => Number.parseInt(m[1], 10))
    .filter(n => !Number.isNaN(n) && n > 0);

  if (pages.length === 0) return 1;
  return Math.max(...pages);
}

function parseSearchEntries(html: string, page: number): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const seen = new Set<number>();
  const pattern = /<a href=\"\/Public\/DetaliiDocument\/(\d+)\">\s*(\d+)\.\s*([^<]+)<\/a>/gi;

  let match = pattern.exec(html);
  while (match) {
    const documentId = Number.parseInt(match[1], 10);
    const listPosition = Number.parseInt(match[2], 10);
    const listingLabel = normalizeWhitespace(match[3]);

    if (!Number.isNaN(documentId) && !seen.has(documentId)) {
      seen.add(documentId);
      entries.push({ documentId, listPosition, listingLabel, page });
    }

    match = pattern.exec(html);
  }

  return entries;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function profileForEntry(entry: SearchEntry, curatedByDocId: Map<number, LawTarget>): TargetProfile {
  const curated = curatedByDocId.get(entry.documentId);
  if (curated) {
    return {
      id: curated.id,
      seedFile: curated.seedFile,
      documentId: curated.documentId,
      title_en: curated.title_en,
      short_name: curated.short_name,
      status: curated.status,
      description: curated.description,
    };
  }

  const raw = normalizeWhitespace(entry.listingLabel);
  const id = `law-doc-${entry.documentId}`;
  const seedFile = `${id}.json`;

  // Listing label is Romanian and may contain only shorthand; avoid inventing English titles.
  const shortName = slugify(raw).replace(/-/g, ' ').trim() || `Doc ${entry.documentId}`;

  return {
    id,
    seedFile,
    documentId: entry.documentId,
    title_en: '',
    short_name: shortName,
    status: 'in_force',
    description: `Auto-ingested from Portal Legislativ LEGE corpus. Listing label: ${raw}`,
  };
}

function cleanupParsedSeed(raw: Record<string, unknown>): Record<string, unknown> {
  const seed = { ...raw };
  const titleEn = typeof seed.title_en === 'string' ? seed.title_en.trim() : '';
  if (!titleEn) {
    delete seed.title_en;
  }
  return seed;
}

async function fetchDetailHtml(documentId: number, forceRefetch: boolean): Promise<string> {
  const sourcePath = path.join(SOURCE_DIR, `${documentId}.html`);
  if (!forceRefetch && fs.existsSync(sourcePath)) {
    return fs.readFileSync(sourcePath, 'utf-8');
  }

  const url = `https://legislatie.just.ro/Public/DetaliiDocument/${documentId}`;
  const response = await fetchLegislation(url);
  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  fs.writeFileSync(sourcePath, response.body);
  return response.body;
}

async function main(): Promise<void> {
  ensureDirs();
  const args = parseArgs();
  const pageSizeCode = args.pageSizeCode;
  const searchBase = searchBaseForCode(pageSizeCode, args.signedFrom, args.signedTo);
  const curatedByDocId = new Map<number, LawTarget>(TARGET_LAWS.map(t => [t.documentId, t]));

  if (args.refreshIndex) {
    fs.rmSync(INDEX_PATH, { force: true });
  }

  const indexedDocIds = new Set<number>();
  if (fs.existsSync(INDEX_PATH)) {
    for (const line of fs.readFileSync(INDEX_PATH, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const row = JSON.parse(trimmed) as { documentId?: number };
        if (typeof row.documentId === 'number') indexedDocIds.add(row.documentId);
      } catch {
        // ignore malformed lines
      }
    }
  }

  const state = args.resume ? loadState(pageSizeCode, args.signedFrom, args.signedTo) : null;
  const firstPageHtml = await fetchSearchPage(pageSizeCode, 1, args.signedFrom, args.signedTo);
  const totalPages = parseTotalPages(firstPageHtml);

  const startPage = Math.max(
    args.startPage ?? (state ? state.lastCompletedPage + 1 : 1),
    1,
  );
  const endPage = Math.min(args.endPage ?? totalPages, totalPages);

  if (startPage > endPage) {
    console.log(`Nothing to do. startPage=${startPage} endPage=${endPage}`);
    return;
  }

  let processedDocs = state?.processedDocs ?? 0;
  let skippedDocs = state?.skippedDocs ?? 0;
  let newIndexedDocs = 0;

  console.log('Romanian Law MCP — Full LEGE corpus ingestion');
  console.log(`Search endpoint: ${searchBase}`);
  console.log(`Pages: ${startPage}..${endPage} of ${totalPages}`);
  console.log(`Page size code: ${pageSizeCode}`);
  if (args.signedFrom || args.signedTo) {
    console.log(`Signed date filter: ${args.signedFrom ?? 'open'} .. ${args.signedTo ?? 'open'}`);
  }
  if (args.maxDocs) console.log(`Max docs: ${args.maxDocs}`);
  if (args.indexOnly) console.log('Mode: index-only');
  console.log('');

  let currentPageHtml = firstPageHtml;
  for (let page = startPage; page <= endPage; page += 1) {
    if (page !== 1 || page !== startPage) {
      try {
        currentPageHtml = await fetchSearchPage(pageSizeCode, page, args.signedFrom, args.signedTo);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendNdjson(SKIP_PATH, {
          type: 'page',
          page,
          pageSizeCode,
          signedFrom: args.signedFrom ?? null,
          signedTo: args.signedTo ?? null,
          reason: message,
          at: new Date().toISOString(),
        });
        skippedDocs += 1;
        saveState(pageSizeCode, {
          lastCompletedPage: page - 1,
          totalPages,
          processedDocs,
          skippedDocs,
          pageSizeCode,
          updatedAt: new Date().toISOString(),
        }, args.signedFrom, args.signedTo);
        if (!args.quiet) {
          console.log(`Page ${page}/${endPage}: SKIP (${message})`);
        }
        continue;
      }
    }

    const entries = parseSearchEntries(currentPageHtml, page);
    if (entries.length === 0) {
      appendNdjson(SKIP_PATH, {
        type: 'page',
        page,
        pageSizeCode,
        signedFrom: args.signedFrom ?? null,
        signedTo: args.signedTo ?? null,
        reason: 'no entries parsed',
        at: new Date().toISOString(),
      });
      continue;
    }

    if (!args.quiet) {
      console.log(`Page ${page}/${endPage}: ${entries.length} entries`);
    }

    for (const entry of entries) {
      if (!indexedDocIds.has(entry.documentId)) {
        indexedDocIds.add(entry.documentId);
        newIndexedDocs += 1;
        appendNdjson(INDEX_PATH, { ...entry, pageSizeCode });
      }
      if (args.indexOnly) continue;

      const profile = profileForEntry(entry, curatedByDocId);
      const seedPath = path.join(SEED_DIR, profile.seedFile);
      if (fs.existsSync(seedPath)) {
        continue;
      }

      try {
        const html = await fetchDetailHtml(entry.documentId, args.forceRefetch);
        const parsed = parseRomanianLawHtml(html, {
          id: profile.id,
          seedFile: profile.seedFile,
          documentId: profile.documentId,
          title_en: profile.title_en,
          short_name: profile.short_name,
          status: profile.status,
          description: profile.description,
        });
        const cleaned = cleanupParsedSeed(parsed as unknown as Record<string, unknown>);
        fs.writeFileSync(seedPath, `${JSON.stringify(cleaned, null, 2)}\n`);
        processedDocs += 1;
      } catch (error) {
        skippedDocs += 1;
        const message = error instanceof Error ? error.message : String(error);
        appendNdjson(SKIP_PATH, {
          type: 'document',
          documentId: entry.documentId,
          page,
          listingLabel: entry.listingLabel,
          pageSizeCode,
          signedFrom: args.signedFrom ?? null,
          signedTo: args.signedTo ?? null,
          reason: message,
          at: new Date().toISOString(),
        });
      }

      if (args.maxDocs && processedDocs >= args.maxDocs) {
        saveState(pageSizeCode, {
          lastCompletedPage: page,
          totalPages,
          processedDocs,
          skippedDocs,
          pageSizeCode,
          updatedAt: new Date().toISOString(),
        }, args.signedFrom, args.signedTo);
        console.log(`Reached --max-docs ${args.maxDocs}. Stopping.`);
        return;
      }
    }

    saveState(pageSizeCode, {
      lastCompletedPage: page,
      totalPages,
      processedDocs,
      skippedDocs,
      pageSizeCode,
      updatedAt: new Date().toISOString(),
    }, args.signedFrom, args.signedTo);
  }

  console.log('');
  console.log(`Done. processedDocs=${processedDocs} skippedDocs=${skippedDocs} newIndexedDocs=${newIndexedDocs}`);
  console.log(`State: ${statePathForContext(pageSizeCode, args.signedFrom, args.signedTo)}`);
  console.log(`Index: ${INDEX_PATH}`);
  console.log(`Skips: ${SKIP_PATH}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
