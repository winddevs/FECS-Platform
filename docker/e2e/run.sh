#!/usr/bin/env bash
# Local end-to-end environment for the fashion platform.
#
#   bash docker/e2e/run.sh up      build the image, start the stack, seed demo data
#   bash docker/e2e/run.sh test    run the use-case journeys
#   bash docker/e2e/run.sh chaos   failure scenarios (worker down, Redis down, carrier down)
#   bash docker/e2e/run.sh logs    follow server and worker logs
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
  down)
    "${COMPOSE[@]}" --profile e2e down -v --remove-orphans
    ;;
  *)
    sed -n 2,9p "$0"; exit 1;;
esac
