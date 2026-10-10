# Fashion ERP + Commerce + Social Commerce + Fulfillment Platform

## Technical Design Document v1.0

**Status:** Proposed / Baseline architecture  
**Requirement source:** Fashion Platform Requirement Document v1.0  
**Architecture style:** Modular monolith first, explicit bounded contexts, event-driven integration  
**Core stack:** Next.js + Payload CMS + Medusa 2 + PostgreSQL + Redis + Kafka + OpenTelemetry  
**Workflow:** Local domain workflow; Temporal optional for long-running MTO/return/exception orchestration  
**Deployment:** Kubernetes  
**External integrations:** Meta/Facebook Messenger, J&T first

---

# 1. Executive Summary

Platform hợp nhất ERP sản xuất thời trang, commerce, social commerce và fulfillment nhưng giữ rõ domain ownership.

Core architecture:

```text
                         CUSTOMER
                    +-------+--------+
                    |                |
                    v                v
             Next.js Store      Social Channels
                    |             Meta/Facebook
                    +-------+--------+
                            |
                        API Gateway
                            |
        +-------------------+-------------------+
        |                   |                   |
        v                   v                   v
   Medusa Commerce      Channel Layer      Backoffice
        |                   |                   |
        +-----------+-------+-------------------+
                    |
             Inventory Projection
                    |
            Finished Goods Domain
                    |
             Manufacturing / MRP
                    |
              Material Inventory
                    |
                Procurement

Commerce ready order
        ↓
Fulfillment Layer
        ↓
Carrier Interface
        ↓
       J&T
        ↓
Tracking / Events
        ↓
Notification Policy
        ↓
Meta / Other Channels
```

Cross-cutting:

```text
PostgreSQL
Redis
Kafka
Transactional Outbox/Inbox
OpenTelemetry
Prometheus/Grafana/Loki
ClickHouse/BI
```

---

# 2. Architectural Decisions

## ADR-001 — Medusa owns commerce

Product sellability, cart, order, payment and commerce reservation remain in Medusa.

## ADR-002 — Manufacturing inventory is separate

Raw material, WIP and factory physical stock do not live in Medusa.

## ADR-003 — Finished goods bridge

Finished Goods is the boundary between physical production stock and commerce inventory.

## ADR-004 — Ledger-based material stock

Stock movements are immutable; current balance is a projection.

## ADR-005 — Provider abstractions

Meta/J&T details stay in adapters and never leak through core domain models.

## ADR-006 — Outbox/inbox

Domain write and event intent commit atomically; consumers deduplicate.

## ADR-007 — Modular monolith first

Start with deployable modules sharing infrastructure where useful, extract services only under scale/team/security pressure.

## ADR-008 — Agent uses typed tools

No direct DB or provider-secret access.

---

# 3. System Context

```text
External:
- Customers
- Suppliers
- Meta Platform
- J&T
- Payment provider(s)

Internal:
- Storefront
- Backoffice
- Medusa
- Procurement
- Material Inventory
- Manufacturing/MRP
- Quality
- Finished Goods
- Social Commerce
- Fulfillment
- Notification
- Data Platform
```

---

# 4. Bounded Contexts & Data Ownership

| Context            | Owns                                                        |
| ------------------ | ----------------------------------------------------------- |
| Procurement        | supplier, PO, goods receipt                                 |
| Material Inventory | material, lot, dye lot, roll, ledger, balance, reservation  |
| Manufacturing/MRP  | BOM, routing, MO, MRP, cut plan, WIP, operation execution   |
| Quality            | inspection, defect, QC release, rework decision             |
| Finished Goods     | FG batch, physical FG stock, allocation                     |
| Commerce           | product, price, cart, order, payment, commerce reservation  |
| Social Commerce    | channel identity, inbound/outbound conversation integration |
| Fulfillment        | carrier shipment, tracking normalization                    |
| Returns            | authorization, return inspection, disposition               |
| Content            | landing page, SEO, campaign, editorial content              |
| Integration        | inbox, outbox, idempotency                                  |
| Analytics          | read models only                                            |

---

# 5. Deployment Architecture

Recommended initial Kubernetes topology:

```text
Ingress / API Gateway
  ├── storefront
  ├── commerce-api
  ├── backoffice-api
  └── webhook-api

Workers
  ├── material-inventory-worker
  ├── manufacturing-worker
  ├── inventory-projection-worker
  ├── outbox-publisher
  ├── carrier-worker
  ├── notification-worker
  └── reconciliation-worker

Infrastructure
  ├── PostgreSQL
  ├── Redis
  ├── Kafka
  ├── Object Storage
  ├── OTel Collector
  └── ClickHouse / analytics
```

Scale webhook ingestion independently from business workers.

---

# 6. Repository Structure

```text
fashion-platform/
├── apps/
│   ├── storefront/
│   ├── medusa/
│   ├── backoffice/
│   ├── webhook-gateway/
│   └── workers/
│
├── domains/
│   ├── procurement/
│   ├── material-inventory/
│   ├── manufacturing/
│   ├── quality/
│   ├── finished-goods/
│   ├── social-commerce/
│   ├── fulfillment/
│   └── returns/
│
├── integrations/
│   ├── meta/
│   ├── jt/
│   └── payments/
│
├── packages/
│   ├── contracts/
│   ├── event-schemas/
│   ├── authz/
│   ├── idempotency/
│   ├── observability/
│   └── design-system/
│
├── workflows/
└── infra/
```

---

# 7. Core Data Architecture

Use PostgreSQL transactional schemas separated by context.

Representative schemas:

```text
core
procurement
inventory
manufacturing
quality
finished_goods
commerce_integration
social
fulfillment
returns
integration
```

Stable business identifiers:

```text
SKU
PO number
MO number
Batch number
Tracking number
```

Internal primary IDs:

```text
UUID
```

---

# 8. Material Inventory Design

Material hierarchy:

```text
Material
  ↓
Lot
  ↓
Dye Lot
  ↓
Roll
  ↓
Warehouse Location
```

Balance key:

```text
material_id
lot_id?
roll_id?
location_id
```

Balance:

```text
on_hand_qty
reserved_qty
qc_hold_qty
damaged_qty
version
```

Available:

```text
on_hand - reserved - qc_hold - damaged
```

---

# 9. Material Stock Ledger

Every physical mutation creates:

```text
material_stock_movement
```

Movement types include:

```text
RECEIPT
ISSUE_TO_PRODUCTION
RETURN_FROM_PRODUCTION
TRANSFER_OUT
TRANSFER_IN
SCRAP
ADJUSTMENT_PLUS
ADJUSTMENT_MINUS
```

Reservation modifies reservation state/balance but is distinct from physical movement.

Transaction pattern:

```text
BEGIN
  idempotency guard
  lock balance
  validate
  append movement / reservation
  update balance
  insert outbox
COMMIT
```

---

# 10. Concurrency Strategy

Default:

```text
READ COMMITTED
+ SELECT ... FOR UPDATE
+ deterministic lock order
+ unique constraints
+ idempotency
```

For reservation:

```text
query candidate rows
  ↓
rank
  ↓
lock selected rows
  ↓
re-check available
  ↓
update reserved_qty
```

Invariant:

```text
reserved + qc_hold + damaged <= on_hand
```

---

# 11. Fabric Allocation Policy

Default fashion strategy:

```text
SAME_DYE_LOT_FIFO
  ↓
prefer opened/partial rolls
  ↓
minimize unusable remainder
```

If one dye lot cannot satisfy requirement:

```text
minimize number of dye lots
```

and require planner approval when policy threshold is violated.

---

# 12. BOM / Routing

BOM:

```text
versioned
released
immutable after release
```

MO references exact BOM/routing version.

BOM explosion:

```text
required =
planned_output
× qty_per_unit
× (1 + waste_factor)
```

Routing defines operation sequence, work-center type, standard time and QC gates.

---

# 13. MRP Design

Inputs:

```text
planned/open MOs
MTO orders
BOM
inventory availability
reservations
confirmed incoming PO
safety stock
lead time
calendar
```

Gross-to-net:

```text
Gross Requirement
- Available
- Confirmed Incoming
+ Safety Buffer
= Net Requirement
```

Output suggestions:

```text
PURCHASE
TRANSFER
PRODUCE
RESCHEDULE
```

MRP run is versioned and auditable.

---

# 14. Manufacturing Order State Machine

```text
DRAFT
  ↓
PLANNED
  ↓
MATERIAL_CHECK
  ↓
MATERIAL_RESERVED
  ↓
RELEASED
  ↓
IN_PROGRESS
  ↓
QC_PENDING
  ↓
PACKING
  ↓
COMPLETED
```

Exceptions:

```text
ON_HOLD
CANCELLED
PARTIALLY_COMPLETED
FAILED
```

Only domain commands transition state.

---

# 15. Material Reservation Saga

```text
MO PLANNED
  ↓
Material requirements
  ↓
Material Inventory reserveMaterial()
  ↓
reservation refs persisted
  ↓
MO MATERIAL_RESERVED
```

If local persistence fails after successful remote/module reservation:

```text
retry same idempotency key
or compensate releaseReservation()
```

---

# 16. Cutting Architecture

```text
Released MO
  ↓
Cut Plan
  ↓
Roll Allocation
  ↓
issueMaterial()
  ↓
Lay / Marker / Size ratio
  ↓
Cut Batch
  ↓
Bundle
```

Cut reconciliation:

```text
issued
≈ consumed + returned + scrap
```

Unexplained variance creates manufacturing exception.

---

# 17. WIP / Operation Execution

Recommended v1 traceability level:

```text
bundle-level WIP
```

Each execution records:

```text
input_qty
good_qty
rework_qty
reject_qty
remaining_wip
```

Invariant:

```text
good + rework + reject <= input
```

---

# 18. Quality Integration

QC is separate domain.

Manufacturing consumes:

```text
quality.inspection_completed
```

Decision:

```text
PASS
REWORK
REJECT
HOLD
```

Only PASS quantity can progress to packing/FG.

---

# 19. Finished Goods Domain

FG receipt is triggered by:

```text
QC RELEASED
+ PACK COMPLETE
```

FG batch stores:

```text
sku
mo_id
production_batch_id
qty
warehouse/location
production date
traceability refs
```

Physical FG stock remains independent from commerce reservation.

---

# 20. Commerce Inventory Projection

Commerce available quantity:

```text
FG physical on hand
- warehouse hold
- QC hold
- safety stock
- non-commerce allocation
= sellable projection
```

Projection event:

```json
{
  "sku": "TSHIRT-BLK-M",
  "location_id": "WH-HCM-01",
  "available_qty": 194,
  "source_version": 9182
}
```

Consumer rule:

```text
if incoming source_version <= last_applied_version
    ignore
else
    apply
```

Prevents stale Kafka retry from overwriting newer stock.

---

# 21. Medusa Integration

Medusa owns:

```text
catalog
price
promotion
sales channel
customer
cart
order
payment
commerce reservation
return/refund commerce state
fulfillment orchestration
```

Manufacturing tables are not embedded into Medusa Product entities.

SKU is the stable integration key.

---

# 22. Make-to-Stock Flow

```text
Planner
 ↓
MO
 ↓
Material Reserve
 ↓
Production
 ↓
QC
 ↓
FG
 ↓
Inventory Projection
 ↓
Medusa
 ↓
Order
 ↓
Fulfillment
```

---

# 23. Made-to-Order Flow

```text
Order Paid
 ↓
Production Request
 ↓
Material Check/Reserve
 ↓
MO
 ↓
Production milestones
 ↓
QC
 ↓
FG
 ↓
direct allocation to order
 ↓
Ready to Ship
```

Temporal may orchestrate the long-running wait states.

Temporal does not own material/order truth.

---

# 24. Customer-Facing Production Projection

Factory state maps to simplified customer state:

```text
PLANNED/MATERIAL_RESERVED
 → PREPARING_PRODUCTION

CUTTING/SEWING/FINISHING
 → IN_PRODUCTION

QC_PENDING
 → QUALITY_CHECK

PACKING
 → PREPARING_SHIPMENT

FG ALLOCATED
 → READY_TO_SHIP
```

Social/storefront never need internal operation details.

---

# 25. Social Commerce Architecture

```text
Facebook Messenger
      ↓
Meta Webhook
      ↓
Webhook verification
      ↓
Integration Inbox
      ↓
Channel Worker
      ↓
Customer Identity
      ↓
Commerce/Shipment/Production Read APIs
      ↓
Notification/Reply Policy
      ↓
Meta Send API
```

Meta remains a channel.

---

# 26. Social Identity

Entity:

```text
customer_channel_identity
```

Key:

```text
channel
account_id
external_user_id
```

For Facebook Messenger:

```text
external_user_id = PSID
account_id       = Page ID
```

Do not treat PSID as global customer ID.

---

# 27. AI / Agent Boundary

Agent flow:

```text
Customer
 ↓
Agent
 ↓
Tool Gateway
 ↓
Policy / Confirmation
 ↓
Typed Domain API
```

Tools:

```text
product.search
cart.create
order.get
production.status
shipment.get
return.request
```

Forbidden:

```text
direct DB
raw carrier API
provider secret
unrestricted stock adjustment
```

---

# 28. Fulfillment Architecture

Common interface:

```ts
interface CarrierProvider {
  createShipment(...)
  cancelShipment(...)
  getTracking(...)
  verifyWebhook?(...)
  parseWebhook?(...)
}
```

First provider:

```text
JTCarrierProvider
```

Future:

```text
GHN
GHTK
Ninja Van
Viettel Post
Lalamove
```

---

# 29. Shipment Creation

```text
Medusa fulfillment ready
  ↓
CreateCarrierShipmentWorkflow
  ↓
idempotency check
  ↓
J&T adapter
  ↓
carrier response
  ↓
carrier_shipment
  ↓
outbox event
```

Hard invariant:

```text
UNIQUE(carrier_code, medusa_fulfillment_id)
```

---

# 30. Shipment Unknown State

Network timeout after create request is ambiguous.

Use:

```text
PENDING
SUCCEEDED
FAILED_RETRYABLE
FAILED_FINAL
UNKNOWN
```

For UNKNOWN:

```text
reconcile by merchant/order reference
```

before retrying create.

---

# 31. Tracking Ingestion

Preferred:

```text
J&T push/webhook
  ↓
verify
  ↓
inbox/dedup
  ↓
canonical mapper
  ↓
shipment state
  ↓
outbox
```

Fallback reconciliation polls active shipments.

Do not scrape public carrier tracking pages.

---

# 32. Canonical Shipment States

```text
CREATED
PICKUP_PENDING
PICKED_UP
IN_TRANSIT
ARRIVED_HUB
OUT_FOR_DELIVERY
DELIVERED
DELIVERY_FAILED
RETURNING
RETURNED
CANCELLED
EXCEPTION
```

Transition guard prevents invalid state regression from late callbacks.

---

# 33. Notification Architecture

```text
Domain Event
  ↓
Notification Policy
  ↓
Template Resolver
  ↓
Channel Router
  ├── Facebook
  ├── WhatsApp later
  ├── Push
  └── Email
```

Policy checks:

```text
consent
channel rule/window
dedup
preference
event priority
rate limit
```

---

# 34. Returns Architecture

```text
Return Request
  ↓
Eligibility / Authorization
  ↓
Return Shipment
  ↓
Warehouse Receive
  ↓
Return QC
  ├── A-grade → sellable FG
  ├── B-grade → secondary stock
  ├── Rework
  ├── Damaged
  └── Scrap
```

Exchange reserves replacement SKU and creates new fulfillment.

---

# 35. Integration Inbox

All external webhooks/events enter durable inbox before business processing.

```text
RECEIVED
PROCESSING
PROCESSED
RETRY
DLQ
```

Unique:

```text
(provider, external_event_id)
```

or deterministic hash when provider lacks event ID.

---

# 36. Transactional Outbox

Pattern:

```text
DB transaction
  ├── domain state
  └── outbox row
COMMIT

publisher
  ↓
Kafka
```

Publisher uses batching and `FOR UPDATE SKIP LOCKED`.

---

# 37. Event Envelope

```json
{
  "event_id": "evt_...",
  "event_type": "domain.event.v1",
  "event_version": 1,
  "aggregate_type": "...",
  "aggregate_id": "...",
  "occurred_at": "...",
  "correlation_id": "...",
  "causation_id": "...",
  "producer": "...",
  "data": {}
}
```

Consumers deduplicate by `event_id`.

---

# 38. Kafka Topic Strategy

```text
fashion.procurement.events.v1
fashion.inventory.events.v1
fashion.manufacturing.events.v1
fashion.quality.events.v1
fashion.finished-goods.events.v1
fashion.commerce.events.v1
fashion.fulfillment.events.v1
fashion.notification.events.v1
```

Partition key:

```text
domain aggregate ID
```

Examples:

```text
MO events        -> mo_id
Shipment events  -> shipment_id
```

---

# 39. API Design

Surface separation:

```text
/store/*
/admin/*
/internal/*
/webhooks/*
```

Examples:

```http
POST /admin/material-inventory/reservations
POST /admin/material-inventory/issues

POST /admin/manufacturing/mos
POST /admin/manufacturing/mos/{id}/release
POST /admin/manufacturing/operations/{id}/complete

GET /store/orders/{id}/production-status

POST /webhooks/meta
POST /webhooks/jt/tracking
```

State-changing APIs require idempotency key where duplicate side effect is possible.

---

# 40. Error Model

Common structure:

```json
{
  "code": "INSUFFICIENT_STOCK",
  "message": "Insufficient available stock.",
  "details": {},
  "correlation_id": "..."
}
```

Domains define stable error codes.

---

# 41. Authorization

Recommended roles:

```text
ERP_ADMIN
PROCUREMENT
WAREHOUSE_OPERATOR
WAREHOUSE_MANAGER
PRODUCTION_PLANNER
CUTTING_OPERATOR
SEWING_OPERATOR
SEWING_SUPERVISOR
QC
PACKING_OPERATOR
COMMERCE_ADMIN
CUSTOMER_SUPPORT
FINANCE
SRE
AUDITOR
```

High-risk actions require elevated role + reason.

---

# 42. Secret Management

Secrets include:

```text
META_APP_SECRET
META_PAGE_ACCESS_TOKEN
J&T credentials/signing key
payment credentials
database credentials
Kafka credentials
```

Requirements:

```text
secret manager
no Git
no browser
no raw logs
rotation procedure
environment separation
```

---

# 43. PII & Data Protection

PII:

```text
name
phone
delivery address
conversation content
order data
tracking data
```

Controls:

```text
RBAC
masking in logs
no PII in metric labels
retention policy
encrypted backups/storage
least-privilege access
```

---

# 44. Webhook Security

```text
Internet
  ↓
WAF / Gateway
  ↓
TLS
  ↓
provider verification/signature
  ↓
payload limit
  ↓
schema validation
  ↓
inbox
```

Webhook handlers ACK quickly and process asynchronously.

---

# 45. Reliability & Retry

Retry with exponential backoff + jitter.

Do not blindly retry ambiguous side-effect operations.

External create operations use:

```text
UNKNOWN
→ reconcile
→ retry only if confirmed absent
```

---

# 46. Circuit Breakers

Provider outage must not take down core platform.

J&T:

```text
order still works
production still works
shipment waits/retries
```

Meta:

```text
order/shipment correct
notification queues/retries
```

---

# 47. Reconciliation Architecture

Required jobs:

```text
material ledger vs balance
balance reserved vs reservation records
roll current qty vs balance
MO requirement vs inventory reservation/issue
cut issue vs consumption/return/scrap
QC release vs packing/FG
FG physical vs sellable projection
Medusa inventory vs projection
J&T active shipment vs local state
outbox/inbox stuck rows
```

Incremental frequent + full nightly.

---

# 48. Observability

OpenTelemetry traces:

```text
order
production
inventory
shipment
social webhook
notification
return
```

Key attributes:

```text
order.id
sku
mo.id
production.batch.id
shipment.id
carrier
warehouse.id
event.id
workflow.id
```

Never trace raw access tokens.

---

# 49. Metrics

Material:

```text
on_hand
reserved
scrap rate
variance
reservation failure
```

Manufacturing:

```text
MO cycle time
on-time completion
first pass yield
rework
reject
fabric variance
line efficiency
WIP aging
```

Commerce:

```text
conversion
oversell count
inventory sync lag
```

Fulfillment:

```text
create success
delivery lead time
delivery failure
RTS rate
tracking staleness
```

Integration:

```text
outbox lag
consumer lag
webhook invalid
DLQ size
provider error rate
```

---

# 50. Initial SLOs

| SLO                      |   Target |
| ------------------------ | -------: |
| Commerce API             |   99.95% |
| Webhook API              |   99.95% |
| Webhook ACK p95          | < 500 ms |
| Availability query p95   | < 200 ms |
| MO query p95             | < 300 ms |
| Reserve material p95     |    < 1 s |
| Operation complete p95   | < 500 ms |
| Inventory projection p95 |    < 5 s |
| Outbox publish p95       |    < 5 s |
| Duplicate shipment       |        0 |
| Race-condition oversell  |        0 |

---

# 51. Data & Analytics

Transactional flow:

```text
PostgreSQL
  ↓ events / CDC
Kafka
  ↓
ClickHouse
  ↓
dbt
  ↓
Data Quality
  ↓
BI
```

Analytics is read-only relative to transactional domain.

---

# 52. Temporal Usage

Use Temporal only for long-running processes:

```text
MTO lifecycle
return/exchange lifecycle
supplier/production wait
carrier exception recovery
SLA escalation
```

Do not use Temporal for simple CRUD/stock mutation.

---

# 53. Redis Usage

Redis may support:

```text
cache
short-lived locks where appropriate
rate limiting
dedup acceleration
session
```

Redis is not the inventory/order source of truth.

---

# 54. Backoffice Architecture

Navigation:

```text
Dashboard
Procurement
Materials
Fabric Lots & Rolls
BOM
MRP
Production Planning
Manufacturing Orders
Shop Floor
Quality
Finished Goods
Commerce
Orders
Fulfillment
Returns
Social Inbox
Analytics
Administration
```

Shop-floor UI must be role-specific and scan-first.

---

# 55. CI/CD Gates

Each deployment:

```text
lint
typecheck
unit tests
contract tests
integration tests
migration validation
SAST
dependency scan
secret scan
container scan
event schema compatibility
```

Inventory/manufacturing changes also run invariant/concurrency tests.

---

# 56. Testing Strategy

Unit:

```text
BOM explosion
allocation policy
state machine
status mapper
notification policy
```

Property/invariant:

```text
stock conservation
no negative availability
no duplicate shipment
output/input conservation
stale event ignored
```

Integration:

```text
Postgres + outbox
Kafka consumers
Medusa sync
Meta webhook
J&T sandbox
```

E2E:

```text
MTS
MTO
Return/Exchange
Social inquiry
Carrier exception
```

---

# 57. Migration Strategy

For legacy stock:

```text
freeze writes
export
normalize IDs/UOM
opening balance movement
balance creation
active reservation migration
shadow compare
cutover
```

Never import balance without corresponding history/opening ledger entry.

---

# 58. Feature Flags

```text
MANUFACTURING_ENABLED
MTO_ENABLED
FG_SYNC_TO_MEDUSA_ENABLED

META_MESSENGER_ENABLED
META_SHIPMENT_NOTIFICATION_ENABLED

JT_FULFILLMENT_ENABLED
JT_AUTO_CREATE_SHIPMENT
JT_TRACKING_CALLBACK_ENABLED
JT_RECONCILIATION_ENABLED

AGENT_READ_TOOLS_ENABLED
AGENT_STATE_CHANGE_ENABLED
```

---

# 59. Rollout Plan

## Phase 0

Infrastructure, identity, RBAC, outbox/inbox, events, observability.

## Phase 1

Procurement + raw material inventory.

## Phase 2

BOM/MRP/MO/Cutting/Sewing/QC/Packing.

## Phase 3

Finished Goods + versioned Medusa inventory projection.

## Phase 4

Commerce hardening and MTS.

## Phase 5

J&T create/cancel/tracking/reconciliation.

## Phase 6

Meta inbound/order/shipment query + notification.

## Phase 7

MTO workflow and customer production status.

## Phase 8

Returns/exchange/costing/optimization.

---

# 60. Failure Scenarios

## J&T timeout on shipment create

```text
status UNKNOWN
→ reconcile by merchant reference
→ attach existing shipment or safe retry
```

## Kafka unavailable

```text
domain commit succeeds
outbox backlog remains
publisher catches up
```

## Duplicate Meta webhook

Inbox dedup returns success without duplicate processing.

## Stale FG inventory event

Version guard ignores stale event.

## Concurrent stock reservation

Row locks + invariant check prevent oversubscription.

## MO cancel after partial issue

Run reconciliation/return/scrap workflow; do not status-flip only.

---

# 61. Security Threat Highlights

Key threats:

```text
duplicate side effects
webhook spoofing
provider token leakage
NoSQL/SQL injection
horizontal privilege escalation
PII leakage in telemetry
agent tool abuse
stale event rollback
inventory race
fraudulent manual adjustment
```

Controls:

```text
typed schemas
prepared queries
RBAC
policy layer
idempotency
signature verification
version guards
audit
secret manager
OTel redaction
```

---

# 62. Requirement-to-Design Traceability

| Requirement | Design                   |
| ----------- | ------------------------ |
| FR-INV-*    | Sections 8–11, 47        |
| FR-MRP-*    | Sections 12–15           |
| FR-MFG-*    | Sections 14–18, 22–24    |
| FR-FG-*     | Sections 19–20           |
| FR-COM-*    | Sections 20–23           |
| FR-SOC-*    | Sections 25–27, 33       |
| FR-FUL-*    | Sections 28–32           |
| FR-RET-*    | Section 34               |
| NFR-CON-*   | Sections 9–10, 35–38, 47 |
| NFR-SEC-*   | Sections 41–44, 61       |
| NFR-OBS-*   | Sections 48–50           |
| NFR-AVL-*   | Sections 45–47, 60       |

---

# 63. Technical Definition of Done

Platform implementation is technically complete when:

1. Domain boundaries are enforced in code/repository structure.
2. Raw material and WIP never leak into Medusa inventory.
3. Material ledger/balance/reservations reconcile.
4. Manufacturing consumes inventory through commands only.
5. BOM/routing versions are immutable after release.
6. FG is traceable back to MO/material lot.
7. FG → Medusa projection is versioned and stale-safe.
8. Commerce inventory reservation is correct under concurrency.
9. J&T shipment creation is idempotent.
10. Tracking ingestion is idempotent and transition-guarded.
11. Meta webhooks are verified, durable and deduplicated.
12. Returns require QC before restock.
13. Outbox/inbox reconciliation exists.
14. OTel traces and actionable metrics exist.
15. SAST/dependency/secret/container checks pass.
16. MTS/MTO/return/shipment E2E tests pass.
17. Runbooks exist for provider outage, stock mismatch and reconciliation failure.

---

# 64. Next-Level Detailed Specifications

This TDD becomes the parent design for implementation specifications:

```text
01 Domain Data Model & ERD
02 Material Inventory Detailed Design
03 Manufacturing / MRP Detailed Design
04 Finished Goods & Medusa Inventory Projection
05 Commerce / Order / MTO Integration
06 J&T Carrier Provider Integration
07 Meta Social Commerce Integration
08 Returns / Exchange
09 Event Catalog & Schemas
10 Security Threat Model
11 Observability / SLO Runbook
12 Kubernetes / Helm Deployment
13 QA / E2E Plan
```

These specifications must comply with the ownership and consistency rules in this TDD.
