import { afterEach, describe, expect, it, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { SERVER_NAME, SERVER_VERSION, SERVER_LABEL, PACKAGE_NAME, REPOSITORY_URL, DB_ENV_VAR } from '../../src/constants.js';
import { normalizeAsOfDate } from '../../src/utils/as-of-date.js';
import { sanitizeFtsInput, buildFtsQueryVariants } from '../../src/utils/fts-query.js';
import { generateResponseMetadata } from '../../src/utils/metadata.js';
import { resolveDocumentId } from '../../src/utils/statute-id.js';
import { detectCapabilities, readDbMetadata, upgradeMessage } from '../../src/capabilities.js';

import { getAbout } from '../../src/tools/about.js';
import { listSources } from '../../src/tools/list-sources.js';
import { formatCitationTool } from '../../src/tools/format-citation.js';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { searchLegislation } from '../../src/tools/search-legislation.js';
import { buildLegalStance } from '../../src/tools/build-legal-stance.js';
import { getProvision } from '../../src/tools/get-provision.js';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { getRomanianImplementations } from '../../src/tools/get-romanian-implementations.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { validateCitationTool } from '../../src/tools/validate-citation.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';
import { buildTools, registerTools } from '../../src/tools/registry.js';

function createFixtureDb(options?: { includeEu?: boolean; includeMetadata?: boolean }): BetterSqlite3.Database {
  const includeEu = options?.includeEu ?? true;
  const includeMetadata = options?.includeMetadata ?? true;
  const db = new BetterSqlite3(':memory:');

  db.exec(`
    CREATE TABLE legal_documents (
      id TEXT PRIMARY KEY,
      type TEXT,
      title TEXT,
      title_en TEXT,
      short_name TEXT,
      status TEXT,
      issued_date TEXT,
      in_force_date TEXT,
      url TEXT,
      description TEXT
    );

    CREATE TABLE legal_provisions (
      id INTEGER PRIMARY KEY,
      document_id TEXT,
      provision_ref TEXT,
      chapter TEXT,
      section TEXT,
      title TEXT,
      content TEXT
    );

    CREATE VIRTUAL TABLE provisions_fts USING fts5(
      content, title,
      content='legal_provisions',
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TABLE definitions (
      id INTEGER PRIMARY KEY,
      document_id TEXT,
      term TEXT,
      definition TEXT
    );
  `);

  if (includeEu) {
    db.exec(`
      CREATE TABLE eu_documents (
        id TEXT PRIMARY KEY,
        type TEXT,
        year INTEGER,
        number INTEGER,
        title TEXT,
        short_name TEXT,
        description TEXT
      );

      CREATE TABLE eu_references (
        id INTEGER PRIMARY KEY,
        source_type TEXT,
        source_id TEXT,
        document_id TEXT,
        provision_id INTEGER,
        eu_document_id TEXT,
        eu_article TEXT,
        reference_type TEXT,
        reference_context TEXT,
        full_citation TEXT,
        is_primary_implementation INTEGER,
        implementation_status TEXT
      );
    `);
  }

  if (includeMetadata) {
    db.exec('CREATE TABLE db_metadata (key TEXT PRIMARY KEY, value TEXT);');
  }

  db.prepare(`
    INSERT INTO legal_documents
      (id, type, title, title_en, short_name, status, issued_date, in_force_date, url, description)
    VALUES
      ('law-190-2018', 'statute', 'LEGE nr. 190 din 18 iulie 2018', 'Law 190/2018', 'Legea GDPR', 'in_force', '2018-07-18', '2018-07-18', 'https://legislatie.just.ro/Public/DetaliiDocument/203151', 'GDPR implementation'),
      ('law-365-2002', 'statute', 'LEGE nr. 365 din 7 iunie 2002', 'Law 365/2002', 'Legea comertului electronic', 'in_force', '2002-06-07', '2002-06-07', 'https://legislatie.just.ro/Public/DetaliiDocument/77218', 'E-commerce'),
      ('oug-98-2010', 'statute', 'OUG nr. 98 din 3 noiembrie 2010', 'OUG 98/2010', 'OUG infrastructuri critice', 'in_force', '2010-11-03', '2010-11-03', 'https://legislatie.just.ro/Public/DetaliiDocument/123547', 'Critical infrastructures'),
      ('doc-amended', 'statute', 'Act amended', 'Act amended', 'AA', 'amended', '2020-01-01', '2020-01-02', 'https://example.test/amended', 'Amended law'),
      ('doc-repealed', 'statute', 'Act repealed', 'Act repealed', 'AR', 'repealed', '2010-01-01', '2010-01-02', 'https://example.test/repealed', 'Repealed law'),
      ('doc-not-yet', 'statute', 'Act not yet in force', 'Act not yet in force', 'ANY', 'not_yet_in_force', '2030-01-01', '2030-06-01', 'https://example.test/future', 'Future law')
  `).run();

  const insertProvision = db.prepare(`
    INSERT INTO legal_provisions (id, document_id, provision_ref, chapter, section, title, content)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertFts = db.prepare('INSERT INTO provisions_fts(rowid, content, title) VALUES (?, ?, ?)');

  const provisions: Array<[number, string, string, string, string, string, string]> = [
    [1, 'law-190-2018', 'Art.1', 'Capitolul I', '1', 'Articolul 1', 'datelor cu caracter personal și Regulamentul (UE) 2016/679'],
    [2, 'law-190-2018', 's2', 'Capitolul I', '2', 'Articolul 2', 'definiții pentru date personale'],
    [3, 'law-190-2018', 'pX3', 'Capitolul I', 'X3', 'Articolul X3', 'text pentru section exact match'],
    [4, 'law-190-2018', 'custom-77', 'Capitolul I', '77A', 'Articolul 77A', 'text pentru like match 77'],
    [5, 'law-365-2002', 'Art.11', 'Capitolul IV', '11', 'Articolul 11', 'furnizorii de servicii răspund în condițiile legii'],
    [6, 'oug-98-2010', 'Art.1', 'Capitolul I', '1', 'Articolul 1', 'protecția infrastructurilor critice și securității naționale'],
    [7, 'doc-amended', 'Art.5', 'Capitolul I', '5', 'Articolul 5', 'text amended'],
    [8, 'doc-repealed', 'Art.1', 'Capitolul I', '1', 'Articolul 1', 'text repealed']
  ];

  for (const row of provisions) {
    insertProvision.run(...row);
    insertFts.run(row[0], row[6], row[5]);
  }

  if (includeEu) {
    db.prepare(`
      INSERT INTO eu_documents (id, type, year, number, title, short_name, description)
      VALUES
        ('regulation:2016/679', 'regulation', 2016, 679, 'GDPR', 'GDPR', 'General Data Protection Regulation'),
        ('directive:2002/58', 'directive', 2002, 58, 'ePrivacy', 'ePrivacy', 'ePrivacy Directive')
    `).run();

    db.prepare(`
      INSERT INTO eu_references
        (id, source_type, source_id, document_id, provision_id, eu_document_id, eu_article, reference_type, reference_context, full_citation, is_primary_implementation, implementation_status)
      VALUES
        (1, 'provision', 'law-190-2018:Art.1', 'law-190-2018', 1, 'regulation:2016/679', '6', 'references', 'context complete', 'Regulamentul (UE) 2016/679', 1, 'complete'),
        (2, 'provision', 'law-190-2018:Art.1', 'law-190-2018', 1, 'directive:2002/58', NULL, 'implements', 'context implements', 'Directiva 2002/58', 0, 'complete'),
        (3, 'provision', 'doc-amended:Art.5', 'doc-amended', 7, 'directive:2002/58', NULL, 'references', 'context partial', 'Directiva 2002/58', 0, 'partial'),
        (4, 'provision', 'oug-98-2010:Art.1', 'oug-98-2010', 6, 'directive:2002/58', NULL, 'references', 'context unknown', 'Directiva 2002/58', 0, 'unknown'),
        (5, 'provision', 'doc-repealed:Art.1', 'doc-repealed', 8, 'regulation:2016/679', NULL, 'references', 'context repealed', 'Regulamentul (UE) 2016/679', 0, 'complete')
    `).run();
  }

  if (includeMetadata) {
    db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)').run('tier', 'pro');
    db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)').run('schema_version', '2.0');
    db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)').run('built_at', '2026-02-21T00:00:00.000Z');
    db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)').run('builder', 'unit-tests');
  }

  return db;
}

const opened: BetterSqlite3.Database[] = [];
function trackedDb(db: BetterSqlite3.Database): BetterSqlite3.Database {
  opened.push(db);
  return db;
}

afterEach(() => {
  while (opened.length > 0) {
    const db = opened.pop();
    db?.close();
  }
});

function setupRegistryHarness(db: BetterSqlite3.Database, context?: { version: string; fingerprint: string; dbBuilt: string }) {
  const handlers = new Map<object, (request: unknown) => Promise<unknown>>();
  const fakeServer = {
    setRequestHandler: vi.fn((schema: object, handler: (request: unknown) => Promise<unknown>) => {
      handlers.set(schema, handler);
    }),
  };

  registerTools(fakeServer as unknown as any, db as unknown as any, context);

  const list = handlers.get(ListToolsRequestSchema);
  const call = handlers.get(CallToolRequestSchema);
  if (!list || !call) {
    throw new Error('registry handlers were not registered');
  }

  return { list, call };
}

function parseToolJson(response: unknown): Record<string, unknown> {
  const payload = response as { content?: Array<{ text?: string }> };
  const text = payload.content?.[0]?.text ?? '{}';
  return JSON.parse(text) as Record<string, unknown>;
}

describe('constants and utils coverage', () => {
  it('covers constants exports', () => {
    expect(SERVER_NAME).toBe('romanian-law-mcp');
    expect(SERVER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(SERVER_LABEL).toContain('Romanian');
    expect(PACKAGE_NAME).toContain('romanian-law-mcp');
    expect(REPOSITORY_URL).toContain('github.com/Ansvar-Systems');
    expect(DB_ENV_VAR).toBe('ROMANIAN_LAW_DB_PATH');
  });

  it('covers normalizeAsOfDate branches', () => {
    expect(normalizeAsOfDate(undefined)).toBeNull();
    expect(normalizeAsOfDate('')).toBeNull();
    expect(normalizeAsOfDate('2026-02-21')).toBe('2026-02-21');
    expect(normalizeAsOfDate('2026-02-21T00:00:00Z')).toBe('2026-02-21');
    expect(normalizeAsOfDate('not-a-date')).toBeNull();
  });

  it('covers fts query helpers', () => {
    expect(sanitizeFtsInput(`a'b"c(d)e[f]{g}^~*: h`)).toBe('a b c d e f g h');
    expect(buildFtsQueryVariants('')).toEqual([]);
    expect(buildFtsQueryVariants('ab')).toEqual(['ab']);
    expect(buildFtsQueryVariants('abc')).toEqual(['abc', 'abc*']);
    expect(buildFtsQueryVariants('alpha beta')).toEqual([
      '"alpha beta"',
      'alpha AND beta',
      'alpha AND beta*',
    ]);
  });

  it('covers capabilities and metadata helpers', () => {
    const db = trackedDb(createFixtureDb());
    const caps = detectCapabilities(db as unknown as any);
    expect(caps.has('core_legislation')).toBe(true);
    expect(caps.has('eu_references')).toBe(true);
    expect(caps.has('case_law')).toBe(false);

    const meta = readDbMetadata(db as unknown as any);
    expect(meta.tier).toBe('pro');
    expect(meta.schema_version).toBe('2.0');
    expect(meta.builder).toBe('unit-tests');

    const responseMeta = generateResponseMetadata(db as unknown as any);
    expect(responseMeta.jurisdiction).toBe('RO');
    expect(responseMeta.freshness).toBe('2026-02-21T00:00:00.000Z');

    expect(upgradeMessage('eu')).toContain('eu');
  });

  it('covers metadata fallbacks without db_metadata table', () => {
    const db = trackedDb(createFixtureDb({ includeMetadata: false }));

    const meta = readDbMetadata(db as unknown as any);
    expect(meta.tier).toBe('free');
    expect(meta.schema_version).toBe('1.0');

    const responseMeta = generateResponseMetadata(db as unknown as any);
    expect(responseMeta.freshness).toBeUndefined();
  });

  it('covers resolveDocumentId direct, fuzzy, lower fallback and misses', () => {
    const db = trackedDb(createFixtureDb());

    expect(resolveDocumentId(db as unknown as any, 'law-190-2018')).toBe('law-190-2018');
    expect(resolveDocumentId(db as unknown as any, 'Legea GDPR')).toBe('law-190-2018');
    expect(resolveDocumentId(db as unknown as any, 'missing')).toBeNull();
    expect(resolveDocumentId(db as unknown as any, '   ')).toBeNull();

    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('WHERE id = ?')) {
          return { get: () => undefined };
        }
        if (sql.includes('title LIKE')) {
          return { get: () => undefined };
        }
        return { get: () => ({ id: 'doc-lower' }) };
      }),
    };

    expect(resolveDocumentId(mockDb as unknown as any, 'Doc Lower')).toBe('doc-lower');
  });
});

describe('about and sources tools', () => {
  it('returns about payload with statistics', () => {
    const db = trackedDb(createFixtureDb());
    const result = getAbout(db as unknown as any, {
      version: '1.2.3',
      fingerprint: 'abc',
      dbBuilt: '2026-02-21T00:00:00.000Z',
    });

    expect(result.server).toBe('romanian-law-mcp');
    expect(result.database.tier).toBe('pro');
    expect(result.statistics.documents).toBeGreaterThan(0);
  });

  it('covers safeCount error paths in about/listSources', async () => {
    const fakeDb = {
      prepare: (sql: string) => {
        if (sql.includes('sqlite_master')) return { all: () => [] };
        if (sql.includes('SELECT key, value FROM db_metadata')) return { all: () => [] };
        if (sql.includes('COUNT(*)')) throw new Error('count failed');
        return { get: () => undefined, all: () => [] };
      },
    };

    const about = getAbout(fakeDb as unknown as any, {
      version: '1.0.0',
      fingerprint: 'f',
      dbBuilt: 'now',
    });
    expect(about.statistics.documents).toBe(0);

    const sources = await listSources(fakeDb as unknown as any);
    expect(sources.results.database.document_count).toBe(0);
    expect(sources.results.database.provision_count).toBe(0);
  });

  it('covers safeCount undefined-row branches in about/listSources', async () => {
    const fakeDb = {
      prepare: (sql: string) => {
        if (sql.includes('sqlite_master')) return { all: () => [] };
        if (sql.includes('SELECT key, value FROM db_metadata')) return { all: () => [] };
        if (sql.includes('COUNT(*)')) return { get: () => undefined };
        return { get: () => undefined, all: () => [] };
      },
    };

    const about = getAbout(fakeDb as unknown as any, {
      version: '1.0.0',
      fingerprint: 'f',
      dbBuilt: 'now',
    });
    expect(about.statistics.documents).toBe(0);

    const sources = await listSources(fakeDb as unknown as any);
    expect(sources.results.database.document_count).toBe(0);
    expect(sources.results.database.provision_count).toBe(0);
  });

  it('returns source listing with metadata', async () => {
    const db = trackedDb(createFixtureDb());
    const result = await listSources(db as unknown as any);
    expect(result.results.sources[0].name).toContain('Legislatie');
    expect(result._metadata.jurisdiction).toBe('RO');
  });
});

describe('citation and currency tools', () => {
  it('formats citations in full/short/pinpoint styles', async () => {
    const full = await formatCitationTool({ citation: 'Section 12, Privacy Act 1988', format: 'full' });
    expect(full.formatted).toContain('Section 12');

    const short = await formatCitationTool({ citation: 'Privacy Act 1988 s 12', format: 'short' });
    expect(short.formatted).toContain('s 12');

    const pinpoint = await formatCitationTool({ citation: 'Act Section 9', format: 'pinpoint' });
    expect(pinpoint.formatted).toBe('s 9');

    const shortNoSection = await formatCitationTool({ citation: 'Simple Act', format: 'short' });
    expect(shortNoSection.formatted).toBe('Simple Act');

    const pinpointNoSection = await formatCitationTool({ citation: 'Simple Act', format: 'pinpoint' });
    expect(pinpointNoSection.formatted).toBe('Simple Act');

    const noSection = await formatCitationTool({ citation: 'Simple Act' });
    expect(noSection.formatted).toBe('Simple Act');
  });

  it('checks currency for found and missing documents', async () => {
    const db = trackedDb(createFixtureDb());

    const missing = await checkCurrency(db as unknown as any, { document_id: 'missing-doc' });
    expect(missing.results.status).toBe('not_found');

    const repealed = await checkCurrency(db as unknown as any, { document_id: 'doc-repealed' });
    expect(repealed.results.warnings[0]).toContain('repealed');

    const notYet = await checkCurrency(db as unknown as any, { document_id: 'doc-not-yet' });
    expect(notYet.results.warnings[0]).toContain('not yet entered');

    const inForce = await checkCurrency(db as unknown as any, { document_id: 'law-190-2018' });
    expect(inForce.results.status).toBe('in_force');
    expect(inForce.results.warnings).toEqual([]);
  });
});

describe('search and stance tools', () => {
  it('searches legislation with filters, empty input and limit clamp', async () => {
    const db = trackedDb(createFixtureDb());

    const empty = await searchLegislation(db as unknown as any, { query: '   ' });
    expect(empty.results).toEqual([]);

    const found = await searchLegislation(db as unknown as any, {
      query: 'datelor caracter personal',
      document_id: 'law-190-2018',
      status: 'in_force',
      limit: 999,
    });
    expect(found.results.length).toBeGreaterThan(0);
    expect(found.results[0].document_id).toBe('law-190-2018');
  });

  it('covers FTS fallback catch path in searchLegislation', async () => {
    let calls = 0;
    const mockDb = {
      prepare: () => ({
        all: (..._args: unknown[]) => {
          calls += 1;
          if (calls === 1) throw new Error('fts syntax error');
          return [
            {
              document_id: 'd1',
              document_title: 'Doc',
              provision_ref: 'Art.1',
              chapter: null,
              section: '1',
              title: 'Articolul 1',
              snippet: 'snippet',
              relevance: -1,
            },
          ];
        },
      }),
    };

    const result = await searchLegislation(mockDb as unknown as any, { query: 'alpha beta' });
    expect(result.results.length).toBe(1);
  });

  it('covers no-result and empty-variant returns in searchLegislation', async () => {
    const db = trackedDb(createFixtureDb());

    const noResult = await searchLegislation(db as unknown as any, { query: 'definitelynohitterm' });
    expect(noResult.results).toEqual([]);

    const emptyVariants = await searchLegislation(db as unknown as any, { query: `'\"(){}[]^~*:` });
    expect(emptyVariants.results).toEqual([]);
  });

  it('builds legal stance and covers empty/catch/no-result branches', async () => {
    const db = trackedDb(createFixtureDb());

    const empty = await buildLegalStance(db as unknown as any, { query: '' });
    expect(empty.results).toEqual([]);

    const ok = await buildLegalStance(db as unknown as any, {
      query: 'infrastructurilor critice',
      document_id: 'oug-98-2010',
      limit: 99,
    });
    expect(ok.results.length).toBeGreaterThan(0);

    let calls = 0;
    const mockDb = {
      prepare: () => ({
        all: () => {
          calls += 1;
          if (calls === 1) throw new Error('bad fts query');
          return [];
        },
      }),
    };
    const none = await buildLegalStance(mockDb as unknown as any, { query: 'alpha beta' });
    expect(none.results).toEqual([]);
  });
});

describe('get_provision branches', () => {
  it('covers all lookup modes and fallbacks', async () => {
    const db = trackedDb(createFixtureDb());

    const missingDoc = await getProvision(db as unknown as any, {
      document_id: 'missing-doc',
      provision_ref: 'Art.1',
    });
    expect(missingDoc.results).toEqual([]);

    const direct = await getProvision(db as unknown as any, {
      document_id: 'law-190-2018',
      provision_ref: 'Art.1',
    });
    expect(direct.results[0].provision_ref).toBe('Art.1');

    const sPrefix = await getProvision(db as unknown as any, {
      document_id: 'law-190-2018',
      provision_ref: '2',
    });
    expect(sPrefix.results[0].provision_ref).toBe('s2');

    const sectionMatch = await getProvision(db as unknown as any, {
      document_id: 'law-190-2018',
      provision_ref: 'X3',
    });
    expect(sectionMatch.results[0].section).toBe('X3');

    const likeMatch = await getProvision(db as unknown as any, {
      document_id: 'law-190-2018',
      provision_ref: '77',
    });
    expect(likeMatch.results[0].provision_ref).toContain('77');

    const missingProvision = await getProvision(db as unknown as any, {
      document_id: 'law-190-2018',
      provision_ref: '999',
    });
    expect(missingProvision.results).toEqual([]);

    const allForDoc = await getProvision(db as unknown as any, {
      document_id: 'law-190-2018',
    });
    expect(allForDoc.results.length).toBeGreaterThan(1);
  });

  it('covers docRow missing branch with a mocked db', async () => {
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('SELECT id FROM legal_documents WHERE id = ?')) {
          return { get: (): { id: string } => ({ id: 'x' }) };
        }
        if (sql.includes('SELECT id, title, url FROM legal_documents')) {
          return { get: (): undefined => undefined };
        }
        return { get: (): undefined => undefined, all: (): never[] => [] };
      }),
    };

    const result = await getProvision(mockDb as unknown as any, { document_id: 'x' });
    expect(result.results).toEqual([]);
  });

  it('covers null document URL mapping branches', async () => {
    const db = trackedDb(createFixtureDb());
    db.prepare(`
      INSERT INTO legal_documents (id, type, title, title_en, short_name, status, issued_date, in_force_date, url, description)
      VALUES ('doc-no-url', 'statute', 'No URL Act', 'No URL Act', 'NUA', 'in_force', '2020-01-01', '2020-01-01', NULL, 'no-url')
    `).run();
    db.prepare(`
      INSERT INTO legal_provisions (id, document_id, provision_ref, chapter, section, title, content)
      VALUES (999, 'doc-no-url', 'Art.1', NULL, '1', 'Articolul 1', 'content')
    `).run();

    const specific = await getProvision(db as unknown as any, {
      document_id: 'doc-no-url',
      provision_ref: 'Art.1',
    });
    expect(specific.results[0].url).toBeUndefined();

    const all = await getProvision(db as unknown as any, {
      document_id: 'doc-no-url',
    });
    expect(all.results[0].url).toBeUndefined();
  });
});

describe('EU basis and implementation tools', () => {
  it('covers getEUBasis unresolved/missing/success paths', async () => {
    const db = trackedDb(createFixtureDb());

    const unresolved = await getEUBasis(db as unknown as any, { document_id: 'missing' });
    expect(unresolved.results).toEqual([]);

    const noEuDb = trackedDb(createFixtureDb({ includeEu: false }));
    const noEu = await getEUBasis(noEuDb as unknown as any, { document_id: 'law-190-2018' });
    expect((noEu._metadata as any).note).toContain('EU references not available');

    const filtered = await getEUBasis(db as unknown as any, {
      document_id: 'law-190-2018',
      reference_types: ['references'],
      include_articles: true,
    });
    expect(filtered.results.length).toBeGreaterThan(0);
    expect(filtered.results[0].articles).toContain('6');
  });

  it('covers getProvisionEUBasis unresolved/missing/provision-miss/success', async () => {
    const db = trackedDb(createFixtureDb());

    const unresolved = await getProvisionEUBasis(db as unknown as any, {
      document_id: 'missing',
      provision_ref: 'Art.1',
    });
    expect(unresolved.results).toEqual([]);

    const noEuDb = trackedDb(createFixtureDb({ includeEu: false }));
    const noEu = await getProvisionEUBasis(noEuDb as unknown as any, {
      document_id: 'law-190-2018',
      provision_ref: 'Art.1',
    });
    expect((noEu._metadata as any).note).toContain('EU references not available');

    const missingProvision = await getProvisionEUBasis(db as unknown as any, {
      document_id: 'law-190-2018',
      provision_ref: 'Art.999',
    });
    expect(missingProvision.results).toEqual([]);

    const success = await getProvisionEUBasis(db as unknown as any, {
      document_id: 'law-190-2018',
      provision_ref: 'Art.1',
    });
    expect(success.results.length).toBeGreaterThan(0);
  });

  it('covers getRomanianImplementations filters and missing-table branch', async () => {
    const db = trackedDb(createFixtureDb());

    const success = await getRomanianImplementations(db as unknown as any, {
      eu_document_id: 'regulation:2016/679',
      primary_only: true,
      in_force_only: true,
    });
    expect(success.results.length).toBe(1);

    const noEuDb = trackedDb(createFixtureDb({ includeEu: false }));
    const noEu = await getRomanianImplementations(noEuDb as unknown as any, {
      eu_document_id: 'regulation:2016/679',
    });
    expect((noEu._metadata as any).note).toContain('EU references not available');
  });

  it('covers searchEUImplementations filters/limit and missing branch', async () => {
    const db = trackedDb(createFixtureDb());

    const rows = await searchEUImplementations(db as unknown as any, {
      query: 'GDPR',
      type: 'regulation',
      year_from: 2015,
      year_to: 2020,
      has_romanian_implementation: true,
      limit: 999,
    });
    expect(rows.results.length).toBeGreaterThan(0);

    const noEuDb = trackedDb(createFixtureDb({ includeEu: false }));
    const noEu = await searchEUImplementations(noEuDb as unknown as any, {});
    expect((noEu._metadata as any).note).toContain('EU documents not available');
  });

  it('covers minimum limit clamp in searchEUImplementations', async () => {
    const db = trackedDb(createFixtureDb());
    const rows = await searchEUImplementations(db as unknown as any, { limit: 0 });
    expect(rows.results.length).toBe(1);
  });
});

describe('citation and EU compliance validation tools', () => {
  it('covers validateCitation parsing and status/provision warnings', async () => {
    const db = trackedDb(createFixtureDb());

    const unparsed = await validateCitationTool(db as unknown as any, { citation: '   ' });
    expect(unparsed.results.valid).toBe(false);

    const missingDoc = await validateCitationTool(db as unknown as any, { citation: 'Section 1 Missing Act' });
    expect(missingDoc.results.valid).toBe(false);

    const secFirst = await validateCitationTool(db as unknown as any, {
      citation: 'Section 1 law-190-2018',
    });
    expect(secFirst.results.valid).toBe(true);

    const secLast = await validateCitationTool(db as unknown as any, {
      citation: 'law-190-2018 s 1',
    });
    expect(secLast.results.valid).toBe(true);

    const secWordLast = await validateCitationTool(db as unknown as any, {
      citation: 'law-190-2018 Section 1',
    });
    expect(secWordLast.results.valid).toBe(true);

    const missingProvision = await validateCitationTool(db as unknown as any, {
      citation: 'law-190-2018 s 999',
    });
    expect(missingProvision.results.valid).toBe(false);

    const repealed = await validateCitationTool(db as unknown as any, {
      citation: 'doc-repealed s 1',
    });
    expect(repealed.results.warnings.join(' ')).toContain('repealed');

    const amended = await validateCitationTool(db as unknown as any, {
      citation: 'doc-amended s 5',
    });
    expect(amended.results.warnings.join(' ')).toContain('amended');

    const plain = await validateCitationTool(db as unknown as any, {
      citation: 'law-365-2002',
    });
    expect(plain.results.valid).toBe(true);
    expect(plain.results.normalized).toContain('LEGE nr. 365');
  });

  it('covers validateEUCompliance status branches', async () => {
    const db = trackedDb(createFixtureDb());

    const missingDoc = await validateEUCompliance(db as unknown as any, { document_id: 'missing-doc' });
    expect(missingDoc.results.compliance_status).toBe('not_applicable');

    const noEuDb = trackedDb(createFixtureDb({ includeEu: false }));
    const noEu = await validateEUCompliance(noEuDb as unknown as any, { document_id: 'law-190-2018' });
    expect(noEu.results.warnings.join(' ')).toContain('EU references not available');

    const noRefs = await validateEUCompliance(db as unknown as any, { document_id: 'doc-not-yet' });
    expect(noRefs.results.compliance_status).toBe('not_applicable');
    expect(noRefs.results.recommendations[0]).toContain('No EU cross-references');

    const compliant = await validateEUCompliance(db as unknown as any, { document_id: 'law-190-2018' });
    expect(compliant.results.compliance_status).toBe('compliant');

    const partial = await validateEUCompliance(db as unknown as any, { document_id: 'doc-amended' });
    expect(partial.results.compliance_status).toBe('partial');

    const unclear = await validateEUCompliance(db as unknown as any, { document_id: 'oug-98-2010' });
    expect(unclear.results.compliance_status).toBe('unclear');

    const repealed = await validateEUCompliance(db as unknown as any, { document_id: 'doc-repealed' });
    expect(repealed.results.warnings.join(' ')).toContain('repealed');
  });

  it('covers validateEUCompliance eu_document_id filter branch', async () => {
    const db = trackedDb(createFixtureDb());
    const filtered = await validateEUCompliance(db as unknown as any, {
      document_id: 'law-190-2018',
      eu_document_id: 'regulation:2016/679',
    });
    expect(filtered.results.eu_references_found).toBeGreaterThan(0);
  });
});

describe('registry coverage', () => {
  it('covers buildTools branches', () => {
    const withoutDb = buildTools();
    expect(withoutDb.some(t => t.name === 'list_sources')).toBe(true);
    expect(withoutDb.some(t => t.name === 'about')).toBe(false);

    const dbNoDefinitions = trackedDb(new BetterSqlite3(':memory:'));
    const withDbNoDefinitions = buildTools(dbNoDefinitions as unknown as any);
    expect(withDbNoDefinitions.some(t => t.name === 'list_sources')).toBe(true);

    const db = trackedDb(createFixtureDb());
    const withContext = buildTools(db as unknown as any, {
      version: '1.0.0',
      fingerprint: 'abc',
      dbBuilt: '2026-02-21T00:00:00.000Z',
    });
    expect(withContext.some(t => t.name === 'about')).toBe(true);
  });

  it('covers registerTools handlers, dispatch cases, and errors', async () => {
    const db = trackedDb(createFixtureDb());
    const context = { version: '1.0.0', fingerprint: 'abc', dbBuilt: '2026-02-21T00:00:00.000Z' };
    const { list, call } = setupRegistryHarness(db, context);

    const listResult = await list({});
    expect((listResult as { tools: Array<{ name: string }> }).tools.some(t => t.name === 'about')).toBe(true);

    async function invoke(name: string, args: Record<string, unknown> = {}) {
      const response = await call({ params: { name, arguments: args } });
      expect((response as { isError?: boolean }).isError).toBeUndefined();
      return parseToolJson(response);
    }

    expect((await invoke('search_legislation', { query: 'datelor' })).results).toBeDefined();
    expect((await invoke('get_provision', { document_id: 'law-190-2018', provision_ref: 'Art.1' })).results).toBeDefined();
    expect((await invoke('validate_citation', { citation: 'law-190-2018 s 1' })).results).toBeDefined();
    expect((await invoke('build_legal_stance', { query: 'datelor' })).results).toBeDefined();
    expect((await invoke('format_citation', { citation: 'Section 1, Law 190/2018', format: 'full' })).formatted).toBeDefined();
    expect((await invoke('check_currency', { document_id: 'law-190-2018' })).results).toBeDefined();
    expect((await invoke('get_eu_basis', { document_id: 'law-190-2018' })).results).toBeDefined();
    expect((await invoke('get_romanian_implementations', { eu_document_id: 'regulation:2016/679' })).results).toBeDefined();
    expect((await invoke('search_eu_implementations', { query: 'GDPR' })).results).toBeDefined();
    expect((await invoke('get_provision_eu_basis', { document_id: 'law-190-2018', provision_ref: 'Art.1' })).results).toBeDefined();
    expect((await invoke('validate_eu_compliance', { document_id: 'law-190-2018' })).results).toBeDefined();
    expect((await invoke('list_sources')).results).toBeDefined();
    expect((await invoke('about')).server).toBeDefined();

    const unknown = await call({ params: { name: 'unknown_tool', arguments: {} } });
    expect((unknown as { isError?: boolean }).isError).toBe(true);
    expect(((unknown as { content: Array<{ text: string }> }).content[0].text)).toContain('Unknown tool');

    const thrown = await call({ params: { name: 'format_citation' } });
    expect((thrown as { isError?: boolean }).isError).toBe(true);
    expect(((thrown as { content: Array<{ text: string }> }).content[0].text)).toContain('Error:');

    const nonErrorArgs = Object.defineProperty({}, 'citation', {
      enumerable: true,
      get: () => {
        throw 'string-thrown';
      },
    });
    const nonErrorThrown = await call({ params: { name: 'format_citation', arguments: nonErrorArgs } });
    expect((nonErrorThrown as { isError?: boolean }).isError).toBe(true);
    expect(((nonErrorThrown as { content: Array<{ text: string }> }).content[0].text)).toContain('string-thrown');
  });

  it('covers about tool not configured branch', async () => {
    const db = trackedDb(createFixtureDb());
    const { call } = setupRegistryHarness(db);
    const result = await call({ params: { name: 'about', arguments: {} } });
    expect((result as { isError?: boolean }).isError).toBe(true);
    expect(((result as { content: Array<{ text: string }> }).content[0].text)).toContain('not configured');
  });
});
