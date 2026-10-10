# Fashion ERP + Commerce + Social Commerce + Fulfillment Platform

## Product & System Requirement Document v1.0

**Status:** Proposed / Baseline for implementation  
**Platform:** Fashion ERP + Manufacturing + Commerce + Social Commerce + Fulfillment  
**Commerce base:** Paydusa / Medusa 2 / Next.js / Payload CMS  
**Integrations:** Meta/Facebook Messenger, J&T first; extensible to other channels/carriers  
**Primary audience:** Product, Business, Engineering, QA, Operations, Warehouse, Production, CS, SRE

---

# 1. Purpose

Tài liệu này là nguồn requirement cấp platform cho hệ thống thời trang hợp nhất từ nguyên liệu tới khách hàng.

Platform phải hỗ trợ toàn bộ vòng đời:

```text
Supplier
  ↓
Procurement
  ↓
Raw Material / Fabric Inventory
  ↓
BOM / MRP / Production Planning
  ↓
Cutting / Sewing / WIP / QC / Packing
  ↓
Finished Goods
  ↓
Commerce / Social Commerce
  ↓
Order / Payment
  ↓
Warehouse Fulfillment
  ↓
J&T / Carrier
  ↓
Tracking / Notification
  ↓
Return / Exchange / Refund
```

Hệ thống phải hỗ trợ cả:

```text
MAKE-TO-STOCK (MTS)
MAKE-TO-ORDER (MTO)
```

---

# 2. Business Objectives

## BO-01 — One operational platform

Giảm việc vận hành bằng nhiều file/ứng dụng rời rạc. Dữ liệu material, production, finished goods, order và shipment phải liên kết được end-to-end.

## BO-02 — Inventory correctness

Không oversell, không âm tồn kho do race condition, không mất dấu material movement.

## BO-03 — Production traceability

Trace được:

```text
Order
→ Finished Goods Batch
→ Manufacturing Order
→ Production Batch
→ Material Issue
→ Fabric Roll
→ Fabric/Dye Lot
→ Goods Receipt
→ Supplier PO
```

## BO-04 — Omnichannel commerce

Khách có thể tìm sản phẩm, hỏi đơn hàng/tracking và nhận thông báo qua web và social channels mà không làm Meta trở thành order system.

## BO-05 — Carrier independence

J&T là carrier đầu tiên nhưng platform không được hard-code J&T vào order core.

## BO-06 — Production visibility

Planner, production, QC, warehouse, CS và customer có trạng thái phù hợp với vai trò của họ.

---

# 3. Platform Scope

In scope:

```text
Supplier / PO / Receiving
Material Master
Fabric Lot / Dye Lot / Roll
Raw Material Stock Ledger
Material Reservation
BOM / Routing
MRP
Manufacturing Order
Cut Planning
Bundle / WIP
Sewing / Work Center
QC / Rework / Reject
Packing
Finished Goods
Medusa Inventory Projection
Product / Price / Cart / Order / Payment
Social Commerce / Meta Messenger
J&T Shipment / Tracking
Returns / Exchange
Notification
Audit / Security / Observability
Data / Analytics projection
```

---

# 4. Out of Scope for v1

The first production version does not require:

```text
Full accounting / GL
Payroll
Advanced APS optimization
AI demand forecast
Supplier self-service portal
Native checkout inside every social channel
Individual serialization for every low-value garment
Automatic supplier PO without approval
Complex factory digital twin
Carrier route optimization
```

These can be added after v1.

---

# 5. User Roles

| Role                         | Primary Responsibilities                                        |
| ---------------------------- | --------------------------------------------------------------- |
| ERP Admin                    | master data and configuration                                   |
| Procurement                  | supplier, PO, receiving coordination                            |
| Warehouse Operator           | receive, putaway, scan, issue, return, transfer                 |
| Warehouse Manager            | stock adjustment, cycle count approval, exception handling      |
| Production Planner           | MRP, MO, material readiness, scheduling                         |
| Cutting Operator             | roll issue, lay/cut execution, bundle creation                  |
| Sewing Operator / Supervisor | WIP execution and quantity reporting                            |
| QC                           | inspection, defect, release, rework/reject                      |
| Packing Operator             | packing and FG handoff                                          |
| Commerce Admin               | products, pricing, promotions, sales channels                   |
| Customer Support             | order, production and shipment support                          |
| Finance / Authorized CS      | refund/payment-sensitive actions                                |
| SRE / Platform               | availability, integration, telemetry                            |
| Auditor                      | audit and traceability                                          |
| Customer                     | shopping, order tracking, MTO production status, return request |

---

# 6. Core Business Rules

## BR-001 — Domain authority

```text
Manufacturing   = material/BOM/MO/WIP/QC coordination
FG domain       = physical finished goods
Medusa          = commerce/order/reservation authority
Carrier         = physical shipment authority
Meta            = communication channel
Payload CMS     = content authority
Kafka           = integration backbone, not source of truth
```

## BR-002 — Raw material is not commerce inventory

Fabric, trim and WIP must never be represented as sellable Medusa inventory.

## BR-003 — QC gate

Only quantity that is:

```text
production completed
+ QC PASS/released
+ packed
+ FG receipt posted
```

may become commerce-eligible stock.

## BR-004 — Reservation is not consumption

Material reservation does not reduce physical on-hand. Issue to production does.

## BR-005 — External side effects must be idempotent

Shipment creation, payment callbacks, inventory write commands, FG receipt, webhook ingestion and refunds must be idempotent.

## BR-006 — Return is not immediately sellable

Returned garment must pass return QC before restock.

---

# 7. End-to-End Business Journeys

# 7.1 Make-to-Stock

```text
Demand / Planner
  ↓
MO
  ↓
Reserve Material
  ↓
Cut / Sew / QC / Pack
  ↓
FG Receipt
  ↓
Sellable Projection
  ↓
Medusa Inventory
  ↓
Customer Order
  ↓
Pick / Pack
  ↓
J&T Shipment
  ↓
Delivered
```

# 7.2 Made-to-Order

```text
Customer Order
  ↓
Payment / Deposit
  ↓
Production Request
  ↓
Material Availability
  ↓
Reserve
  ↓
MO
  ↓
Cut / Sew / QC / Pack
  ↓
FG allocated directly to Order
  ↓
J&T
```

# 7.3 Social Commerce Inquiry

```text
Customer Messenger
  ↓
Meta Webhook
  ↓
Identity Resolution
  ↓
Order / Product / Shipment Query
  ↓
Medusa / local read models
  ↓
Messenger response
```

# 7.4 Return / Exchange

```text
Customer Request
  ↓
Eligibility
  ↓
Return Authorization
  ↓
Carrier Return
  ↓
Warehouse Receive
  ↓
Return QC
  ├── Restock
  ├── Rework
  ├── B-grade
  └── Scrap
```

---

# 8. Functional Requirements — Procurement

## FR-PROC-001 Supplier master

System shall manage supplier identity, status, contacts, supported materials and commercial references.

## FR-PROC-002 Purchase Order

System shall create, approve, send, partially receive and close purchase orders.

## FR-PROC-003 Goods Receipt

A PO line may be received in multiple receipts.

## FR-PROC-004 Fabric receiving

For track-roll materials, receiving shall create lot/dye-lot/roll identities and accepted measured quantity.

## FR-PROC-005 Receiving QC hold

Material can be received physically but unavailable while QC is pending.

---

# 9. Functional Requirements — Material Inventory

## FR-INV-001 Immutable movement ledger

Every physical stock mutation shall produce an immutable stock movement.

## FR-INV-002 Current balance

System shall maintain fast current balance by:

```text
material + lot + roll + location
```

where applicable.

## FR-INV-003 Quantity dimensions

System shall maintain:

```text
on_hand
reserved
qc_hold
damaged
available
```

## FR-INV-004 Atomic reservation

Concurrent reservations must not exceed available quantity.

## FR-INV-005 Dye-lot allocation

Fabric allocation shall support same-dye-lot preference and maximum dye-lot policy.

## FR-INV-006 FIFO/roll allocation

System shall support configurable allocation policy including FIFO and roll-fragment reduction.

## FR-INV-007 Issue to production

Reserved stock can be physically issued to a Manufacturing Order.

## FR-INV-008 Return unused material

Unused issued material can return to stock as GOOD, QC_HOLD or DAMAGED.

## FR-INV-009 Scrap

Scrap shall require quantity, reason, actor and business reference.

## FR-INV-010 Transfer

System shall support same-site transfer and asynchronous inter-warehouse transfer.

## FR-INV-011 Cycle count

Cycle count shall preserve expected quantity/version, physical count, approval and adjustment movement.

## FR-INV-012 Barcode/QR

Fabric roll and key warehouse entities shall be scannable.

## FR-INV-013 Reconciliation

System shall detect mismatches between ledger, balance, reservations and roll state.

---

# 10. Functional Requirements — BOM / MRP

## FR-MRP-001 Versioned BOM

BOM shall be versioned and immutable after release.

## FR-MRP-002 BOM explosion

System shall calculate material requirement from output quantity, BOM quantity and waste factor.

## FR-MRP-003 Routing

System shall define operation sequence, work-center requirements and standard times.

## FR-MRP-004 MRP run

MRP shall calculate gross demand, available stock, confirmed incoming, safety buffer and shortage.

## FR-MRP-005 Supply suggestions

MRP may recommend:

```text
PURCHASE
TRANSFER
PRODUCE
RESCHEDULE
```

## FR-MRP-006 Planner approval

MRP recommendations shall not automatically create supplier PO in v1.

---

# 11. Functional Requirements — Manufacturing

## FR-MFG-001 Manufacturing Order

System shall create MO for MTS, MTO, replenishment, sample and rework.

## FR-MFG-002 Version freeze

MO shall retain BOM/routing versions used at creation/release.

## FR-MFG-003 Material readiness

Planner shall see READY, PARTIAL or SHORTAGE status.

## FR-MFG-004 Material reservation

Manufacturing shall call Material Inventory reservation commands instead of modifying stock directly.

## FR-MFG-005 Production batch

An MO may be split into one or more production batches.

## FR-MFG-006 Cut plan

System shall plan fabric rolls, lays, size ratios and planned consumption.

## FR-MFG-007 Fabric reconciliation

For a cut batch:

```text
issued ≈ actual consumed + returned + scrap
```

within tolerance.

## FR-MFG-008 Bundle/WIP

System shall track WIP at bundle level for v1.

## FR-MFG-009 Operation execution

Operations shall report input, good, rework and reject quantities.

## FR-MFG-010 Work centers

System shall track work-center availability, effective capacity and load.

## FR-MFG-011 QC gates

Manufacturing shall block progression when required QC gate is not passed.

## FR-MFG-012 Rework

Rework shall be an explicit tracked flow and must not inflate good output.

## FR-MFG-013 Packing

Packing shall use only QC-released quantity.

## FR-MFG-014 Partial completion

MO may be partially completed while rework/open quantity remains.

## FR-MFG-015 MTO customer status

System shall expose simplified production status:

```text
PREPARING_PRODUCTION
IN_PRODUCTION
QUALITY_CHECK
PREPARING_SHIPMENT
READY_TO_SHIP
```

---

# 12. Functional Requirements — Finished Goods

## FR-FG-001 FG receipt

Finished goods shall be received from QC-released/packed production output.

## FR-FG-002 FG batch

Each FG receipt shall preserve production batch/MO/traceability links.

## FR-FG-003 Physical FG ledger

Physical finished-goods stock shall be auditable.

## FR-FG-004 Sellable projection

Commerce sellable quantity shall be derived from physical FG minus holds/safety/non-commerce allocations.

## FR-FG-005 MTO allocation

MTO-produced goods allocated to an order shall not enter general ATS.

## FR-FG-006 Versioned sync

FG → Medusa inventory sync must reject stale versions/events.

---

# 13. Functional Requirements — Commerce

## FR-COM-001 Product/SKU

System shall expose sellable product variants with stable SKU mapping.

## FR-COM-002 Price and promotion

Commerce shall support pricing and promotion independently of manufacturing cost.

## FR-COM-003 Cart/order/payment

Medusa shall own cart, order, payment and commerce reservation lifecycle.

## FR-COM-004 Inventory availability

Storefront shall show commerce-available inventory, not physical factory quantity.

## FR-COM-005 Order allocation

Order reservation shall not double-reserve physical stock outside defined projection logic.

## FR-COM-006 MTO order

Order can trigger production and remain linked to MO/FG allocation.

---

# 14. Functional Requirements — Social Commerce

## FR-SOC-001 Meta inbound webhook

System shall receive Messenger events through verified webhooks.

## FR-SOC-002 Channel identity

System shall map channel-specific external user identity to internal customer identity.

## FR-SOC-003 Product inquiry

Customer/CS/agent can query products through commerce APIs.

## FR-SOC-004 Order inquiry

Customer can query authorized order state through social channel.

## FR-SOC-005 Production inquiry

MTO customer can query simplified production state.

## FR-SOC-006 Shipment inquiry

Customer can query local synchronized shipment state.

## FR-SOC-007 Secure checkout link

Social conversation may create a cart and return a secure web checkout link.

## FR-SOC-008 Notification policy

Outbound social notification must pass channel policy/consent/window checks.

## FR-SOC-009 Human handoff

System shall support handoff from agent automation to CS.

---

# 15. Functional Requirements — Fulfillment

## FR-FUL-001 Carrier abstraction

Carrier integration shall implement a common provider interface.

## FR-FUL-002 J&T provider

J&T shall be the first production carrier provider.

## FR-FUL-003 Create shipment

A ready fulfillment shall create at most one active physical shipment unless explicitly replaced.

## FR-FUL-004 Tracking number

Carrier tracking identifiers shall be stored and linked to fulfillment/order.

## FR-FUL-005 Canonical status

Carrier-specific tracking statuses shall map to canonical platform statuses.

## FR-FUL-006 Webhook-first tracking

Carrier webhook/push should be primary when supported; polling shall reconcile missed events.

## FR-FUL-007 Shipment query

Storefront, CS and agent shall read local shipment state.

## FR-FUL-008 Delivery failure

Delivery failure/return-to-sender shall be represented explicitly.

---

# 16. Functional Requirements — Returns & Exchange

## FR-RET-001 Return authorization

Return shall require eligibility and authorization.

## FR-RET-002 Return shipment

Return can create or attach a carrier return shipment.

## FR-RET-003 Return QC

Returned item shall be classified:

```text
A_GRADE
B_GRADE
REWORK
DAMAGED
SCRAP
```

## FR-RET-004 Exchange

Exchange shall reserve replacement SKU and create new fulfillment after policy approval.

## FR-RET-005 Refund

Refund shall remain a commerce/payment action and require authorized role.

---

# 17. Functional Requirements — Notifications

## FR-NOT-001 Event-driven notification

Notifications shall be triggered from domain events.

## FR-NOT-002 Policy engine

Before delivery, system shall evaluate channel permission, consent, dedup and preference.

## FR-NOT-003 Channels

Initial channels:

```text
Facebook Messenger
Email / push optional
```

Architecture shall support future WhatsApp/Zalo/LINE.

## FR-NOT-004 High-value events

Recommended:

```text
order confirmed
MTO production started
quality check / ready to ship
shipment picked up
out for delivery
delivered
delivery failed
return received
refund completed
```

---

# 18. Functional Requirements — Administration

## FR-ADM-001 RBAC

All operational actions shall require role/permission checks.

## FR-ADM-002 Feature flags

High-risk integrations and automation shall support independent feature flags.

## FR-ADM-003 Audit

Manual stock adjustment, release with shortage, overproduction approval, refund and shipment actions shall be auditable.

## FR-ADM-004 Configuration

Carrier, Meta, warehouse, material and planning configuration shall be environment/organization controlled.

---

# 19. Non-Functional Requirements — Consistency

## NFR-CON-001 No race-induced negative stock

Concurrent operations must not create negative available stock.

## NFR-CON-002 Idempotency

Duplicate command/webhook/event must not duplicate business side effects.

## NFR-CON-003 Event ordering tolerance

Consumers shall tolerate retries and stale/out-of-order events using version/state guards.

## NFR-CON-004 Transactional outbox

Critical domain state + event intent shall commit atomically.

## NFR-CON-005 Rebuild/reconciliation

Current projections must be verifiable against source history.

---

# 20. Non-Functional Requirements — Performance

Initial targets:

| Requirement                      |        Target |
| -------------------------------- | ------------: |
| Commerce API availability        |        99.95% |
| Webhook availability             |        99.95% |
| Webhook ACK p95                  |      < 500 ms |
| Product/order local query p95    |      < 300 ms |
| Material availability query p95  |      < 200 ms |
| Reserve material command p95     | < 1 s typical |
| Shop-floor barcode lookup p95    |      < 150 ms |
| Operation completion p95         |      < 500 ms |
| Inventory projection lag p95     |         < 5 s |
| Outbox publish lag p95           |         < 5 s |
| Duplicate physical shipment      |             0 |
| Oversell caused by platform race |             0 |

External provider latency is measured separately.

---

# 21. Non-Functional Requirements — Availability & Failure Isolation

## NFR-AVL-001 J&T outage

Checkout/order/manufacturing must continue; shipment creation becomes pending/retryable.

## NFR-AVL-002 Meta outage

Commerce and fulfillment remain correct; notification retries independently.

## NFR-AVL-003 Kafka outage

Committed domain transactions remain durable through outbox backlog.

## NFR-AVL-004 Worker crash

Business state must recover from database/workflow state without duplicate side effects.

---

# 22. Non-Functional Requirements — Security

## NFR-SEC-001 Secrets

Provider credentials and tokens shall live in secret manager, never browser/Git/logs.

## NFR-SEC-002 Webhook verification

Meta/J&T callbacks shall be authenticated/verified using provider-supported mechanism.

## NFR-SEC-003 PII protection

Phone, address, message content and order details shall be access-controlled and masked in logs.

## NFR-SEC-004 Least privilege

Warehouse/production/CS/finance permissions shall be separated.

## NFR-SEC-005 AI isolation

AI agent shall not receive direct DB access, J&T secret or Meta Page token.

---

# 23. Non-Functional Requirements — Observability

## NFR-OBS-001 Tracing

OpenTelemetry shall trace business flows across domain and integrations.

## NFR-OBS-002 Metrics

Each domain shall expose technical and business metrics.

## NFR-OBS-003 Correlation

Important commands/events shall carry:

```text
correlation_id
causation_id
aggregate_id
```

## NFR-OBS-004 Alerts

Alerts shall exist for auth failures, stock mismatches, outbox lag, provider error rate, stale tracking, material shortage and QC/production anomalies.

---

# 24. Non-Functional Requirements — Audit & Data Retention

## NFR-AUD-001 Immutable business history

Stock movement and key state events shall remain audit-friendly.

## NFR-AUD-002 Actor audit

Manual high-risk actions must record actor, reason and timestamp.

## NFR-AUD-003 Traceability retention

Consumed rolls/lots must remain queryable after stock reaches zero.

---

# 25. Multi-Warehouse Requirements

System shall support:

```text
Factory Raw Material
Factory WIP
Factory Finished Goods
HCM Fulfillment
HN Fulfillment
Return QC
Damaged / Quarantine
In-Transit
```

Transfer rules must preserve total stock.

---

# 26. Multi-Country Readiness

Architecture shall support country-specific:

```text
payment
tax
carrier
currency
warehouse
returns policy
social channel
legal entity
```

without duplicating product/manufacturing masters unnecessarily.

---

# 27. Reporting & Analytics Requirements

Platform shall provide event/CDC feeds for analytics.

Minimum marts/KPIs:

```text
material consumption
fabric variance
production output
first pass yield
rework/reject
work-center utilization
inventory aging
sell-through
order conversion
fulfillment lead time
carrier performance
return reason
SKU margin inputs
```

Analytics must not write transactional state.

---

# 28. Requirement Traceability Matrix

| Requirement Area | Primary Domain / Component                         |
| ---------------- | -------------------------------------------------- |
| FR-PROC-*        | Procurement                                        |
| FR-INV-*         | Material Inventory                                 |
| FR-MRP-*         | Manufacturing/MRP                                  |
| FR-MFG-*         | Manufacturing + Quality                            |
| FR-FG-*          | Finished Goods + Inventory Projection              |
| FR-COM-*         | Medusa Commerce                                    |
| FR-SOC-*         | Meta Channel Adapter / Social Commerce             |
| FR-FUL-*         | Fulfillment / Carrier Gateway / J&T                |
| FR-RET-*         | Returns + Commerce + Warehouse QC                  |
| FR-NOT-*         | Notification Policy / Channel Gateway              |
| NFR-CON-*        | PostgreSQL transactions, idempotency, outbox/inbox |
| NFR-SEC-*        | AuthZ, Secret Manager, Gateway                     |
| NFR-OBS-*        | OpenTelemetry / Metrics / Logs                     |
| NFR-AVL-*        | Workers, retries, circuit breakers, queues         |

---

# 29. MVP Requirements

Platform v1 MVP shall include:

```text
Material master
Supplier / PO / receiving
Fabric lot / dye lot / roll
Material ledger / reservation / issue / return / scrap
BOM and Routing
Manufacturing Order
Cut / Sew / QC / Packing
Finished Goods receipt
FG → Medusa inventory sync
Web commerce
J&T shipment/tracking
Facebook order/tracking inquiry
Basic MTO production status
Basic return/exchange
RBAC / audit
OTel / metrics / logs
Reconciliation jobs
```

---

# 30. Acceptance Criteria — Platform v1

Platform v1 is accepted when all are true:

1. A fabric receipt can be traced to PO/supplier.
2. Roll reservation and issue cannot duplicate under concurrent requests.
3. Material ledger reconciles to current balance.
4. Same-dye-lot rule can be enforced.
5. MO freezes BOM/routing version.
6. Cut consumption reconciles to issue/return/scrap within tolerance.
7. WIP/QC/rework quantities remain consistent.
8. Only QC-released packed output becomes FG.
9. FG sync to Medusa is versioned and stale-event safe.
10. Medusa order reservation does not oversell due platform races.
11. One Medusa fulfillment cannot accidentally create two J&T shipments.
12. Tracking is idempotent and reconcilable.
13. Customer can query order/shipment through Facebook Messenger.
14. MTO customer can see simplified production status.
15. Returned stock is not sellable before QC.
16. Order can trace back to FG batch/MO/fabric lot.
17. Critical commands have audit and OTel trace.
18. Kafka/provider outage does not corrupt business state.
19. Security review passes.
20. E2E MTS, MTO, shipment and return tests pass.

---

# 31. Delivery Roadmap

```text
Phase 0 — Platform foundation
Phase 1 — Procurement + Material Inventory
Phase 2 — BOM / MRP / Manufacturing / QC
Phase 3 — Finished Goods + Medusa Inventory Projection
Phase 4 — Commerce hardening
Phase 5 — J&T Fulfillment
Phase 6 — Meta Social Commerce
Phase 7 — MTO end-to-end
Phase 8 — Returns, costing, optimization
```

---

# 32. Requirement Governance

Requirement IDs are stable.

Change process:

```text
New request
  ↓
Business impact
  ↓
Domain ownership review
  ↓
Requirement ID/version update
  ↓
TDD impact analysis
  ↓
Test/acceptance update
```

No implementation should bypass documented domain ownership simply to ship faster.

---

# 33. Definition of Ready for Development

A feature is ready when:

```text
requirement ID exists
owner/domain is clear
API/event impact is known
data ownership is clear
security classification is known
acceptance criteria exist
failure/idempotency behavior is defined
observability requirement exists
```

---

# 34. Definition of Done

A feature is done when:

```text
code
+ migration
+ tests
+ contract/schema
+ audit/authz
+ OTel/metrics
+ failure/retry behavior
+ documentation
+ production runbook where needed
```

all pass review.
