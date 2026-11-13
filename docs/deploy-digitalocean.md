# Deploying to DigitalOcean (two droplets)

This is the deployment guide for bibaestudios.com. Everything is driven by
`scripts/deploy.sh`. The older `docs/deploy-nginx.md` describes the same stack on
a single server and is still the reference for the nginx rules.

## 1. Layout

```
                     Cloudflare / DNS
                            |
        +-------------------+--------------------+
        |                                        |
  STORE droplet (public)                  BACKEND droplet (public)
  bibaestudios.com, www                   ecom.bibaestudios.com
  admin.bibaestudios.com (-> /admin)
  captcha.bibaestudios.com                s3., img.bibaestudios.com
  nginx -> store   :8000 (loopback)       nginx -> medusa :9000 (private IP)
        -> fcaptcha:3100 (loopback)             -> minio  :9002 (loopback)
                                                -> imgproxy :8081 (loopback)
        |                                        |
        |   private VPC network (sgp1)           |
        +--> Medusa    10.x.x.x:9000  ----------->+  medusa    (API, admin, jobs)
        +--> Postgres  10.x.x.x:5432  (ecommerce_cms)  postgres  (ecommerce_medusa + ecommerce_cms)
        +--> Redis     10.x.x.x:6379  (sign-in limits) redis
                                                 minio     (media + product images)
                                                 imgproxy  (resized WebP copies, optional)
                                                 meilisearch (product search, internal only)
```

| Droplet     | Runs                                                                                                | Recommended size                              | Minimum (with the 2 GB swap the script adds) |
| ----------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| **backend** | Medusa (one process, API + admin + jobs), Postgres 17, Redis 7, MinIO, imgproxy, Meilisearch, nginx | 4 GiB RAM, 2 vCPU, 80 GiB SSD (Basic, $24/mo) | 2 GiB, 2 vCPU, 60 GiB ($18/mo)               |
| **store**   | Next.js storefront and Payload CMS admin (one app), FCaptcha, nginx                                 | 2 GiB RAM, 2 vCPU, 60 GiB SSD (Basic, $18/mo) | 2 GiB, 1 vCPU, 50 GiB ($12/mo)               |

**Current setup (demo):** the backend is a Basic 2 GiB / 2 vCPU / 60 GiB droplet and the store
a 2 GiB / 1 vCPU / 50 GiB droplet. `infra/deploy/backend/docker-compose.yml` is tuned for
that: Postgres 128 MB shared buffers, Redis 128 MB, Meilisearch 384 MB, Medusa 1100 MB.
Expect swap use under load. For production traffic move the backend to 4 GiB and use the
larger values noted in comments in that file.

Prices are from the [DigitalOcean pricing page](https://www.digitalocean.com/pricing/droplets)
(checked 4 Nov 2026). RAM figures are estimates, not measurements: check
`scripts/deploy.sh status` after the first week and resize if swap is in use.

**The CMS is not a separate service.** Payload runs inside the Next.js app (`/admin`),
so it lives on the store droplet. Only its database (`ecommerce_cms`) is on the
backend droplet.

### Which traffic uses the private network

Both droplets are in the same VPC (`10.104.0.0/20`, region sgp1). Traffic
between them uses the private addresses and never crosses the internet:

| From                       | To                         | Address                            | Network                 |
| -------------------------- | -------------------------- | ---------------------------------- | ----------------------- |
| store                      | Medusa API                 | `http://<backend private IP>:9000` | private                 |
| store (Payload CMS)        | Postgres `ecommerce_cms`   | `<backend private IP>:5432`        | private                 |
| store                      | Redis (sign-in limits)     | `<backend private IP>:6379`        | private                 |
| store (build time only)    | Postgres and Medusa        | SSH tunnel through your Mac        | private, via the tunnel |
| browser                    | store, Medusa admin, MinIO | `bibaestudios.com`, `ecom.`, `s3.` | public (HTTPS)          |
| store (Payload) and Medusa | MinIO S3 API               | `https://s3.bibaestudios.com`      | public                  |

The last row is public on purpose. Payload hands the browser a presigned upload
URL, and the signature is tied to the S3 host name, so that name has to be the
public one. Medusa uses the same name for simplicity. Its traffic stays on the
backend droplet's own network card.

Postgres, Redis and Medusa listen on the backend's private address only, so the
internet cannot reach them. Any other droplet in the same VPC could still try to
connect (they need the passwords), so add the cloud firewall rule in 2.4 that
restricts ports 5432, 6379 and 9000 to the store droplet.

### Where people go

| Who           | URL                                                                              | Droplet |
| ------------- | -------------------------------------------------------------------------------- | ------- |
| Shoppers      | `https://bibaestudios.com` (and `www`)                                           | store   |
| CMS editors   | `https://admin.bibaestudios.com` (redirects to `https://bibaestudios.com/admin`) | store   |
| Medusa admins | `https://ecom.bibaestudios.com` (redirects to `/app`)                            | backend |

**Why the CMS lives on `bibaestudios.com/admin` and `admin.` only redirects.** Payload's
admin sends its API calls to one address (`NEXT_PUBLIC_SERVER_URL`) and keeps the
login cookie for that host. Serving the same admin UI from `admin.bibaestudios.com`
would send the calls and the cookie to different hosts, and login would fail.
A separate admin host needs Payload cookie-domain, CORS/CSRF and live-preview
changes, which I have not been able to test. Until then `admin.` is an easy-to-remember
door. If you want the CMS reachable _only_ on `admin.`, say so; it is a small nginx
change plus the Payload work above.

**Why the store calls Medusa on the private address.** Reaching Medusa through
`ecom.bibaestudios.com` would make every customer share the store droplet's IP in
nginx's sign-in rate limit, locking people out. The private address skips nginx.

## 2. One-time preparation

### 2.1 Droplets

|                                        | Backend                | Store                |
| -------------------------------------- | ---------------------- | -------------------- |
| Public IP                              | `165.232.166.136`      | `188.166.238.43`     |
| Private IP (VPC `10.104.0.0/20`, sgp1) | `10.104.0.5`           | `10.104.0.3`         |
| SSH alias                              | `bibaestudios-backend` | `bibaestudios-store` |

Both need Docker with the Compose plugin and the SSH key `~/.ssh/bibasestudos`
in `/root/.ssh/authorized_keys`. Check sizes against section 1: the script adds a
2 GB swap file but cannot make a small droplet bigger.

### 2.2 SSH access

`~/.ssh/config` on your Mac (already added):

```
Host bibaestudios-backend
    HostName 165.232.166.136
    User root
    IdentityFile ~/.ssh/bibasestudos
    IdentitiesOnly yes

Host bibaestudios-store
    HostName 188.166.238.43
    User root
    IdentityFile ~/.ssh/bibasestudos
    IdentitiesOnly yes
```

### 2.3 DNS

| Name                      | Points to                         | Serves                                                         |
| ------------------------- | --------------------------------- | -------------------------------------------------------------- |
| `bibaestudios.com`, `www` | store droplet `188.166.238.43`    | storefront (`www` redirects to the bare domain)                |
| `admin`                   | store droplet `188.166.238.43`    | CMS entry point, redirects to `https://bibaestudios.com/admin` |
| `captcha`                 | store droplet `188.166.238.43`    | FCaptcha widget and API                                        |
| `ecom`                    | backend droplet `165.232.166.136` | Medusa API; opens Medusa Admin (`/app`)                        |
| `s3`                      | backend droplet `165.232.166.136` | MinIO S3 API                                                   |
| `img`                     | backend droplet `165.232.166.136` | resized images (imgproxy). **Cloudflare proxy on**, see 6.1    |
| `media`                   | Cloudflare R2 (custom domain)     | media files, images and videos. Not a droplet: see 6.2         |

Private addresses (VPC `10.104.0.0/20`): store `10.104.0.3`, backend `10.104.0.5`.

Use **DNS only** (grey cloud) while you get the first certificates. If you later
proxy through Cloudflare: set SSL mode to _Full (strict)_, and keep `s3` DNS-only
because Cloudflare limits upload size (100 MB on the free plan) and videos upload
straight to `s3`.

### 2.4 Cloud firewall (recommended)

The script enables `ufw` (22, 80, 443). Docker ignores `ufw` for published ports,
so internal ports are bound to the private address or to loopback in the compose
files. Add a DigitalOcean Cloud Firewall as a second layer:

- backend: allow 22 from your IP, 80/443 from anywhere, **5432, 6379, 9000 only
  from the store droplet (`10.104.0.3`)**.
- store: allow 22 from your IP, 80/443 from anywhere.

### 2.5 Local requirements

Docker Desktop with buildx, `openssl`, `ssh`, `tar`, `dig`. The droplets are
x86_64 and a Mac M-series is arm64, so images are cross-built. **Turn on
Docker Desktop > Settings > General > "Use Rosetta for x86_64/amd64 emulation"**:
without it the Next.js build runs under QEMU and is very slow.

### 2.6 Accounts you need

| Service       | Needed for                                                                       | Required?                                       |
| ------------- | -------------------------------------------------------------------------------- | ----------------------------------------------- |
| Resend (SMTP) | order and account emails (Medusa refuses to start without a password and sender) | yes                                             |
| PostHog       | analytics                                                                        | no. Empty key = local provider, nothing is sent |
| Stripe        | card payments (`NEXT_PUBLIC_STRIPE_KEY`)                                         | only if you take cards                          |

Verify the sending domain in Resend so `EMAIL_FROM` works.

### 2.7 Deploy settings

```
cp infra/deploy/deploy.conf.example infra/deploy/deploy.conf
```

Fill in the domains, SSH aliases and the public and private IPs of both droplets.
The private IP is on the droplet page under _Networking_. The file is git-ignored
and holds no secrets.

## 3. First deploy

Run in this order. Each step is safe to repeat.

```bash
# 1. Prepare both servers: packages, Docker, 2 GB swap, ufw, nginx, Let's Encrypt
#    certificates, compose files, and a .env with generated secrets.
scripts/deploy.sh setup backend
scripts/deploy.sh setup store          # names without a DNS record yet are skipped; re-run later to add them

# 2. Put your own values in (Resend key etc.). Values are read from stdin, not the command line.
scripts/deploy.sh env backend          # shows the file with secrets hidden
scripts/deploy.sh set-env backend SMTP_PASSWORD
scripts/deploy.sh set-env store   SMTP_PASSWORD

# 3. Backend: build Medusa + MinIO, ship, create buckets, migrate, start.
scripts/deploy.sh release backend

# 4. Medusa admin user (role ERP_ADMIN), demo data, publishable key.
GENERATE_PASSWORD=1 scripts/deploy.sh admin-user you@example.com   # prints a generated password once
ASSUME_YES=1 scripts/deploy.sh seed                                  # DEMO data + publishable key
scripts/deploy.sh publishable-key                                    # copies the key into the store .env

# 5. Vietnam region (VND), shipping options and VND prices for the demo products.
ssh bibaestudios-backend 'ADMIN_PW=<the admin password> ADMIN_EMAIL=you@example.com python3 -' < infra/deploy/backend/seed-vietnam.py

# 6. CMS admin + one welcome post. The storefront build needs a post and a collection.
GENERATE_PASSWORD=1 scripts/deploy.sh seed-cms you@example.com

# 7. Storefront: migrate the CMS database, build, ship, start.
scripts/deploy.sh release store
```

**Why the CMS needs a post and Medusa a collection.** Next.js Cache Components refuses
`generateStaticParams` functions that return an empty list, so the build fails on a brand-new
system. The seed gives Medusa four products and four categories but no collection, so create
one in Medusa Admin (Products > Collections) and add products to it. Step 6 creates the post.

**Why Medusa calls the CMS on a private address.** Product queries ask Medusa for the CMS copy of
each product (`*payload_product`), so Medusa calls the CMS API. `PAYLOAD_SERVER_URL` in the backend
`.env` is `http://<store private IP>:8000`, and the store container listens there. Until the store
is released once, those product calls fail with a 502: on a first install, release the store, then
release it **a second time** so the pages are built with the CMS reachable. Later releases need one pass.

**Demo data.** The Medusa seed script creates demo regions (Europe, Tunisia), products and the
publishable API key. If you do not want demo data, skip `seed`, create a sales channel and a
publishable key in Medusa Admin, and put the key in the store `.env` yourself.

**Search.** Click Settings > Meilisearch > _Sync Data to Meilisearch_ once so existing products
are indexed (`POST /admin/meilisearch/sync`).

**Passwords.** `GENERATE_PASSWORD=1` prints a strong password once; change it after the first
login. Do not paste real passwords into chat or tickets.

## 4. Every later deploy

```bash
scripts/deploy.sh release backend     # Medusa changed
scripts/deploy.sh release store       # storefront or CMS changed
scripts/deploy.sh release all         # both
```

**Local and production settings are separate files.** `apps/*/.env.template` is for local
development only (URLs point at localhost). `apps/*/.env.production.template` lists the
production values; the real production `.env` exists only on the droplets and is created by
`scripts/deploy.sh setup`. Before building, `release` stops when a public URL in the server
`.env` (`BACKEND_URL`, `STOREFRONT_URL`, the CORS lists, `NEXT_PUBLIC_*`, `S3_*`) points at
localhost, and names the variable. `ALLOW_LOCAL_URLS=1` turns that into a warning.
Medusa also refuses to build a staff-invite or password-reset link from a missing or local
`BACKEND_URL` in production, instead of sending a link to `localhost`.

What a release does:

- **backend**: builds `fecs-medusa:<timestamp>-<git sha>`, sends it over SSH, starts
  Postgres/Redis/MinIO if needed, creates buckets (idempotent), runs
  `medusa db:migrate`, restarts Medusa, waits for it to be healthy.
- **store**: opens an SSH tunnel to the backend droplet (the build needs the
  database and Medusa), runs `payload migrate`, builds the image, sends it,
  restarts, waits for health.

It builds from your **working tree** (the tag ends in `-dirty` when it has
uncommitted changes). Commit first if you want a release you can trace to a commit.

If the new container is not healthy after 3 minutes, the script puts the
previous image back and exits with an error. Database migrations are **not**
reverted, so keep migrations backward compatible (the expand/contract rule in
`docs/operations.md`).

### Rollback

```bash
scripts/deploy.sh rollback backend
scripts/deploy.sh rollback store
```

The last three images stay on each server (`KEEP_RELEASES`).

## 5. Operating it

```bash
scripts/deploy.sh status               # containers, memory, swap, disk, health
scripts/deploy.sh logs backend medusa  # follow logs (also: postgres, redis, minio)
scripts/deploy.sh logs store store     # also: fcaptcha
scripts/deploy.sh backup               # pg_dump of both databases to ~/fecs-backups
scripts/deploy.sh ssh backend
```

Where things are on the servers:

| Path                                                       | Content                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `/opt/fecs/<droplet>/.env`                                 | secrets and settings (mode 600). Never in git                        |
| `/opt/fecs/<droplet>/release.env`                          | `IMAGE_TAG` and `PREVIOUS_TAG`                                       |
| `/opt/fecs/<droplet>/docker-compose.yml`                   | overwritten on every release                                         |
| Docker volumes `postgres_data`, `redis_data`, `minio_data` | all state, on the backend droplet                                    |
| `/etc/nginx/conf.d/fecs-*.conf`, `/etc/nginx/snippets/`    | nginx                                                                |
| `/etc/letsencrypt/`                                        | certificates, renewed by the certbot timer, nginx reloads on renewal |

Useful one-offs:

```bash
# Medusa CLI inside the image (for example, create another user)
ssh bibaestudios-backend 'cd /opt/fecs/backend && docker compose --env-file .env --env-file release.env run --rm -T cli user -e a@b.c -p ...'

# MinIO console (not published): tunnel it, then open http://localhost:9003
ssh -L 9003:127.0.0.1:9003 bibaestudios-backend
```

### Backups

`scripts/deploy.sh backup` covers the two databases only. **MinIO files (media,
product images) are not included.** Turn on DigitalOcean droplet backups (weekly,
20% of the droplet price) for the backend droplet, or copy the `minio_data` volume
regularly. Test a restore (`pg_restore`) before you rely on a backup.

## 6. MinIO: read this

The upstream MinIO project is archived: no more releases, images or security
fixes, and its Docker Hub images were removed. The deploy builds it **from source**
(`docker/minio/Dockerfile`, pinned commit) and keeps it on the backend droplet.
That is what this repo uses for local development too.

Consequences:

- You own its security. Keep the S3 port reachable only through nginx, keep
  `MINIO_ROOT_PASSWORD` strong, and plan to move to a maintained S3 service
  (DigitalOcean Spaces, Garage, SeaweedFS). Moving needs only the `S3_*` values.
- The apps use the MinIO **root** credentials, because the usual tools to create
  a limited user (`mc`) are no longer published. Anyone who gets `.env` gets the
  storage. Keep file permissions and the firewall tight.
- Two buckets are created: `ecommerce-media` (Payload CMS media, public read for
  `cms/media/*` only) and `ecommerce-medusa` (Medusa product images, **everything
  in it is public read**). Do not store private files in `ecommerce-medusa`.
- Browsers upload to `https://s3.bibaestudios.com` directly with presigned URLs
  (Payload `clientUploads`). CORS is allowed for `https://bibaestudios.com` and
  `https://www.bibaestudios.com` only.

### 6.1 Image resizing (imgproxy) and protecting the pictures

Without imgproxy, the Next.js server on the store droplet resizes every picture.
With it, a separate container next to MinIO does, and Cloudflare keeps every
result for a year, so the droplets only see the first visit to each picture.

```
Browser -> Cloudflare (cached WebP) -> nginx on the backend droplet -> imgproxy -> MinIO (original)
```

What is in place once it is on:

- URLs look like `https://img.bibaestudios.com/<version>/w<width>/<base64 key>.webp`.
  `<version>` changes when the media document is saved, so a replaced picture is
  fetched again. imgproxy accepts only the 14 widths of `docker/imgproxy/presets.txt`
  (the widest is 2048) and reads only `ecommerce-media/cms/media/`; any other
  size, path or format is a 404. EXIF (GPS, camera) is removed from every copy.
- The `img` host answers only Cloudflare (`snippets/cloudflare-geo.conf`), so
  the Cloudflare rules below cannot be skipped by going to the droplet directly.
  nginx also limits a visitor to 20 cache misses a second (`zone=img`).
- Payload media shown through `Media`/`PayloadImage` and the product cards and
  gallery use it. Medusa-only product photos (`ecommerce-medusa`), the cart and the
  search box still go through the Next.js optimizer.

**Turn it on** (the order matters; nothing changes for visitors until the last step):

1. DNS: add `img` as an **A record to the backend droplet, proxied (orange cloud)**.
   Cloudflare SSL mode _Full (strict)_.
2. `scripts/deploy.sh setup backend` (safe to repeat): adds `img` to the
   certificate and installs the nginx host. If the certificate request fails
   because of the proxy, switch `img` to DNS only for that minute.
3. `scripts/deploy.sh release backend`: starts imgproxy (and restarts it when
   `presets.txt` changed). A failure here only warns.
4. Cloudflare, for the host `img.bibaestudios.com`:
   - _Caching > Cache Rules_: eligible for cache; Edge TTL "use cache-control
     header if present, bypass cache if not"; leave Polish, Mirage and Rocket
     Loader off.
   - _Security > WAF > Custom rules_, action Block, to stop other sites embedding
     the pictures (empty referrers stay allowed: privacy settings, apps):

     ```
     (http.host eq "img.bibaestudios.com" and http.referer ne ""
      and not http.referer contains "bibaestudios.com")
     ```

     Also turn on **Hotlink Protection** for the zone (Scrape Shield).

   - _Security > WAF > Rate limiting rules_: for example 300 requests per minute
     per IP on the host, action Block. The free plan allows one such rule.
   - _Security > Bots_: Bot Fight Mode on.
5. Check the chain, then build the storefront with it:

   ```bash
   # 404 from imgproxy = Cloudflare, nginx and imgproxy all answer
   # (the key part needs 8+ characters, or nginx answers 404 on its own)
   curl -s -o /dev/null -w '%{http_code}\n' https://img.bibaestudios.com/v1/w999/preflight-check.webp
   # first request MISS, second HIT (use a real <version>/<base64 key> from the site)
   curl -sI https://img.bibaestudios.com/<version>/w640/<key>.webp | grep -iE 'HTTP|cf-cache-status|content-type'

   scripts/deploy.sh set-env store NEXT_PUBLIC_IMGPROXY_URL   # https://img.bibaestudios.com
   scripts/deploy.sh release store
   ```

   `release store` first asks the host for the 404 above and stops if it does not
   answer, because the value is compiled into the browser bundle.

**Turn it off**: remove `NEXT_PUBLIC_IMGPROXY_URL` from the store `.env` and run
`release store`. The Next.js optimizer takes over.

**Changing presets.** Edit `docker/imgproxy/presets.txt` and `IMGPROXY_WIDTHS` in
`apps/store/src/utilities/imgproxy.ts` together, then `release backend` (restarts
imgproxy) and `release store` (a storefront built with the old list asks for
removed widths and gets 404). URLs keep the same version, so purge the host in
Cloudflare (_Caching > Purge > Hostname_).

**Memory.** The container is limited to 512 MB and 2 images at a time. On a 2 GiB
backend droplet watch `scripts/deploy.sh status` after the first large upload;
imgproxy rejects sources over 50 MP or 50 MB.

**What this does not protect.** The original files stay public:
`https://s3.bibaestudios.com/ecommerce-media/cms/media/<name>` returns the
full-size upload, and everything in `ecommerce-medusa` (photos added in Medusa
Admin) is public too. A picture that a browser can show can always be saved, so
the aim is to make bulk copying slow and the public copies small, not impossible.

The originals are not closed yet because the site still reads them directly:

- `og:image` (`utilities/generateMeta.ts` falls back to the original) and the
  product JSON-LD images (`lib/seo/product.ts`). Social networks and search
  engines need JPEG/PNG, not WebP.
- Videos (`VideoMedia` plays the file URL; imgproxy does not serve video).
- Images rendered with a plain `next/image` or `<img>`: the header menu images
  and the hover blocks (`HoverCards`, `HoverHighlights`).
- The Payload admin, which opens the file URL from the browser (not tested).

To close them: move those readers to imgproxy (a JPEG route for `og:image`) or
to signed S3 URLs, then replace `public-read-media.json` with a policy that
allows videos only. Add a watermark at the same time: imgproxy needs a logo file
(`IMGPROXY_WATERMARK_PATH`) and its own preset names for pictures that carry it.
Legal measures (a copyright clause in the terms, keeping the originals as proof)
work alongside the technical ones.

### 6.2 Media on Cloudflare R2, and protecting the videos

Plan: the CMS media library (images and videos, bucket `ecommerce-media`, prefix
`cms/media/`) moves from MinIO to a Cloudflare R2 bucket. Why:

- R2 has no download fee, and Cloudflare allows its CDN to carry video **that is
  stored on R2**. Videos therefore go through the Cloudflare proxy like everything
  else: the droplet's address is not given away by a DNS-only record, and the droplet
  carries no video traffic. (Video stored on MinIO may not be served through the free
  CDN: see [Cloudflare's terms](https://blog.cloudflare.com/updated-tos).)
- Uploads from the CMS go straight to R2 with presigned URLs, with no 100 MB proxy limit.
- MinIO is an archived project and has no backup; R2 is managed.
- imgproxy reads with a read-only token instead of the MinIO root key.

Medusa product photos (`ecommerce-medusa`) stay on MinIO.

**What protects the videos** (a video that a browser can play can always be saved;
these layers stop embedding, bulk copying and unmarked copies):

1. Hotlink protection on `media`: pages of other sites cannot embed the file.
2. Rate limit and Bot Fight Mode on `media`: stops download tools.
3. The bucket is private: no `r2.dev` address; the only public way in is the
   `media` custom domain, which has the rules above in front of it.
4. A watermark on every public video: `scripts/prepare-video.sh clip.mov --logo logo.png`.
   (Link signing with expiry, "WAF token authentication", needs the Cloudflare Pro
   plan and signed URLs in the storefront; add it only for paid or exclusive content.)

#### Step 1: in the Cloudflare dashboard

1. R2 Object Storage: enable it (a payment method may be requested; the free tier
   is 10 GB and no download fees). Note the **Account ID**.
2. Create a bucket, for example `bibaestudios-media`, location hint Asia-Pacific.
   Leave **Public Development URL** (`r2.dev`) disabled.
3. In the bucket, Settings > CORS policy:

   ```json
   [
     {
       "AllowedOrigins": [
         "https://bibaestudios.com",
         "https://www.bibaestudios.com"
       ],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. R2 > Manage API tokens: create two tokens, both limited to this bucket:
   **Object Read & Write** (the CMS and the copy) and **Object Read only** (imgproxy).
   Keep each Access Key ID and Secret; the secret is shown once.

#### Step 2: put the settings on the backend (values are read from the terminal, hidden)

```bash
scripts/deploy.sh set-env backend R2_ACCOUNT_ID
scripts/deploy.sh set-env backend MEDIA_BUCKET          # bibaestudios-media
scripts/deploy.sh set-env backend R2_WRITE_KEY_ID
scripts/deploy.sh set-env backend R2_WRITE_SECRET
scripts/deploy.sh media-to-r2 --dry-run                 # lists what would be copied
scripts/deploy.sh media-to-r2                           # copies, then compares; safe to repeat
```

`media-to-r2` only copies (it never deletes) and ends by checking that every file
exists in R2 with the same content.

#### Step 3: imgproxy reads from R2

```bash
scripts/deploy.sh set-env backend IMGPROXY_S3_ENDPOINT  # https://<account id>.r2.cloudflarestorage.com
scripts/deploy.sh set-env backend IMGPROXY_S3_REGION    # auto
scripts/deploy.sh set-env backend IMGPROXY_S3_BUCKET    # bibaestudios-media
scripts/deploy.sh set-env backend IMGPROXY_S3_KEY_ID    # the read-only token
scripts/deploy.sh set-env backend IMGPROXY_S3_SECRET
scripts/deploy.sh imgproxy                              # restarts imgproxy with the new settings; Medusa is not rebuilt
```

Check an image on `img` (see 6.1) still returns 200. Visitors notice nothing: the
files are in both places.

#### Step 4: switch the CMS and the video host

1. DNS: delete the `media` A record (the one pointing at the backend droplet), then in
   R2 > the bucket > Settings > Custom Domains, connect `media.bibaestudios.com`.
   Cloudflare creates the proxied record itself. Check with
   `curl -sI https://media.bibaestudios.com/cms/media/<a file>.png` (200, `server: cloudflare`).
2. Store settings (the CMS signs uploads with these, and builds file URLs from them):

   ```bash
   scripts/deploy.sh set-env store S3_ENDPOINT        # https://<account id>.r2.cloudflarestorage.com
   scripts/deploy.sh set-env store S3_REGION          # auto
   scripts/deploy.sh set-env store S3_BUCKET          # bibaestudios-media
   scripts/deploy.sh set-env store S3_ACCESS_KEY_ID   # the Read & Write token
   scripts/deploy.sh set-env store S3_SECRET_ACCESS_KEY
   scripts/deploy.sh set-env store S3_FILE_URL        # https://media.bibaestudios.com
   scripts/deploy.sh release store
   ```

   `S3_FILE_URL` has no bucket name: the custom domain already points at the bucket.

3. Cloudflare rules for the host `media.bibaestudios.com`:
   - Caching > Cache Rules: eligible for cache; Edge TTL 1 month; Browser TTL 1 year.
     Every file URL carries `?v=<last change>`, so a replaced file gets a new URL.
   - Security > WAF > Custom rules, action Block:

     ```
     (http.host eq "media.bibaestudios.com" and http.referer ne ""
      and not http.referer contains "bibaestudios.com")
     ```

   - Security > WAF > Rate limiting rules: for example 300 requests per minute per IP.
   - Security > Bots: Bot Fight Mode on.

#### Step 5: clean up

Once pictures and a test video work from `media.bibaestudios.com` and the CMS
uploads to R2:

- keep the MinIO copy of `ecommerce-media` for a few weeks as a way back, then delete it;
- remove `R2_WRITE_KEY_ID` and `R2_WRITE_SECRET` from the backend `.env` (only the copy used them).

**Roll back** (before cleaning up): set `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, the two
keys and `S3_FILE_URL` of the store back to the MinIO values (`https://s3.bibaestudios.com`,
`us-east-1`, `ecommerce-media`, the MinIO user and password,
`https://s3.bibaestudios.com/ecommerce-media`) and `release store`; clear the five
`IMGPROXY_S3_*` values on the backend and run `scripts/deploy.sh imgproxy`.
Files uploaded to R2 in the meantime are not in MinIO: copy them back with rclone.

#### Preparing a video

```bash
scripts/prepare-video.sh original.mov hero.mp4 --logo logo.png    # H.264 MP4, <=1920 px, faststart, no audio, watermark
```

It stops above 100 MB and warns above 50 MB. See `--help` for `--audio`,
`--max-width` and `--crf`.

## 7. Search: Meilisearch

Product search uses [Meilisearch](https://github.com/meilisearch/meilisearch)
(replaces Algolia), running as a container on the backend droplet.

- Only Medusa talks to it, inside the Docker network (`http://meilisearch:7700`). It has
  **no published port**, so the internet cannot reach it. The storefront's search box
  calls `/api/search` on the store, which calls Medusa's `POST /store/products/search`.
  No search credentials exist on the store droplet or in the browser.
- `MEILISEARCH_MASTER_KEY` is generated by `setup` in `/opt/fecs/backend/.env`.
- Medusa creates the index on first write and sets its searchable fields (title,
  handle, description, category names, tag values). Typo tolerance is on by default,
  and accents are ignored, so "ao so mi" finds "Áo sơ mi".
- The index is **derived data**. It is not in `scripts/deploy.sh backup`; rebuild it
  with the Sync button instead. Medusa keeps working if Meilisearch is down: only
  search and index updates fail.
- Memory: limited to 512 MB, indexing to 256 MB (`MEILI_MAX_INDEXING_MEMORY`). Size
  figures in section 1 allow for it, but they are estimates.
- Local development: `docker compose up -d meilisearch` in `docker/`, then set
  `MEILISEARCH_HOST=http://localhost:7700` and
  `MEILISEARCH_MASTER_KEY=dev-master-key-change-me` in `apps/medusa/.env`.
- Unpublished products are not removed from the index when you unpublish them
  (same behaviour as before). Delete or re-sync to clean up.

## 8. Changes made to the app for this deployment

| File                                                                                                    | Change                                                                                             | Why                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/store/next.config.mjs`                                                                            | `output: "standalone"` when `NEXT_OUTPUT=standalone`                                               | Small production image. Normal builds and dev are unchanged                                                                               |
| `apps/medusa/medusa-config.ts`                                                                          | S3 provider `additional_client_config.forcePathStyle` from `S3_FORCE_PATH_STYLE`                   | MinIO needs path-style URLs. Off unless the variable is `true`                                                                            |
| `apps/medusa/medusa-config.ts`                                                                          | PostHog provider only when `POSTHOG_EVENTS_API_KEY` is set, else the local provider                | PostHog throws at start-up without a key                                                                                                  |
| `apps/medusa/src/modules/algolia` and its workflows, steps, subscribers, admin route and admin page     | Replaced by the same files under the name `meilisearch` (plain `fetch` client, no new npm package) | Algolia replaced by Meilisearch. `POST /store/products/search` returns the same response shape, so the storefront search box is unchanged |
| `apps/medusa/.env.template`, `apps/store/.env.template`, `apps/store/src/environment.d.ts`              | `ALGOLIA_*` and `NEXT_PUBLIC_ALGOLIA_*` removed, `MEILISEARCH_*` added (Medusa only)               | The store never used the Algolia keys                                                                                                     |
| `docker/docker-compose.yml`, `docker/docker-compose.e2e.yml`, `infra/k8s/examples/external-secret.yaml` | Meilisearch service / variables instead of Algolia                                                 | Local development, e2e stack, k8s secret example                                                                                          |

New files: `infra/docker/store.Dockerfile` (+ `.dockerignore`), `infra/deploy/**`
(compose files, nginx templates, `deploy.conf.example`), `scripts/deploy.sh`.

## 9. Troubleshooting

| Symptom                                             | Likely cause and fix                                                                                                                                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup` fails at certbot                            | DNS does not point at the droplet yet, or port 80 is blocked. Run `dig +short <name>`; wait for DNS; re-run `setup`                                                                                                                                       |
| `release backend` stops: "empty in .env"            | Fill the listed keys. `ALLOW_INCOMPLETE=1` skips the check, but Medusa will not start without the SMTP values                                                                                                                                             |
| Medusa unhealthy, logs show a missing module option | A required value is empty or wrong in the backend `.env`                                                                                                                                                                                                  |
| `release store`: cannot reach Medusa                | Release the backend first. Check both droplets are in the same VPC and `BACKEND_PRIVATE_IP` is right                                                                                                                                                      |
| `release store`: tunnel fails                       | Local ports 15432 or 19000 are in use. Stop what uses them                                                                                                                                                                                                |
| Store build cannot reach `host.docker.internal`     | Docker Desktop only. Check the tunnel is up and Docker Desktop is current                                                                                                                                                                                 |
| Store build: out of memory                          | Raise Docker Desktop memory (Settings > Resources), or `--max-old-space-size` in `store.Dockerfile`                                                                                                                                                       |
| `payload migrate` fails in the build                | A migration or a dev-mode schema change needs attention. The build has no stdin, so it never auto-answers Payload's prompts. Fix on the database, not by forcing                                                                                          |
| CMS upload fails in the browser                     | Check `https://s3.bibaestudios.com` resolves and has a valid certificate, and CORS origin matches the site URL exactly                                                                                                                                    |
| Search box finds nothing                            | The index is empty: run Medusa Admin > Settings > Meilisearch > Sync. If it is still empty, `scripts/deploy.sh logs backend meilisearch` and `logs backend medusa` (look for `Meilisearch ... failed`). A wrong `MEILISEARCH_MASTER_KEY` shows as 401/403 |
| 502 from nginx                                      | The container is down: `scripts/deploy.sh status`, then `logs`                                                                                                                                                                                            |
| Out-of-memory kills                                 | `status` shows swap in use. Resize the droplet                                                                                                                                                                                                            |

## 10. Known problems found while deploying

| Problem                                                                                                                                       | What was done                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The storefront has about 150 TypeScript errors in committed code (mostly Medusa SDK type drift in `lib/data`, checkout and common components) | The Docker build sets `NEXT_IGNORE_TYPE_ERRORS=true`. Dev and CI stay strict. Remove that line in `infra/docker/store.Dockerfile` once the errors are fixed                      |
| `next build` crashed with `qemu ... Segmentation fault`                                                                                       | amd64 builds on an Apple Silicon Mac run under QEMU. The Dockerfile limits Next to 2 build workers (`NEXT_BUILD_CPUS=2`). Turning on Rosetta in Docker Desktop removes the cause |
| `export const dynamic/revalidate` on two blog list pages conflicted with `cacheComponents`                                                    | Removed from `posts/page.tsx` and `posts/page/[pageNumber]/page.tsx`                                                                                                             |
| Three blocks imported `Button` with `import type` but rendered it                                                                             | Changed to a normal import (would have crashed at runtime)                                                                                                                       |
| `sitemap.ts` read a `www` folder that does not exist and built the base URL as `https://https://...`                                          | Missing folder tolerated, URL built correctly                                                                                                                                    |
| The Medusa image shipped `@ecommerce/email` as raw TSX, so the SMTP provider crashed at start-up                                              | `infra/docker/medusa.Dockerfile` now compiles it to CommonJS                                                                                                                     |
| Cloudflare returns error 1010 to Python's HTTP client on the public hostname                                                                  | Admin API scripts run on the backend droplet against `http://<private IP>:9000`                                                                                                  |
| The English version of a CMS post shows the Vietnamese text                                                                                   | Existing behaviour: `queryPostBySlug` does not pass a locale. Not changed                                                                                                        |

## 11. What has not been verified

Written without access to the servers. These were tested locally: the compose files
(`docker compose config`), both nginx configs (`nginx -t` with the real domains),
shell syntax, lint and format of the changed app files, and that a container can
reach the Mac's loopback through `host.docker.internal`. **Not run end to end**:

- the standalone storefront build and image start (monorepo tracing path
  `apps/store/server.js`),
- a BuildKit step reaching the SSH tunnel through `--add-host host.docker.internal:host-gateway`,
- the MinIO source build for amd64,
- `payload migrate` inside the image against the live database,
- the Medusa seed script path in the image (`./src/scripts/seed.js`),
- certificate issuance and the ufw rules on the actual droplets,
- the search path inside a running Medusa: the new Meilisearch module was tested
  against a live Meilisearch v1.56.1 container (index, upsert, delete, search with
  and without Vietnamese accents, error cases), and the changed files type-check,
  lint and format cleanly. The workflows, subscribers, admin page and the storefront
  search box were not run end to end, and `medusa build` was not run.

Expect to fix a few small things in the first run. The script stops on any error
and leaves the previous release running.
