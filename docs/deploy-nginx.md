# nginx for bibaestudios.com

One server, nginx in front, two apps behind it:

| Address                        | Goes to                                      | Port (local only) |
| ------------------------------ | -------------------------------------------- | ----------------- |
| `https://bibaestudios.com`     | Next.js storefront and the Payload CMS admin | 8000              |
| `https://www.bibaestudios.com` | redirects to `https://bibaestudios.com`      | -                 |
| `https://api.bibaestudios.com` | Medusa API, Medusa Admin (`/app`), webhooks  | 9000              |
| `https://img.bibaestudios.com` | resized images (imgproxy), behind Cloudflare | 8081              |

Files: `infra/nginx/bibaestudios.com.conf` (the site), `infra/nginx/snippets/`
(TLS, headers, proxy settings, private-network rule) and
`infra/nginx/env.production.example` (the domain-specific settings).

## 1. DNS

Create three records pointing at the server's public IP:

```
bibaestudios.com        A   <server ip>
www.bibaestudios.com    A   <server ip>
api.bibaestudios.com    A   <server ip>
img.bibaestudios.com    A   <server ip>      (proxied by Cloudflare, see "Images")
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

## Images: MinIO + imgproxy + Cloudflare (`img.bibaestudios.com`)

Product and CMS images are resized to WebP by imgproxy and cached by Cloudflare.
The original stays in MinIO.

```
HIT   Browser -> Cloudflare edge (cached WebP) -> Browser
MISS  Browser -> Cloudflare -> nginx -> imgproxy -> MinIO (original)
                                          imgproxy resizes -> Cloudflare stores it -> Browser
```

Uploads do not use this path: Payload sends the original straight from the
admin's browser to MinIO (`S3_ENDPOINT`). Videos and originals are not served
here either (see the next section).

How the URL works: `https://img.bibaestudios.com/<version>/w<width>/<key>.webp`

- `<version>` changes whenever the media document is saved, so a replaced image
  is fetched again even though every response is cached for a year.
- `w<width>` is one of the 15 presets in `docker/imgproxy/presets.txt`. imgproxy
  runs in presets-only mode, so nobody can request an odd size, and the URLs
  need no signing key (the browser builds them).
- `<key>` is the file's path in the bucket (`cms/media/photo.png`), Base64-URL
  encoded. imgproxy can only read the `cms/media/` prefix of one bucket.
- `.webp` is an extension Cloudflare caches by default, and the format is in the
  URL, so there is no `Vary: Accept` to configure.

Only images uploaded in the Payload media library use imgproxy. Medusa product
photos and files in `/public` keep going through Next.js's own optimizer.

### 1. imgproxy next to MinIO

Create a read-only MinIO access key for imgproxy (MinIO console > Access Keys,
or `mc admin`), with this policy, and use it instead of the admin key:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::<bucket>/cms/media/*"]
    }
  ]
}
```

Run imgproxy bound to localhost (`docker/docker-compose.yml` has the full
local example; change these for production):

```bash
docker run -d --name imgproxy --restart unless-stopped \
  -p 127.0.0.1:8081:8080 \
  -v "$PWD/docker/imgproxy/presets.txt:/config/presets.txt:ro" \
  -e IMGPROXY_USE_S3=true \
  -e IMGPROXY_S3_ENDPOINT=https://<minio address> \
  -e IMGPROXY_S3_REGION=us-east-1 \
  -e AWS_ACCESS_KEY_ID=<read-only key> -e AWS_SECRET_ACCESS_KEY=<its secret> \
  -e IMGPROXY_S3_ALLOWED_BUCKETS=<bucket> \
  -e IMGPROXY_BASE_URL=s3://<bucket>/ \
  -e IMGPROXY_ALLOWED_SOURCES=s3://<bucket>/cms/media/ \
  -e IMGPROXY_SOURCE_URL_QUERY_SEPARATOR= \
  -e IMGPROXY_ONLY_PRESETS=true -e IMGPROXY_PRESETS_PATH=/config/presets.txt \
  -e IMGPROXY_FORMAT_QUALITY=webp=78,avif=60 -e IMGPROXY_TTL=31536000 \
  -e IMGPROXY_USE_ETAG=true \
  -e IMGPROXY_MAX_SRC_RESOLUTION=50 -e IMGPROXY_MAX_SRC_FILE_SIZE=52428800 \
  -e IMGPROXY_REQUESTS_QUEUE_SIZE=200 \
  ghcr.io/imgproxy/imgproxy:v4.0.17
```

Size it for the first visit to each image, not for steady traffic: Cloudflare
answers the repeats. Start with 2 CPU cores and 1 GB, and watch memory when
large originals are uploaded. imgproxy rejects sources over 50 MP or 50 MB.

### 2. nginx

```bash
sudo cp infra/nginx/snippets/cloudflare-only.conf /etc/nginx/snippets/
sudo cp infra/nginx/img.bibaestudios.com.conf /etc/nginx/conf.d/
sudo mkdir -p /var/cache/nginx/img && sudo chown www-data /var/cache/nginx/img
```

The server answers only Cloudflare's address ranges (anyone else gets 403), and
forwards only URLs shaped like the ones above. A 5 GB cache on disk lets one
resize serve several Cloudflare locations that miss at the same time.
Cloudflare's ranges are in `snippets/cloudflare-only.conf` (copied from
https://www.cloudflare.com/ips-v4 and `/ips-v6`); check them twice a year.

### 3. Cloudflare

1. DNS: `img` A record to the server, **Proxied** (orange cloud).
2. SSL/TLS: set the mode to **Full (strict)**. Add the host to the existing
   certificate: `sudo certbot certonly --expand --webroot -w /var/www/certbot -d
bibaestudios.com -d www.bibaestudios.com -d api.bibaestudios.com -d
img.bibaestudios.com`, then reload nginx. (If the challenge fails, switch the
   record to DNS only for that minute.)
3. Caching > Cache Rules, one rule for `Hostname equals img.bibaestudios.com`:
   - Cache eligibility: **Eligible for cache**
   - Edge TTL: **Use cache-control header if present, bypass cache if not**
   - Browser TTL: **Respect origin TTL**
4. Caching > Tiered Cache: turn on **Smart Tiered Cache** (free). Cloudflare
   locations then ask one upper location, not your server, on a miss.
5. Leave Polish, Mirage and Rocket Loader off for this host; the images are
   already WebP.
6. Optional: a rate limiting rule on `img.bibaestudios.com` (for example 300
   requests a minute per address) so one visitor cannot trigger many resizes.

### 4. Storefront

Set `NEXT_PUBLIC_IMGPROXY_URL=https://img.bibaestudios.com` and **rebuild**: it
is read when the browser bundle is built, not at runtime. Leave it empty to fall
back to Next.js's optimizer.

### Check it

```bash
# the first request is a miss, the second a hit (Cloudflare adds cf-cache-status)
U=https://img.bibaestudios.com/<version>/w640/<base64 key>.webp
curl -sI $U | grep -iE 'HTTP|cf-cache-status|x-cache-status|content-type|cache-control'
curl -sI $U | grep -i cf-cache-status                                  # HIT
curl -s -o /dev/null -w '%{http_code}\n' https://img.bibaestudios.com/v1/w999/x.webp   # 404
curl -s -o /dev/null -w '%{http_code}\n' --resolve img.bibaestudios.com:443:<server ip> $U  # 403: not via Cloudflare
```

### When you change something

- A new image or a re-saved one needs nothing: its URL has a new version.
- If you change a preset, the quality, or `IMGPROXY_FORMAT_QUALITY`, URLs stay
  the same while the picture changes. Then purge everything for the host in
  Cloudflare (Caching > Purge > Hostname) and clear nginx's cache:
  `sudo rm -rf /var/cache/nginx/img/*`.
- Widths are listed in two places that must match: `docker/imgproxy/presets.txt`
  and `IMGPROXY_WIDTHS` in `apps/store/src/utilities/imgproxy.ts`.

## Media cache in front of MinIO (optional)

`media.bibaestudios.com.conf` is a read-only cache for the **originals**,
mainly videos, which imgproxy does not serve. Uploads still go straight from the
browser to MinIO, so only reads use it.

1. DNS: add `media.bibaestudios.com`, and add it to the certificate.
2. Copy `media.bibaestudios.com.conf` to `/etc/nginx/conf.d/` and set the
   `upstream minio-media` address to your MinIO server.
3. Create the cache folder: `mkdir -p /var/cache/nginx/media` (owned by the
   nginx user).
4. Storefront env: `S3_ENDPOINT` stays the MinIO address (uploads),
   `S3_FILE_URL=https://media.bibaestudios.com/<bucket>` (reads).

What it does: caches files for 30 days on disk (20 GB cap), tells browsers to
keep them for a year (`immutable`), caches video in 1 MB pieces so seeking works
from cache, and keeps serving cached files if MinIO is down. File URLs carry
`?v=<version>`, which is part of the cache key, so a replaced file is fetched
again. Only `GET`/`HEAD` on `/<bucket>/cms/media/` are allowed. The
`X-Cache-Status` header shows `HIT` or `MISS`.

If you put this host behind Cloudflare too, check Cloudflare's terms for
serving video from the CDN on your plan before sending large videos through it.

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
