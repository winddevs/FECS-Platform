import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

import {
  paymentGate,
  processProductionRequest,
} from "../src/lib/mto/process-request";
import { productionStatusForOrder } from "../src/lib/mto/production-status";
import {
  packAndReceiveFinishedGoodsWorkflow,
  shipFinishedGoodsWorkflow,
  syncSellableToMedusaWorkflow,
} from "../src/workflows/finished-goods";
import {
  createBomWorkflow,
  createCutPlanWorkflow,
  completeCutWorkflow,
  createManufacturingOrderWorkflow,
  createRoutingWorkflow,
  executeOperationWorkflow,
  inspectBundleWorkflow,
  issueMaterialToMoWorkflow,
  releaseBomWorkflow,
  releaseManufacturingOrderWorkflow,
  releaseRoutingWorkflow,
  reserveMoMaterialsWorkflow,
} from "../src/workflows/manufacturing";

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok - ${msg}`);
};

/**
 * End-to-end MTS and MTO journeys across Manufacturing -> Quality -> Finished
 * Goods -> Medusa inventory -> shipment, plus order -> batch -> MO -> fabric
 * lot traceability (acceptance criteria 8, 9, 14, 16).
 */
export default async function test({ container }: ExecArgs) {
  const inv: any = container.resolve("materialInventory");
  const mfg: any = container.resolve("manufacturing");
  const fg: any = container.resolve("finishedGoods");
  const inventory: any = container.resolve(Modules.INVENTORY);
  const stockLocations: any = container.resolve(Modules.STOCK_LOCATION);
  const actor = { actor_id: "user_e2e", correlation_id: "cor_e2e" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;
  const style = `JKT-${run}`;
  const skuM = `${style}-M`;

  console.log("# factory setup");
  const fabric = await inv.createMaterials({
    code: `FAB-${run}`,
    name: "Denim",
    uom: "m",
    track_roll: true,
    track_dye_lot: true,
  });
  const rm = await inv.createMaterialLocations({
    code: `RM-${run}`,
    name: "RM",
    warehouse_code: "FAC",
  });
  const stockLoc = await stockLocations.createStockLocations({
    name: `HCM ${run}`,
  });
  const item = await inventory.createInventoryItems({ sku: skuM });
  const fgLoc = await fg.createFgLocations({
    code: `FG-${run}`,
    name: "HCM FG",
    warehouse_code: "HCM",
    medusa_stock_location_id: stockLoc.id,
  });
  const bom = await createBomWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("bom"),
      product_sku: style,
      lines: [
        { material_id: fabric.id, uom: "m", qty_per_unit: 2, waste_factor: 0 },
      ],
    },
  });
  await releaseBomWorkflow(container).run({
    input: { id: bom.result.id, ...actor },
  });
  const rt = await createRoutingWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("rt"),
      product_sku: style,
      operations: [
        {
          seq: 10,
          code: "SEW",
          name: "Sew",
          work_center_type: "SEWING",
          standard_minutes: 20,
        },
        {
          seq: 20,
          code: "QC",
          name: "Final QC",
          work_center_type: "QC",
          standard_minutes: 1,
          qc_gate: true,
        },
      ],
    },
  });
  await releaseRoutingWorkflow(container).run({
    input: { id: rt.result.id, ...actor },
  });
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("rcv"),
    material_id: fabric.id,
    location_id: rm.id,
    lot: { lot_no: `LOT-${run}`, dye_lot_no: "D1" },
    rolls: [{ roll_code: `R1-${run}`, qty: 30 }],
  });

  /** Drives one MO from released to packed+received FG. */
  const produce = async (moId: string, qtyOfSku: number, tag: string) => {
    const [batch] = await mfg.listProductionBatches({ mo_id: moId });
    await issueMaterialToMoWorkflow(container).run({
      input: {
        mo_id: moId,
        ...actor,
        material_id: fabric.id,
        qty: qtyOfSku * 2,
        idempotency_key: k(`iss-${tag}`),
      },
    });
    await createCutPlanWorkflow(container).run({
      input: {
        mo_id: moId,
        ...actor,
        batch_id: batch.id,
        fabric_material_id: fabric.id,
        lays: [
          {
            roll_code: `R1-${run}`,
            planned_consumption: qtyOfSku * 2,
            size_ratio: { [skuM]: qtyOfSku },
          },
        ],
      },
    });
    const cut = await completeCutWorkflow(container).run({
      input: {
        mo_id: moId,
        batch_id: batch.id,
        ...actor,
        idempotency_key: k(`cut-${tag}`),
        fabric_material_id: fabric.id,
        actual_consumption: qtyOfSku * 2,
        bundles: [{ sku: skuM, qty: qtyOfSku }],
      },
    });
    const bundle = cut.result.bundles[0];
    await executeOperationWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k(`op-${tag}`),
        bundle_id: bundle.id,
        op_seq: 10,
        input_qty: qtyOfSku,
        good_qty: qtyOfSku,
      },
    });
    await inspectBundleWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k(`qc-${tag}`),
        bundle_id: bundle.id,
        mo_id: moId,
        pass_qty: qtyOfSku,
      },
    });
    return bundle;
  };

  console.log("# MTS: produce -> pack -> FG -> sellable -> Medusa inventory");
  const mts = await createManufacturingOrderWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mo-mts"),
      order_type: "MTS",
      product_sku: style,
      lines: [{ sku: skuM, qty: 5 }],
    },
  });
  await reserveMoMaterialsWorkflow(container).run({
    input: { mo_id: mts.result.id, ...actor },
  });
  await releaseManufacturingOrderWorkflow(container).run({
    input: { mo_id: mts.result.id, ...actor },
  });
  const mtsBundle = await produce(mts.result.id, 5, "mts");
  const sellableBefore = (await fg.sellableFor([skuM]))[skuM] ?? 0;
  assert(
    sellableBefore === 0,
    "QC-released but NOT yet packed output is not sellable (BR-003)"
  );
  const mtsFg = await packAndReceiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("pack-mts"),
      bundle_id: mtsBundle.id,
      qty: 5,
      location_id: fgLoc.id,
    },
  });
  assert(
    mtsFg.result.finished_goods.sellable === 5,
    "packed output posted as finished goods and sellable"
  );
  const mtsMo = (await mfg.listManufacturingOrders({ id: mts.result.id }))[0];
  assert(
    mtsMo.status === "COMPLETED" && mtsMo.completed_qty === 5,
    "MO COMPLETED after the last pack"
  );
  const [balance] = await fg.listFgBalances({
    sku: skuM,
    location_id: fgLoc.id,
  });
  process.env.FG_SYNC_TO_MEDUSA_ENABLED = "true";
  const sync = await syncSellableToMedusaWorkflow(container).run({
    input: {
      sku: skuM,
      location_id: fgLoc.id,
      medusa_stock_location_id: stockLoc.id,
      available_qty: 5,
      source_version: balance.version,
    },
  });
  assert(
    sync.result.applied,
    "versioned projection applied to Medusa inventory"
  );
  const level = (
    await inventory.listInventoryLevels({
      inventory_item_id: item.id,
      location_id: stockLoc.id,
    })
  )[0];
  assert(
    Number(level.stocked_quantity) === 5,
    "Medusa shows the commerce-available quantity, not factory stock"
  );
  assert(
    (await inv.getUsableAvailability([fabric.id]))[fabric.id] === 20,
    "fabric stock (raw material) is untouched by FG and never in Medusa inventory"
  );

  console.log("# MTS order shipped -> traceability to MO and fabric lot");
  const orderId = `order_mts_${run}`;
  await shipFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("ship-mts"),
      sku: skuM,
      location_id: fgLoc.id,
      qty: 2,
      reference_type: "FULFILLMENT",
      reference_id: `ful_${run}`,
      order_id: orderId,
    },
  });
  const lines = await fg.listFgShipmentLines({ order_id: orderId });
  const batch = await fg.traceBatch(lines[0].batch_id);
  assert(batch.batch.mo_id === mts.result.id, "order -> FG batch -> MO");
  const fullBatch = (await fg.listFgBatches({ id: lines[0].batch_id }))[0];
  const lots = fullBatch.traceability.material_lot_ids;
  assert(
    lots.length === 1 &&
      (await inv.listMaterialLots({ id: lots[0] }))[0].lot_no === `LOT-${run}`,
    "FG batch -> issued fabric lot (full chain order->batch->MO->lot)"
  );

  console.log(
    "# MTO: request -> wait for material -> produce -> allocated to the order"
  );
  const mtoOrder = `order_mto_${run}`;
  assert(
    paymentGate({ MTO_PAYMENT_GATE: "authorized" } as any) === "authorized" &&
      paymentGate({} as any) === "captured",
    "payment gate defaults to captured funds"
  );
  const first = await mfg.enqueueProductionRequests({
    order_id: mtoOrder,
    ...actor,
    payment_confirmed: true,
    lines: [
      { order_line_id: `line_${run}`, sku: skuM, product_sku: style, qty: 12 },
    ],
  });
  const replay = await mfg.enqueueProductionRequests({
    order_id: mtoOrder,
    ...actor,
    payment_confirmed: true,
    lines: [
      { order_line_id: `line_${run}`, sku: skuM, product_sku: style, qty: 12 },
    ],
  });
  assert(
    first.created === 1 && replay.created === 0,
    "replayed order.placed creates no duplicate production"
  );
  const claimed = (await mfg.claimDueProductionRequests(20)).filter(
    (r: any) => r.order_id === mtoOrder
  );
  assert(claimed.length === 1, "request claimed by a worker");
  const waiting = await processProductionRequest(container, claimed[0]);
  assert(
    waiting.outcome === "WAITING_MATERIAL",
    `not enough fabric (needs 24m, 20m left) -> WAITING_MATERIAL`
  );
  const [req1] = await mfg.listProductionRequests({ order_id: mtoOrder });
  assert(
    req1.status === "WAITING_MATERIAL" && req1.mo_id,
    "request parked with its MO created"
  );
  assert(
    (await productionStatusForOrder({ mfg, fg }, mtoOrder))?.status ===
      "PREPARING_PRODUCTION",
    "customer sees PREPARING_PRODUCTION"
  );
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("rcv2"),
    material_id: fabric.id,
    location_id: rm.id,
    lot: { lot_no: `LOT2-${run}`, dye_lot_no: "D1" },
    rolls: [{ roll_code: `R2-${run}`, qty: 30 }],
  });
  const resumed = await processProductionRequest(container, {
    ...req1,
    qty: Number(req1.qty),
    attempts: Number(req1.attempts),
    payment_confirmed: true,
  });
  assert(
    resumed.outcome === "RELEASED",
    "material arrives -> reserved and MO released"
  );
  const mtoMo = (
    await mfg.listManufacturingOrders({ customer_order_id: mtoOrder })
  )[0];
  assert(
    mtoMo.order_type === "MTO" && mtoMo.status === "RELEASED",
    "MTO MO released and linked to the order"
  );
  assert(
    (await productionStatusForOrder({ mfg, fg }, mtoOrder))?.status ===
      "IN_PRODUCTION",
    "customer sees IN_PRODUCTION"
  );

  const mtoBundle = await produce(mtoMo.id, 12, "mto");
  assert(
    (await productionStatusForOrder({ mfg, fg }, mtoOrder))?.status ===
      "PREPARING_SHIPMENT",
    "QC passed, awaiting packing -> PREPARING_SHIPMENT"
  );
  const sellableMts = (await fg.sellableFor([skuM]))[skuM];
  await packAndReceiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("pack-mto"),
      bundle_id: mtoBundle.id,
      qty: 12,
      location_id: fgLoc.id,
    },
  });
  assert(
    (await fg.sellableFor([skuM]))[skuM] === sellableMts,
    "MTO output allocated to the order never enters general availability"
  );
  const alloc = await fg.listFgAllocations({ order_id: mtoOrder });
  assert(
    alloc.length === 1 && alloc[0].qty === 12,
    "FG allocated directly to the customer order"
  );
  assert(
    (await productionStatusForOrder({ mfg, fg }, mtoOrder))?.status ===
      "READY_TO_SHIP",
    "customer sees READY_TO_SHIP"
  );
  const shipMto = await shipFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("ship-mto"),
      sku: skuM,
      location_id: fgLoc.id,
      qty: 12,
      reference_type: "FULFILLMENT",
      reference_id: `ful_mto_${run}`,
      order_id: mtoOrder,
    },
  });
  assert(
    shipMto.result.from_allocation === 12,
    "shipment consumes the allocation"
  );
  const mtoLines = await fg.listFgShipmentLines({ order_id: mtoOrder });
  assert(
    (await fg.listFgBatches({ id: mtoLines[0].batch_id }))[0].mo_id ===
      mtoMo.id,
    "MTO order traces back to its own batch and MO"
  );

  console.log("# invariants");
  assert((await fg.reconcile()).ok, "FG ledger reconciles");
  assert((await inv.reconcile()).ok, "material ledger reconciles");
  console.log("INTEGRATION TEST PASSED");
}
