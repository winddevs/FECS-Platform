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
  captcha.bibaestudios.com                s3.bibaestudios.com
  nginx -> store   :8000 (loopback)       nginx -> medusa :9000 (private IP)
        -> fcaptcha:3100 (loopback)             -> minio  :9002 (loopback)
        |                                        |
        |   private VPC network (sgp1)           |
        +--> Medusa    10.x.x.x:9000  ----------->+  medusa    (API, admin, jobs)
        +--> Postgres  10.x.x.x:5432  (ecommerce_cms)  postgres  (ecommerce_medusa + ecommerce_cms)
        +--> Redis     10.x.x.x:6379  (sign-in limits) redis
                                                 minio     (media + product images)
                                                 meilisearch (product search, internal only)
```

| Droplet     | Runs                                                                                      | Recommended size                              | Minimum (with the 2 GB swap the script adds) |
| ----------- | ----------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| **backend** | Medusa (one process, API + admin + jobs), Postgres 17, Redis 7, MinIO, Meilisearch, nginx | 4 GiB RAM, 2 vCPU, 80 GiB SSD (Basic, $24/mo) | 2 GiB, 2 vCPU, 60 GiB ($18/mo)               |
| **store**   | Next.js storefront and Payload CMS admin (one app), FCaptcha, nginx                       | 2 GiB RAM, 2 vCPU, 60 GiB SSD (Basic, $18/mo) | 2 GiB, 1 vCPU, 50 GiB ($12/mo)               |

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
