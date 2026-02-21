#!/usr/bin/env tsx
/**
 * Validate ingestion completeness for all configured Romanian law targets.
 *
 * Checks:
 * - source HTML exists for every target law
 * - seed JSON exists and has required metadata
 * - all provisions have non-empty refs/title/content
 * - provision refs are unique per law
 * - top-level article count in official HTML matches seed provision count
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { TARGET_LAWS, type LawTarget } from './lib/parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DIR = path.resolve(__dirname, '../data/source');
const SEED_DIR = path.resolve(__dirname, '../data/seed');

interface ProvisionLike {
  provision_ref?: unknown;
  section?: unknown;
  title?: unknown;
  content?: unknown;
}

interface SeedLike {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  title_en?: unknown;
  short_name?: unknown;
  status?: unknown;
  issued_date?: unknown;
  in_force_date?: unknown;
  url?: unknown;
  description?: unknown;
  provisions?: unknown;
}

function extractConsolidatedForm(html: string): string {
  const start = html.indexOf('<div id="div_Formaconsolidata"');
  if (start < 0) {
    throw new Error('missing consolidated form container');
  }

  const end = html.indexOf('<div id="div_Formerepublicate"', start);
  if (end < 0) return html.slice(start);
  return html.slice(start, end);
}

function extractBalancedSpan(html: string, start: number): { end: number } | null {
  if (start < 0 || start >= html.length || !html.startsWith('<span', start)) {
    return null;
  }

  const tokenRegex = /<\/?span\b[^>]*>/gi;
  tokenRegex.lastIndex = start;

  let depth = 0;
  let end = -1;
  let token = tokenRegex.exec(html);

  while (token) {
    const raw = token[0];
    const isClosing = raw.startsWith('</');
    const isSelfClosing = /\/>\s*$/.test(raw);

    if (isClosing) {
      depth -= 1;
      if (depth === 0) {
        end = tokenRegex.lastIndex;
        break;
      }
    } else if (!isSelfClosing) {
      depth += 1;
    }

    token = tokenRegex.exec(html);
  }

  if (end < 0) return null;
  return { end };
}

function countTopLevelArticles(html: string): number {
  const articleStartRegex = /<span class=\"[^\"]*\bS_ART\b[^\"]*\"[^>]*id=\"id_art[^\"]*\"[^>]*>/gi;
  let count = 0;
  let topLevelEnd = -1;
  let match = articleStartRegex.exec(html);

  while (match) {
    const start = match.index;
    if (start < topLevelEnd) {
      match = articleStartRegex.exec(html);
      continue;
    }

    const span = extractBalancedSpan(html, start);
    if (!span) {
      match = articleStartRegex.exec(html);
      continue;
    }

    topLevelEnd = span.end;
    count += 1;
    match = articleStartRegex.exec(html);
  }

  return count;
}

function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function loadSeed(seedPath: string): SeedLike {
  return JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as SeedLike;
}

function auditTarget(target: LawTarget): string[] {
  const issues: string[] = [];
  const sourcePath = path.join(SOURCE_DIR, `${target.id}.html`);
  const seedPath = path.join(SEED_DIR, target.seedFile);

  if (!fs.existsSync(sourcePath)) {
    issues.push('missing source HTML');
    return issues;
  }

  if (!fs.existsSync(seedPath)) {
    issues.push('missing seed JSON');
    return issues;
  }

  const sourceHtml = fs.readFileSync(sourcePath, 'utf-8');
  const consolidated = extractConsolidatedForm(sourceHtml);
  const topLevelArticles = countTopLevelArticles(consolidated);
  const seed = loadSeed(seedPath);

  const requiredStringFields: Array<keyof SeedLike> = [
    'id',
    'type',
    'title',
    'title_en',
    'short_name',
    'status',
    'url',
    'description',
  ];

  for (const field of requiredStringFields) {
    const value = seed[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      issues.push(`invalid ${field}`);
    }
  }

  if (!isIsoDate(seed.issued_date)) issues.push('invalid issued_date');
  if (!isIsoDate(seed.in_force_date)) issues.push('invalid in_force_date');

  if (seed.id !== target.id) issues.push(`seed id mismatch (${String(seed.id)})`);
  if (seed.type !== 'statute') issues.push(`seed type mismatch (${String(seed.type)})`);

  if (typeof seed.url !== 'string' || !seed.url.endsWith(String(target.documentId))) {
    issues.push(`seed url mismatch (${String(seed.url)})`);
  }

  const provisions = Array.isArray(seed.provisions) ? (seed.provisions as ProvisionLike[]) : [];
  if (!Array.isArray(seed.provisions)) {
    issues.push('provisions is not an array');
  }

  if (provisions.length !== topLevelArticles) {
    issues.push(`article count mismatch (seed=${provisions.length}, source=${topLevelArticles})`);
  }

  const refs = new Set<string>();
  let duplicateRefs = 0;

  for (const p of provisions) {
    const ref = typeof p.provision_ref === 'string' ? p.provision_ref.trim() : '';
    const section = typeof p.section === 'string' ? p.section.trim() : '';
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    const content = typeof p.content === 'string' ? p.content.trim() : '';

    if (!ref) issues.push('provision with empty ref');
    if (!section) issues.push('provision with empty section');
    if (!title) issues.push('provision with empty title');
    if (!content) issues.push('provision with empty content');

    if (ref) {
      if (refs.has(ref)) {
        duplicateRefs += 1;
      } else {
        refs.add(ref);
      }
    }
  }

  if (duplicateRefs > 0) {
    issues.push(`duplicate provision refs (${duplicateRefs})`);
  }

  return issues;
}

async function main(): Promise<void> {
  console.log('Romanian Law MCP — Ingestion Completeness Audit');
  console.log('===============================================\n');

  let failed = 0;
  for (const target of TARGET_LAWS) {
    const issues = auditTarget(target);
    if (issues.length === 0) {
      console.log(`OK   ${target.id}`);
      continue;
    }

    failed += 1;
    console.log(`FAIL ${target.id}`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }

  console.log('');
  console.log(`Summary: ${TARGET_LAWS.length - failed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
