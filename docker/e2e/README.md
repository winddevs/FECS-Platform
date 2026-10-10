# Local Docker end-to-end stack

Runs the platform with the production topology and drives it through the
fashion use-case journeys (Requirement doc §7.1–7.4) over HTTP.

```bash
bash docker/e2e/run.sh up      # build image, start stack, seed demo data
bash docker/e2e/run.sh test    # journeys (JOURNEYS=smoke,social bash … to pick some)
bash docker/e2e/run.sh chaos   # failure scenarios
bash docker/e2e/run.sh logs    # follow server and worker logs
bash docker/e2e/run.sh down    # stop and delete the data volume
```

## Topology

| Service        | Role                                                         | Host port |
| -------------- | ------------------------------------------------------------ | --------- |
| postgres       | database (volume `e2e_postgres`)                             | 5544      |
| redis          | event bus, workflow engine, cache                            | -         |
| mock-providers | J&T, Meta Graph and Payload stand-ins                        | 7070      |
| migrate        | `medusa db:migrate`                                          | -         |
| bootstrap      | demo users, then demo catalogue/region/stock                 | -         |
| medusa-server  | `MEDUSA_WORKER_MODE=server` (HTTP only)                      | 9100      |
| medusa-worker  | `MEDUSA_WORKER_MODE=worker`, scaled to 2 (jobs, subscribers) | -         |
| e2e (profile)  | journey runner                                               | -         |

## Real vs mocked

- Real: the production Docker image, Postgres, Redis, server/worker split,
  outbox, inbox, idempotency, RBAC, sagas.
- Mocked: J&T (HMAC verified, idempotent per `txlogisticId`, failure injection
  at `/__jt/fail`, push webhooks via `/__jt/scan`), Meta Graph, Payload.
- Swapped by `LOCAL_STACK=true` in `medusa-config.ts`: file storage, analytics
  and notifications use local providers instead of S3, PostHog and Resend.

Real carrier/Meta payload formats and SaaS behaviour are not verified here.

## Demo users

`<role>@fashion.local` / `Passw0rd!local` for: admin, procurement, warehouse,
planner, cutter, sewer, supervisor, qc, packer, support, finance, sre, norole.
Rework needs `supervisor`; creating FG locations needs `admin`.

## Journeys

`smoke`, `make-to-stock`, `made-to-order`, `social`, `returns`. They are
re-runnable on the same database (stock assertions are relative to baselines).

## Chaos scenarios

Workers down, carrier timeout after create, carrier unavailable, 12-way webhook
burst, `kill -9` on a worker, server restart. Each checks that no order is lost,
duplicated or shipped twice once the system recovers.

## Notes

- `medusa build` still reports legacy type-only errors (Payload, Algolia,
  analytics, email templates). `apps/medusa/scripts/check-build-errors.mjs`
  fails the image build on any error outside the allow-list or when
  `.medusa/server/medusa-config.js` is missing (`pnpm build:check`).
- Each Medusa stock location maps to exactly one FG location (unique partial
  index, migration `Migration20261010182848`). Databases that already contain
  duplicates must be cleaned before migrating.
- Port 7000 is avoided because macOS AirPlay uses it.
