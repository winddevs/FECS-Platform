import { Modules } from "@medusajs/framework/utils";

import { FINISHED_GOODS_MODULE } from "../../modules/finishedGoods";
import type FinishedGoodsModuleService from "../../modules/finishedGoods/service";
import type {
  ProjectionEvent,
  ReceiveFgInput,
} from "../../modules/finishedGoods/service";
import { MANUFACTURING_MODULE } from "../../modules/manufacturing";
import type ManufacturingModuleService from "../../modules/manufacturing/service";
import type { PackedResult } from "../../modules/manufacturing/types";
import { MATERIAL_INVENTORY_MODULE } from "../../modules/materialInventory";
import type MaterialInventoryModuleService from "../../modules/materialInventory/service";
import { wrapStep, type Resolver } from "./wrap";

const fg = (c: Resolver) =>
  c.resolve<FinishedGoodsModuleService>(FINISHED_GOODS_MODULE);

export const receiveFinishedGoodsStep = wrapStep(
  "fg-receive",
  (i: ReceiveFgInput, c) => fg(c).receiveFinishedGoods(i)
);

type Cmd = {
  actor_id: string;
  correlation_id?: string | null;
  idempotency_key: string;
};

export const changeFgHoldStep = wrapStep(
  "fg-change-hold",
  (
    i: Cmd & {
      sku: string;
      location_id: string;
      qty: number;
      kind: "WAREHOUSE" | "QC";
      action: "HOLD" | "RELEASE";
      reason: string;
    },
    c
  ) => fg(c).changeHold(i)
);
export const adjustFgStep = wrapStep(
  "fg-adjust",
  (
    i: Cmd & {
      sku: string;
      location_id: string;
      direction: "PLUS" | "MINUS";
      qty: number;
      reason: string;
    },
    c
  ) => fg(c).adjustFinishedGoods(i)
);
export const setSafetyStockStep = wrapStep(
  "fg-safety-stock",
  (i: Cmd & { sku: string; location_id: string; safety_stock: number }, c) =>
    fg(c).setSafetyStock(i)
);
export const allocateFgStep = wrapStep(
  "fg-allocate",
  (
    i: Cmd & {
      order_id: string;
      sku: string;
      location_id: string;
      qty: number;
    },
    c
  ) => fg(c).allocateToOrder(i)
);
export const releaseFgAllocationStep = wrapStep(
  "fg-release-allocation",
  (i: Cmd & { allocation_id: string }, c) => fg(c).releaseAllocation(i)
);
export const shipFgStep = wrapStep(
  "fg-ship",
  (
    i: Cmd & {
      sku: string;
      location_id: string;
      qty: number;
      reference_type: string;
      reference_id: string;
      order_id?: string | null;
    },
    c
  ) => fg(c).shipFinishedGoods(i)
);
export const republishProjectionStep = wrapStep(
  "fg-republish-projection",
  (
    i: {
      actor_id: string;
      correlation_id?: string | null;
      sku?: string | null;
    },
    c
  ) => fg(c).republishProjection(i)
);

type ReceivePackedInput = {
  packed: PackedResult;
  location_id: string;
  actor_id: string;
  correlation_id?: string | null;
  idempotency_key: string;
};

/**
 * Only QC-released, packed output becomes finished goods (BR-003). Builds the
 * traceability block: MO -> BOM/routing versions -> fabric lots/rolls issued.
 */
export const receivePackedOutputStep = wrapStep(
  "fg-receive-packed-output",
  async (i: ReceivePackedInput, c) => {
    const mfg = c.resolve<ManufacturingModuleService>(MANUFACTURING_MODULE);
    const inv = c.resolve<MaterialInventoryModuleService>(
      MATERIAL_INVENTORY_MODULE
    );
    const [mo] = await mfg.listManufacturingOrders({ id: i.packed.mo_id });
    const [bundle] = await mfg.listBundles({ id: i.packed.bundle_id });
    const issued = await inv.listMaterialStockMovements({
      reference_type: "MO",
      reference_id: i.packed.mo_id,
      movement_type: "ISSUE_TO_PRODUCTION",
    });
    const lotIds = [...new Set(issued.map((m) => m.lot_id).filter(Boolean))];
    const rollIds = [...new Set(issued.map((m) => m.roll_id).filter(Boolean))];

    return await fg(c).receiveFinishedGoods({
      actor_id: i.actor_id,
      correlation_id: i.correlation_id,
      idempotency_key: `${i.idempotency_key}:fg`,
      sku: i.packed.sku,
      qty: i.packed.qty,
      location_id: i.location_id,
      source: "PRODUCTION",
      mo_id: i.packed.mo_id,
      production_batch_id: i.packed.batch_id,
      packing_record_id: i.packed.packing_record_id,
      allocate_to_order_id:
        mo?.order_type === "MTO" ? (mo.customer_order_id ?? null) : null,
      traceability: {
        mo_number: mo?.mo_number,
        bom_id: mo?.bom_id,
        bom_version: mo?.bom_version,
        routing_id: mo?.routing_id,
        routing_version: mo?.routing_version,
        bundle_code: bundle?.bundle_code,
        pack_no: i.packed.pack_no,
        material_lot_ids: lotIds,
        material_roll_ids: rollIds,
      },
    });
  }
);

/**
 * Pushes a sellable projection into Medusa's inventory level for that SKU,
 * guarded by the version table (FR-FG-006). Disabled unless
 * FG_SYNC_TO_MEDUSA_ENABLED=true.
 */
export const syncSellableToMedusaStep = wrapStep(
  "fg-sync-sellable-to-medusa",
  async (event: ProjectionEvent, c) => {
    if (process.env.FG_SYNC_TO_MEDUSA_ENABLED !== "true") {
      return { applied: false, reason: "DISABLED" };
    }
    const inventory = c.resolve<{
      listInventoryItems: (
        f: Record<string, unknown>
      ) => Promise<Array<{ id: string }>>;
      listInventoryLevels: (
        f: Record<string, unknown>
      ) => Promise<Array<{ id: string }>>;
      updateInventoryLevels: (
        u: Array<Record<string, unknown>>
      ) => Promise<unknown>;
      createInventoryLevels: (
        u: Array<Record<string, unknown>>
      ) => Promise<unknown>;
    }>(Modules.INVENTORY);

    return await fg(c).applyProjectionVersion(event, async () => {
      if (!event.medusa_stock_location_id) {
        return { status: "UNMAPPED" as const };
      }
      const [item] = await inventory.listInventoryItems({ sku: event.sku });
      if (!item) {
        return { status: "UNMAPPED" as const };
      }
      const key = {
        inventory_item_id: item.id,
        location_id: event.medusa_stock_location_id,
      };
      const [level] = await inventory.listInventoryLevels(key);
      if (level) {
        await inventory.updateInventoryLevels([
          { ...key, stocked_quantity: event.available_qty },
        ]);
      } else {
        await inventory.createInventoryLevels([
          { ...key, stocked_quantity: event.available_qty },
        ]);
      }
      return { status: "OK" as const };
    });
  }
);
