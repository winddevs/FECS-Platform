#!/usr/bin/env bash
# Checks the nginx config against the local stack, in Docker, with a throwaway
# self-signed certificate:
#   1. `nginx -t` accepts the config
#   2. routing: HTTP->HTTPS, www->apex, storefront, API, webhooks, private paths
# Needs the stack from docker/e2e/run.sh (API :9100) and the storefront (:8000).
set -euo pipefail
cd "$(dirname "$0")"
NAME=bibae-nginx-test
WORK="$(mktemp -d)"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

mkdir -p "$WORK/live/bibaestudios.com" "$WORK/conf" "$WORK/snippets"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=bibaestudios.com" \
  -addext "subjectAltName=DNS:bibaestudios.com,DNS:www.bibaestudios.com,DNS:api.bibaestudios.com" \
  -keyout "$WORK/live/bibaestudios.com/privkey.pem" \
  -out "$WORK/live/bibaestudios.com/fullchain.pem" >/dev/null 2>&1

cp snippets/*.conf "$WORK/snippets/"
# The stack listens on the host's :9100 / :8000; inside Docker that is host.docker.internal.
sed -e 's#127.0.0.1:8000#host.docker.internal:8000#' \
    -e 's#127.0.0.1:9000#host.docker.internal:9100#' \
    bibaestudios.com.conf > "$WORK/conf/bibaestudios.com.conf"
# Pretend the caller is NOT on a private network, to prove /internal/ is closed.
STRICT="$WORK/strict"; mkdir -p "$STRICT/snippets" "$STRICT/conf"
cp "$WORK"/snippets/*.conf "$STRICT/snippets/"; cp "$WORK/conf/"*.conf "$STRICT/conf/"
printf 'allow 203.0.113.9;\ndeny all;\n' > "$STRICT/snippets/internal-only.conf"

run_nginx() { # $1 = config dir
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --add-host host.docker.internal:host-gateway \
    -p 18080:80 -p 18443:443 \
    -v "$1/conf/bibaestudios.com.conf:/etc/nginx/conf.d/default.conf:ro" \
    -v "$1/snippets:/etc/nginx/snippets:ro" \
    -v "$WORK/live:/etc/letsencrypt/live:ro" \
    nginx:alpine >/dev/null
  sleep 2
}

echo "== nginx -t"
docker run --rm --add-host host.docker.internal:host-gateway \
  -v "$WORK/conf/bibaestudios.com.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$WORK/snippets:/etc/nginx/snippets:ro" \
  -v "$WORK/live:/etc/letsencrypt/live:ro" \
  nginx:alpine nginx -t

pass=0; fail=0
check() { # name, expected, actual
  if [[ "$2" == "$3" ]]; then echo "  ok - $1"; pass=$((pass+1));
  else echo "  FAIL - $1 (expected $2, got $3)"; fail=$((fail+1)); fi
}
code() { curl -sk -o /dev/null -w '%{http_code}' --max-time 60 "$@"; }
R=(--resolve bibaestudios.com:18443:127.0.0.1 --resolve www.bibaestudios.com:18443:127.0.0.1 --resolve api.bibaestudios.com:18443:127.0.0.1)
H=(--resolve bibaestudios.com:18080:127.0.0.1 --resolve api.bibaestudios.com:18080:127.0.0.1)

run_nginx "$WORK"
echo "== routing"
check "http -> https (301)" 301 "$(code "${H[@]}" http://bibaestudios.com:18080/vi/vn)"
loc=$(curl -sk -o /dev/null -w '%{redirect_url}' "${H[@]}" http://api.bibaestudios.com:18080/health)
check "redirect keeps host and path" "https://api.bibaestudios.com/health" "$loc"
check "www -> apex (301)" 301 "$(code "${R[@]}" https://www.bibaestudios.com:18443/vi/vn)"
loc=$(curl -sk -o /dev/null -w '%{redirect_url}' "${R[@]}" https://www.bibaestudios.com:18443/vi/vn?x=1)
check "www redirect keeps the path" "https://bibaestudios.com/vi/vn?x=1" "$loc"
check "storefront home" 200 "$(code "${R[@]}" https://bibaestudios.com:18443/vi/vn)"
check "Payload admin reachable" 200 "$(code "${R[@]}" https://bibaestudios.com:18443/admin/login)"
check "API /health" 200 "$(code "${R[@]}" https://api.bibaestudios.com:18443/health)"
check "Medusa Admin UI /app" 200 "$(code "${R[@]}" https://api.bibaestudios.com:18443/app)"
check "unsigned Meta webhook reaches the app (rejected 401/403, not 502)" 1 \
  "$([[ $(code "${R[@]}" -X POST -H 'content-type: application/json' -d '{}' https://api.bibaestudios.com:18443/webhooks/meta) =~ ^(401|403)$ ]] && echo 1 || echo 0)"
check "webhook over the size limit (413)" 413 \
  "$(head -c 600000 /dev/zero | tr '\0' 'a' | code "${R[@]}" -X POST --data-binary @- https://api.bibaestudios.com:18443/webhooks/meta)"
hsts=$(curl -sk -D - -o /dev/null "${R[@]}" https://api.bibaestudios.com:18443/health | tr -d '\r' | grep -ci '^strict-transport-security')
check "HSTS header present" 1 "$hsts"
check "HTTP/2 negotiated" "2" "$(curl -sk -o /dev/null -w '%{http_version}' "${R[@]}" https://bibaestudios.com:18443/vi/vn)"

echo "== private paths"
check "/internal/ready from a private address is allowed" 200 "$(code "${R[@]}" https://api.bibaestudios.com:18443/internal/ready)"
run_nginx "$STRICT"
check "/internal/ready from outside is denied (403)" 403 "$(code "${R[@]}" https://api.bibaestudios.com:18443/internal/ready)"
check "/internal/metrics from outside is denied (403)" 403 "$(code "${R[@]}" https://api.bibaestudios.com:18443/internal/metrics)"

echo; echo "passed $pass, failed $fail"
[[ $fail -eq 0 ]]
