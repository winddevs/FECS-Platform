# Local deployment and end-to-end demo

Run the whole platform on one machine and walk a fashion order from raw
material to delivered parcel. Everything here was run on macOS with Docker
Desktop; the steps marked "not verified" are called out.

## What you get

| Piece                 | Where                                 | Notes                                                      |
| --------------------- | ------------------------------------- | ---------------------------------------------------------- |
| Medusa API + Admin UI | http://localhost:9100 (admin: `/app`) | Production image, 1 server + 2 workers                     |
| Storefront (Next.js)  | http://localhost:8000/en/vn           | Run from source with `next dev`; embeds Payload CMS admin  |
| Mock J&T, Meta, LLM   | http://localhost:7070/__state         | Stand-ins you control (see "Playing the outside world")    |
| Postgres              | localhost:5544 (`fashion`/`fashion`)  | Databases `fashion` (Medusa) and `ecommerce_cms` (Payload) |
| Redis                 | inside Docker                         | Event bus, cache, locks, workflow engine                   |
| Redpanda (Kafka)      | HTTP proxy on localhost:18082         | Receives the domain event feed                             |

Real: the production Docker image, Postgres, Redis, Redpanda, the server/worker
split, migrations, jobs, subscribers, webhooks and role-based access.
Simulated: J&T, Meta Messenger, the language model, Payload API calls from
Medusa, S3 (files on disk), email (written to the log), PostHog (off).

## Prerequisites

- Docker Desktop with at least 6 GB of memory. The running stack uses about
  1.6 GB; the first image build needs more headroom.
- Node.js 22 and the repository's dependencies installed (`pnpm install`).
- Free ports: 9100, 7070, 5544, 18082, 8000.

## Start

Run from the repository root.

```bash
# 1. Build the image, start the stack, seed users and the demo store (first run: several minutes)
bash docker/e2e/run.sh up

# 2. Optional but recommended: fill the system with a full history
#    (stock received, produced and sold; orders; parcels; returns). About 3 minutes.
bash docker/e2e/run.sh test

# 3. Prepare and start the storefront
bash docker/e2e/run.sh storefront
cd apps/store && env -u DATABASE_URL ./node_modules/.bin/next dev --port 8000
```

Step 3 creates the `ecommerce_cms` database, writes `apps/store/.env` with this
stack's publishable key, and applies the Payload migrations. `env -u
DATABASE_URL` keeps a `DATABASE_URL` exported in your shell (for example from
running the integration tests) from overriding the storefront's own.

The first storefront page takes a while to compile. Open
http://localhost:8000/en/vn once the terminal prints `Ready`.

## Accounts

All demo accounts use the password `Passw0rd!local`. Sign in to
http://localhost:9100/app with:

| User                                          | Role               | Use it for                                      |
| --------------------------------------------- | ------------------ | ----------------------------------------------- |
| `admin@fashion.local`                         | ERP admin          | Everything, including settings                  |
| `procurement@fashion.local`                   | Procurement        | Suppliers, purchase orders, goods receipts      |
| `warehouse@fashion.local`                     | Warehouse manager  | Raw material, counts, transfers, finished goods |
| `planner@fashion.local`                       | Production planner | BOM, routing, MRP, manufacturing orders         |
| `cutter@`, `sewer@`, `supervisor@`, `packer@` | Shop floor         | Cutting, sewing, rework, packing                |
| `qc@fashion.local`                            | Quality            | Inspections                                     |
| `support@fashion.local`                       | Customer support   | Shipments, exceptions, returns, Messenger chats |
| `finance@fashion.local`                       | Finance            | Payment capture, refunds                        |
| `sre@fashion.local`                           | SRE                | Operations, metrics, analytics marts            |

Sign in as different roles to show that permissions are enforced: a sewing
operator cannot see finished goods, and a user with no role (`norole@`) sees
403 on every ERP screen.

The demo store sells two products in Vietnamese dong:

- Basic tee, black (`TEE-BLK-S/M/L`): made to stock. It has no stock until
  production packs it, which is the point of the demo.
- Made-to-order blazer, navy (`BLZ-NVY-M/L`): no stock; every order raises a
  production request.

## Demo script (about 20 minutes)

Run `bash docker/e2e/run.sh test` first so there is history to browse. The
script then adds a live order on top.

### 1. The back office

Open `/app` as `admin@fashion.local`. The sidebar has eleven ERP entries:
Procurement, Raw Materials, Planning, Production, Shop Floor, Quality, Finished
Goods, Fulfillment, Returns, Social Support, Operations.

- Raw Materials: balances, lots, rolls, the movement ledger, cycle counts,
  transfers, reconciliation.
- Production: manufacturing orders and production requests.
- Finished Goods: balances and batches by SKU, allocations, holds.
- Operations: the one-glance health summary, settings, country profiles and
  the analytics marts.

### 2. A customer buys a T-shirt

1. Open http://localhost:8000/en/vn/products/basic-tee-black.
2. Pick size M or L (S has no stock) and add it to the cart.
3. Check out with a Vietnam address, the flat J&T shipping option and the
   default payment.
4. Note the order number.

Not verified: the click-through in a browser. The same steps through the
store API are covered by the automated journeys.

### 3. The warehouse ships it

1. In the Medusa admin open Orders, then the new order.
2. Create a fulfillment from the "HCM Warehouse" location.
3. Open Fulfillment, then Shipments. A J&T waybill (`JT0000…`) appears within
   seconds, created automatically. No duplicate is ever created.
4. Open Finished Goods, then Balances: the shipped pieces left the ledger.

### 4. The courier moves the parcel

You play J&T. Use the waybill from the previous step.

```bash
bash docker/e2e/run.sh demo parcels
bash docker/e2e/run.sh demo scan JT00000010 "Pickup scan"
bash docker/e2e/run.sh demo scan JT00000010 "Out for delivery"
bash docker/e2e/run.sh demo scan JT00000010 "Delivered - signed"
```

Each scan reaches the platform as a signed webhook, is stored durably, and is
processed by a worker. Refresh Fulfillment, then Shipments to see the status
move. A late, repeated scan never moves a parcel backwards.

Show a customer's view (the storefront has no tracking screen yet, so this is
an API call):

```bash
bash docker/e2e/run.sh demo my-orders <customer_email> 'Passw0rd!local'
```

### 5. A delivery problem

```bash
bash docker/e2e/run.sh demo scan <waybill> "Delivery failed - recipient absent"
```

Open Fulfillment, then Delivery exceptions. Support sees the case and can
resolve it or replace the parcel. A later good scan resolves it by itself.

### 6. The customer asks on Messenger

You play the customer. Link the account, then ask about the order.

```bash
# the customer's one-time code (the storefront has no screen for it yet)
bash docker/e2e/run.sh demo link-code <customer_email> 'Passw0rd!local'
bash docker/e2e/run.sh demo messenger "link <CODE>" demo-lan
bash docker/e2e/run.sh demo messenger "where is my order?" demo-lan
bash docker/e2e/run.sh demo messenger "talk to a human" demo-lan
```

The last message hands the chat to a person. Open Social Support, then
Conversations, to read it and answer. Anonymous visitors see nothing private;
the bot refuses until the account is linked.

### 7. A made-to-order blazer

1. In the storefront buy the made-to-order blazer
   (http://localhost:8000/en/vn/products/made-to-order-blazer-navy). The order
   is accepted although there is no stock.
2. Open Production, then Production requests: a request waits for payment.
3. As `finance@fashion.local`, capture the payment on the order.
4. The request becomes a manufacturing order, and fabric is reserved from the
   rolls. Follow it through Shop Floor and Quality; the pieces are packed into
   finished goods and shipped like the T-shirt.

Shop-floor steps (cutting, sewing, inspection, packing) need data for bundles
and rolls. The exact API sequence is in
`apps/medusa/integration-tests/e2e/made-to-order.mjs`; the Shop Floor screens
use the same calls. Not verified: driving the whole shop floor through the UI
by hand.

### 8. Returns and exchange

Open Returns. A customer return is authorized, the carrier collects it, the
warehouse receives it, QC decides where the piece goes (back to stock or
scrap), and the refund is capped and happens once. An exchange sends the
replacement only after the old piece is back. The full path is exercised in
`apps/medusa/integration-tests/e2e/returns.mjs`.

### 9. Signals for operators

```bash
# business and technical metrics (bearer token for the local stack)
curl -s -H "Authorization: Bearer e2e-metrics-token" localhost:9100/internal/metrics | grep fashion_

# the domain event feed, as a downstream system sees it
docker compose -f docker/docker-compose.e2e.yml exec redpanda \
  rpk topic consume e2e.fashion.fulfillment.events.v1 -n 3 -o start
```

In the admin, Operations, Analytics lists the fourteen analytics views (sales
sell-through, carrier performance, production output, material consumption, SKU
margin inputs, and more).

### 10. Failure drills

```bash
bash docker/e2e/run.sh chaos
```

It stops workers, makes the carrier time out or fail, floods the webhook,
kills a worker with `kill -9`, restarts the server and stops Kafka. After each
one it checks that no order was lost, duplicated or shipped twice.

To do one by hand while you watch the admin:

```bash
docker compose -f docker/docker-compose.e2e.yml stop medusa-worker   # orders still work, jobs wait
docker compose -f docker/docker-compose.e2e.yml start medusa-worker  # the backlog drains
```

## Playing the outside world

`bash docker/e2e/run.sh demo <command>`:

| Command                        | What it does                                          |
| ------------------------------ | ----------------------------------------------------- |
| `parcels`                      | Parcels the mock J&T has received, with the last scan |
| `scan <waybill> "<text>"`      | A courier scan, pushed to the platform webhook        |
| `messenger "<text>" [psid]`    | A customer message on Messenger, then the replies     |
| `messages [psid]`              | Everything the platform sent to that chat             |
| `link-code <email> <password>` | The customer's one-time code to link Messenger        |
| `my-orders <email> <password>` | The customer's orders with live parcel status         |
| `storefront-env`               | Rewrite `apps/store/.env` for this stack              |

Scan texts the platform understands: "Pickup scan", "Departure scan", "Out for
delivery", "Delivered - signed", "Delivery failed - recipient absent",
"Returned to sender - signed". Matching is by keyword, case-insensitive.

## Day-to-day

```bash
bash docker/e2e/run.sh logs     # follow server and worker logs
docker compose -f docker/docker-compose.e2e.yml stop    # pause, keep data
docker compose -f docker/docker-compose.e2e.yml start   # resume
bash docker/e2e/run.sh down     # stop and delete ALL data (volumes)
```

After `down` and a fresh `up` the publishable key changes. Run
`bash docker/e2e/run.sh storefront` again so the storefront uses the new key,
then restart `next dev`.

## Troubleshooting

- The storefront shows no products or "Out of stock": the publishable key in
  `apps/store/.env` is stale. Run `bash docker/e2e/run.sh storefront` and
  restart `next dev`.
- `payload migrate` or the storefront writes to the wrong database: a
  `DATABASE_URL` exported in your shell wins over `.env`. Use `env -u
DATABASE_URL` as shown above.
- Payload asks whether to proceed because it ran in dev mode: answer yes on a
  demo database (the script does).
- `up` stays at "waiting for the API": see the last lines it prints, or run
  `bash docker/e2e/run.sh logs`. Usual causes are a port already in use or too
  little Docker memory.
- `pnpm` fails with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`: a corepack and
  Node version mismatch. Run the binaries directly, as the commands above do
  (`./node_modules/.bin/next`).
- Orders place but no J&T parcel appears: check that a worker is running
  (`docker compose -f docker/docker-compose.e2e.yml ps`) and that the order has
  a fulfillment created from "HCM Warehouse".
- Kafka shows nothing: the topics are created by the `redpanda-init` service;
  if you started the broker alone, run `docker compose -f
docker/docker-compose.e2e.yml up redpanda-init`.

## What this demo does not prove

- The real J&T and Meta formats. The mocks follow our adapters, not the
  vendors' documentation; set `JT_STATUS_MAP_JSON` and verify against the
  vendor's sandbox before going live.
- A real language model. The mock chooses read-only actions only.
- A real Kafka cluster over the native protocol. The relay talks to Redpanda
  through its HTTP proxy.
- Customer screens in the storefront for account linking, parcel tracking,
  production status and return requests. Those exist as store APIs only; the
  demo drives them with `demo link-code` and `demo my-orders`.
- Browser behaviour of the back-office screens and the storefront checkout. The
  APIs behind them are tested; the UIs were not clicked through here except for
  loading the admin and storefront pages.

For production, use `infra/k8s` and `docs/operations.md`, not this stack.
