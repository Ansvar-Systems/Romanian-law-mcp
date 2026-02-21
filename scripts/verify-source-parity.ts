#!/usr/bin/env tsx
/**
 * Verify provision text parity between saved official HTML and seed JSON.
 *
 * Checks exact string equality for selected provisions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseRomanianLawHtml, TARGET_LAWS } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface ProvisionLike {
  provision_ref: string;
  content: string;
}

interface CheckItem {
  lawId: string;
  provisionRef: string;
}

const CHECKS: CheckItem[] = [
  { lawId: 'law-190-2018', provisionRef: 'Art.15' },
  { lawId: 'law-365-2002', provisionRef: 'Art.11' },
  { lawId: 'law-286-2009-cyber', provisionRef: 'Art.360' },
];

function normalizeRef(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function readSeedProvisions(seedPath: string): ProvisionLike[] {
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as { provisions?: ProvisionLike[] };
  if (!Array.isArray(raw.provisions)) return [];
  return raw.provisions;
}

function main(): void {
  let failures = 0;

  console.log('Romanian Law MCP — Source/Seed Provision Parity');
  console.log('');

  for (const check of CHECKS) {
    const target = TARGET_LAWS.find(t => t.id === check.lawId);
    if (!target) {
      console.log(`FAIL ${check.lawId} ${check.provisionRef}: missing target metadata`);
      failures += 1;
      continue;
    }

    const sourcePath = path.join(SOURCE_DIR, `${target.id}.html`);
    const seedPath = path.join(SEED_DIR, target.seedFile);

    if (!fs.existsSync(sourcePath)) {
      console.log(`FAIL ${check.lawId} ${check.provisionRef}: missing source ${sourcePath}`);
      failures += 1;
      continue;
    }

    if (!fs.existsSync(seedPath)) {
      console.log(`FAIL ${check.lawId} ${check.provisionRef}: missing seed ${seedPath}`);
      failures += 1;
      continue;
    }

    const html = fs.readFileSync(sourcePath, 'utf-8');
    const parsed = parseRomanianLawHtml(html, target);
    const seedProvisions = readSeedProvisions(seedPath);

    const refKey = normalizeRef(check.provisionRef);
    const sourceProvision = parsed.provisions.find(p => normalizeRef(p.provision_ref) === refKey);
    const seedProvision = seedProvisions.find(p => normalizeRef(p.provision_ref) === refKey);

    if (!sourceProvision) {
      console.log(`FAIL ${check.lawId} ${check.provisionRef}: provision missing in parsed source`);
      failures += 1;
      continue;
    }

    if (!seedProvision) {
      console.log(`FAIL ${check.lawId} ${check.provisionRef}: provision missing in seed`);
      failures += 1;
      continue;
    }

    if (sourceProvision.content !== seedProvision.content) {
      console.log(`FAIL ${check.lawId} ${check.provisionRef}: content mismatch`);
      console.log(`  source length=${sourceProvision.content.length}, seed length=${seedProvision.content.length}`);
      failures += 1;
      continue;
    }

    console.log(`OK   ${check.lawId} ${check.provisionRef} (len=${sourceProvision.content.length})`);
  }

  console.log('');
  if (failures > 0) {
    console.log(`Parity checks failed: ${failures}`);
    process.exit(1);
  }

  console.log('Parity checks passed: all selected provisions match exactly.');
}

main();
