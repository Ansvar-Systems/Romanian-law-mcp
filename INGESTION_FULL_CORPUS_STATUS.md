# Romanian Full-Corpus Ingestion Status

Date: 2026-02-21
Portal: https://legislatie.just.ro
Corpus target: `tipdoc=1` (LEGE)

## Current progress

- Indexed unique LEGE documents: `11,999` (`data/full-corpus/full-laws-index.ndjson`, deduped by `documentId`)
- Seed ingestion state file: `data/full-corpus/full-laws-ingest-state.json`
- Current ingestion command (resumable):

```bash
npm run ingest:indexed-laws -- --quiet
```

## Recovery work performed

The corpus index was recovered in stages due deterministic portal HTTP 500 failures:

1. Yearly ranges (`YYYY/01/01..YYYY/12/31`)
2. Month ranges for failed years
3. Single-day ranges for failed months
4. Alternate page-size codes (`rezultatePerPagina` code `2..5`) for failed days
5. Overlap windows (`day-1..day` and `day..day+1`) for failed days

## Unresolved inaccessible date windows

These windows still return HTTP 500 from the official portal on all tested variants above:

- `1993/03/11`
- `1993/05/06`
- `1993/12/30`
- `2013/02/21`
- `2017/02/16`
- `2018/01/03`
- `2020/01/06`

For these windows, laws were not fabricated and were not ingested.

## Reproduction commands

Yearly indexing (already executed):

```bash
npm run ingest:full-laws -- --index-only --no-resume --page-size-code 1 --signed-from YYYY/01/01 --signed-to YYYY/12/31 --quiet
```

Month/day fallback indexing:

```bash
npm run ingest:full-laws -- --index-only --no-resume --page-size-code 1 --signed-from YYYY/MM/DD --signed-to YYYY/MM/DD --quiet
```

Alternate page-size retry (same date window):

```bash
npm run ingest:full-laws -- --index-only --no-resume --page-size-code <2|3|4|5> --signed-from YYYY/MM/DD --signed-to YYYY/MM/DD --quiet
```
