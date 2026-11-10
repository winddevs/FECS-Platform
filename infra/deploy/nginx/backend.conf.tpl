# nginx on the BACKEND droplet. Rendered by scripts/deploy.sh (__TOKENS__ are
# replaced) and installed as /etc/nginx/conf.d/fecs-backend.conf.
#
#   __API_DOMAIN__  -> Medusa API, Medusa Admin (/app), webhooks   (__BACKEND_PRIVATE_IP__:9000)
#   __S3_DOMAIN__   -> MinIO S3 API: browser uploads (presigned) and public media reads (127.0.0.1:9002)
#   __IMG_DOMAIN__  -> imgproxy: resized WebP copies of the media, Cloudflare only (127.0.0.1:8081)
#
# Rules are the same as infra/nginx/bibaestudios.com.conf (single-server layout).
# Snippets (tls, proxy-common, security-headers, internal-only) are installed
# into /etc/nginx/snippets by the script.

# Visitors behind the Cloudflare proxy: use their real address for rate limits and logs.
include snippets/cloudflare-realip.conf;
include snippets/cloudflare-geo.conf;

map $http_upgrade $connection_upgrade {
    default upgrade;
    ""      "";
}

limit_req_zone $binary_remote_addr zone=webhooks:10m rate=50r/s;
limit_req_zone $binary_remote_addr zone=admin_login:10m rate=10r/m;

# Customer sign-in/sign-up/password reset on the public API: 10 a minute per
# address. The storefront server calls Medusa on the private address (not
# through nginx) and limits per account itself; loopback is exempt.
geo $from_storefront {
    default 0;
    127.0.0.1 1;
    ::1       1;
}
map $from_storefront $customer_auth_key {
    1       "";
    default $binary_remote_addr;
}
limit_req_zone $customer_auth_key zone=customer_auth:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=auth_other:10m rate=60r/m;
limit_req_status 429;
limit_conn_zone $binary_remote_addr zone=perip:10m;

# Image resizing is the one expensive request on this droplet. Cloudflare answers
# repeats from its cache, so only misses count here: a visitor (real address,
# see cloudflare-realip.conf) who misses more than this is a scraper.
limit_req_zone $binary_remote_addr zone=img:10m rate=20r/s;

upstream medusa {
    server __BACKEND_PRIVATE_IP__:9000;
    keepalive 32;
}

upstream minio {
    server 127.0.0.1:9002;
    keepalive 16;
}

upstream imgproxy {
    server 127.0.0.1:8081;
    keepalive 16;
}

gzip_comp_level 5;
gzip_min_length 1024;
gzip_proxied any;
gzip_vary on;
gzip_types text/plain text/css text/xml application/json application/javascript
           application/xml image/svg+xml;

server_tokens off;

# ---- HTTP: certificates and redirect -----------------------------------------

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name __API_DOMAIN__ __S3_DOMAIN__ __IMG_DOMAIN__;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# ---- Medusa API, admin and webhooks ------------------------------------------

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __API_DOMAIN__;

    include snippets/tls.conf;
    include snippets/security-headers.conf;

    client_max_body_size 10m;
    limit_conn perip 100;

    location = /health {
        access_log off;
        include snippets/proxy-common.conf;
        proxy_pass http://medusa;
    }

    # Readiness and metrics: private networks only.
    location /internal/ {
        include snippets/internal-only.conf;
        include snippets/proxy-common.conf;
        proxy_pass http://medusa;
    }

    # Meta and J&T webhooks: body passed through untouched (HMAC over exact bytes).
    location /webhooks/ {
        client_max_body_size 512k;
        limit_req zone=webhooks burst=200 nodelay;
        include snippets/proxy-common.conf;
        proxy_pass http://medusa;
        proxy_read_timeout 15s;
    }

    location ~ ^/auth/user/ {
        limit_req zone=admin_login burst=10 nodelay;
        include snippets/proxy-common.conf;
        proxy_pass http://medusa;
    }

    location ~ ^/auth/customer/ {
        limit_req zone=customer_auth burst=5 nodelay;
        include snippets/proxy-common.conf;
        proxy_pass http://medusa;
    }

    location /auth/ {
        limit_req zone=auth_other burst=20 nodelay;
        include snippets/proxy-common.conf;
        proxy_pass http://medusa;
    }

    location ~ ^/(app|admin)(/|$) {
        # To restrict the back-office to your office / VPN, uncomment:
        # allow 203.0.113.10;
        # deny  all;
        proxy_read_timeout 120s;
        include snippets/proxy-common.conf;
        proxy_pass http://medusa;
    }

    # The bare address opens the Medusa Admin.
    location = / {
        return 302 /app;
    }

    location / {
        include snippets/proxy-common.conf;
        proxy_pass http://medusa;
    }
}

# ---- MinIO S3 API -------------------------------------------------------------
# Payload uploads straight from the browser with presigned URLs
# (clientUploads: true), so this host must be public. Writes need a signature;
# anonymous reads work only for the public prefixes set by minio-init
# (ecommerce-media/cms/media/*, ecommerce-medusa/*). The console is not exposed.

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __S3_DOMAIN__;

    include snippets/tls.conf;
    add_header Strict-Transport-Security "max-age=31536000" always;

    # Large product videos. Raise if you upload bigger files.
    client_max_body_size 2g;
    limit_conn perip 100;

    location / {
        proxy_pass http://minio;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        # The S3 signature covers the Host header: pass it through untouched.
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Stream uploads and downloads instead of buffering them on disk.
        proxy_request_buffering off;
        proxy_buffering off;
        chunked_transfer_encoding off;
        proxy_connect_timeout 5s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        # CORS comes from MinIO (MINIO_API_CORS_ALLOW_ORIGIN); do not add it here.
        proxy_hide_header X-Minio-Deployment-Id;
        proxy_hide_header X-Amz-Request-Id;
        proxy_hide_header X-Amz-Id-2;
    }
}

# ---- imgproxy: resized images -------------------------------------------------
#
#   Browser -> Cloudflare (cached WebP) -> this nginx -> imgproxy -> MinIO
#
# The storefront builds /<version>/w<width>/<base64url key>.webp. imgproxy
# accepts only the widths in presets.txt and reads only ecommerce-media/cms/media/,
# so everything else is refused here before it reaches it. Only Cloudflare may
# connect ($from_cloudflare, snippets/cloudflare-geo.conf): its rate limit, hotlink and bot rules
# in front of this host are what keep scrapers off, and a direct request would
# skip them. If the DNS record is "DNS only" (grey cloud) this host answers 403.

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __IMG_DOMAIN__;

    include snippets/tls.conf;

    if ($from_cloudflare = 0) {
        return 403;
    }

    location ~ "^/[A-Za-z0-9_-]{1,32}/w[0-9]{2,4}/[A-Za-z0-9_-]{8,1024}\.webp$" {
        limit_except GET HEAD {
            deny all;
        }
        limit_req zone=img burst=60 nodelay;

        proxy_pass http://imgproxy;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $proxy_host;
        proxy_set_header Cookie "";

        # Resizing a big photo can take a moment; imgproxy gives up at 10 s.
        proxy_connect_timeout 3s;
        proxy_read_timeout 15s;

        # The URL carries a version, so an answer never changes: keep it a year.
        # Without `always`, nginx adds Cache-Control to successful answers only,
        # so a 404 or 429 is never cached as immutable.
        proxy_hide_header Cache-Control;
        proxy_hide_header Set-Cookie;
        proxy_hide_header Server;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Strict-Transport-Security "max-age=31536000" always;
        add_header X-Content-Type-Options "nosniff" always;
    }

    location / {
        return 404;
    }
}
