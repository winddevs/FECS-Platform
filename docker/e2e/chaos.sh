#!/usr/bin/env bash
# Failure scenarios against the running docker stack (docker/e2e/run.sh up).
# Each one breaks something in the middle of a real flow and checks that the
# system recovers without losing or duplicating anything.
set -euo pipefail
cd "$(dirname "$0")/../.."
dc() { docker compose -f docker/docker-compose.e2e.yml "$@"; }
e2e() { # e2e <scenario> [arg]  -> prints the RESULT json, fails loudly otherwise
  local out
  out=$(dc --profile e2e run --rm -T -e SCENARIO="$1" -e ARG="${2:-}" e2e node /e2e/chaos.mjs 2>&1) || { echo "$out" | tail -15; return 1; }
  echo "$out" | grep -E "^  ok - (exactly|12 identical)" >&2 || true
  echo "$out" | sed -n 's/^RESULT //p' | tail -1
}
field() { python3 -c "import sys,json; print(json.loads(sys.stdin.read())$1)"; }
step() { echo; echo "## $*"; }
pass=0
ok() { pass=$((pass + 1)); echo "  PASS - $*"; }

step "0. make sure there is stock to sell (runs the make-to-stock journey)"
dc --profile e2e run --rm -T -e JOURNEYS=smoke,make-to-stock e2e 2>&1 | tail -1

step "1. every worker is down while an order is fulfilled; nothing is lost"
dc stop medusa-worker >/dev/null
placed=$(e2e place)
order=$(echo "$placed" | field "['order_id']")
sleep 8
state=$(e2e shipment-state "$order")
[ "$(echo "$state" | field "['shipments']")" = "[]" ] && ok "with no worker running the parcel is NOT created yet (the event waits in Redis)"
dc up -d --scale medusa-worker=2 medusa-worker >/dev/null 2>&1
e2e await-shipment "$order:1" >/dev/null && ok "workers back: the queued event is processed, one parcel created"

step "2. the carrier creates the parcel but the answer times out (the duplicate-waybill trap)"
e2e arm "create:timeout_after_create:1" >/dev/null
placed=$(e2e place); order=$(echo "$placed" | field "['order_id']")
sleep 8
echo "  shipment right after the timeout: $(e2e shipment-state "$order")"
e2e await-shipment "$order:1" >/dev/null && ok "reconciled by merchant reference: exactly ONE waybill, no duplicate"

step "3. the carrier API is down for the first attempts"
e2e arm "create:unavailable:2" >/dev/null
placed=$(e2e place); order=$(echo "$placed" | field "['order_id']")
e2e await-shipment "$order:1" >/dev/null && ok "retried until the carrier answered: exactly ONE waybill"

step "4. a webhook storm: the same carrier push 12 times at once, two workers"
e2e scan-burst "$order" >/dev/null && ok "12 identical pushes produce one event and one status change"

step "5. kill -9 a worker in the middle of work; the other one carries on"
placed=$(e2e place); order=$(echo "$placed" | field "['order_id']")
dc kill -s SIGKILL medusa-worker >/dev/null 2>&1 || true
dc up -d --scale medusa-worker=2 medusa-worker >/dev/null 2>&1
e2e await-shipment "$order:1" >/dev/null && ok "after a hard crash and restart the shipment still completes once"

step "6. the API server restarts; sessions and queues survive (Redis)"
dc restart medusa-server >/dev/null
for _ in $(seq 1 60); do curl -fs http://localhost:9100/internal/ready >/dev/null 2>&1 && break; sleep 2; done
placed=$(e2e place); order=$(echo "$placed" | field "['order_id']")
e2e await-shipment "$order:1" >/dev/null && ok "orders keep flowing after a server restart"

step "7. Kafka is down while the business keeps working; events are delivered when it returns"
dc stop redpanda >/dev/null
probe=$(e2e kafka-produce); material=$(echo "$probe" | field "['material_id']")
ok "with Kafka down a stock receipt is still accepted (the database is the source of truth)"
sleep 20
queued=$(e2e kafka-queue | field "['pending']")
[ "$queued" -ge 1 ] && ok "the event waits in the relay queue ($queued pending)"
dc up -d redpanda >/dev/null
for _ in $(seq 1 60); do dc ps --format json redpanda 2>/dev/null | grep -q '"Health":"healthy"' && break; sleep 2; done
e2e kafka-await "$material" >/dev/null && ok "Kafka is back: the event arrives, exactly once"
echo; echo "CHAOS PASSED ($pass scenarios)"
