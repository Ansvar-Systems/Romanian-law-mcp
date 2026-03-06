/**
 * Response metadata utilities for Romanian Law MCP.
 */

import type Database from '@ansvar/mcp-sqlite';

export interface ResponseMetadata {
  data_source: string;
  jurisdiction: string;
  disclaimer: string;
  freshness?: string;
  note?: string;
  query_strategy?: string;
}

export interface ToolResponse<T> {
  results: T;
  _metadata: ResponseMetadata;
}

export function generateResponseMetadata(
  db: InstanceType<typeof Database>,
): ResponseMetadata {
  let freshness: string | undefined;
  try {
    const row = db.prepare(
      "SELECT value FROM db_metadata WHERE key = 'built_at'"
    ).get() as { value: string } | undefined;
    if (row) freshness = row.value;
  } catch {
    // Ignore
  }

  return {
    data_source: 'Legislatie.just.ro (legislatie.just.ro) — Ministerul Justiției (Ministry of Justice of Romania)',
    jurisdiction: 'RO',
    disclaimer:
      'This data is sourced from the Legislatie.just.ro under public domain. ' +
      'The authoritative versions are maintained by Ministerul Justiției (Ministry of Justice of Romania). ' +
      'Always verify with the official Legislatie.just.ro portal (legislatie.just.ro).',
    freshness,
  };
}
