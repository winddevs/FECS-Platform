import type { MedusaContainer } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

import { FINISHED_GOODS_MODULE } from "../../modules/finishedGoods";
import { sellableOf } from "../../modules/finishedGoods/lib/projection";
import type FinishedGoodsModuleService from "../../modules/finishedGoods/service";
import { MATERIAL_INVENTORY_MODULE } from "../../modules/materialInventory";
import type MaterialInventoryModuleService from "../../modules/materialInventory/service";

export type FgReconciliationIssue = {
  check:
    | "PENDING_SYNC"
    | "DRIFT"
    | "UNMAPPED"
    | "SYNC_ERROR"
    | "RAW_MATERIAL_LEAK";
  sku: string;
  detail: Record<string, unknown>;
};

type InventoryApi = {
  listInventoryItems: (
    f: Record<string, unknown>,
    c?: Record<string, unknown>
  ) => Promise<Array<{ id: string; sku: string | null }>>;
  listInventoryLevels: (
    f: Record<string, unknown>
  ) => Promise<Array<{ stocked_quantity: number | string }>>;
};

const PAGE = 1000;

/**
 * FG physical -> sellable projection -> Medusa inventory (TDD s.47, FR-FG-006).
 *  - PENDING_SYNC: Medusa has not applied the latest version yet (lag, not drift)
 *  - DRIFT: versions match but Medusa stock differs from the projection
 *  - RAW_MATERIAL_LEAK: a raw material code exists as Medusa inventory (BR-002)
 * Read-only: repair is `POST /admin/finished-goods/projection/republish`.
 */
export const reconcileFgWithMedusa = async (
  container: MedusaContainer
): Promise<{ ok: boolean; issues: FgReconciliationIssue[]; lag: number }> => {
  const fg = container.resolve<FinishedGoodsModuleService>(
    FINISHED_GOODS_MODULE
  );
  const inventory = container.resolve<InventoryApi>(Modules.INVENTORY);
  const issues: FgReconciliationIssue[] = [];
  let lag = 0;

  const locations = await fg.listFgLocations({ is_commerce: true });
  const stockLocationByFg = new Map(
    locations.map((l) => [l.id, l.medusa_stock_location_id])
  );
  const balances = await fg.listFgBalances({}, { take: PAGE });
  const states = await fg.listCommerceSyncStates({}, { take: PAGE });
  const stateByKey = new Map(
    states.map((s) => [`${s.sku}|${s.location_id}`, s])
  );

  for (const balance of balances) {
    if (!stockLocationByFg.has(balance.location_id)) continue; // non-commerce location
    const state = stateByKey.get(`${balance.sku}|${balance.location_id}`);
    const expected = sellableOf(balance);
    if (
      !state ||
      Number(state.last_applied_version) < Number(balance.version)
    ) {
      lag += 1;
      issues.push({
        check: "PENDING_SYNC",
        sku: balance.sku,
        detail: {
          balance_version: balance.version,
          applied_version: state?.last_applied_version ?? 0,
        },
      });
      continue;
    }
    if (state.status === "UNMAPPED" || state.status === "ERROR") {
      issues.push({
        check: state.status === "ERROR" ? "SYNC_ERROR" : "UNMAPPED",
        sku: balance.sku,
        detail: { error: state.last_error },
      });
      continue;
    }
    const stockLocationId = stockLocationByFg.get(balance.location_id);
    const [item] = await inventory.listInventoryItems({ sku: balance.sku });
    if (!item || !stockLocationId) continue;
    const [level] = await inventory.listInventoryLevels({
      inventory_item_id: item.id,
      location_id: stockLocationId,
    });
    if (level && Number(level.stocked_quantity) !== expected) {
      issues.push({
        check: "DRIFT",
        sku: balance.sku,
        detail: { expected, medusa: Number(level.stocked_quantity) },
      });
    }
  }

  // Raw material must never be sellable inventory in Medusa.
  const materials = await container
    .resolve<MaterialInventoryModuleService>(MATERIAL_INVENTORY_MODULE)
    .listMaterials({}, { select: ["code"], take: PAGE });
  const codes = materials.map((m) => m.code);
  if (codes.length > 0) {
    const leaked = await inventory.listInventoryItems({ sku: codes });
    for (const item of leaked) {
      issues.push({
        check: "RAW_MATERIAL_LEAK",
        sku: item.sku ?? "",
        detail: { inventory_item_id: item.id },
      });
    }
  }
  // Lag is expected during normal operation; only real faults fail the check.
  return { ok: issues.every((i) => i.check === "PENDING_SYNC"), issues, lag };
};
