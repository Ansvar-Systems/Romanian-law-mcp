#!/usr/bin/env tsx
/**
 * Romanian Law MCP real-data ingestion.
 *
 * Fetches official legislation HTML from legislatie.just.ro and rebuilds
 * JSON seed files in data/seed from real article text.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchLegislation } from './lib/fetcher.js';
import { parseRomanianLawHtml, TARGET_LAWS, type LawTarget } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface CliArgs {
  limit: number | null;
  skipFetch: boolean;
}

interface IngestResult {
  id: string;
  documentId: number;
  status: string;
  provisions: number;
  definitions: number;
  url: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let limit: number | null = null;
  let skipFetch = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--limit' && args[i + 1]) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        limit = parsed;
      }
      i += 1;
      continue;
    }

    if (arg === '--skip-fetch') {
      skipFetch = true;
    }
  }

  return { limit, skipFetch };
}

function cleanSeedDirectory(expectedFiles: string[]): void {
  fs.mkdirSync(SEED_DIR, { recursive: true });

  const expected = new Set(expectedFiles);
  const current = fs.readdirSync(SEED_DIR).filter(name => name.endsWith('.json'));

  for (const file of current) {
    if (!expected.has(file)) {
      fs.rmSync(path.join(SEED_DIR, file), { force: true });
    }
  }
}

function sourceFileFor(target: LawTarget): string {
  return path.join(SOURCE_DIR, `${target.id}.html`);
}

function seedFileFor(target: LawTarget): string {
  return path.join(SEED_DIR, target.seedFile);
}

async function fetchOrLoadHtml(target: LawTarget, skipFetch: boolean): Promise<string> {
  const sourcePath = sourceFileFor(target);
  if (skipFetch && fs.existsSync(sourcePath)) {
    return fs.readFileSync(sourcePath, 'utf-8');
  }

  const url = `https://legislatie.just.ro/Public/DetaliiDocument/${target.documentId}`;
  const response = await fetchLegislation(url);

  if (response.status !== 200) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  if (!/text\/html/i.test(response.contentType)) {
    throw new Error(`Unexpected content type ${response.contentType} from ${url}`);
  }

  if (!response.body.includes('div_Formaconsolidata')) {
    throw new Error(`Missing consolidated form container in ${url}`);
  }

  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.writeFileSync(sourcePath, response.body);
  return response.body;
}

async function ingestTargets(targets: LawTarget[], skipFetch: boolean): Promise<IngestResult[]> {
  cleanSeedDirectory(targets.map(t => t.seedFile));

  const results: IngestResult[] = [];

  for (const target of targets) {
    const url = `https://legislatie.just.ro/Public/DetaliiDocument/${target.documentId}`;
    process.stdout.write(`Fetching ${target.id} (${target.documentId})... `);

    try {
      const html = await fetchOrLoadHtml(target, skipFetch);
      const parsed = parseRomanianLawHtml(html, target);

      fs.writeFileSync(seedFileFor(target), `${JSON.stringify(parsed, null, 2)}\n`);

      console.log(`OK (${parsed.provisions.length} provisions, ${parsed.definitions.length} definitions)`);
      results.push({
        id: target.id,
        documentId: target.documentId,
        status: 'OK',
        provisions: parsed.provisions.length,
        definitions: parsed.definitions.length,
        url,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`SKIP (${message})`);
      results.push({
        id: target.id,
        documentId: target.documentId,
        status: `SKIP: ${message}`,
        provisions: 0,
        definitions: 0,
        url,
      });
    }
  }

  return results;
}

function printReport(results: IngestResult[]): void {
  const ok = results.filter(r => r.status === 'OK');
  const skipped = results.filter(r => r.status !== 'OK');

  const totalProvisions = ok.reduce((sum, row) => sum + row.provisions, 0);
  const totalDefinitions = ok.reduce((sum, row) => sum + row.definitions, 0);

  console.log('\n' + '='.repeat(84));
  console.log('Romanian Law MCP Ingestion Report');
  console.log('='.repeat(84));
  console.log('Source portal: https://legislatie.just.ro');
  console.log(`Fetched laws: ${ok.length}/${results.length}`);
  console.log(`Skipped laws: ${skipped.length}`);
  console.log(`Total provisions: ${totalProvisions}`);
  console.log(`Total definitions: ${totalDefinitions}`);
  console.log('');

  for (const row of results) {
    console.log(
      `${row.id.padEnd(22)} ${String(row.provisions).padStart(4)} prov  ${String(row.definitions).padStart(3)} def  ${row.status}`,
    );
  }

  if (skipped.length > 0) {
    console.log('\nSkipped entries (not ingested):');
    for (const row of skipped) {
      console.log(`- ${row.id} (${row.url}): ${row.status}`);
    }
  }

  console.log('');
}

async function main(): Promise<void> {
  const { limit, skipFetch } = parseArgs();
  const targets = limit ? TARGET_LAWS.slice(0, limit) : TARGET_LAWS;

  console.log('Romanian Law MCP — Real data ingestion');
  console.log('Portal: https://legislatie.just.ro');
  console.log('Method: HTML scrape (official consolidated document pages)');
  if (limit) console.log(`--limit ${limit}`);
  if (skipFetch) console.log('--skip-fetch');
  console.log('');

  const results = await ingestTargets(targets, skipFetch);
  printReport(results);
}

main().catch(error => {
  console.error('Fatal ingestion error:', error);
  process.exit(1);
});
