# nginx for bibaestudios.com

One server, nginx in front, two apps behind it:

| Address                        | Goes to                                      | Port (local only) |
| ------------------------------ | -------------------------------------------- | ----------------- |
| `https://bibaestudios.com`     | Next.js storefront and the Payload CMS admin | 8000              |
| `https://www.bibaestudios.com` | redirects to `https://bibaestudios.com`      | -                 |
| `https://api.bibaestudios.com` | Medusa API, Medusa Admin (`/app`), webhooks  | 9000              |

Files: `infra/nginx/bibaestudios.com.conf` (the site), `infra/nginx/snippets/`
(TLS, headers, proxy settings, private-network rule) and
`infra/nginx/env.production.example` (the domain-specific settings).

## 1. DNS

Create three records pointing at the server's public IP:

```
bibaestudios.com        A   <server ip>
www.bibaestudios.com    A   <server ip>
api.bibaestudios.com    A   <server ip>
```

(Add matching `AAAA` records if the server has IPv6.)

## 2. Install the config

```bash
sudo apt install nginx certbot            # Debian / Ubuntu; nginx 1.25.1 or newer
sudo mkdir -p /var/www/certbot /etc/nginx/snippets
sudo cp infra/nginx/snippets/*.conf /etc/nginx/snippets/
sudo cp infra/nginx/bibaestudios.com.conf /etc/nginx/conf.d/
```

nginx must be at least 1.25.1 (the config uses `http2 on`). If your distribution
ships an older nginx, install the official nginx.org package, or replace
`http2 on;` with `http2` on each `listen ... ssl` line.

## 3. Certificate (Let's Encrypt)

The site file refers to certificate files that do not exist yet, so get the
certificate first with a temporary HTTP-only server:

```bash
sudo tee /etc/nginx/conf.d/acme-bootstrap.conf >/dev/null <<'CONF'
server {
    listen 80;
    server_name bibaestudios.com www.bibaestudios.com api.bibaestudios.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
}
CONF
sudo mv /etc/nginx/conf.d/bibaestudios.com.conf /root/   # keep it out until the cert exists
sudo nginx -t && sudo systemctl reload nginx

sudo certbot certonly --webroot -w /var/www/certbot \
  -d bibaestudios.com -d www.bibaestudios.com -d api.bibaestudios.com

sudo rm /etc/nginx/conf.d/acme-bootstrap.conf
sudo mv /root/bibaestudios.com.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

Certbot renews on its own timer; make nginx pick up the new certificate:

```bash
echo 'systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run
```

## 4. Run the apps on localhost only

nginx is the only thing the internet should reach. Bind the apps to
`127.0.0.1` and open only 80 and 443 in the firewall:

- Medusa: `MEDUSA_WORKER_MODE=server` on port 9000 (workers run separately),
  listening on `127.0.0.1`.
- Storefront: `next start --port 8000 --hostname 127.0.0.1`.

If you run them in Docker, publish the ports as `127.0.0.1:9000:9000` and
`127.0.0.1:8000:8000`, not `9000:9000`.

Then set the domain-specific variables from `infra/nginx/env.production.example`
(CORS, public URLs, sender address) and restart both apps. The Resend API key
goes in `SMTP_PASSWORD`, outside git.

## 5. Tell the other services

| Service        | Setting                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Meta Messenger | Webhook callback URL `https://api.bibaestudios.com/webhooks/meta`, verify token = `META_VERIFY_TOKEN`                                         |
| J&T Express    | Tracking callback `https://api.bibaestudios.com/webhooks/jt/tracking`                                                                         |
| Resend         | Verify the domain `bibaestudios.com` (DNS records Resend shows) so `EMAIL_FROM` can use it                                                    |
| Prometheus     | Scrape `https://api.bibaestudios.com/internal/metrics` **from inside your network** with the bearer token; nginx refuses it from the internet |

## What nginx does here

- Redirects HTTP to HTTPS and `www` to the bare domain; HSTS and the usual
  security headers; TLS 1.2 and 1.3 only.
- Webhooks: own rate limit (50 requests/s per address, burst 200), 512 KB body
  limit, body passed through untouched (the app checks the HMAC over the exact
  bytes).
- `/internal/*` (readiness, metrics) is answered only to loopback and private
  networks. `/health` stays public for uptime monitors.
- Admin sign-in (`/auth/user/emailpass`) and Payload sign-in are limited to 10
  attempts a minute per address.
- Medusa Admin and ERP routes allow slow requests (120 s). To lock the
  back-office to your office or VPN, uncomment the `allow` / `deny` lines in the
  `/app` and `/admin` location.
- `X-Forwarded-Proto` is forwarded, which Medusa needs to issue its secure
  session cookie behind TLS.
- Behind Cloudflare or another proxy, add `set_real_ip_from` rules for it so
  rate limits see the visitor and not the proxy.

## Check it

```bash
curl -I http://bibaestudios.com                 # 301 to https
curl -I https://www.bibaestudios.com            # 301 to https://bibaestudios.com
curl -s https://api.bibaestudios.com/health     # OK
curl -I https://api.bibaestudios.com/internal/ready   # 403 from the internet
curl -I https://bibaestudios.com/vi/vn          # 200, Vietnamese storefront
```

`bash infra/nginx/test.sh` runs the same routing checks against the local
Docker stack with a throwaway certificate (nginx in Docker, ports 18080/18443).
