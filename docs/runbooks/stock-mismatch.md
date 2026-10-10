# Runbook: stock mismatch

**Alerts:** `StockInvariantViolated` (page), reconciliation endpoints returning 409.

1. Which ledger?
   - Raw material: `GET /admin/material-inventory/reconciliation`
   - Finished goods / Medusa: `GET /admin/finished-goods/reconciliation`
2. Read the `check`:
   - `LEDGER_VS_BALANCE`: a balance does not equal the sum of its movements.
     The database forbids editing movements, so this indicates a bug or manual
     SQL. Freeze the SKU/roll (QC hold), then correct with an **audited
     adjustment** (`POST .../adjustments`, reason required) - never UPDATE rows.
   - `RESERVATION_VS_BALANCE`: reserved quantity disagrees with reservation
     lines. Release the reservation and re-reserve.
   - `BALANCE_INVARIANT`: reserved + qc_hold + damaged > on_hand. CHECK
     constraints should make this impossible - treat as a P1 defect.
   - FG `DRIFT`: Medusa stock differs from the projection at the same version.
     Repair: `POST /admin/finished-goods/projection/republish {sku}`.
   - `RAW_MATERIAL_LEAK`: a raw material exists as Medusa inventory. Remove that
     inventory item; raw material must never be sellable.
   - `PENDING_SYNC` is normal lag, not an error.
3. Physical count disagrees with the system: cycle count
   (`POST /admin/material-inventory/cycle-counts`, needs the balance `version`
   so a stale count is rejected) or FG adjustment. All are audited.
