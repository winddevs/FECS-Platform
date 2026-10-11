# Operations guide

## Process roles and scaling

One image, three roles (`MEDUSA_WORKER_MODE`):

| Role     | Env                         | Scales on            | Notes                                                             |
| -------- | --------------------------- | -------------------- | ----------------------------------------------------------------- |
| `server` | `MEDUSA_WORKER_MODE=server` | request rate / CPU   | API + admin; no jobs                                              |
| webhook  | same image, own Deployment  | webhook rate         | isolated so a carrier/Meta replay cannot starve checkout          |
| `worker` | `MEDUSA_WORKER_MODE=worker` | outbox/inbox backlog | jobs + subscribers; replicas are safe (SKIP LOCKED + idempotency) |

Local dev uses `shared` (both in one process). Production topology:
`infra/k8s` (Kustomize base + staging/production overlays), rehearsal stack:
`docker/docker-compose.platform.yml`.

Stateful dependencies are **managed services**, not pods: PostgreSQL (PITR on),
Redis (event bus, cache, locks, sessions), object storage.

### Capacity rules of thumb

- Connections: `(server + webhook + worker replicas) x DB_POOL_MAX < max_connections`.
  Beyond ~200 connections put PgBouncer in front. Transaction pooling is
  compatible: every lock used by stock/FG/shipment code is transaction-scoped
  (`FOR UPDATE`, `pg_advisory_xact_lock`), never session-scoped.
- Hot rows are per roll/SKU, not global, so write throughput scales with
  catalogue breadth. Reservation contention shows as `RESERVATION_CONTENTION`
  (retry) - alert if sustained.
- Ledger tables (`material_stock_movement`, `fg_movement`, `audit_log`) only
  grow. Plan monthly range partitioning on `created_at` once a table passes
  ~50M rows; the append-only triggers carry over to partitions.

## Configuration

`apps/medusa/.env.template` lists every setting. Secrets live in the secret
manager (see `infra/k8s/examples/external-secret.yaml`); rotate by updating the
secret and `kubectl rollout restart deploy -l app.kubernetes.io/name=medusa`.

### Rolling out an integration (feature flags)

Switch on one at a time, watching `/admin/ops/summary` and the alerts:

1. `MANUFACTURING_ENABLED` - FG ship-out mirrors fulfillments.
2. `FG_SYNC_TO_MEDUSA_ENABLED` - sellable projection -> Medusa inventory. Run
   `POST /admin/finished-goods/projection/republish` once to backfill.
3. `JT_FULFILLMENT_ENABLED` (+ `JT_TRACKING_CALLBACK_ENABLED`, then
   `JT_RECONCILIATION_ENABLED`, finally `JT_AUTO_CREATE_SHIPMENT`).
4. `META_MESSENGER_ENABLED` -> `AGENT_READ_TOOLS_ENABLED` ->
   `META_SHIPMENT_NOTIFICATION_ENABLED` -> `AGENT_STATE_CHANGE_ENABLED`.
5. `MTO_ENABLED` with `MTO_PAYMENT_GATE=captured`.

Rolling back = flip the flag and restart; data stays consistent because every
side effect is idempotent and retried from durable state.

### Stock projection and Medusa fulfillment

`finishedGoods` is the source of truth for finished stock. With
`FG_SYNC_TO_MEDUSA_ENABLED` its sellable quantity is written to Medusa's
`stocked_quantity`. Medusa also lowers `stocked_quantity` itself when a
fulfillment is created. Both writers converge on the same number, because the
`order.fulfillment_created` subscriber ships the same units out of the FG ledger
and that emits a fresh (versioned) projection. A warehouse that ships through
the FG API **before** Medusa records the fulfillment can leave Medusa lower by
that quantity until the next projection; the FG-vs-Medusa reconciliation job (`reconcile-finished-goods`)
reports it as drift and `POST /admin/finished-goods/projection/republish`
fixes it. Always create the Medusa fulfillment first, so the two stay in step.

### Social support

- A customer asks for a person ("gặp nhân viên", "talk to a human"): the chat
  goes to human mode (`GET /admin/social/identities?handoff_state=HUMAN` is the
  queue). The bot then runs nothing for that chat.
- Agents read `GET /admin/social/identities/:id/messages` and answer with
  `POST /admin/social/identities/:id/messages` (`social:manage`). Replies are
  refused outside the 24h messaging window or for opted-out customers.
- The customer returns to the bot by sending `bot`.
- Checkout links are bound to the linked customer: the exchange endpoint only
  answers the same logged-in customer. More than 30 messages a minute from one
  chat are dropped.

### Performance

`pnpm --filter medusa test:perf` seeds a scratch database (SCALE=1: ~320k ledger
rows, 10k reservations, 65k outbox rows; SCALE=4: 5M rows) and checks the SLOs
of the design (availability < 200 ms, reserve < 1 s, outbox publish, ...) plus
the query plans of the hot statements. `integration-tests/perf/run-http-perf.sh`
repeats the key calls through the real API with concurrent clients. A nightly
workflow (`.github/workflows/perf.yml`) runs both.

Production signals: `fashion_http_request_duration_ms` (histogram per route
shape, scraped from `/internal/metrics`) feeds the `slo-latency` alerts.

Rule for raw SQL on big tables: always include `deleted_at IS NULL`. The
framework builds its indexes as partial indexes on that predicate, so a query
without it silently falls back to a sequential scan (this is checked by the
query-plan section of the perf test).

### Access control

Roles are stored on the admin user (`metadata.fashion_roles`). Grant the first
ERP_ADMIN from the CLI: `pnpm --filter medusa grant-role <email> <ROLE...>`.

Medusa lets any admin edit `metadata` on `POST /admin/users/:id` and
`POST /admin/invites`, so writing the `fashion_roles` key is itself guarded: it
needs the `roles:manage` permission (ERP_ADMIN only). Other metadata stays
editable by everyone.

Users with no role cannot call any fashion endpoint, and also not the legacy
commerce admin routes: Algolia/Payload sync, analytics, invoice config and
invoice PDFs need `commerce:admin` (ERP_ADMIN, COMMERCE_ADMIN) or `order:read`.
Existing admins who used those screens need a role granted first.
Roles and permissions: `src/lib/authz/permissions.ts`.

### Sandbox providers

`CARRIER_SANDBOX` / `CHANNEL_SANDBOX` swap in in-process providers (staging, CI).
They still require a signed webhook: HMAC-SHA256 of the body with
`SANDBOX_WEBHOOK_SECRET`, in the same header the real provider uses
(`x-signature` for the carrier, `x-hub-signature-256` for Messenger). Without
that secret every webhook is rejected, so a mis-set flag in production cannot
open the webhook routes.

### Kafka event feed

Domain events (inventory, procurement, manufacturing, quality, finished goods,
fulfillment, returns, notifications) are also delivered to Kafka, one topic per
bounded context: `<prefix>fashion.<context>.events.v1`, keyed by aggregate id
so one aggregate's events stay ordered. Delivery is at-least-once; consumers
deduplicate on the envelope's `event_id`.

- Enable with `KAFKA_RELAY_ENABLED=true` and `KAFKA_REST_URL` (Confluent REST
  Proxy, Redpanda HTTP Proxy or Strimzi bridge). Optional: `KAFKA_REST_USER` /
  `KAFKA_REST_PASSWORD`, `KAFKA_TOPIC_PREFIX`, `KAFKA_REST_TIMEOUT_MS`.
- Create the topics up front. The proxies do not create a topic on first
  produce.
- Kafka is never the source of truth. When it is down, events wait in
  `kafka_relay_event` and leave when it returns; orders, stock and shipments
  are unaffected. Watch `fashion_outbox_pending` and the Kafka provider-call
  metrics; see `docs/runbooks/outbox-backlog.md`.
- The client speaks the REST proxy protocol, not the native Kafka protocol.

### Analytics marts

Fourteen read-only SQL views in schema `analytics` (production output,
material consumption, sell-through, carrier performance, order conversion,
fulfillment lead time, SKU margin inputs, ...). They are (re)created at start
by the integration module's loader and are served by
`GET /admin/analytics-marts` and `GET /admin/analytics-marts/:mart`
(permission `analytics:read`, read-only transaction, allow-listed names). Point
a BI tool at the schema with a read-only database role.

### Settings and country profiles

`GET/PUT/DELETE /admin/settings/:key` (permission `config:manage`, ERP_ADMIN)
override business rules per GLOBAL, COUNTRY or WAREHOUSE scope; environment
variables are the fallback. Values are validated against the registry in
`src/lib/config/settings.ts` and cached for 20 seconds per process.
`/admin/country-profiles` holds the country's carrier, currency, warehouses,
return window and social channels, so a second country is configuration.

### Delivery problems and tracking repair

- A failed or stuck parcel opens a `shipment_exception` (support queue:
  `GET /admin/fulfillment/exceptions`); a later good scan resolves it.
- Parcels whose webhook never arrived are polled by `poll-carrier-tracking`
  (every minute; stale after `TRACKING_POLL_STALE_SECONDS`, default 15 min).
- A returned parcel can be replaced on purpose (`replace` on the shipment), and
  the old shipment is kept as history.
- Carrier status codes map through `JT_STATUS_MAP_JSON` (exact codes first,
  keyword rules after). The real J&T contract is not verified here: set the map
  from the carrier's documentation before going live.

### Stock operations

Cycle counts are maker-checker (count, then another person approves the
adjustment). Transfers between warehouses are in transit until received
(`dispatch` / `receive` / `cancel`), for materials and finished goods. Rolls and
lots carry Code 128 labels (`/admin/material-inventory/labels/:type/:code`) and scans resolve through
`/admin/material-inventory/scan/:code`.

### AI assistant boundary

`AGENT_LLM_ENABLED` lets a language model help only when the rules found no
intent. The model may choose one read-only action (order status, tracking,
production status, return policy); its answer is validated against a strict
schema, and PII is masked before the text leaves the platform. Checkout, link,
stop and mute are never model-selectable. Configure with `AGENT_LLM_*`
(OpenAI-compatible endpoint).

### Languages (Vietnamese first)

Vietnamese (`vi`) is the default everywhere; English stays available.

- Storefront: `/{locale}/{country}/...` with `vi` default (Accept-Language is
  honoured), UI text in `apps/store/src/i18n/messages/areas/<area>.{en,vi}.json`,
  prices as `250.000 ₫`, dates in the customer's format. Content in Payload
  falls back to English when a Vietnamese version is missing. Payload's own admin
  speaks Vietnamese too.
- Medusa Admin: the first time a browser opens it, it switches to Vietnamese
  once (widget `default-language`); after that the operator's choice in
  Profile > Language wins. The ERP screens translate through `tr()`; add a
  string by writing it in English in the screen and its Vietnamese in
  `src/admin/i18n/vi/<area>.ts`. `pnpm --filter medusa i18n:check` fails CI when
  one is missing.
- API errors: clients that send `x-locale: vi` (the back-office does) or
  `Accept-Language: vi` get Vietnamese messages; `code` stays stable.
  `i18n:errors` checks every error message in the code has a translation.
  `DEFAULT_API_LOCALE` sets the default (`en`).
- Messenger: replies follow the language the customer writes in and it is
  remembered per chat; notifications use that language, else
  `SOCIAL_DEFAULT_LOCALE`.
- Emails and invoice PDFs: `order.locale`, else `order.metadata.locale`, else
  `EMAIL_DEFAULT_LOCALE` / `INVOICE_DEFAULT_LOCALE` (default `vi`). The invoice
  uses Roboto so diacritics print correctly.

### Startup checks

The integration module's loader runs in every process before traffic: it
refuses to start in production with missing or default secrets
(`SKIP_SECRET_CHECK=true` overrides, for emergencies only), masks PII in logs
and creates the analytics views. Medusa 2 does not run a top-level
`src/loaders` folder, so do not add startup code there.

## Local end-to-end stack

For a guided demo on a laptop (stack, storefront, demo accounts, a 20 minute
script) see `docs/local-demo.md`.

`bash docker/e2e/run.sh up|test|chaos|down` starts the production image with
Postgres, Redis, a server and two workers, and mock J&T/Meta/Payload providers,
then runs the fashion use-case journeys and failure scenarios. See
`docker/e2e/README.md` for the port map, demo users and what is mocked.

## Deploying

1. CI builds, scans and pushes `ghcr.io/<org>/fashion-medusa:<git-sha>`.
2. Run the migration Job (`infra/k8s/migrate`) with the new tag **before** the
   rollout; abort on failure.
3. Set the tag in the overlay and apply (`kubectl apply -k infra/k8s/overlays/production`)
   or let Argo CD sync. Rolling update keeps `maxUnavailable: 0`.
4. Watch `/admin/ops/summary`, outbox lag and error rate for 15 minutes.

### Migration policy (zero-downtime)

Old and new code run side by side during a rollout, so migrations must be
backward compatible: **expand** (add nullable columns/tables/indexes
`CONCURRENTLY` where large) -> deploy code that uses them -> **contract**
(drop old columns) in a later release. Never rename a column or table in one
step; never change a CHECK/trigger that the previous release would violate.
CI fails if a model change ships without its migration.

## Observability

- Traces: OpenTelemetry (HTTP, workflows, queries, DB) via `instrumentation.ts`;
  business ids (`mo.id`, `sku`, `order.id`, `bundle.id`, `fulfillment.id`) are
  added to spans. Set `OTEL_EXPORTER_OTLP_ENDPOINT`.
- Metrics: Prometheus scrapes `/internal/metrics` (bearer `METRICS_TOKEN`);
  alert rules in `infra/observability/alerts.yaml`.
- One-glance health for on-call: `GET /admin/ops/summary` (role `SRE`).
- Probes: liveness `/health`, readiness `/internal/ready` (checks Postgres).

## Data retention

`prune-operational-tables` (daily) trims delivered outbox rows (14d),
idempotency keys (30d), processed inbox (30d), chat content (90d). Ledgers and
the audit log are never pruned. Tune with the `RETENTION_*` variables.

## Backup and recovery

Postgres PITR is the recovery mechanism. After a restore, run:
`GET /admin/material-inventory/reconciliation`,
`GET /admin/finished-goods/reconciliation`, then
`POST /admin/finished-goods/projection/republish` to re-sync Medusa stock.
Outbox rows PENDING at restore time are re-published; consumers dedupe by
`event_id`.
