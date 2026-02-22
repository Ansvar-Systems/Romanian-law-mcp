# Romanian Full-Corpus Ingestion Status

Date: 2026-02-22
Portal: https://legislatie.just.ro
Corpus target: `tipdoc=1` (LEGE)

## Final outcome

- Indexed unique LEGE documents: `11,999` (`data/full-corpus/full-laws-index.ndjson`, deduped by `documentId`)
- Seed coverage against index: `11,999 / 11,999` (missing: `0`)
- Database rebuild after full ingestion:
  - `12,001` legal documents
  - `112,257` provisions
  - `10,592` definitions
  - `323` EU documents
  - `1,601` EU references

## Parser/ingestion hardening used to reach full coverage

1. Added fallback parsing for legacy laws with `S_PAR` paragraphs but no `S_ART` wrappers.
2. Added metadata-only fallback for source pages marked `Act în curs de procesare` (no legal text available in body).
3. Kept strict no-fabrication policy: no synthetic legal text was generated.

## Portal instability notes

The following exact date filters consistently returned HTTP 500 on all tested strategies
(year/month/day splits, page-size codes 1-5, overlap windows):

- `1993/03/11`
- `1993/05/06`
- `1993/12/30`
- `2013/02/21`
- `2017/02/16`
- `2018/01/03`
- `2020/01/06`

These were documented and retried. No corresponding listing entries were present in the recovered index for these dates.

## Verification

Executed successfully after full ingestion:

```bash
npm run build:db
npm run verify:parity
npm run build
npm test
npx tsc --noEmit --pretty false
```

Parity verification matched source text character-by-character for:

- `law-190-2018` `Art.15`
- `law-365-2002` `Art.11`
- `law-286-2009-cyber` `Art.360`
