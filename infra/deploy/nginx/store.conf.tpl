# nginx on the STORE droplet. Rendered by scripts/deploy.sh (__TOKENS__ are
# replaced) and installed as /etc/nginx/conf.d/fecs-store.conf.
#
#   __DOMAIN__, www     -> Next.js storefront + Payload CMS admin (127.0.0.1:8000)
#   __CAPTCHA_DOMAIN__  -> FCaptcha widget and API               (127.0.0.1:3100)
#
# Rules are the same as infra/nginx/bibaestudios.com.conf (single-server layout).

# Visitors behind the Cloudflare proxy: use their real address for rate limits and logs.
include snippets/cloudflare-realip.conf;

map $http_upgrade $connection_upgrade {
    default upgrade;
    ""      "";
}

limit_req_zone $binary_remote_addr zone=cms_login:10m rate=10r/m;
limit_req_status 429;
limit_conn_zone $binary_remote_addr zone=perip:10m;

upstream storefront {
    server 127.0.0.1:8000;
    keepalive 32;
}

upstream fcaptcha {
    server 127.0.0.1:3100;
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
    server_name __DOMAIN__ www.__DOMAIN__ __ADMIN_DOMAIN__ __CAPTCHA_DOMAIN__;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# ---- www -> apex ---------------------------------------------------------------

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.__DOMAIN__;

    include snippets/tls.conf;
    return 301 https://__DOMAIN__$request_uri;
}

# ---- CMS entry point -----------------------------------------------------------
# __ADMIN_DOMAIN__ sends editors to the Payload admin. The admin itself is served
# on __DOMAIN__/admin: Payload's API calls, login cookie and live preview all use
# one origin (NEXT_PUBLIC_SERVER_URL). Serving the admin UI from a second host
# would need Payload cookie-domain, CORS and CSRF changes first.

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __ADMIN_DOMAIN__;

    include snippets/tls.conf;
    include snippets/security-headers.conf;

    return 302 https://__DOMAIN__/admin;
}

# ---- storefront + Payload CMS -------------------------------------------------

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __DOMAIN__;

    include snippets/tls.conf;
    include snippets/security-headers.conf;

    # Media uploads go straight to MinIO (presigned URLs), not through here.
    client_max_body_size 10m;
    limit_conn perip 50;

    # Next.js (Cache Components) sends long cache-tag headers on some pages. The
    # nginx default of 4-8k answers "502 upstream sent too big header".
    proxy_buffer_size 32k;
    proxy_buffers 8 32k;
    proxy_busy_buffers_size 64k;

    location = /admin/login {
        limit_req zone=cms_login burst=10 nodelay;
        include snippets/proxy-common.conf;
        proxy_pass http://storefront;
    }

    location = /api/users/login {
        limit_req zone=cms_login burst=10 nodelay;
        include snippets/proxy-common.conf;
        proxy_pass http://storefront;
    }

    location /_next/static/ {
        include snippets/proxy-common.conf;
        proxy_pass http://storefront;
        proxy_hide_header Cache-Control;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        include snippets/security-headers.conf;
    }

    location / {
        include snippets/proxy-common.conf;
        proxy_pass http://storefront;
    }
}

# ---- FCaptcha -------------------------------------------------------------------
# The browser loads /fcaptcha.js and calls /api/*. Token checks come from the
# storefront server over 127.0.0.1 (FCAPTCHA_ORIGIN) and are not published.

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name __CAPTCHA_DOMAIN__;

    include snippets/tls.conf;

    client_max_body_size 64k;

    location = /fcaptcha.js {
        include snippets/proxy-common.conf;
        proxy_pass http://fcaptcha;
    }

    location /api/ {
        include snippets/proxy-common.conf;
        proxy_pass http://fcaptcha;
    }

    location / {
        return 404;
    }
}
