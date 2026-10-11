#!/usr/bin/env bash
# Boots the real API (integration profile), seeds role users and runs the
# HTTP-level test against it. Needs only Postgres.
#
#   DATABASE_URL=postgresql://user:pass@localhost:5432/db bash integration-tests/run-http.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?DATABASE_URL is required}"
export INTEGRATION_TEST=true MEDUSA_DISABLE_TELEMETRY=true
export JWT_SECRET=integration-test COOKIE_SECRET=integration-test
export STORE_CORS=http://localhost ADMIN_CORS=http://localhost AUTH_CORS=http://localhost
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
PORT="${PORT:-9101}"
export BASE_URL="http://localhost:${PORT}"

# Real provider adapters (no sandbox) so signature checks are genuinely tested.
# Nothing here reaches a real carrier or Meta: the J&T URL is closed and no
# Meta page token is configured.
export JT_FULFILLMENT_ENABLED=true JT_TRACKING_CALLBACK_ENABLED=true
export JT_API_BASE_URL=http://127.0.0.1:59999 JT_API_ACCOUNT=test JT_PRIVATE_KEY=test JT_WEBHOOK_SECRET=jt-secret
export META_MESSENGER_ENABLED=true META_APP_SECRET=meta-secret META_VERIFY_TOKEN=verify-me
export METRICS_TOKEN=http-test-metrics-token-0123456789
export AGENT_READ_TOOLS_ENABLED=true MANUFACTURING_ENABLED=true

echo "==> migrate + seed"
npx medusa db:migrate >/dev/null
npx medusa exec ./integration-tests/http/seed-users.ts >/dev/null

echo "==> start API on :${PORT}"
log="$(mktemp)"
npx medusa develop --port "$PORT" >"$log" 2>&1 &
server=$!
cleanup() {
  # `npx` forks the real server, so stop it by port as well as by pid.
  kill "$server" 2>/dev/null || true
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:${PORT}" | xargs kill 2>/dev/null || true
  fi
  wait "$server" 2>/dev/null || true
  rm -f "$log"
}
trap cleanup EXIT

for _ in $(seq 1 90); do
  if curl -fs "${BASE_URL}/internal/ready" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fs "${BASE_URL}/internal/ready" >/dev/null || { echo "server did not become ready"; tail -40 "$log"; exit 1; }

echo "==> HTTP tests"
node "${HTTP_SCRIPT:-integration-tests/http/api.test.mjs}" || { echo "--- server log tail ---"; tail -40 "$log"; exit 1; }
