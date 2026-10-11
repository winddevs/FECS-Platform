# Back-office (Medusa Admin extensions)

The ERP REST API (procurement, raw materials, manufacturing, shop floor, quality,
finished goods, fulfillment, returns, social hand-off, operations) has an operator UI
built as Medusa Admin extensions. Everything lives in `apps/medusa/src/admin/`.

Open it at `/app` of the Medusa backend (dev: `http://localhost:9100/app`). Eleven sidebar
entries are added; each is one page with tabs.

## How it is organised

```
apps/medusa/src/admin/
  lib/erp/            shared kit (no barrel file, import each module directly)
  screens/<domain>/   list configs, form configs, detail/action components
  routes/<name>/page.tsx   one thin page per sidebar entry (defineRouteConfig + tabs)
  routes/settings/*, widgets/*   pre-existing, untouched
```

### Shared kit (`lib/erp/`)

| Module                                                                         | What it gives you                                                                                                                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.ts`                                                                       | `erp.get/post/put/del/text/getAllowing`, `ErpApiError`, `describeError`, `reportError`. Adds `Idempotency-Key` to every command and `x-correlation-id` to every call. |
| `use-erp.ts`                                                                   | `useErpQuery` (GET, cached under the `erp` key root) and `useErpCommand` (mutation: success toast, error toast, refresh of every `erp` query).                        |
| `resource-types.ts`, `resource-table.tsx`, `resource-filters.tsx`, `cells.tsx` | Generic paginated `ResourceTable` driven by a `ResourceConfig`.                                                                                                       |
| `status-badge.tsx`                                                             | `StatusBadge`: status string -> badge color.                                                                                                                          |
| `form-fields.ts`, `field-inputs.tsx`                                           | Declarative forms: a `FieldConfig[]` gives the inputs, validation and request body.                                                                                   |
| `form-drawer.tsx`                                                              | `FormDrawer`: side drawer around a `<form>` with pending state.                                                                                                       |
| `action-drawer.tsx`                                                            | `ActionDrawer`: button + `FormDrawer` + command. The one way to create or act on records.                                                                             |
| `confirm-action-button.tsx`                                                    | `ConfirmActionButton`: button + confirmation dialog + optional (required) reason.                                                                                     |
| `detail-parts.tsx`                                                             | `QueryBoundary`, `DetailSection`, `KeyValueGrid`, `MiniTable`, `BackBar`.                                                                                             |
| `page-shell.tsx`                                                               | `TabbedPage` (shared QueryClient + tabs), `ViewSwitch` (second-level switch).                                                                                         |
| `label-dialog.tsx`                                                             | `LabelButton`: fetches an SVG label with the admin session, shows it in a drawer, prints it.                                                                          |
| `lookup-box.tsx`                                                               | Scanner / manual code input.                                                                                                                                          |
| `reconciliation-view.tsx`                                                      | Runs a reconciliation endpoint; a 409 is shown as findings, not as an error.                                                                                          |
| `refs.ts`                                                                      | Id -> code lookup for materials, locations, suppliers, FG locations, work centers (tables show codes, forms offer a lookup).                                          |
| `icons.tsx`                                                                    | Sidebar icons (see "Known limits").                                                                                                                                   |

### Behaviour that applies everywhere

- **Permissions are never assumed.** All buttons are visible; the API decides. A `403`
  shows a toast "Permission denied" with the server's `Missing permission: ...` text. A
  list that is forbidden shows the same message inline with a Retry button.
- **Errors** show the API `message` in a toast plus `Reference: cor_...`. That id is the
  `x-correlation-id` the UI sent, so support can find the request in the logs.
- **Idempotency.** Every POST/PUT/DELETE sends an `Idempotency-Key` (a UUID). Re-sending the
  identical command after a network error or 5xx reuses the key; a definitive 4xx or a
  success starts a new one. Routes that do not need a key simply ignore the header.
- **Numbers.** Shown as returned by the API with digit grouping only. No currency or unit
  formatting is applied.
- **Detail screens** open inside the page (state, not a URL). See "Known limits".
- **After any command** all `erp` queries are refetched, so lists and details stay current.

## Sidebar entries and screens

| Sidebar entry  | Route             | Tabs                                                                                                                                        |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Procurement    | `/procurement`    | Purchase orders, Suppliers                                                                                                                  |
| Raw Materials  | `/raw-materials`  | Stock (Balances, Lots, Rolls, Movements ledger, Reservations), Receive, Cycle counts, Transfers, Scan, Materials, Locations, Reconciliation |
| Planning       | `/planning`       | BOMs, Routings, MRP (Suggestions, Runs), Planning params, Work centers (Load, Work centers)                                                 |
| Production     | `/production`     | Manufacturing orders, Production requests, Exceptions                                                                                       |
| Shop Floor     | `/shop-floor`     | Bundle station, Bundles                                                                                                                     |
| Quality        | `/quality`        | Inspections, Inspect a bundle                                                                                                               |
| Finished Goods | `/finished-goods` | Balances, Batches, Allocations, Holds & adjustments, Transfers, Locations, Reconciliation                                                   |
| Fulfillment    | `/fulfillment`    | Shipments, Delivery exceptions                                                                                                              |
| Returns        | `/returns`        | Returns                                                                                                                                     |
| Social Support | `/social-support` | Conversations                                                                                                                               |
| Operations     | `/operations`     | Ops summary, Settings, Country profiles, Analytics                                                                                          |

## Screen -> endpoint -> permission

Permissions come from `apps/medusa/src/api/fashion/middlewares.ts` and `ops-middlewares.ts`.
The role lists are in the matrix below. A screen needs the **read** permission to load; each
action needs its own permission.

### Procurement

| Screen / action                                   | Endpoint                                                         | Permission            |
| ------------------------------------------------- | ---------------------------------------------------------------- | --------------------- |
| Purchase orders list                              | `GET /admin/procurement/purchase-orders`                         | `procurement:read`    |
| Purchase order detail, receipts                   | `GET /admin/procurement/purchase-orders/:id`, `.../:id/receipts` | `procurement:read`    |
| New purchase order                                | `POST /admin/procurement/purchase-orders`                        | `procurement:write`   |
| Approve / Close / Cancel (reason)                 | `POST .../:id/approve`, `/close`, `/cancel`                      | `procurement:approve` |
| Send to supplier                                  | `POST .../:id/send`                                              | `procurement:write`   |
| Record goods receipt (roll lines, QC_HOLD bucket) | `POST .../:id/receipts`                                          | `procurement:receive` |
| Suppliers list                                    | `GET /admin/procurement/suppliers`                               | `procurement:read`    |
| New supplier                                      | `POST /admin/procurement/suppliers`                              | `master:write`        |

### Raw materials

| Screen / action                                | Endpoint                                                                                   | Permission                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Materials, Locations lists                     | `GET /admin/material-inventory/materials`, `/locations`                                    | `master:read`                                                                     |
| New material / location                        | `POST /admin/material-inventory/materials`, `/locations`                                   | `master:write`                                                                    |
| Print label (roll, location)                   | `GET /admin/material-inventory/labels/:type/:code`                                         | `inventory:read`                                                                  |
| Balances, Lots, Rolls, Movements, Reservations | `GET /admin/material-inventory/balances`, `/lots`, `/rolls`, `/movements`, `/reservations` | `inventory:read`                                                                  |
| Reserve material                               | `POST /admin/material-inventory/reservations`                                              | `inventory:reserve` (+ `manufacturing:approve` when "planner approves" is ticked) |
| Release reservation                            | `POST .../reservations/:id/release`                                                        | `inventory:reserve`                                                               |
| Issue to production                            | `POST /admin/material-inventory/issues`                                                    | `inventory:issue`                                                                 |
| Receive stock                                  | `POST /admin/material-inventory/receipts`                                                  | `inventory:receive`                                                               |
| Record cycle count                             | `POST /admin/material-inventory/cycle-counts`                                              | `inventory:count`                                                                 |
| Cycle counts queue                             | `GET /admin/material-inventory/cycle-counts`                                               | `inventory:read`                                                                  |
| Approve / reject count                         | `POST .../cycle-counts/:id/decision`                                                       | `inventory:adjust`                                                                |
| Adjustment                                     | `POST /admin/material-inventory/adjustments`                                               | `inventory:adjust`                                                                |
| Scrap (reason + business reference)            | `POST /admin/material-inventory/scraps`                                                    | `inventory:scrap`                                                                 |
| QC hold decision                               | `POST /admin/material-inventory/qc-decisions`                                              | `inventory:qc`                                                                    |
| Same-site transfer, Dispatch                   | `POST /admin/material-inventory/transfers`, `/transfers/dispatch`                          | `inventory:transfer`                                                              |
| Receive / cancel in-transit transfer           | `POST .../transfers/:id/receive`, `/cancel`                                                | `inventory:transfer`                                                              |
| Transfers list                                 | `GET /admin/material-inventory/transfers`                                                  | `inventory:read`                                                                  |
| Scan box                                       | `GET /admin/material-inventory/scan/:code`                                                 | `inventory:read`                                                                  |
| Reconciliation status                          | `GET /admin/material-inventory/reconciliation`                                             | `inventory:reconcile`                                                             |

Count, adjustment, scrap, QC decision and transfers are started from a balance: open
Stock > Balances and click a row.

### Planning

| Screen / action                        | Endpoint                                                                   | Permission              |
| -------------------------------------- | -------------------------------------------------------------------------- | ----------------------- |
| BOMs / Routings list, detail, versions | `GET /admin/manufacturing/boms`, `/boms/:id`, `/routings`, `/routings/:id` | `manufacturing:read`    |
| New BOM / routing (draft)              | `POST /admin/manufacturing/boms`, `/routings`                              | `manufacturing:plan`    |
| Release                                | `POST .../boms/:id/release`, `.../routings/:id/release`                    | `manufacturing:release` |
| MRP runs, suggestions                  | `GET /admin/manufacturing/mrp/runs`, `/mrp/suggestions`                    | `manufacturing:read`    |
| Run MRP                                | `POST /admin/manufacturing/mrp/runs`                                       | `manufacturing:plan`    |
| Approve / reject suggestion            | `POST .../mrp/suggestions/:id/decide`                                      | `manufacturing:approve` |
| SKU reorder rules                      | `GET /admin/manufacturing/planning-params/skus`                            | `manufacturing:read`    |
| Set material / SKU parameters          | `POST /admin/manufacturing/planning-params`, `/planning-params/skus`       | `manufacturing:plan`    |
| Work centers, load                     | `GET /admin/manufacturing/work-centers`, `/work-centers/load`              | `manufacturing:read`    |
| New work center                        | `POST /admin/manufacturing/work-centers`                                   | `manufacturing:plan`    |

### Production, shop floor, quality

| Screen / action                      | Endpoint                                                                             | Permission                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| MO list, detail, reserved rolls      | `GET /admin/manufacturing/mos`, `/mos/:id`, `/mos/:id/rolls`                         | `manufacturing:read`                                                            |
| New MO, Check material               | `POST /admin/manufacturing/mos`, `.../mos/:id/check-material`                        | `manufacturing:plan`                                                            |
| Reserve material                     | `POST .../mos/:id/reserve`                                                           | `manufacturing:plan` (+ `manufacturing:approve` for dye-lot override)           |
| Release (with batches), Hold, Resume | `POST .../mos/:id/release`, `/hold`, `/resume`                                       | `manufacturing:release`                                                         |
| Cancel, Short-close                  | `POST .../mos/:id/cancel`, `/short-close`                                            | `manufacturing:approve`                                                         |
| Issue fabric                         | `POST .../mos/:id/issue`                                                             | `inventory:issue`                                                               |
| Cut plan, Cut                        | `POST .../mos/:id/cut-plan`, `/cut`                                                  | `manufacturing:cut` (+ `manufacturing:approve` when overproduction is approved) |
| Exceptions                           | `GET /admin/manufacturing/exceptions`                                                | `manufacturing:read`                                                            |
| Production requests / Retry          | `GET /admin/manufacturing/production-requests`, `POST .../:id/retry`                 | `manufacturing:read` / `manufacturing:plan`                                     |
| Bundle lookup, bundles list, ticket  | `GET /admin/manufacturing/bundles/by-code/:code`, `/by-code/:code/label`, `/bundles` | `manufacturing:read`                                                            |
| Report operation                     | `POST .../bundles/:id/operations`                                                    | `manufacturing:execute`                                                         |
| Send to inspection                   | `POST .../bundles/:id/inspections`                                                   | `quality:inspect`                                                               |
| Return rework                        | `POST .../bundles/:id/rework`                                                        | `manufacturing:rework`                                                          |
| Pack                                 | `POST .../bundles/:id/pack`                                                          | `manufacturing:pack`                                                            |
| Inspections list                     | `GET /admin/quality/inspections`                                                     | `manufacturing:read`                                                            |

### Finished goods

| Screen / action                                                                     | Endpoint                                                                                                   | Permission     |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------- |
| Balances (sellable computed), Batches, Allocations, Movements, Transfers, Locations | `GET /admin/finished-goods/balances`, `/batches`, `/allocations`, `/movements`, `/transfers`, `/locations` | `fg:read`      |
| Batch trace                                                                         | `GET /admin/finished-goods/batches/:id/trace`                                                              | `fg:read`      |
| Reconciliation                                                                      | `GET /admin/finished-goods/reconciliation`                                                                 | `fg:read`      |
| Hold / release, Adjust, Safety stock, Allocate                                      | `POST /admin/finished-goods/holds`, `/adjustments`, `/safety-stock`, `/allocations`                        | `fg:adjust`    |
| New FG location                                                                     | `POST /admin/finished-goods/locations`                                                                     | `master:write` |
| Dispatch / receive / cancel transfer                                                | `POST .../transfers/dispatch`, `.../transfers/:id/receive`, `/cancel`                                      | `fg:receive`   |
| Republish projection                                                                | `POST /admin/finished-goods/projection/republish`                                                          | `fg:sync`      |

Sellable = `max(0, on_hand - warehouse_hold - qc_hold - allocated - safety_stock)`, the
same formula as `modules/finishedGoods/lib/projection.ts`.

### Fulfillment, returns, social, operations

| Screen / action                                 | Endpoint                                                                      | Permission           |
| ----------------------------------------------- | ----------------------------------------------------------------------------- | -------------------- |
| Shipments, detail + tracking events, exceptions | `GET /admin/fulfillment/shipments`, `/shipments/:id`, `/exceptions`           | `fulfillment:read`   |
| Create / cancel / replace shipment              | `POST /admin/fulfillment/shipments`, `.../:id/cancel`, `.../:id/replace`      | `fulfillment:manage` |
| Resolve delivery exception                      | `POST .../exceptions/:id/resolve`                                             | `fulfillment:manage` |
| Returns list, detail                            | `GET /admin/returns`, `/returns/:id`                                          | `returns:read`       |
| New return, Authorize, Reject, Close            | `POST /admin/returns`, `.../:id/authorize`, `/reject`, `/close`               | `returns:authorize`  |
| Receive                                         | `POST .../returns/:id/receive`                                                | `returns:receive`    |
| Inspect item                                    | `POST .../returns/:id/items/:item_id/inspect`                                 | `returns:inspect`    |
| Refund                                          | `POST .../returns/:id/refund`                                                 | `returns:refund`     |
| Ship replacement (exchange)                     | `POST .../returns/:id/ship-replacement`                                       | `fulfillment:manage` |
| Conversations, history                          | `GET /admin/social/identities`, `.../:id/messages`                            | `social:read`        |
| Reply, hand back to bot / take over             | `POST .../identities/:id/messages`, `.../:id/handoff`                         | `social:manage`      |
| Ops summary                                     | `GET /admin/ops/summary`                                                      | `ops:read`           |
| Settings list                                   | `GET /admin/settings`                                                         | `ops:read`           |
| Set / clear setting                             | `PUT /admin/settings/:key`, `DELETE /admin/settings/:key?scope_type&scope_id` | `config:manage`      |
| Country profiles                                | `GET /admin/country-profiles`                                                 | `master:read`        |
| Save country profile                            | `POST /admin/country-profiles`                                                | `config:manage`      |
| Analytics marts, CSV                            | `GET /admin/analytics-marts`, `/admin/analytics-marts/:mart`                  | `analytics:read`     |

### Lookups (optional reads)

Tables show master codes instead of ids by reading the masters; forms use them for
suggestions. If the user lacks the read permission the screen quietly shows raw ids.
Materials, locations, country profiles: `master:read`. Suppliers: `procurement:read`.
Work centers: `manufacturing:read`. FG locations: `fg:read`.

## Role -> permission matrix

From `apps/medusa/src/lib/authz/permissions.ts`. Roles are stored on the admin user as
`metadata.fashion_roles`. A user with no role gets `403` everywhere. Roles are granted with the
`grant-role` script in `apps/medusa/package.json`.

| Permission              | Roles                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master:read`           | ERP_ADMIN, PROCUREMENT, WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, PRODUCTION_PLANNER, AUDITOR                                                                |
| `master:write`          | ERP_ADMIN, PROCUREMENT                                                                                                                                    |
| `procurement:read`      | ERP_ADMIN, PROCUREMENT, WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, FINANCE, AUDITOR                                                                           |
| `procurement:write`     | ERP_ADMIN, PROCUREMENT                                                                                                                                    |
| `procurement:approve`   | ERP_ADMIN, PROCUREMENT                                                                                                                                    |
| `procurement:receive`   | ERP_ADMIN, WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER                                                                                                          |
| `inventory:read`        | ERP_ADMIN, PROCUREMENT, WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, PRODUCTION_PLANNER, CUTTING_OPERATOR, SEWING_OPERATOR, SEWING_SUPERVISOR, QC, SRE, AUDITOR |
| `inventory:receive`     | ERP_ADMIN, WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER                                                                                                          |
| `inventory:reserve`     | ERP_ADMIN, PRODUCTION_PLANNER                                                                                                                             |
| `inventory:issue`       | ERP_ADMIN, WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, CUTTING_OPERATOR                                                                                        |
| `inventory:return`      | ERP_ADMIN, WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER, CUTTING_OPERATOR                                                                                        |
| `inventory:transfer`    | ERP_ADMIN, WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER                                                                                                          |
| `inventory:qc`          | ERP_ADMIN, WAREHOUSE_MANAGER, QC                                                                                                                          |
| `inventory:scrap`       | ERP_ADMIN, WAREHOUSE_MANAGER                                                                                                                              |
| `inventory:adjust`      | ERP_ADMIN, WAREHOUSE_MANAGER                                                                                                                              |
| `inventory:count`       | ERP_ADMIN, WAREHOUSE_OPERATOR, WAREHOUSE_MANAGER                                                                                                          |
| `inventory:reconcile`   | ERP_ADMIN, WAREHOUSE_MANAGER, SRE, AUDITOR                                                                                                                |
| `manufacturing:read`    | ERP_ADMIN, WAREHOUSE_MANAGER, PRODUCTION_PLANNER, CUTTING_OPERATOR, SEWING_OPERATOR, SEWING_SUPERVISOR, QC, PACKING_OPERATOR, CUSTOMER_SUPPORT, AUDITOR   |
| `manufacturing:plan`    | ERP_ADMIN, PRODUCTION_PLANNER                                                                                                                             |
| `manufacturing:release` | ERP_ADMIN, PRODUCTION_PLANNER                                                                                                                             |
| `manufacturing:approve` | ERP_ADMIN, PRODUCTION_PLANNER                                                                                                                             |
| `manufacturing:cut`     | ERP_ADMIN, CUTTING_OPERATOR                                                                                                                               |
| `manufacturing:execute` | ERP_ADMIN, SEWING_OPERATOR, SEWING_SUPERVISOR                                                                                                             |
| `manufacturing:rework`  | ERP_ADMIN, SEWING_SUPERVISOR                                                                                                                              |
| `manufacturing:pack`    | ERP_ADMIN, PACKING_OPERATOR                                                                                                                               |
| `quality:inspect`       | ERP_ADMIN, QC                                                                                                                                             |
| `fg:read`               | ERP_ADMIN, WAREHOUSE_MANAGER, PRODUCTION_PLANNER, PACKING_OPERATOR, COMMERCE_ADMIN, CUSTOMER_SUPPORT, SRE, AUDITOR                                        |
| `fg:receive`            | ERP_ADMIN, WAREHOUSE_MANAGER                                                                                                                              |
| `fg:adjust`             | ERP_ADMIN, WAREHOUSE_MANAGER                                                                                                                              |
| `fg:sync`               | ERP_ADMIN, SRE                                                                                                                                            |
| `fulfillment:read`      | ERP_ADMIN, WAREHOUSE_MANAGER, PACKING_OPERATOR, COMMERCE_ADMIN, CUSTOMER_SUPPORT, SRE, AUDITOR                                                            |
| `fulfillment:manage`    | ERP_ADMIN, WAREHOUSE_MANAGER, CUSTOMER_SUPPORT                                                                                                            |
| `returns:read`          | ERP_ADMIN, WAREHOUSE_MANAGER, QC, CUSTOMER_SUPPORT, FINANCE, AUDITOR                                                                                      |
| `returns:authorize`     | ERP_ADMIN, CUSTOMER_SUPPORT                                                                                                                               |
| `returns:receive`       | ERP_ADMIN, WAREHOUSE_MANAGER                                                                                                                              |
| `returns:inspect`       | ERP_ADMIN, QC                                                                                                                                             |
| `returns:refund`        | ERP_ADMIN, FINANCE                                                                                                                                        |
| `social:read`           | ERP_ADMIN, COMMERCE_ADMIN, CUSTOMER_SUPPORT, SRE, AUDITOR                                                                                                 |
| `social:manage`         | ERP_ADMIN, CUSTOMER_SUPPORT                                                                                                                               |
| `ops:read`              | ERP_ADMIN, SRE, AUDITOR                                                                                                                                   |
| `analytics:read`        | ERP_ADMIN, PRODUCTION_PLANNER, COMMERCE_ADMIN, FINANCE, SRE, AUDITOR                                                                                      |
| `config:manage`         | ERP_ADMIN                                                                                                                                                 |

(`order:read`, `commerce:admin`, `roles:manage` are not used by these screens.)

## Add a new list screen from a config

1. Find the route in `api/fashion/middlewares.ts` / `ops-middlewares.ts`: the path, the
   response key (the `listHandler(entity, "<plural_key>", ...)` second argument) and the
   filters it accepts.
2. Add a `ResourceConfig` to `screens/<domain>/<domain>-config.ts`:

```ts
import type { ResourceConfig } from "../../lib/erp/resource-types";

export const fabricsList: ResourceConfig = {
  id: "fabrics",
  title: "Fabrics",
  endpoint: "/admin/material-inventory/materials",
  responseKey: "materials", // property of the response that holds the rows
  order: "-created_at", // optional, API `order` parameter
  defaultFilters: { material_type: "FABRIC" }, // optional, applied on first load
  columns: [
    { key: "code", label: "Code", kind: "code" },
    { key: "name", label: "Name" },
    { key: "uom", label: "UoM" },
    { key: "status", label: "Status", kind: "status" }, // StatusBadge
    { key: "supplier_id", label: "Supplier", kind: "ref", ref: "supplier" },
    {
      key: "available",
      label: "Available",
      kind: "number",
      value: (row) => Number(row.on_hand) - Number(row.reserved),
    }, // computed column
  ],
  filters: [
    { key: "code", label: "Code" }, // exact-match text
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["ACTIVE", "INACTIVE"],
    },
  ],
};
```

Column kinds: `text` (default), `status`, `number`, `datetime`, `boolean`, `code`, `json`,
`ref`. Use `columns: "auto"` for endpoints whose columns are only known at runtime
(analytics marts). Only declare filters the middleware lists, the API ignores others.

3. Render it in a tab (`routes/<name>/page.tsx`) or a screen component:

```tsx
<ResourceTable
  config={fabricsList}
  onRowClick={(row) => setSelectedId(String(row.id))} // optional, opens a detail
  toolbar={
    <ActionDrawer
      endpoint="..."
      fields={fabricFields}
      label="New fabric"
      variant="primary"
    />
  }
  renderRowActions={(row) => (
    <ConfirmActionButton
      endpoint={`...${String(row.id)}/close`}
      label="Close"
      prompt="Close this?"
      reason={{ required: true }}
    />
  )}
/>
```

If the screen needs a new sidebar entry, add `routes/<name>/page.tsx` with
`defineRouteConfig({ label, icon })` and `TabbedPage`. Keep to the 11-entry budget:
prefer a new tab on an existing page.

4. Add an action as a form config instead of writing form code:

```ts
export const fabricFields: readonly FieldConfig[] = [
  { name: "code", label: "Code", required: true },
  { name: "qty", label: "Quantity", type: "number", required: true },
  { name: "material_id", label: "Material", type: "lookup", ref: "material" },
  { name: "lines", label: "Line", type: "lines", fields: [/* sub-fields */] },
];
```

Field types: `text`, `number`, `integer`, `textarea`, `select`, `lookup`, `checkbox`,
`json`, `list` (comma-separated -> array), `datetime`, `lines` (repeatable rows),
`group` (nested object). Empty optional fields are omitted from the request body.
Pass `initialValues` to prefill from a row.

5. Run the checks (see below).

## Checks

```
cd apps/medusa
NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p src/admin/tsconfig.json --noEmit
NODE_OPTIONS=--max-old-space-size=8192 npx medusa build > /tmp/ui-build.log 2>&1
node scripts/check-build-errors.mjs /tmp/ui-build.log .
```

## Known limits

- `@medusajs/icons` and `react-router-dom` are not direct dependencies of `apps/medusa`, and
  the admin bundler cannot resolve them from there (verified: the build fails on import). So
  the sidebar icons are small inline SVGs (`lib/erp/icons.tsx`) and detail screens are
  in-page state instead of routes. Consequence: a detail screen has no URL of its own and the
  browser Back button leaves the page; use the "Back to ..." button. If those packages are
  added later, `icons.tsx` can be swapped for `@medusajs/icons` and details moved to
  `[id]/page.tsx` routes.
- Balances have no single-record endpoint; the balance detail re-reads the list filtered by
  material and location.
- The roll/location label uses the browser print dialog on the SVG; page size and margins
  are the browser's.
- Lookups load the first 200 records of a master (the API page maximum). Longer lists can
  still be used by pasting an id.
- Material planning parameters can only be set (the API has no list); SKU reorder rules can
  be listed and set.
- No automated browser test exists for these screens. They were checked by type-check,
  production build, and server-side render of every page and of the main detail screens
  with seeded data, not by clicking through them against a running backend.
