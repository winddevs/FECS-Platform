# Fashion platform - engineering guide

Implements `Fashion_Platform_Requirement_Document_v1.0.md` and
`Fashion_Platform_Technical_Design_Document_v1.0.md` inside `apps/medusa`.

## How it is organised

A **modular monolith**: one deployable, bounded contexts that each own their
tables, talk through service APIs and events, and can be extracted later.

| Context (module key) | Owns                                                   | Folder                          |
| -------------------- | ------------------------------------------------------ | ------------------------------- |
| `integration`        | inbox, audit log                                       | `src/modules/integration`       |
| `materialInventory`  | materials, lots, rolls, ledger, balances, reservations | `src/modules/materialInventory` |
| `procurement`        | suppliers, POs, goods receipts                         | `src/modules/procurement`       |
| `manufacturing`      | BOM, routing, MO, cut, bundles/WIP, MRP, MTO requests  | `src/modules/manufacturing`     |
| `quality`            | inspections                                            | `src/modules/quality`           |
| `finishedGoods`      | FG batches, ledger, allocation, sellable projection    | `src/modules/finishedGoods`     |
| `fashionFulfillment` | carrier shipments, tracking                            | `src/modules/fulfillment`       |
| `socialCommerce`     | channel identity, conversations, notifications         | `src/modules/socialCommerce`    |
| `returns`            | RMA, return QC, refunds                                | `src/modules/returns`           |

Medusa (catalog, cart, order, payment, commerce inventory) stays the commerce
authority; raw material and WIP never enter Medusa inventory (BR-002).

Layering for every feature: **module (data + invariants) -> workflow
(business steps, compensation) -> API route (validate, authorize, call)**.
Cross-module calls go through workflows, never through another module's tables.

Shared building blocks live in `src/lib`: `tx.ts` (idempotency, outbox, locks),
`outbox/`, `idempotency/`, `authz/`, `feature-flags.ts`, `errors.ts`,
`reconciliation/`, `retention.ts`.

## Reliability rules (apply to every new feature)

1. **Idempotent commands**: state-changing endpoints require an
   `Idempotency-Key`; the key and the business write commit in one transaction.
2. **Transactional outbox**: domain write + event row in the same transaction;
   the `publish-outbox` job delivers. Never emit directly from a handler.
3. **Inbox for external input**: webhooks verify the signature, insert into the
   durable inbox, ACK. A worker processes it with retry/backoff/DLQ.
4. **Database enforces invariants** (CHECK constraints, unique indexes,
   append-only triggers) in addition to the code.
5. **Provider details stay in adapters** (`src/integrations`): carrier and
   channel interfaces; the core never sees J&T/Meta shapes.
6. **Every risky integration has a feature flag**, off by default.
7. **No PII in logs, metrics labels or span attributes.**

## Extending

- **New carrier**: implement `CarrierProvider` (`src/integrations/carrier/provider.ts`),
  register it in `registry.ts`. Nothing else changes.
- **New messaging channel** (WhatsApp/Zalo/LINE): implement `MessageChannel`,
  register it, add an inbox handler in `src/lib/inbox/`.
- **New domain event**: emit through the module outbox, then run
  `pnpm --filter medusa events:write` and review the diff of
  `docs/events/catalog.json`. CI fails on uncataloged or removed events.
- **New module with its own outbox**: add its key to `src/lib/outbox/drainers.ts`
  and its tables to `src/lib/retention.ts`.
- **New role/permission**: `src/lib/authz/permissions.ts`.

## Testing

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/db   # any empty Postgres
pnpm --filter medusa typecheck       # scoped tsc (the full-project tsc exceeds memory)
pnpm --filter medusa test:integration  # invariants, concurrency, state machines, MTS/MTO/returns
pnpm --filter medusa test:http         # real server: auth, RBAC, validation, webhooks
pnpm --filter medusa events:check
```

Integration tests use the `INTEGRATION_TEST=true` profile of
`medusa-config.ts`: core + fashion modules only, no Redis/Algolia/S3 needed.

See also: [operations](operations.md) and [runbooks](runbooks/).
