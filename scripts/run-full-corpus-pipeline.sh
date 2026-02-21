#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

attempt=1
while true; do
  echo "[$(date -Iseconds)] ingest:indexed-laws attempt=$attempt"
  if npm run ingest:indexed-laws -- --quiet; then
    break
  fi

  echo "[$(date -Iseconds)] ingest:indexed-laws failed; retrying in 10s"
  attempt=$((attempt + 1))
  sleep 10
done

echo "[$(date -Iseconds)] build:db"
npm run build:db

echo "[$(date -Iseconds)] verify:parity"
npm run verify:parity

echo "[$(date -Iseconds)] build"
npm run build

echo "[$(date -Iseconds)] test"
npm test

echo "[$(date -Iseconds)] tsc --noEmit"
npx tsc --noEmit --pretty false

echo "[$(date -Iseconds)] full corpus pipeline complete"
