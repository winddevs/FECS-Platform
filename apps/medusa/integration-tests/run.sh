#!/usr/bin/env bash
# Runs every integration test against a real Postgres using the lean
# INTEGRATION_TEST profile of medusa-config.ts (no Redis/Algolia/S3 needed).
#
#   DATABASE_URL=postgresql://user:pass@localhost:5432/db bash integration-tests/run.sh [pattern]
#
# The database is migrated first; tests use unique ids per run, so they can be
# re-run against the same database.
set -euo pipefail
cd "$(dirname "$0")/.."

export INTEGRATION_TEST=true
export MEDUSA_DISABLE_TELEMETRY=true
export JWT_SECRET="${JWT_SECRET:-integration-test}"
export COOKIE_SECRET="${COOKIE_SECRET:-integration-test}"
export STORE_CORS="${STORE_CORS:-http://localhost}"
export ADMIN_CORS="${ADMIN_CORS:-http://localhost}"
export AUTH_CORS="${AUTH_CORS:-http://localhost}"
export CARRIER_SANDBOX=true
export CHANNEL_SANDBOX=true
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

: "${DATABASE_URL:?DATABASE_URL is required}"
pattern="${1:-}"

echo "==> migrating"
npx medusa db:migrate >/dev/null

failed=0
for test in integration-tests/[0-9]*.ts; do
  [[ -n "$pattern" && "$test" != *"$pattern"* ]] && continue
  echo "==> $test"
  log="$(mktemp)"
  if npx medusa exec "./$test" >"$log" 2>&1 && grep -q "INTEGRATION TEST PASSED" "$log"; then
    grep -E "^\s+ok - " "$log" | wc -l | xargs echo "    checks passed:"
  else
    grep -vE "^\s+at |^info:|^warn:" "$log" | tail -40
    failed=1
  fi
  rm -f "$log"
done
exit "$failed"
