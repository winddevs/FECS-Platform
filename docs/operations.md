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

### Access control

Roles are stored on the admin user (`metadata.fashion_roles`). Grant with
`pnpm --filter medusa grant-role <email> <ROLE...>`. Users with no role cannot
call any fashion endpoint. Roles and permissions: `src/lib/authz/permissions.ts`.

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
