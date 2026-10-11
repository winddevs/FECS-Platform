#!/usr/bin/env bash
# Local end-to-end environment for the fashion platform.
#
#   bash docker/e2e/run.sh up      build the image, start the stack, seed demo data
#   bash docker/e2e/run.sh test    run the use-case journeys
#   bash docker/e2e/run.sh chaos   failure scenarios (worker down, Redis down, carrier down)
#   bash docker/e2e/run.sh logs    follow server and worker logs
#   bash docker/e2e/run.sh storefront   prepare the Next.js storefront for this stack
#   bash docker/e2e/run.sh demo <cmd>   play the courier / Messenger customer (see demo.mjs)
#   bash docker/e2e/run.sh down    stop everything and delete the data
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker/docker-compose.e2e.yml)
BASE=http://localhost:9100

wait_ready() {
  echo "==> waiting for the API"
  for _ in $(seq 1 120); do
    if curl -fs "$BASE/internal/ready" >/dev/null 2>&1; then echo "    ready"; return 0; fi
    sleep 2
  done
  echo "API did not become ready"; "${COMPOSE[@]}" logs --tail=60 medusa-server bootstrap; exit 1
}

case "${1:-}" in
  up)
    "${COMPOSE[@]}" up -d --build --scale medusa-worker="${WORKERS:-2}"
    wait_ready
    echo "==> API http://localhost:9100  (admin@fashion.local / Passw0rd!local, role users: <role>@fashion.local)"
    echo "==> mock providers http://localhost:7070/__state"
    ;;
  test)
    wait_ready
    "${COMPOSE[@]}" --profile e2e run --rm e2e
    ;;
  chaos)
    wait_ready
    bash docker/e2e/chaos.sh
    ;;
  logs)
    "${COMPOSE[@]}" logs -f medusa-server medusa-worker
    ;;
  storefront)
    wait_ready
    # Payload CMS (embedded in the storefront) needs its own database.
    if ! "${COMPOSE[@]}" exec -T postgres psql -U fashion -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='ecommerce_cms'" | grep -q 1; then
      "${COMPOSE[@]}" exec -T postgres psql -U fashion -d postgres -c "CREATE DATABASE ecommerce_cms"
    fi
    node docker/e2e/demo.mjs storefront-env
    # env -u: a DATABASE_URL exported in this shell must not win over apps/store/.env
    (cd apps/store && yes | env -u DATABASE_URL npx --yes payload migrate)
    echo "==> start it:  cd apps/store && env -u DATABASE_URL ./node_modules/.bin/next dev --port 8000"
    echo "==> then open  http://localhost:8000/en/vn"
    ;;
  demo)
    shift
    node docker/e2e/demo.mjs "$@"
    ;;
  down)
    "${COMPOSE[@]}" --profile e2e down -v --remove-orphans
    ;;
  *)
    sed -n 2,9p "$0"; exit 1;;
esac
