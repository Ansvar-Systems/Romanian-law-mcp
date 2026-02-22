#!/usr/bin/env tsx
/**
 * Ingest all indexed Romanian LEGE documents into seed JSON files.
 *
 * Reads data/full-corpus/full-laws-index.ndjson, fetches
 * /Public/DetaliiDocument/{id}, parses consolidated content, and writes
 * data/seed/*.json. Resumable and idempotent.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchLegislation } from './lib/fetcher.js';
import { parseRomanianLawHtml, TARGET_LAWS, type LawTarget } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INDEX_PATH = path.resolve(__dirname, '../data/full-corpus/full-laws-index.ndjson');
const STATE_PATH = path.resolve(__dirname, '../data/full-corpus/full-laws-ingest-state.json');
const SKIP_PATH = path.resolve(__dirname, '../data/full-corpus/full-laws-skipped.ndjson');
const SOURCE_DIR = path.resolve(__dirname, '../data/source/full-laws');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface IndexRow {
  documentId: number;
  listingLabel?: string;
}

interface CliArgs {
  startPos?: number;
  endPos?: number;
  maxDocs?: number;
  resume: boolean;
  refreshState: boolean;
  forceRefetch: boolean;
  forceReparse: boolean;
  quiet: boolean;
  docIds: Set<number>;
}

interface IngestState {
  nextPosition: number;
  totalEntries: number;
  processedDocs: number;
  skippedDocs: number;
  updatedAt: string;
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
    resume: true,
    refreshState: false,
    forceRefetch: false,
    forceReparse: false,
    quiet: false,
    docIds: new Set<number>(),
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--start-pos' && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isNaN(parsed) && parsed > 0) result.startPos = parsed;
      i += 1;
      continue;
    }

    if (arg === '--end-pos' && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isNaN(parsed) && parsed > 0) result.endPos = parsed;
      i += 1;
      continue;
    }

    if (arg === '--max-docs' && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isNaN(parsed) && parsed > 0) result.maxDocs = parsed;
      i += 1;
      continue;
    }

    if (arg === '--doc-id' && next) {
      const parsed = Number.parseInt(next, 10);
      if (!Number.isNaN(parsed) && parsed > 0) result.docIds.add(parsed);
      i += 1;
      continue;
    }

    if (arg === '--no-resume') {
      result.resume = false;
      continue;
    }

    if (arg === '--refresh-state') {
      result.refreshState = true;
      continue;
    }

    if (arg === '--force-refetch') {
      result.forceRefetch = true;
      continue;
    }

    if (arg === '--force-reparse') {
      result.forceReparse = true;
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
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SEED_DIR, { recursive: true });
}

function appendNdjson(filePath: string, record: unknown): void {
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function profileForDocument(documentId: number, listingLabel: string | undefined, curatedByDocId: Map<number, LawTarget>): TargetProfile {
  const curated = curatedByDocId.get(documentId);
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

  const raw = normalizeWhitespace(listingLabel ?? `LEGE ${documentId}`);
  return {
    id: `law-doc-${documentId}`,
    seedFile: `law-doc-${documentId}.json`,
    documentId,
    title_en: '',
    short_name: slugify(raw).replace(/-/g, ' ').trim() || `Doc ${documentId}`,
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

function parseDateFromDdMmYyyy(text: string): string | undefined {
  const match = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!match) return undefined;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function extractPageTitle(rawHtml: string): string | undefined {
  const titleMatch = rawHtml.match(/<title>([^<]+)<\/title>/i);
  if (!titleMatch?.[1]) return undefined;
  const cleaned = normalizeWhitespace(titleMatch[1].replace(/-\s*Portal Legislativ\s*$/i, ''));
  return cleaned.length > 0 ? cleaned : undefined;
}

function shouldUseMetadataFallback(errorMessage: string): boolean {
  return errorMessage.startsWith('No provisions extracted for')
    || errorMessage.startsWith('Could not extract law title (S_DEN) for');
}

function buildMetadataOnlySeed(
  profile: TargetProfile,
  row: IndexRow,
  rawHtml: string,
  parseError: string,
): Record<string, unknown> {
  const listingLabel = normalizeWhitespace(row.listingLabel ?? '');
  const title = (extractPageTitle(rawHtml) ?? listingLabel) || `LEGE ${profile.documentId}`;
  const issuedDate = parseDateFromDdMmYyyy(title) ?? parseDateFromDdMmYyyy(listingLabel);
  const processingFlag = /act în curs de procesare/i.test(rawHtml)
    ? 'Source page reports "Act în curs de procesare".'
    : '';

  return cleanupParsedSeed({
    id: profile.id,
    type: 'statute',
    title,
    title_en: profile.title_en,
    short_name: profile.short_name,
    status: profile.status,
    issued_date: issuedDate,
    in_force_date: issuedDate,
    url: `https://legislatie.just.ro/Public/DetaliiDocument/${profile.documentId}`,
    description: [
      profile.description,
      processingFlag,
      `Metadata-only fallback applied: ${parseError}`,
      listingLabel ? `Listing label: ${listingLabel}` : '',
    ].filter(Boolean).join(' '),
    provisions: [],
    definitions: [],
  });
}

function loadIndexRows(): IndexRow[] {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(`Index file not found: ${INDEX_PATH}`);
  }

  const rows: IndexRow[] = [];
  const seen = new Set<number>();

  for (const line of fs.readFileSync(INDEX_PATH, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<IndexRow>;
      if (typeof parsed.documentId !== 'number' || parsed.documentId <= 0) continue;
      if (seen.has(parsed.documentId)) continue;
      seen.add(parsed.documentId);
      rows.push({
        documentId: parsed.documentId,
        listingLabel: typeof parsed.listingLabel === 'string' ? parsed.listingLabel : undefined,
      });
    } catch {
      // ignore malformed lines
    }
  }

  return rows;
}

function loadState(): IngestState | null {
  if (!fs.existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8')) as IngestState;
  } catch {
    return null;
  }
}

function saveState(state: IngestState): void {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
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

  if (args.refreshState) {
    fs.rmSync(STATE_PATH, { force: true });
  }

  const curatedByDocId = new Map<number, LawTarget>(TARGET_LAWS.map(t => [t.documentId, t]));

  const allRows = loadIndexRows();
  const filteredRows = args.docIds.size > 0
    ? allRows.filter(row => args.docIds.has(row.documentId))
    : allRows;

  if (filteredRows.length === 0) {
    console.log('Nothing to ingest: no index entries matched filters.');
    return;
  }

  const state = args.resume ? loadState() : null;
  const startPos = Math.max(args.startPos ?? state?.nextPosition ?? 1, 1);
  const endPos = Math.min(args.endPos ?? filteredRows.length, filteredRows.length);

  if (startPos > endPos) {
    console.log(`Nothing to do. startPos=${startPos} endPos=${endPos}`);
    return;
  }

  let processedDocs = state?.processedDocs ?? 0;
  let skippedDocs = state?.skippedDocs ?? 0;
  let runProcessed = 0;
  let runSkipped = 0;
  let existingSeeds = 0;
  let fallbackSeeds = 0;

  console.log('Romanian Law MCP — Ingest indexed LEGE corpus');
  console.log(`Index: ${INDEX_PATH}`);
  console.log(`Entries: ${filteredRows.length}`);
  console.log(`Range: ${startPos}..${endPos}`);
  if (args.docIds.size > 0) {
    console.log(`Doc filter size: ${args.docIds.size}`);
  }
  if (args.maxDocs) {
    console.log(`Max docs this run: ${args.maxDocs}`);
  }
  console.log('');

  for (let pos = startPos; pos <= endPos; pos += 1) {
    const row = filteredRows[pos - 1];
    const profile = profileForDocument(row.documentId, row.listingLabel, curatedByDocId);
    const seedPath = path.join(SEED_DIR, profile.seedFile);

    if (fs.existsSync(seedPath) && !args.forceReparse) {
      existingSeeds += 1;
      saveState({
        nextPosition: pos + 1,
        totalEntries: filteredRows.length,
        processedDocs,
        skippedDocs,
        updatedAt: new Date().toISOString(),
      });
      continue;
    }

    try {
      const html = await fetchDetailHtml(row.documentId, args.forceRefetch);
      let cleaned: Record<string, unknown>;
      try {
        const parsed = parseRomanianLawHtml(html, {
          id: profile.id,
          seedFile: profile.seedFile,
          documentId: profile.documentId,
          title_en: profile.title_en,
          short_name: profile.short_name,
          status: profile.status,
          description: profile.description,
        });
        cleaned = cleanupParsedSeed(parsed as unknown as Record<string, unknown>);
      } catch (parseError) {
        const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
        if (!shouldUseMetadataFallback(parseMessage)) {
          throw parseError;
        }
        cleaned = buildMetadataOnlySeed(profile, row, html, parseMessage);
        fallbackSeeds += 1;
      }

      fs.writeFileSync(seedPath, `${JSON.stringify(cleaned, null, 2)}\n`);
      processedDocs += 1;
      runProcessed += 1;
      if (!args.quiet) {
        console.log(`OK ${pos}/${endPos} doc=${row.documentId} -> ${profile.seedFile}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      skippedDocs += 1;
      runSkipped += 1;
      appendNdjson(SKIP_PATH, {
        type: 'document',
        stage: 'ingest-indexed-laws',
        documentId: row.documentId,
        reason: message,
        at: new Date().toISOString(),
      });
      if (!args.quiet) {
        console.log(`SKIP ${pos}/${endPos} doc=${row.documentId} (${message})`);
      }
    }

    saveState({
      nextPosition: pos + 1,
      totalEntries: filteredRows.length,
      processedDocs,
      skippedDocs,
      updatedAt: new Date().toISOString(),
    });

    if (args.maxDocs && runProcessed >= args.maxDocs) {
      console.log(`Reached --max-docs ${args.maxDocs}. Stopping.`);
      break;
    }
  }

  console.log('');
  console.log(`Done. runProcessed=${runProcessed} runSkipped=${runSkipped} existingSeeds=${existingSeeds} fallbackSeeds=${fallbackSeeds}`);
  console.log(`Cumulative: processedDocs=${processedDocs} skippedDocs=${skippedDocs}`);
  console.log(`State: ${STATE_PATH}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
