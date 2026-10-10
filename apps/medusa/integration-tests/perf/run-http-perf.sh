#!/usr/bin/env bash
# HTTP-level performance check: boots the real API against the (seeded) perf
# database and drives it with concurrent clients.
#
#   DATABASE_URL=... bash integration-tests/perf/run-perf.sh        # seed first
#   DATABASE_URL=... bash integration-tests/perf/run-http-perf.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export HTTP_SCRIPT=integration-tests/perf/http-load.mjs
export METRICS_TOKEN="${METRICS_TOKEN:-perf-metrics-token}"
exec bash integration-tests/run-http.sh
