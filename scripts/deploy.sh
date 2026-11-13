#!/usr/bin/env bash
# Deploy the platform to two DigitalOcean droplets.
#
#   backend droplet  Medusa, Postgres (medusa + cms databases), Redis, MinIO, imgproxy, Meilisearch
#   store droplet    Next.js storefront + Payload CMS admin, FCaptcha
#
# Images are built on this machine (linux/amd64) and sent over SSH, so the
# servers never build anything and no registry is needed.
#
# Full guide: docs/deploy-digitalocean.md
#
# First deploy, in this order:
#   scripts/deploy.sh setup backend
#   scripts/deploy.sh setup store
#   (edit the TODO values in /opt/fecs/*/.env, see `scripts/deploy.sh env <target>`)
#   scripts/deploy.sh release backend
#   scripts/deploy.sh admin-user you@example.com
#   scripts/deploy.sh seed                 (optional: demo data + publishable key)
#   scripts/deploy.sh publishable-key
#   scripts/deploy.sh release store
#
# Every later deploy:  scripts/deploy.sh release backend|store|all

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$ROOT/infra/deploy"
CONF="${DEPLOY_CONF:-$DEPLOY_DIR/deploy.conf}"

# Local ports for the SSH tunnel used while building the storefront.
TUNNEL_PG_PORT=15432
TUNNEL_MEDUSA_PORT=19000

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=30)

# ---- output ---------------------------------------------------------------------

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh <command> [args]

Setup (once per droplet)
  setup backend|store        install packages, swap, firewall, nginx, TLS certificate,
                             upload compose files, create the server .env (secrets generated)
  env backend|store          print the server .env with secrets hidden, TODO values marked
  set-env backend|store KEY  set one value in the server .env (read from stdin or prompted)

Release
  release backend            build Medusa (+ MinIO on first run), ship, migrate, restart
  release store              build storefront, migrate CMS, ship, restart
  release all                backend, then store
  rollback backend|store     go back to the previous image (database migrations stay applied)

First-deploy helpers
  admin-user <email> [ROLE]  create a Medusa admin user (asks for the password), role default ERP_ADMIN
  grant-role <email> ROLE... give an existing admin user fashion-platform roles
  seed                       run the Medusa seed script (demo data and the publishable key)
  seed-cms <email>           create the first CMS admin and a welcome post (before the first store release)
  publishable-key            copy the Medusa publishable key into the store .env

Media storage
  imgproxy                   refresh the compose files and (re)start imgproxy only, e.g. after a
                             change of the IMGPROXY_S3_* settings; Medusa is not rebuilt
  media-to-r2 [--dry-run]    copy cms/media/ from MinIO to the Cloudflare R2 bucket (safe to repeat,
                             never deletes). Needs R2_ACCOUNT_ID, MEDIA_BUCKET, R2_WRITE_KEY_ID and
                             R2_WRITE_SECRET in the backend .env (docs/deploy-digitalocean.md 6.2)

Operate
  status                     containers, memory, disk, health checks
  logs backend|store [svc]   follow logs
  backup                     dump both databases to ~/fecs-backups
  ssh backend|store          open a shell on the droplet

Config: infra/deploy/deploy.conf (copy deploy.conf.example). Override with DEPLOY_CONF=path.
EOF
}

# ---- config ---------------------------------------------------------------------

load_conf() {
  [ -f "$CONF" ] || die "missing $CONF. Copy infra/deploy/deploy.conf.example to infra/deploy/deploy.conf and fill it in."
  # shellcheck disable=SC1090
  . "$CONF"
  : "${REMOTE_DIR:=/opt/fecs}"
  : "${PLATFORM:=linux/amd64}"
  : "${KEEP_RELEASES:=3}"
  : "${LETSENCRYPT_EMAIL:=}"
  : "${ADMIN_DOMAIN:=admin.$DOMAIN}"
  : "${IMG_DOMAIN:=img.$DOMAIN}"
  local v
  for v in DOMAIN API_DOMAIN S3_DOMAIN CAPTCHA_DOMAIN BACKEND_SSH BACKEND_PUBLIC_IP BACKEND_PRIVATE_IP; do
    [ -n "${!v:-}" ] || die "$v is empty in $CONF"
  done
}

need_store_conf() {
  local v
  for v in STORE_SSH STORE_PUBLIC_IP STORE_PRIVATE_IP; do
    [ -n "${!v:-}" ] || die "$v is empty in $CONF (the store droplet is not configured yet)"
  done
}

# Sets T_HOST, T_DIR, T_NAME for "backend" or "store".
target() {
  case "${1:-}" in
    backend)
      T_NAME=backend
      T_HOST="$BACKEND_SSH"
      ;;
    store)
      need_store_conf
      T_NAME=store
      T_HOST="$STORE_SSH"
      ;;
    *) die "expected 'backend' or 'store', got '${1:-}'" ;;
  esac
  T_DIR="$REMOTE_DIR/$T_NAME"
}

# ---- ssh helpers ----------------------------------------------------------------

rsh() {
  local host="$1"
  shift
  ssh "${SSH_OPTS[@]}" "$host" "$@"
}

# Remote compose command for a target directory (used inside remote scripts too).
COMPOSE='docker compose --env-file .env --env-file release.env'

# Read KEY from the server .env (surrounding quotes removed).
env_get() {
  local host="$1" dir="$2" key="$3" value
  value="$(rsh "$host" "grep -E '^${key}=' '$dir/.env' | tail -n 1 | cut -d= -f2-" </dev/null || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

# Set KEY=VALUE in the server .env (replaces the line or appends it).
env_set() {
  local host="$1" dir="$2" key="$3" value="$4"
  case "$value" in
    *[!A-Za-z0-9_./:@+=,-]*) die "refusing to write a value with unusual characters for $key" ;;
  esac
  rsh "$host" bash -s -- "$dir/.env" "$key" "$value" <<'EOF'
set -euo pipefail
file="$1"; key="$2"; value="$3"
[ -s "$file" ] || { echo "refusing to edit $file: it is missing or empty" >&2; exit 1; }
cp -p "$file" "$file.bak"
tmp="$(mktemp)"
awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {print k "=" v; f=1; next} {print} END{if(!f) print k "=" v}' "$file" > "$tmp"
[ -s "$tmp" ] || { rm -f "$tmp"; echo "edit produced an empty file; $file left unchanged" >&2; exit 1; }
cat "$tmp" > "$file"
rm -f "$tmp"
EOF
}

# Fail when a listed KEY holds a localhost address (a comma separated list such as
# STORE_CORS is checked item by item). This catches a development value copied into
# the production .env. Empty keys are skipped: require_env reports those.
# ALLOW_LOCAL_URLS=1 turns the failure into a warning.
LOCAL_URL_PATTERN='^[[:space:]]*[a-z][a-z0-9+.-]*://(localhost|127\.0\.0\.1|\[::1\])([:/?#]|$)'
reject_local_urls() {
  local host="$1" dir="$2"
  shift 2
  local bad="" key value
  for key in "$@"; do
    value="$(env_get "$host" "$dir" "$key")"
    [ -n "$value" ] || continue
    if printf '%s\n' "$value" | tr ',' '\n' | grep -Eiq "$LOCAL_URL_PATTERN"; then
      bad="$bad $key"
    fi
  done
  [ -n "$bad" ] || return 0
  if [ "${ALLOW_LOCAL_URLS:-0}" = "1" ]; then
    warn "local address in $dir/.env (continuing, ALLOW_LOCAL_URLS=1):$bad"
  else
    die "these values in $host:$dir/.env point at localhost:$bad
That looks like a development .env. Fix them with 'scripts/deploy.sh set-env $T_NAME KEY' and run again."
  fi
}

# Fail when any listed KEY is empty in the server .env.
require_env() {
  local host="$1" dir="$2"
  shift 2
  local missing="" key value
  for key in "$@"; do
    value="$(env_get "$host" "$dir" "$key")"
    [ -n "$value" ] || missing="$missing $key"
  done
  if [ -n "$missing" ]; then
    if [ "${ALLOW_INCOMPLETE:-0}" = "1" ]; then
      warn "empty in $dir/.env (continuing, ALLOW_INCOMPLETE=1):$missing"
    else
      die "empty in $host:$dir/.env:$missing
Fill them in (ssh $host, edit $dir/.env) and run again."
    fi
  fi
}

# Copy a local directory's contents to a remote directory (tar over ssh).
push_dir() {
  local src="$1" host="$2" dest="$3"
  # COPYFILE_DISABLE: no macOS ._ files. --no-same-owner: files belong to the remote user.
  COPYFILE_DISABLE=1 tar -C "$src" -cf - . | rsh "$host" "mkdir -p '$dest' && tar --no-same-owner -C '$dest' -xf -"
}

gen_secret() { openssl rand -hex 32; }

# ---- templates ------------------------------------------------------------------

render() {
  sed \
    -e "s|__API_DOMAIN__|$API_DOMAIN|g" \
    -e "s|__S3_DOMAIN__|$S3_DOMAIN|g" \
    -e "s|__IMG_DOMAIN__|$IMG_DOMAIN|g" \
    -e "s|__CAPTCHA_DOMAIN__|$CAPTCHA_DOMAIN|g" \
    -e "s|__ADMIN_DOMAIN__|$ADMIN_DOMAIN|g" \
    -e "s|__BACKEND_PRIVATE_IP__|$BACKEND_PRIVATE_IP|g" \
    -e "s|__CERT_NAME__|${CERT_NAME:-}|g" \
    -e "s|__DOMAIN__|$DOMAIN|g" \
    "$1"
}

# ---- local prerequisites ----------------------------------------------------------

check_local() {
  command -v docker >/dev/null || die "docker is not installed"
  docker buildx version >/dev/null 2>&1 || die "docker buildx is not available"
  command -v openssl >/dev/null || die "openssl is required to generate secrets"
  local arch
  arch="$(uname -m)"
  if [ "$arch" = "arm64" ] && [ "$PLATFORM" = "linux/amd64" ]; then
    local settings="$HOME/Library/Group Containers/group.com.docker/settings-store.json"
    if [ -f "$settings" ] && grep -q '"UseVirtualizationFrameworkRosetta": *false' "$settings"; then
      warn "Docker Desktop builds linux/amd64 through QEMU on this Apple Silicon Mac, which is very slow
         for the Next.js build. Turn on Settings > General > 'Use Rosetta for x86_64/amd64 emulation'."
    fi
  fi
}

release_tag() {
  local tag sha dirty=""
  sha="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo nogit)"
  if [ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]; then
    dirty="-dirty"
  fi
  tag="$(date +%Y%m%d-%H%M%S)-${sha}${dirty}"
  printf '%s' "$tag"
}

# Send a local image to a server: docker save | gzip | ssh | docker load.
ship_image() {
  local host="$1" image="$2"
  log "sending $image to $host"
  docker save "$image" | gzip -1 | rsh "$host" 'gunzip | docker load'
}

# Point release.env at a new tag and remember the one it replaces.
set_release() {
  local host="$1" dir="$2" tag="$3"
  rsh "$host" bash -s -- "$dir" "$tag" <<'EOF'
set -euo pipefail
cd "$1"
touch release.env
old="$(grep -E '^IMAGE_TAG=' release.env | tail -n 1 | cut -d= -f2- || true)"
[ -n "$old" ] || old=none
printf 'IMAGE_TAG=%s\nPREVIOUS_TAG=%s\n' "$2" "$old" > release.env
EOF
}

# Wait for a compose service to turn healthy; roll back to PREVIOUS_TAG when it does not.
wait_healthy_or_rollback() {
  local host="$1" dir="$2" service="$3"
  rsh "$host" bash -s -- "$dir" "$service" <<'EOF'
set -uo pipefail
cd "$1"; service="$2"
compose="docker compose --env-file .env --env-file release.env"
cid="$($compose ps -q "$service")"
for _ in $(seq 1 60); do
  state="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo none)"
  [ "$state" = healthy ] && { echo "$service is healthy"; exit 0; }
  sleep 3
done
echo "$service did not become healthy; last logs:" >&2
$compose logs --tail=60 "$service" >&2 || true
prev="$(grep -E '^PREVIOUS_TAG=' release.env | cut -d= -f2-)"
cur="$(grep -E '^IMAGE_TAG=' release.env | cut -d= -f2-)"
if [ -n "$prev" ] && [ "$prev" != none ] && [ "$prev" != "$cur" ]; then
  echo "rolling back to $prev" >&2
  printf 'IMAGE_TAG=%s\nPREVIOUS_TAG=%s\n' "$prev" "$cur" > release.env
  $compose up -d "$service" >&2
fi
exit 1
EOF
}

prune_images() {
  local host="$1" repo="$2"
  rsh "$host" "docker images '$repo' --format '{{.Tag}}' | sort -r | tail -n +$((KEEP_RELEASES + 1)) | xargs -r -I{} docker rmi '$repo:{}' >/dev/null 2>&1 || true"
}

# ---- setup ----------------------------------------------------------------------

setup_server() {
  local host="$1" dir="$2"
  log "preparing $host (packages, swap, firewall)"
  rsh "$host" bash -s -- "$dir" <<'EOF'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot ufw curl ca-certificates gnupg >/dev/null

# Docker Engine + Compose plugin from Docker's own apt repository.
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1
docker compose version >/dev/null

# 2 GB swap: the droplets are small, and swap turns an out-of-memory kill into a slow moment.
if [ -z "$(swapon --show --noheadings)" ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-fecs.conf
sysctl -q -p /etc/sysctl.d/99-fecs.conf

# Firewall: SSH, HTTP, HTTPS. (Docker ignores ufw for published ports, so the
# compose files publish internal ports on the private address or loopback only.)
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

mkdir -p "$1" /var/www/certbot
EOF
}

setup_nginx() {
  local host="$1" template="$2" conf_name="$3" cert_name="$4" domains_csv="$5"
  local tmp
  tmp="$(mktemp -d)"
  mkdir -p "$tmp/snippets"

  CERT_NAME="$cert_name" render "$DEPLOY_DIR/nginx/tls.conf.tpl" >"$tmp/snippets/tls.conf"
  cp "$ROOT"/infra/nginx/snippets/{proxy-common,security-headers,internal-only}.conf "$tmp/snippets/"
  cp "$DEPLOY_DIR"/nginx/snippets/*.conf "$tmp/snippets/"
  CERT_NAME="$cert_name" render "$DEPLOY_DIR/nginx/$template" >"$tmp/$conf_name"

  log "installing nginx config on $host"
  push_dir "$tmp" "$host" /tmp/fecs-nginx
  rm -rf "$tmp"

  # An empty argument disappears when ssh joins the command line, so "-" means "no email".
  rsh "$host" bash -s -- "$conf_name" "$cert_name" "$domains_csv" "${LETSENCRYPT_EMAIL:--}" <<'EOF'
set -euo pipefail
conf_name="$1"; cert_name="$2"; domains_csv="$3"; email="$4"
[ "$email" = "-" ] && email=""

mkdir -p /etc/nginx/snippets /var/www/certbot
cp /tmp/fecs-nginx/snippets/*.conf /etc/nginx/snippets/
# The stock "Welcome to nginx" site would clash with our default_server.
rm -f /etc/nginx/sites-enabled/default

names="${domains_csv//,/ }"
cert_file="/etc/letsencrypt/live/$cert_name/fullchain.pem"
if [ -n "$email" ]; then mail_args=(-m "$email"); else mail_args=(--register-unsafely-without-email); fi

# Only ask for names that resolve today. A name added to DNS later is picked up
# the next time this runs (the certificate is expanded).
want=""
for d in $names; do
  if getent ahosts "$d" >/dev/null 2>&1; then want="$want $d"; else echo "note: $d has no DNS record yet, left out of the certificate"; fi
done
[ -n "$want" ] || { echo "none of: $names has a DNS record" >&2; exit 1; }
args=(); for d in $want; do args+=(-d "$d"); done

cert_failed() {
  cat >&2 <<MSG

The certificate request failed. Common causes:
  - a DNS record for one of: $want points somewhere else than this droplet;
  - the record is proxied by Cloudflare ("orange cloud") and the proxy blocks the
    challenge. Switch it to DNS only (grey cloud) or turn off "Always Use HTTPS"
    for the moment. Re-run 'scripts/deploy.sh setup' afterwards: it is safe to repeat.
MSG
}

if [ ! -f "$cert_file" ]; then
  echo "requesting a Let's Encrypt certificate for:$want"
  cat > /etc/nginx/conf.d/fecs-bootstrap.conf <<CONF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $names;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
CONF
  rm -f "/etc/nginx/conf.d/$conf_name"
  nginx -t
  systemctl reload nginx
  if ! certbot certonly --webroot -w /var/www/certbot --cert-name "$cert_name" "${args[@]}" \
    --non-interactive --agree-tos "${mail_args[@]}"; then
    rm -f /etc/nginx/conf.d/fecs-bootstrap.conf
    nginx -t && systemctl reload nginx
    cert_failed
    exit 1
  fi
  rm -f /etc/nginx/conf.d/fecs-bootstrap.conf
else
  have="$(openssl x509 -in "$cert_file" -noout -ext subjectAltName | tr ',' '\n' | sed -n 's/.*DNS://p' | tr -d ' ')"
  missing=""
  for d in $want; do echo "$have" | grep -qx "$d" || missing="$missing $d"; done
  if [ -n "$missing" ]; then
    echo "adding to the certificate:$missing"
    if ! certbot certonly --webroot -w /var/www/certbot --cert-name "$cert_name" --expand "${args[@]}" \
      --non-interactive --agree-tos "${mail_args[@]}"; then
      cert_failed
      exit 1
    fi
  fi
fi

# Reload nginx after every renewal.
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

backup=""
if [ -f "/etc/nginx/conf.d/$conf_name" ]; then
  backup="$(mktemp)"
  cp "/etc/nginx/conf.d/$conf_name" "$backup"
fi
cp "/tmp/fecs-nginx/$conf_name" "/etc/nginx/conf.d/$conf_name"
if ! nginx -t; then
  if [ -n "$backup" ]; then cp "$backup" "/etc/nginx/conf.d/$conf_name"; else rm -f "/etc/nginx/conf.d/$conf_name"; fi
  echo "nginx rejected the new config; previous config restored" >&2
  exit 1
fi
systemctl reload nginx
systemctl enable nginx >/dev/null 2>&1 || true
rm -rf /tmp/fecs-nginx
EOF
}

check_dns() {
  local name ip resolved
  ip="$1"
  shift
  for name in "$@"; do
    resolved="$(dig +short "$name" 2>/dev/null | tr '\n' ' ')"
    case " $resolved " in
      *" $ip "*) ;;
      *) warn "DNS: $name resolves to '${resolved:-nothing}', not $ip. The certificate request fails unless this is fixed (a Cloudflare-proxied name resolves to Cloudflare addresses: that works only when the proxy forwards port 80)." ;;
    esac
  done
}

write_backend_env() {
  local minio_user="fecs-minio-admin" minio_pass
  minio_pass="$(gen_secret)"
  cat <<EOF
# Backend droplet settings. Created by scripts/deploy.sh setup on $(date -u +%Y-%m-%dT%H:%M:%SZ).
# Lines marked TODO need a value from you before \`release backend\`.
# Keep this file private (mode 600). It is not in git.

DOMAIN=$DOMAIN
API_DOMAIN=$API_DOMAIN
S3_DOMAIN=$S3_DOMAIN
IMG_DOMAIN=$IMG_DOMAIN
BACKEND_PRIVATE_IP=$BACKEND_PRIVATE_IP

# ---- infrastructure ----
POSTGRES_PASSWORD=$(gen_secret)
REDIS_PASSWORD=$(gen_secret)
MINIO_ROOT_USER=$minio_user
MINIO_ROOT_PASSWORD=$minio_pass
MINIO_CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN

# ---- Medusa ----
NODE_ENV=production
MEDUSA_DISABLE_TELEMETRY=true
JWT_SECRET=$(gen_secret)
COOKIE_SECRET=$(gen_secret)
METRICS_TOKEN=$(gen_secret)
DB_POOL_MIN=2
DB_POOL_MAX=10
DEFAULT_API_LOCALE=en
BACKEND_URL=https://$API_DOMAIN
STORE_CORS=https://$DOMAIN,https://www.$DOMAIN
ADMIN_CORS=https://$API_DOMAIN
AUTH_CORS=https://$API_DOMAIN,https://$DOMAIN,https://www.$DOMAIN
STOREFRONT_URL=https://$DOMAIN

# ---- Payload CMS (runs inside the storefront) ----
# Medusa calls the CMS on the store droplet's private address (port 8000).
PAYLOAD_SERVER_URL=http://${STORE_PRIVATE_IP:-STORE_PRIVATE_IP_NOT_SET}:8000
PAYLOAD_USER_COLLECTION=users
# Medusa authenticates to the CMS with this key. `scripts/deploy.sh seed-cms` gives it
# to the first CMS user (enable "API Key" on a user in the CMS admin to use another).
PAYLOAD_API_KEY=$(gen_secret)

# ---- file storage: MinIO on this droplet, public through https://$S3_DOMAIN ----
S3_ENDPOINT=https://$S3_DOMAIN
S3_FILE_URL=https://$S3_DOMAIN/ecommerce-medusa
S3_BUCKET=ecommerce-medusa
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=$minio_user
S3_SECRET_ACCESS_KEY=$minio_pass

# ---- search: Meilisearch container on this droplet (not published) ----
MEILISEARCH_HOST=http://meilisearch:7700
MEILISEARCH_MASTER_KEY=$(gen_secret)
MEILISEARCH_PRODUCT_INDEX=products

# ---- TODO: email (Resend over SMTP). Medusa refuses to start without these ----
SMTP_HOST=smtp.resend.com
SMTP_PORT=2465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=
EMAIL_FROM="bibaestudios <no-reply@$DOMAIN>"
EMAIL_DEFAULT_LOCALE=vi
INVOICE_DEFAULT_LOCALE=vi
EMAIL_SUPPORT_ADDRESS=support@$DOMAIN

# ---- optional ----
# PostHog analytics: leave empty to use the local (non-sending) provider.
POSTHOG_EVENTS_API_KEY=
POSTHOG_HOST=https://eu.i.posthog.com
SENTRY_DSN=
EOF
}

write_store_env() {
  local pg redis s3user s3pass
  pg="$(env_get "$BACKEND_SSH" "$REMOTE_DIR/backend" POSTGRES_PASSWORD)"
  redis="$(env_get "$BACKEND_SSH" "$REMOTE_DIR/backend" REDIS_PASSWORD)"
  s3user="$(env_get "$BACKEND_SSH" "$REMOTE_DIR/backend" MINIO_ROOT_USER)"
  s3pass="$(env_get "$BACKEND_SSH" "$REMOTE_DIR/backend" MINIO_ROOT_PASSWORD)"
  [ -n "$pg" ] && [ -n "$redis" ] && [ -n "$s3pass" ] ||
    die "could not read the backend .env. Run 'scripts/deploy.sh setup backend' first."
  cat <<EOF
# Store droplet settings. Created by scripts/deploy.sh setup on $(date -u +%Y-%m-%dT%H:%M:%SZ).
# Lines marked TODO need a value from you before \`release store\`.
# Keep this file private (mode 600). It is not in git.
# NEXT_PUBLIC_* values are compiled into the browser bundle at build time:
# change them, then run \`release store\` again.

DOMAIN=$DOMAIN
CAPTCHA_DOMAIN=$CAPTCHA_DOMAIN
STORE_PRIVATE_IP=$STORE_PRIVATE_IP
NODE_ENV=production

# ---- Medusa (backend droplet, private network) ----
MEDUSA_BACKEND_URL=http://$BACKEND_PRIVATE_IP:9000
# Filled by: scripts/deploy.sh publishable-key (or paste it from Medusa Admin > Settings > API keys)
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=
MEDUSA_PUBLISHABLE_KEY=
NEXT_PUBLIC_DEFAULT_REGION=vn

# ---- site URLs ----
NEXT_PUBLIC_BASE_URL=https://$DOMAIN
NEXT_PUBLIC_SERVER_URL=https://$DOMAIN
NEXT_PUBLIC_WWW_URL=https://$DOMAIN
PAYLOAD_SERVER_URL=https://$DOMAIN

# ---- Payload CMS ----
PAYLOAD_SECRET=$(gen_secret)
PREVIEW_SECRET=$(gen_secret)
REVALIDATE_SECRET=$(gen_secret)
CRON_SECRET=$(gen_secret)
DATABASE_URL=postgresql://ecommerce_admin:$pg@$BACKEND_PRIVATE_IP:5432/ecommerce_cms

# ---- shared sign-in rate limits (Redis on the backend droplet) ----
REDIS_URL=redis://:$redis@$BACKEND_PRIVATE_IP:6379

# ---- media: MinIO on the backend droplet ----
S3_ENDPOINT=https://$S3_DOMAIN
S3_FILE_URL=https://$S3_DOMAIN/ecommerce-media
S3_BUCKET=ecommerce-media
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=$s3user
S3_SECRET_ACCESS_KEY=$s3pass
NEXT_PUBLIC_R2_HOSTNAME=
# Resized WebP images through imgproxy (https://$IMG_DOMAIN). Empty = Next.js resizes
# them itself. Fill it in only after the DNS record, the Cloudflare rules and
# \`release backend\` are done (docs/deploy-digitalocean.md, "Image resizing"):
#   scripts/deploy.sh set-env store NEXT_PUBLIC_IMGPROXY_URL   (then release store)
NEXT_PUBLIC_IMGPROXY_URL=

# ---- captcha (FCaptcha container on this droplet) ----
NEXT_PUBLIC_FCAPTCHA_ORIGIN=https://$CAPTCHA_DOMAIN
NEXT_PUBLIC_FCAPTCHA_SITE_KEY=storefront
FCAPTCHA_ORIGIN=http://fcaptcha:3000
FCAPTCHA_SECRET=$(gen_secret)
FCAPTCHA_VERIFY_SECRET=$(gen_secret)

# ---- TODO: email (Resend over SMTP) ----
SMTP_HOST=smtp.resend.com
SMTP_PORT=2465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=
EMAIL_FROM="bibaestudios <no-reply@$DOMAIN>"

# ---- optional ----
NEXT_PUBLIC_STRIPE_KEY=
FACEBOOK_DOMAIN_VERIFICATION=
EOF
}

cmd_setup() {
  target "${1:-}"
  check_local
  log "checking SSH access to $T_HOST"
  rsh "$T_HOST" 'echo connected as $(whoami) on $(hostname)' || die "cannot ssh to $T_HOST"

  setup_server "$T_HOST" "$T_DIR"

  log "uploading compose files to $T_HOST:$T_DIR"
  push_dir "$DEPLOY_DIR/$T_NAME" "$T_HOST" "$T_DIR"
  rsh "$T_HOST" "chmod +x '$T_DIR'/postgres-init/*.sh 2>/dev/null || true"

  if rsh "$T_HOST" "[ -f '$T_DIR/.env' ]"; then
    log "$T_DIR/.env already exists: keeping it"
  else
    log "creating $T_DIR/.env with generated secrets"
    local tmp
    tmp="$(mktemp)"
    if [ "$T_NAME" = backend ]; then write_backend_env >"$tmp"; else write_store_env >"$tmp"; fi
    rsh "$T_HOST" "umask 077 && cat > '$T_DIR/.env'" <"$tmp"
    rm -f "$tmp"
  fi
  rsh "$T_HOST" "[ -f '$T_DIR/release.env' ] || printf 'IMAGE_TAG=none\nPREVIOUS_TAG=none\n' > '$T_DIR/release.env'"

  if [ "$T_NAME" = backend ]; then
    check_dns "$BACKEND_PUBLIC_IP" "$API_DOMAIN" "$S3_DOMAIN" "$IMG_DOMAIN"
    setup_nginx "$T_HOST" backend.conf.tpl fecs-backend.conf "$API_DOMAIN" "$API_DOMAIN,$S3_DOMAIN,$IMG_DOMAIN"
  else
    check_dns "$STORE_PUBLIC_IP" "$DOMAIN" "www.$DOMAIN" "$ADMIN_DOMAIN" "$CAPTCHA_DOMAIN"
    setup_nginx "$T_HOST" store.conf.tpl fecs-store.conf "$DOMAIN" "$DOMAIN,www.$DOMAIN,$ADMIN_DOMAIN,$CAPTCHA_DOMAIN"
  fi

  log "setup of the $T_NAME droplet is done"
  printf 'Next: fill the TODO values:  ssh %s && nano %s/.env\n' "$T_HOST" "$T_DIR"
}

# Set one value in a server .env. The value is read from the terminal (hidden) or
# from stdin, never from the command line, so it stays out of shell history.
cmd_set_env() {
  target "${1:-}"
  local key="${2:-}" value
  [ -n "$key" ] || die "usage: set-env backend|store KEY   (value read from stdin or prompted)"
  case "$key" in *[!A-Z0-9_]*) die "invalid variable name: $key" ;; esac
  if [ -t 0 ]; then
    read -r -s -p "Value for $key: " value
    printf '\n'
  else
    IFS= read -r value
  fi
  [ -n "$value" ] || die "empty value"
  env_set "$T_HOST" "$T_DIR" "$key" "$value"
  log "$key updated in $T_HOST:$T_DIR/.env (previous file kept as .env.bak)"
}

cmd_env() {
  target "${1:-}"
  rsh "$T_HOST" "cat '$T_DIR/.env'" |
    sed -E 's/^([A-Z0-9_]*(PASSWORD|SECRET|KEY|TOKEN)[A-Z0-9_]*)=(.+)$/\1=********/; s#(://[^:/@]+:)[^@/]+@#\1********@#' |
    sed -E 's/^([A-Z0-9_]+)=$/\1=   <-- TODO (empty)/'
}

# ---- release: backend -------------------------------------------------------------

BACKEND_REQUIRED=(
  JWT_SECRET COOKIE_SECRET POSTGRES_PASSWORD REDIS_PASSWORD MINIO_ROOT_PASSWORD PAYLOAD_API_KEY
  MEILISEARCH_MASTER_KEY SMTP_PASSWORD EMAIL_FROM BACKEND_URL STOREFRONT_URL
)
# Public addresses (emails, CORS, file links). None may point at a local machine.
BACKEND_PUBLIC_URLS=(
  BACKEND_URL STOREFRONT_URL STORE_CORS ADMIN_CORS AUTH_CORS S3_ENDPOINT S3_FILE_URL
)

release_backend() {
  target backend
  check_local
  require_env "$T_HOST" "$T_DIR" "${BACKEND_REQUIRED[@]}"
  reject_local_urls "$T_HOST" "$T_DIR" "${BACKEND_PUBLIC_URLS[@]}"
  local tag
  tag="$(release_tag)"

  log "building Medusa image fecs-medusa:$tag ($PLATFORM)"
  docker buildx build --platform "$PLATFORM" -f "$ROOT/infra/docker/medusa.Dockerfile" \
    -t "fecs-medusa:$tag" --load "$ROOT"

  if ! rsh "$T_HOST" 'docker image inspect fecs-minio:1 >/dev/null 2>&1'; then
    log "building MinIO from source (first release only)"
    docker buildx build --platform "$PLATFORM" -t fecs-minio:1 --load "$ROOT/docker/minio"
    ship_image "$T_HOST" fecs-minio:1
  fi
  ship_image "$T_HOST" "fecs-medusa:$tag"

  log "refreshing compose files"
  push_dir "$DEPLOY_DIR/backend" "$T_HOST" "$T_DIR"
  rsh "$T_HOST" "chmod +x '$T_DIR'/postgres-init/*.sh 2>/dev/null || true"
  set_release "$T_HOST" "$T_DIR" "$tag"

  log "starting data services, applying migrations"
  # -T and </dev/null: the script itself arrives on stdin, so no command inside
  # may read from it.
  rsh "$T_HOST" bash -s -- "$T_DIR" <<'EOF'
set -euo pipefail
cd "$1"
compose="docker compose --env-file .env --env-file release.env"
$compose up -d postgres redis minio meilisearch </dev/null
$compose run --rm -T minio-init </dev/null
$compose run --rm -T migrate </dev/null
$compose up -d medusa </dev/null
EOF
  wait_healthy_or_rollback "$T_HOST" "$T_DIR" medusa
  prune_images "$T_HOST" fecs-medusa
  release_imgproxy
  log "backend released: $tag"
}

# imgproxy resizes the storefront images. It starts after Medusa is healthy and a
# failure here only warns: product pages keep working through the Next.js
# optimizer until the storefront is built with NEXT_PUBLIC_IMGPROXY_URL.
release_imgproxy() {
  local presets="$ROOT/docker/imgproxy/presets.txt" changed=0
  if [ ! -f "$presets" ]; then
    warn "missing $presets: imgproxy not updated"
    return 0
  fi
  log "updating imgproxy"
  # The presets file is bind-mounted, so imgproxy must be restarted when it changes.
  if ! rsh "$T_HOST" "cmp -s - '$T_DIR/imgproxy/presets.txt'" <"$presets" 2>/dev/null; then
    changed=1
    rsh "$T_HOST" "mkdir -p '$T_DIR/imgproxy' && cat > '$T_DIR/imgproxy/presets.txt'" <"$presets"
  fi
  rsh "$T_HOST" bash -s -- "$T_DIR" "$changed" <<'EOF' || warn "imgproxy did not become healthy: run 'scripts/deploy.sh logs backend imgproxy'. The storefront is not affected until NEXT_PUBLIC_IMGPROXY_URL is set."
set -euo pipefail
cd "$1"
compose="docker compose --env-file .env --env-file release.env"
$compose up -d imgproxy </dev/null
if [ "$2" = 1 ]; then $compose restart imgproxy </dev/null; fi
cid="$($compose ps -q imgproxy </dev/null)"
for _ in $(seq 1 20); do
  state="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo none)"
  if [ "$state" = healthy ]; then echo "imgproxy is healthy"; exit 0; fi
  sleep 3
done
$compose logs --tail=30 imgproxy </dev/null >&2 || true
exit 1
EOF
}

# ---- release: store ---------------------------------------------------------------

STORE_REQUIRED=(
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY PAYLOAD_SECRET DATABASE_URL SMTP_PASSWORD EMAIL_FROM
  FCAPTCHA_SECRET FCAPTCHA_VERIFY_SECRET NEXT_PUBLIC_BASE_URL
)
# NEXT_PUBLIC_* values are compiled into the browser bundle, so a local address
# here ships to every visitor.
STORE_PUBLIC_URLS=(
  NEXT_PUBLIC_BASE_URL NEXT_PUBLIC_SERVER_URL NEXT_PUBLIC_WWW_URL PAYLOAD_SERVER_URL
  S3_ENDPOINT S3_FILE_URL NEXT_PUBLIC_FCAPTCHA_ORIGIN NEXT_PUBLIC_IMGPROXY_URL
)

TUNNEL_SOCK=""
BUILD_ENV_FILE=""

tunnel_down() {
  if [ -n "$TUNNEL_SOCK" ] && [ -S "$TUNNEL_SOCK" ]; then
    ssh -S "$TUNNEL_SOCK" -O exit "$BACKEND_SSH" >/dev/null 2>&1 || true
  fi
  [ -z "$BUILD_ENV_FILE" ] || rm -f "$BUILD_ENV_FILE"
}

# NEXT_PUBLIC_IMGPROXY_URL is compiled into the browser bundle. If the image host
# is not answering when the storefront ships, every picture on the site breaks
# until the next release, so refuse to build against a host that is down.
# /v1/w999/... names an unknown preset: a working chain (Cloudflare, nginx,
# imgproxy) answers 404, a stopped imgproxy gives 502, a missing DNS record gives 000.
check_imgproxy_url() {
  local url code
  url="$(env_get "$T_HOST" "$T_DIR" NEXT_PUBLIC_IMGPROXY_URL)"
  [ -n "$url" ] || return 0
  [ "${SKIP_IMG_CHECK:-0}" = "1" ] && return 0
  code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "${url%/}/v1/w999/preflight-check.webp" || true)"
  if [ "$code" != "404" ]; then
    die "NEXT_PUBLIC_IMGPROXY_URL=$url does not answer like imgproxy (HTTP $code, expected 404).
Check the DNS record and the Cloudflare proxy of the image host, and run 'scripts/deploy.sh release backend'.
To ship without imgproxy, remove the value from $T_HOST:$T_DIR/.env. To skip this check: SKIP_IMG_CHECK=1."
  fi
  log "image host $url answers (HTTP $code)"
}

release_store() {
  target store
  check_local
  require_env "$T_HOST" "$T_DIR" "${STORE_REQUIRED[@]}"
  reject_local_urls "$T_HOST" "$T_DIR" "${STORE_PUBLIC_URLS[@]}"

  # Payload's dev mode (`next dev`) writes a "dev" row into payload_migrations. Its
  # `migrate` then asks a yes/no question, which hangs a non-interactive build for
  # ever. Fail fast and say why, instead of answering "yes" on a live database.
  local dev_rows
  dev_rows="$(rsh "$BACKEND_SSH" "cd '$REMOTE_DIR/backend' && docker compose --env-file .env --env-file release.env exec -T postgres psql -U ecommerce_admin -d ecommerce_cms -Atc \"select count(*) from payload_migrations where name = 'dev'\"" </dev/null 2>/dev/null | tr -d '[:space:]' || true)"
  if [ -n "$dev_rows" ] && [ "$dev_rows" != "0" ]; then
    die "the CMS database has a Payload dev-mode marker (payload_migrations.name = 'dev'): someone ran 'next dev' against it.
Check the schema is unchanged, then remove just that row:
  delete from payload_migrations where name = 'dev' and batch = -1;
Never point 'next dev' at the production database."
  fi

  log "checking that Medusa answers on the private network"
  rsh "$T_HOST" "curl -fsS -m 10 http://$BACKEND_PRIVATE_IP:9000/health >/dev/null" ||
    die "the store droplet cannot reach Medusa at http://$BACKEND_PRIVATE_IP:9000/health. Release the backend first and check both droplets are in the same VPC."

  check_imgproxy_url

  local tag
  tag="$(release_tag)"

  if [ -n "${REUSE_IMAGE:-}" ]; then
    # Ship an image that was already built (for example after a failed upload).
    tag="$REUSE_IMAGE"
    docker image inspect "fecs-store:$tag" >/dev/null 2>&1 || die "no local image fecs-store:$tag"
    log "reusing the local image fecs-store:$tag (no build)"
  else
    # Build-time environment = the server .env, with database and Medusa pointed
    # at the SSH tunnel (the private addresses are not reachable from this Mac).
    BUILD_ENV_FILE="$(mktemp)"
    chmod 600 "$BUILD_ENV_FILE"
    trap tunnel_down EXIT
    rsh "$T_HOST" "cat '$T_DIR/.env'" >"$BUILD_ENV_FILE"
    local db_url
    db_url="$(env_get "$T_HOST" "$T_DIR" DATABASE_URL)"
    db_url="${db_url/@$BACKEND_PRIVATE_IP:5432/@host.docker.internal:$TUNNEL_PG_PORT}"
    {
      printf '\n# --- build-time overrides (tunnel to the backend droplet) ---\n'
      printf 'DATABASE_URL="%s"\n' "$db_url"
      printf 'MEDUSA_BACKEND_URL="http://host.docker.internal:%s"\n' "$TUNNEL_MEDUSA_PORT"
      printf 'REDIS_URL=""\n'
    } >>"$BUILD_ENV_FILE"

    log "opening an SSH tunnel to the backend droplet (Postgres and Medusa)"
    TUNNEL_SOCK="$(mktemp -u /tmp/fecs-tunnel.XXXXXX)"
    ssh "${SSH_OPTS[@]}" -f -N -M -S "$TUNNEL_SOCK" -o ExitOnForwardFailure=yes \
      -L "$TUNNEL_PG_PORT:$BACKEND_PRIVATE_IP:5432" \
      -L "$TUNNEL_MEDUSA_PORT:$BACKEND_PRIVATE_IP:9000" "$BACKEND_SSH" </dev/null >/dev/null 2>&1 ||
      die "could not open the tunnel (are the local ports $TUNNEL_PG_PORT and $TUNNEL_MEDUSA_PORT free?)"

    log "migrating the CMS database and building fecs-store:$tag ($PLATFORM)"
    docker buildx build --platform "$PLATFORM" -f "$ROOT/infra/docker/store.Dockerfile" \
      --target runtime --no-cache-filter migrate \
      --add-host host.docker.internal:host-gateway \
      --secret "id=build_env,src=$BUILD_ENV_FILE" \
      -t "fecs-store:$tag" --load "$ROOT"

    tunnel_down
    trap - EXIT
  fi

  if [ "${BUILD_ONLY:-0}" = "1" ]; then
    log "BUILD_ONLY=1: image fecs-store:$tag built, nothing was sent to the server"
    return 0
  fi

  ship_image "$T_HOST" "fecs-store:$tag"

  log "refreshing compose files"
  push_dir "$DEPLOY_DIR/store" "$T_HOST" "$T_DIR"
  set_release "$T_HOST" "$T_DIR" "$tag"
  rsh "$T_HOST" "cd '$T_DIR' && $COMPOSE up -d"
  wait_healthy_or_rollback "$T_HOST" "$T_DIR" store
  prune_images "$T_HOST" fecs-store
  log "store released: $tag"
  printf 'Check: https://%s and the CMS at https://%s\n' "$DOMAIN" "$ADMIN_DOMAIN"
}

cmd_release() {
  load_conf
  case "${1:-}" in
    backend) release_backend ;;
    store) release_store ;;
    all)
      release_backend
      release_store
      ;;
    *) die "usage: release backend|store|all" ;;
  esac
}

cmd_rollback() {
  target "${1:-}"
  local service="medusa"
  [ "$T_NAME" = store ] && service="store"
  rsh "$T_HOST" bash -s -- "$T_DIR" "$service" <<'EOF'
set -euo pipefail
cd "$1"; service="$2"
compose="docker compose --env-file .env --env-file release.env"
prev="$(grep -E '^PREVIOUS_TAG=' release.env | cut -d= -f2-)"
cur="$(grep -E '^IMAGE_TAG=' release.env | cut -d= -f2-)"
if [ -z "$prev" ] || [ "$prev" = none ]; then echo "no previous release to go back to" >&2; exit 1; fi
echo "rolling back $cur -> $prev (database migrations are NOT reverted)"
printf 'IMAGE_TAG=%s\nPREVIOUS_TAG=%s\n' "$prev" "$cur" > release.env
$compose up -d "$service"
EOF
}

# ---- first-deploy helpers -------------------------------------------------------

cmd_admin_user() {
  target backend
  local email="${1:-}" password
  shift || true
  # A user with no role gets 403 on the ERP endpoints and the search sync button.
  local roles=("$@")
  [ "${#roles[@]}" -gt 0 ] || roles=(ERP_ADMIN)
  [ -n "$email" ] || die "usage: admin-user <email> [ROLE...]   (default role: ERP_ADMIN)"
  if [ "${GENERATE_PASSWORD:-0}" = "1" ]; then
    # 24 characters from a URL-safe alphabet, plus a symbol and a digit so it passes common rules.
    password="$(openssl rand -base64 18 | tr '+/' 'Aa' | tr -d '=\n')-9!"
    printf 'Generated password for %s (shown once, change it after the first login):\n  %s\n' "$email" "$password"
  elif [ -t 0 ]; then
    read -r -s -p "Password for $email: " password
    printf '\n'
  else
    IFS= read -r password
  fi
  [ "${#password}" -ge 12 ] || die "use at least 12 characters"
  # The script comes in on stdin, so the password travels inside it, shell-quoted.
  {
    printf 'password=%q\n' "$password"
    cat <<'EOF'
set -euo pipefail
cd "$1"; email="$2"; shift 2
compose="docker compose --env-file .env --env-file release.env"
$compose run --rm -T cli user -e "$email" -p "$password" </dev/null
$compose run --rm -T cli exec ./src/scripts/grant-fashion-role.js "$email" "$@" </dev/null
EOF
  } | rsh "$T_HOST" bash -s -- "$T_DIR" "$email" "${roles[@]}"
}

cmd_grant_role() {
  target backend
  local email="${1:-}"
  shift || true
  [ -n "$email" ] && [ "$#" -gt 0 ] || die "usage: grant-role <email> ROLE [ROLE...]"
  rsh "$T_HOST" bash -s -- "$T_DIR" "$email" "$@" <<'EOF'
set -euo pipefail
cd "$1"; email="$2"; shift 2
docker compose --env-file .env --env-file release.env run --rm -T cli exec ./src/scripts/grant-fashion-role.js "$email" "$@" </dev/null
EOF
}

cmd_seed() {
  target backend
  warn "the seed script creates DEMO data (regions, products, a sales channel, the publishable key)."
  if [ "${ASSUME_YES:-0}" != "1" ]; then
    read -r -p "Run it on the production database? [y/N] " answer
    [ "$answer" = y ] || die "cancelled"
  fi
  rsh "$T_HOST" "cd '$T_DIR' && $COMPOSE run --rm seed"
}

# Create the first CMS admin and one welcome post (the storefront build needs at
# least one post). Runs the Payload Local API from this machine through an SSH
# tunnel to the CMS database. Needs `pnpm install` done locally.
cmd_seed_cms() {
  load_conf
  target store
  local email="${1:-}" password sock envf db_url api_key
  [ -n "$email" ] || die "usage: seed-cms <email>   (GENERATE_PASSWORD=1 to generate the password)"
  if [ "${GENERATE_PASSWORD:-0}" = "1" ]; then
    password="$(openssl rand -base64 18 | tr '+/' 'Aa' | tr -d '=\n')-9!"
    printf 'Generated CMS password for %s (shown once, change it after the first login):\n  %s\n' "$email" "$password"
  elif [ -t 0 ]; then
    read -r -s -p "CMS password for $email: " password
    printf '\n'
  else
    IFS= read -r password
  fi
  [ "${#password}" -ge 12 ] || die "use at least 12 characters"

  # After the password is read: ssh would otherwise swallow a piped password.
  api_key="$(env_get "$BACKEND_SSH" "$REMOTE_DIR/backend" PAYLOAD_API_KEY)"
  [ -n "$api_key" ] || die "PAYLOAD_API_KEY is empty in the backend .env"

  envf="$(mktemp)"
  chmod 600 "$envf"
  sock="$(mktemp -u /tmp/fecs-cms-tunnel.XXXXXX)"
  TUNNEL_SOCK="$sock"
  BUILD_ENV_FILE="$envf"
  trap tunnel_down EXIT
  rsh "$T_HOST" "cat '$T_DIR/.env'" >"$envf"
  db_url="$(env_get "$T_HOST" "$T_DIR" DATABASE_URL)"
  db_url="${db_url/@$BACKEND_PRIVATE_IP:5432/@127.0.0.1:$TUNNEL_PG_PORT}"

  log "opening an SSH tunnel to the CMS database"
  # Close stdio: a backgrounded ssh that keeps the caller's pipes open makes callers hang.
  ssh "${SSH_OPTS[@]}" -f -N -M -S "$sock" -o ExitOnForwardFailure=yes \
    -L "$TUNNEL_PG_PORT:$BACKEND_PRIVATE_IP:5432" "$BACKEND_SSH" </dev/null >/dev/null 2>&1 ||
    die "could not open the tunnel (is local port $TUNNEL_PG_PORT in use?)"

  log "creating the CMS admin and the welcome post"
  (
    cd "$ROOT/apps/store"
    set -a
    # shellcheck disable=SC1090
    . "$envf"
    set +a
    export DATABASE_URL="$db_url" REDIS_URL="" NODE_ENV=production
    export CMS_ADMIN_EMAIL="$email" CMS_ADMIN_PASSWORD="$password" CMS_API_KEY="$api_key"
    npx payload run scripts/seed-cms-demo.ts </dev/null 2>&1
  )
  tunnel_down
  trap - EXIT
}

cmd_publishable_key() {
  load_conf
  target backend
  local key
  key="$(rsh "$T_HOST" "cd '$T_DIR' && $COMPOSE exec -T postgres psql -U ecommerce_admin -d ecommerce_medusa -Atc \"select token from api_key where type='publishable' and revoked_at is null and deleted_at is null order by created_at limit 1\"" | tr -d '[:space:]')"
  [ -n "$key" ] || die "no publishable API key in Medusa. Run 'seed', or create one in Medusa Admin > Settings > Publishable API Keys and add the sales channel."
  case "$key" in pk_*) ;; *) die "unexpected key format" ;; esac
  target store
  env_set "$T_HOST" "$T_DIR" NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY "$key"
  env_set "$T_HOST" "$T_DIR" MEDUSA_PUBLISHABLE_KEY "$key"
  log "publishable key written to the store .env"
}

# ---- media storage: MinIO -> Cloudflare R2 -----------------------------------

# Compose files, presets and a (re)start of imgproxy, without building Medusa.
# `up -d` recreates the container when its settings in .env changed.
cmd_imgproxy() {
  load_conf
  target backend
  log "refreshing compose files"
  push_dir "$DEPLOY_DIR/backend" "$T_HOST" "$T_DIR"
  rsh "$T_HOST" "chmod +x '$T_DIR'/postgres-init/*.sh 2>/dev/null || true"
  release_imgproxy
}

# Copies ecommerce-media/cms/media/ from MinIO to the R2 bucket and compares the two.
# rclone runs in a container on the backend droplet, on MinIO's Docker network. The R2
# token is read from the backend .env on the droplet and handed to the container
# through the environment, so it is never on a command line or in this terminal.
# Only copies: nothing is deleted from either side, so it can be repeated.
cmd_media_to_r2() {
  load_conf
  target backend
  local dry=""
  case "${1:-}" in
    "") ;;
    --dry-run) dry="--dry-run" ;;
    *) die "usage: media-to-r2 [--dry-run]" ;;
  esac
  require_env "$T_HOST" "$T_DIR" R2_ACCOUNT_ID MEDIA_BUCKET R2_WRITE_KEY_ID R2_WRITE_SECRET
  # An empty argument disappears when ssh joins the command line: "-" means "none".
  rsh "$T_HOST" bash -s -- "$T_DIR" "${dry:--}" <<'REMOTE'
set -euo pipefail
cd "$1"; dry="$2"
[ "$dry" != "-" ] || dry=""
get() { grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
account="$(get R2_ACCOUNT_ID)"; bucket="$(get MEDIA_BUCKET)"
minio_user="$(get MINIO_ROOT_USER)"
case "$account" in *[!a-f0-9]*) echo "R2_ACCOUNT_ID must be the 32-character account id" >&2; exit 1 ;; esac

compose="docker compose --env-file .env --env-file release.env"
net="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$($compose ps -q minio </dev/null)")"
[ -n "$net" ] || { echo "MinIO is not running" >&2; exit 1; }

# Secrets go in through the environment (docker run -e NAME), not as arguments.
export RCLONE_CONFIG_MINIO_ACCESS_KEY_ID="$minio_user"
RCLONE_CONFIG_MINIO_SECRET_ACCESS_KEY="$(get MINIO_ROOT_PASSWORD)"; export RCLONE_CONFIG_MINIO_SECRET_ACCESS_KEY
RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(get R2_WRITE_KEY_ID)"; export RCLONE_CONFIG_R2_ACCESS_KEY_ID
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(get R2_WRITE_SECRET)"; export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
rclone() {
  docker run --rm --network "$net" \
    -e RCLONE_CONFIG_MINIO_TYPE=s3 -e RCLONE_CONFIG_MINIO_PROVIDER=Minio \
    -e RCLONE_CONFIG_MINIO_ENDPOINT=http://minio:9000 \
    -e RCLONE_CONFIG_MINIO_ACCESS_KEY_ID -e RCLONE_CONFIG_MINIO_SECRET_ACCESS_KEY \
    -e RCLONE_CONFIG_R2_TYPE=s3 -e RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    -e "RCLONE_CONFIG_R2_ENDPOINT=https://${account}.r2.cloudflarestorage.com" \
    -e RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
    -e RCLONE_CONFIG_R2_ACCESS_KEY_ID -e RCLONE_CONFIG_R2_SECRET_ACCESS_KEY \
    rclone/rclone:1.69.1 "$@" </dev/null
}

src="minio:ecommerce-media/cms/media"; dst="r2:${bucket}/cms/media"
echo "source:      $(rclone size "$src" 2>/dev/null | tr '\n' ' ')"
echo "destination: $(rclone size "$dst" 2>/dev/null | tr '\n' ' ' || true)"
echo "copying $src -> $dst ${dry:+(dry run)}"
rclone copy "$src" "$dst" --checksum --transfers 4 --stats-one-line -v $dry 2>&1 | grep -vE "Config file" | tail -n 15
if [ -z "$dry" ]; then
  echo "comparing (every source file must exist in R2 with the same content)"
  rclone check "$src" "$dst" --one-way 2>&1 | grep -vE "Config file" | tail -n 5
fi
REMOTE
}

# ---- operate ------------------------------------------------------------------

cmd_status() {
  load_conf
  local name
  for name in backend store; do
    if [ "$name" = store ] && [ -z "${STORE_SSH:-}" ]; then continue; fi
    target "$name"
    printf '\n\033[1m== %s (%s) ==\033[0m\n' "$T_NAME" "$T_HOST"
    rsh "$T_HOST" bash -s -- "$T_DIR" "$T_NAME" "$BACKEND_PRIVATE_IP" <<'EOF' || true
cd "$1"; name="$2"; backend_ip="$3"
compose="docker compose --env-file .env --env-file release.env"
$compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}' 2>&1
echo; free -h | sed -n '1,2p'; swapon --show --noheadings | sed 's/^/swap: /'
df -h / | tail -n 1 | awk '{print "disk: " $3 " used of " $2 " (" $5 ")"}'
echo "release: $(tr '\n' ' ' < release.env)"
if [ "$name" = backend ]; then
  curl -s -o /dev/null -m 5 -w "medusa /health: %{http_code}\n" "http://$backend_ip:9000/health" || echo "medusa /health: unreachable"
else
  curl -s -o /dev/null -m 5 -w "store /: %{http_code}\n" http://127.0.0.1:8000/ || echo "store /: unreachable"
fi
EOF
  done
}

cmd_logs() {
  load_conf
  target "${1:-}"
  shift || true
  ssh "${SSH_OPTS[@]}" "$T_HOST" "cd '$T_DIR' && $COMPOSE logs -f --tail=200 ${*:-}"
}

cmd_backup() {
  load_conf
  target backend
  local dir="${BACKUP_DIR:-$HOME/fecs-backups}" stamp db
  stamp="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$dir"
  chmod 700 "$dir"
  for db in ecommerce_medusa ecommerce_cms; do
    log "dumping $db"
    rsh "$T_HOST" "cd '$T_DIR' && $COMPOSE exec -T postgres pg_dump -U ecommerce_admin -Fc '$db'" >"$dir/$db-$stamp.dump"
    chmod 600 "$dir/$db-$stamp.dump"
  done
  log "backups in $dir (MinIO files are NOT included: use droplet backups or snapshots for those)"
}

cmd_ssh() {
  load_conf
  target "${1:-}"
  exec ssh "$T_HOST"
}

# ---- main -------------------------------------------------------------------------

main() {
  local cmd="${1:-help}"
  shift || true
  case "$cmd" in
    help | -h | --help) usage ;;
    setup)
      load_conf
      cmd_setup "$@"
      ;;
    env)
      load_conf
      cmd_env "$@"
      ;;
    set-env)
      load_conf
      cmd_set_env "$@"
      ;;
    release) cmd_release "$@" ;;
    rollback)
      load_conf
      cmd_rollback "$@"
      ;;
    admin-user)
      load_conf
      cmd_admin_user "$@"
      ;;
    grant-role)
      load_conf
      cmd_grant_role "$@"
      ;;
    seed)
      load_conf
      cmd_seed
      ;;
    publishable-key) cmd_publishable_key ;;
    seed-cms) cmd_seed_cms "$@" ;;
    status) cmd_status ;;
    logs) cmd_logs "$@" ;;
    backup) cmd_backup ;;
    imgproxy) cmd_imgproxy ;;
    media-to-r2) cmd_media_to_r2 "$@" ;;
    ssh) cmd_ssh "$@" ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
