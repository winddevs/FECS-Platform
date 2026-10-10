# Runbook: reconciliation / production exceptions

**Alerts:** `MaterialShortageBlockingProduction`, `ManufacturingExceptionsOpen`.

- **Made-to-order waiting for material**
  (`production_request.status = WAITING_MATERIAL`): procurement should receive
  the material (MRP suggestions: `GET /admin/manufacturing/mrp/suggestions`).
  The worker retries every 5 minutes and releases the MO automatically.
  `DYE_LOT_POLICY_VIOLATION` needs a planner with `manufacturing:approve` to
  reserve with `planner_approved=true`. After fixing data (e.g. a missing BOM):
  `POST /admin/manufacturing/production-requests/:id/retry`.
- **FABRIC_VARIANCE exception**: cut consumption did not reconcile with
  issue + return + scrap beyond 2%. Investigate the roll, then return/scrap the
  difference through the inventory endpoints, which reference the MO.
- **Cancel refused (`MO_HAS_ISSUED_MATERIAL`)**: material issued to the MO must
  be returned or scrapped first; cancellation is never a status flip.
- **Reconciliation job logs** (`[reconcile:...]`) go to the worker logs; the
  jobs only read - repairs are always deliberate and audited.
