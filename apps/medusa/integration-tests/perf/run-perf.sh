#!/usr/bin/env bash
# Performance check against the SLOs (TDD section 50) on a seeded database.
#
#   DATABASE_URL=postgresql://user:pass@localhost:5432/perf_db SCALE=1 \
#     bash integration-tests/perf/run-perf.sh
#
# Use a scratch database: it seeds hundreds of thousands of rows.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?DATABASE_URL is required}"
export INTEGRATION_TEST=true MEDUSA_DISABLE_TELEMETRY=true
export JWT_SECRET=perf COOKIE_SECRET=perf
export STORE_CORS=http://localhost ADMIN_CORS=http://localhost AUTH_CORS=http://localhost
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
npx medusa db:migrate >/dev/null
npx medusa exec ./integration-tests/perf/perf.ts 2>&1 | grep -vE "^info:|^warn:"
