import type { ExecArgs } from "@medusajs/framework/types";

import {
  grossToNet,
  produceSuggestions,
} from "../src/modules/manufacturing/lib/mrp";
import { packAndReceiveFinishedGoodsWorkflow } from "../src/workflows/finished-goods";
import {
  completeCutWorkflow,
  createBomWorkflow,
  createCutPlanWorkflow,
  createManufacturingOrderWorkflow,
  createRoutingWorkflow,
  createWorkCenterWorkflow,
  executeOperationWorkflow,
  inspectBundleWorkflow,
  issueMaterialToMoWorkflow,
  releaseBomWorkflow,
  releaseManufacturingOrderWorkflow,
  releaseRoutingWorkflow,
  reserveMoMaterialsWorkflow,
  returnReworkWorkflow,
  runMrpWorkflow,
  setPlanningParamWorkflow,
  setSkuPlanningParamWorkflow,
  shortCloseManufacturingOrderWorkflow,
} from "../src/workflows/manufacturing";

/**
 * Manufacturing and MRP behavior that the first suites did not exercise:
 * order types (FR-MFG-001), routing freeze (FR-MFG-002), multi-batch release
 * (FR-MFG-005), cut plan validation (FR-MFG-006), work centers (FR-MFG-010),
 * partial completion and short-close (FR-MFG-014) and every MRP suggestion
 * type (FR-MRP-004/005).
 */
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${msg}`);
  }
  console.log(`  ok - ${msg}`);
};
const expectFail = async (
  fn: () => Promise<unknown>,
  needle: string,
  msg: string
) => {
  try {
    await fn();
  } catch (e: any) {
    const text = `${e.code ?? ""} ${e.message}`;
    assert(
      text.includes(needle),
      `${msg} (got: ${e.code ?? ""} ${String(e.message).slice(0, 120)})`
    );
    return;
  }
  throw new Error(`ASSERT FAILED: expected failure "${needle}": ${msg}`);
};

export default async function verify({ container }: ExecArgs) {
  const inv: any = container.resolve("materialInventory");
  const mfg: any = container.resolve("manufacturing");
  const fg: any = container.resolve("finishedGoods");
  const proc: any = container.resolve("procurement");
  const pg = container.resolve("__pg_connection__") as any;
  const actor = { actor_id: "user_mfg_gap", correlation_id: "cor_mfg_gap" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;
  const style = `GAP-${run}`;
  const sku = `${style}-M`;

  console.log("# setup");
  const fabric = await inv.createMaterials({
    code: `GF-${run}`,
    name: "Gap fabric",
    uom: "m",
    track_roll: true,
    track_dye_lot: false,
    allocation_policy: "FIFO",
  });
  const store = await inv.createMaterialLocations({
    code: `GST-${run}`,
    name: "Store A",
    warehouse_code: `GA-${run}`,
  });
  const storeB = await inv.createMaterialLocations({
    code: `GSB-${run}`,
    name: "Store B",
    warehouse_code: `GB-${run}`,
  });
  const receiveRolls = (tag: string, rolls: Array<[string, number]>) =>
    inv.receiveMaterial({
      ...actor,
      idempotency_key: k(`rcv-${tag}`),
      material_id: fabric.id,
      location_id: store.id,
      lot: { lot_no: `L-${tag}` },
      rolls: rolls.map(([code, qty]) => ({
        roll_code: `${code}-${run}`,
        qty,
      })),
    });
  const bom = await createBomWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("bom"),
      product_sku: style,
      lines: [
        { material_id: fabric.id, uom: "m", qty_per_unit: 1, waste_factor: 0 },
      ],
    },
  });
  await releaseBomWorkflow(container).run({
    input: { id: bom.result.id, ...actor },
  });
  const routingInput = (key: string, minutes: number) => ({
    ...actor,
    idempotency_key: k(key),
    product_sku: style,
    operations: [
      {
        seq: 10,
        code: "SEW",
        name: "Sew",
        work_center_type: "SEWING",
        standard_minutes: minutes,
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
  });
  const routing1 = await createRoutingWorkflow(container).run({
    input: routingInput("rt1", 10),
  });
  await releaseRoutingWorkflow(container).run({
    input: { id: routing1.result.id, ...actor },
  });

  console.log(
    "# FR-MFG-002: released routing is immutable and frozen on the MO"
  );
  const ops = await mfg.listRoutingOperations({
    routing_id: routing1.result.id,
  });
  await expectFail(
    () => mfg.updateRoutingOperations({ id: ops[0].id, standard_minutes: 99 }),
    "immutable",
    "a released routing operation cannot be edited"
  );
  const first = await createManufacturingOrderWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mo-first"),
      order_type: "MTS",
      product_sku: style,
      lines: [{ sku, qty: 1 }],
    },
  });
  assert(
    first.result.routing_version === 1 &&
      first.result.routing_id === routing1.result.id,
    "the MO froze routing v1"
  );
  const routing2 = await createRoutingWorkflow(container).run({
    input: routingInput("rt2", 12),
  });
  await releaseRoutingWorkflow(container).run({
    input: { id: routing2.result.id, ...actor },
  });
  const frozen = (
    await mfg.listManufacturingOrders({ id: first.result.id })
  )[0];
  assert(
    frozen.routing_version === 1 && frozen.routing_id === routing1.result.id,
    "releasing routing v2 does not change an existing MO"
  );

  console.log("# FR-MFG-001: every order type has its own rules");
  const make = (type: string, extra: Record<string, unknown> = {}) =>
    createManufacturingOrderWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k(`mo-${type}-${Math.random()}`),
        order_type: type,
        product_sku: style,
        lines: [{ sku, qty: 2 }],
        ...extra,
      } as any,
    });
  await expectFail(
    () => make("MTS", { customer_order_id: "order_x" }),
    "cannot be tied to a customer order",
    "a make-to-stock order cannot belong to a customer order"
  );
  await expectFail(
    () => make("REWORK"),
    "needs source_mo_id",
    "a rework order must name the order it repairs"
  );
  await expectFail(
    () => make("REWORK", { source_mo_id: first.result.id }),
    "needs output to repair",
    "rework of an order that produced nothing is refused"
  );
  await expectFail(
    () => make("SAMPLE", { source_mo_id: first.result.id }),
    "only for REWORK",
    "only rework orders have a source order"
  );
  const replenishment = await make("REPLENISHMENT");
  const sample = await make("SAMPLE");
  assert(
    replenishment.result.status === "PLANNED" &&
      sample.result.status === "PLANNED",
    "replenishment and sample orders are created like stock orders"
  );

  console.log(
    "# FR-MFG-010: work centers must be available and of the right type"
  );
  const sewing = await createWorkCenterWorkflow(container).run({
    input: {
      code: `WCS-${run}`,
      name: "Sewing",
      type: "SEWING",
      capacity_minutes_per_day: 60,
      efficiency_pct: 50,
    },
  });
  const finishing = await createWorkCenterWorkflow(container).run({
    input: {
      code: `WCF-${run}`,
      name: "Finishing",
      type: "FINISH",
      capacity_minutes_per_day: 480,
      efficiency_pct: 85,
    },
  });
  const broken = await createWorkCenterWorkflow(container).run({
    input: {
      code: `WCB-${run}`,
      name: "Broken line",
      type: "SEWING",
      capacity_minutes_per_day: 480,
      efficiency_pct: 85,
    },
  });
  await mfg.updateWorkCenters({ id: broken.result.id, is_active: false });

  // One MO in three batches of rolls, used for cut-plan and work-center checks.
  await receiveRolls("a", [
    ["A1", 40],
    ["A2", 20],
  ]);
  const batchMo = await make("MTS", { lines: [{ sku, qty: 60 }] });
  await reserveMoMaterialsWorkflow(container).run({
    input: { mo_id: batchMo.result.id, ...actor },
  });
  const released = await releaseManufacturingOrderWorkflow(container).run({
    input: {
      mo_id: batchMo.result.id,
      ...actor,
      batches: [{ planned_qty: 40 }, { planned_qty: 20 }],
    },
  });
  assert(
    released.result.batches.length === 2 &&
      released.result.batches[0].batch_no.endsWith("-B1") &&
      released.result.batches[1].batch_no.endsWith("-B2"),
    "FR-MFG-005: the MO is split into two production batches"
  );
  await issueMaterialToMoWorkflow(container).run({
    input: {
      mo_id: batchMo.result.id,
      ...actor,
      material_id: fabric.id,
      qty: 60,
      idempotency_key: k("iss-batch"),
    },
  });

  console.log("# FR-MFG-006: a cut plan only uses rolls reserved for the MO");
  const [b1, b2] = released.result.batches;
  const otherFabric = await inv.createMaterials({
    code: `OF-${run}`,
    name: "Other fabric",
    uom: "m",
    track_roll: true,
  });
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("rcv-foreign"),
    material_id: otherFabric.id,
    location_id: store.id,
    lot: { lot_no: "LF" },
    rolls: [{ roll_code: `FOREIGN-${run}`, qty: 50 }],
  });
  await expectFail(
    () =>
      createCutPlanWorkflow(container).run({
        input: {
          mo_id: batchMo.result.id,
          ...actor,
          batch_id: b1.id,
          fabric_material_id: fabric.id,
          lays: [
            {
              roll_code: `FOREIGN-${run}`,
              planned_consumption: 10,
              size_ratio: { [sku]: 10 },
            },
          ],
        },
      }),
    "ROLL_NOT_ASSIGNED",
    "a roll that was not reserved for this MO is refused"
  );
  await expectFail(
    () =>
      createCutPlanWorkflow(container).run({
        input: {
          mo_id: batchMo.result.id,
          ...actor,
          batch_id: b1.id,
          fabric_material_id: fabric.id,
          lays: [
            {
              roll_code: `A2-${run}`,
              planned_consumption: 25,
              size_ratio: { [sku]: 25 },
            },
          ],
        },
      }),
    "LAY_EXCEEDS_ROLL",
    "a lay cannot plan to cut more than its roll holds"
  );
  const plan = (batchId: string, roll: string, qty: number) =>
    createCutPlanWorkflow(container).run({
      input: {
        mo_id: batchMo.result.id,
        ...actor,
        batch_id: batchId,
        fabric_material_id: fabric.id,
        lays: [
          {
            roll_code: `${roll}-${run}`,
            planned_consumption: qty,
            size_ratio: { [sku]: qty },
          },
        ],
      },
    });
  await plan(b1.id, "A1", 40);
  await plan(b2.id, "A2", 20);

  console.log(
    "# FR-MFG-005: cutting several batches reconciles fabric once at the end"
  );
  const cut1 = await completeCutWorkflow(container).run({
    input: {
      mo_id: batchMo.result.id,
      batch_id: b1.id,
      ...actor,
      idempotency_key: k("cut-b1"),
      fabric_material_id: fabric.id,
      actual_consumption: 40,
      bundles: [{ sku, qty: 40 }],
    },
  });
  assert(
    cut1.result.reconciliation.within_tolerance &&
      cut1.result.reconciliation.variance === 0,
    "the first batch is not judged against the whole MO's issue"
  );
  const cut2 = await completeCutWorkflow(container).run({
    input: {
      mo_id: batchMo.result.id,
      batch_id: b2.id,
      ...actor,
      idempotency_key: k("cut-b2"),
      fabric_material_id: fabric.id,
      actual_consumption: 20,
      bundles: [{ sku, qty: 20 }],
    },
  });
  assert(
    cut2.result.reconciliation.within_tolerance &&
      cut2.result.reconciliation.issued === 60 &&
      cut2.result.reconciliation.explained === 60,
    "the last batch reconciles 60 issued against 60 consumed"
  );
  assert(
    cut1.result.bundles[0].bundle_code !== cut2.result.bundles[0].bundle_code,
    "each batch has its own bundle codes"
  );

  const exec = (bundleId: string, tag: string, over: Record<string, unknown>) =>
    executeOperationWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k(`op-${tag}`),
        bundle_id: bundleId,
        op_seq: 10,
        ...over,
      } as any,
    });
  await expectFail(
    () =>
      exec(cut1.result.bundles[0].id, "bad-wc-1", {
        input_qty: 10,
        good_qty: 10,
        work_center_id: broken.result.id,
      }),
    "WORK_CENTER_UNAVAILABLE",
    "an inactive work center cannot report work"
  );
  await expectFail(
    () =>
      exec(cut1.result.bundles[0].id, "bad-wc-2", {
        input_qty: 10,
        good_qty: 10,
        work_center_id: finishing.result.id,
      }),
    "WORK_CENTER_TYPE_MISMATCH",
    "a finishing center cannot report a sewing operation"
  );
  await exec(cut1.result.bundles[0].id, "wc-ok", {
    input_qty: 40,
    good_qty: 40,
    work_center_id: sewing.result.id,
  });
  const loads = await mfg.workCenterLoad(new Date());
  const sewingLoad = loads.find((l: any) => l.id === sewing.result.id);
  assert(
    sewingLoad.effective_capacity_minutes === 30 &&
      sewingLoad.load_minutes === 480 &&
      sewingLoad.over_capacity === true &&
      sewingLoad.available_minutes === 0,
    "an overloaded work center is flagged with its remaining capacity"
  );
  const brokenLoad = loads.find((l: any) => l.id === broken.result.id);
  assert(
    brokenLoad.is_active === false && brokenLoad.over_capacity === false,
    "an inactive center reports itself unavailable, not overloaded"
  );

  console.log(
    "# FR-MFG-014: partial completion while rework is open, then short-close"
  );
  await receiveRolls("rw", [
    ["R1", 10],
    ["R2", 10],
  ]);
  const rework = await make("MTS", { lines: [{ sku, qty: 20 }] });
  await reserveMoMaterialsWorkflow(container).run({
    input: { mo_id: rework.result.id, ...actor },
  });
  const relRework = await releaseManufacturingOrderWorkflow(container).run({
    input: { mo_id: rework.result.id, ...actor },
  });
  await issueMaterialToMoWorkflow(container).run({
    input: {
      mo_id: rework.result.id,
      ...actor,
      material_id: fabric.id,
      qty: 20,
      idempotency_key: k("iss-rw"),
    },
  });
  await createCutPlanWorkflow(container).run({
    input: {
      mo_id: rework.result.id,
      ...actor,
      batch_id: relRework.result.batches[0].id,
      fabric_material_id: fabric.id,
      lays: [
        {
          roll_code: `R1-${run}`,
          planned_consumption: 10,
          size_ratio: { [sku]: 10 },
        },
        {
          roll_code: `R2-${run}`,
          planned_consumption: 10,
          size_ratio: { [sku]: 10 },
        },
      ],
    },
  });
  const cutRework = await completeCutWorkflow(container).run({
    input: {
      mo_id: rework.result.id,
      batch_id: relRework.result.batches[0].id,
      ...actor,
      idempotency_key: k("cut-rw"),
      fabric_material_id: fabric.id,
      actual_consumption: 20,
      bundles: [
        { sku, qty: 10 },
        { sku, qty: 10 },
      ],
    },
  });
  const [good, bad] = cutRework.result.bundles;
  await exec(good.id, "rw-good", { input_qty: 10, good_qty: 10 });
  await inspectBundleWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("qc-rw-good"),
      bundle_id: good.id,
      mo_id: rework.result.id,
      pass_qty: 10,
    },
  });
  const location = await fg.createFgLocations({
    code: `GFG-${run}`,
    name: "Sellable",
    warehouse_code: "HCM",
    is_commerce: true,
  });
  await packAndReceiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("pack-rw-good"),
      bundle_id: good.id,
      qty: 10,
      location_id: location.id,
    },
  });
  await exec(bad.id, "rw-bad", { input_qty: 10, good_qty: 0, rework_qty: 10 });
  const open = (await mfg.listManufacturingOrders({ id: rework.result.id }))[0];
  assert(
    open.status === "PARTIALLY_COMPLETED" && open.completed_qty === 10,
    "10 of 20 packed while 10 pieces wait for rework: PARTIALLY_COMPLETED"
  );
  await expectFail(
    () =>
      shortCloseManufacturingOrderWorkflow(container).run({
        input: { mo_id: rework.result.id, ...actor, reason: "give up" },
      }),
    "REWORK_OPEN",
    "an order with rework still open cannot be short-closed"
  );
  await returnReworkWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("rw-scrap"),
      bundle_id: bad.id,
      good_qty: 0,
      scrap_qty: 10,
    },
  });
  const closed = await shortCloseManufacturingOrderWorkflow(container).run({
    input: {
      mo_id: rework.result.id,
      ...actor,
      reason: "10 pieces scrapped after failed rework",
    },
  });
  assert(
    closed.result.status === "COMPLETED" &&
      closed.result.short_closed &&
      closed.result.shortfall === 10,
    "once the rework is scrapped the order is short-closed with a shortfall of 10"
  );
  const exceptions = await mfg.listManufacturingExceptions({
    mo_id: rework.result.id,
    type: "SHORT_CLOSED",
  });
  assert(exceptions.length === 1, "the short-close is recorded for review");
  await expectFail(
    () =>
      shortCloseManufacturingOrderWorkflow(container).run({
        input: { mo_id: replenishment.result.id, ...actor, reason: "x" },
      }),
    "PARTIALLY_COMPLETED",
    "only a partially completed order can be short-closed"
  );

  console.log("# FR-MFG-001: sample output never becomes sellable");
  const sampleLocation = await fg.createFgLocations({
    code: `GSMP-${run}`,
    name: "Showroom",
    warehouse_code: "HCM",
    is_commerce: false,
  });
  await receiveRolls("smp", [["S1", 4]]);
  const smp = await make("SAMPLE", { lines: [{ sku, qty: 2 }] });
  await reserveMoMaterialsWorkflow(container).run({
    input: { mo_id: smp.result.id, ...actor },
  });
  const smpRel = await releaseManufacturingOrderWorkflow(container).run({
    input: { mo_id: smp.result.id, ...actor },
  });
  await issueMaterialToMoWorkflow(container).run({
    input: {
      mo_id: smp.result.id,
      ...actor,
      material_id: fabric.id,
      qty: 2,
      idempotency_key: k("iss-smp"),
    },
  });
  await createCutPlanWorkflow(container).run({
    input: {
      mo_id: smp.result.id,
      ...actor,
      batch_id: smpRel.result.batches[0].id,
      fabric_material_id: fabric.id,
      lays: [
        {
          roll_code: `S1-${run}`,
          planned_consumption: 2,
          size_ratio: { [sku]: 2 },
        },
      ],
    },
  });
  const smpCut = await completeCutWorkflow(container).run({
    input: {
      mo_id: smp.result.id,
      batch_id: smpRel.result.batches[0].id,
      ...actor,
      idempotency_key: k("cut-smp"),
      fabric_material_id: fabric.id,
      actual_consumption: 2,
      bundles: [{ sku, qty: 2 }],
    },
  });
  const smpBundle = smpCut.result.bundles[0];
  await exec(smpBundle.id, "smp", { input_qty: 2, good_qty: 2 });
  await inspectBundleWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("qc-smp"),
      bundle_id: smpBundle.id,
      mo_id: smp.result.id,
      pass_qty: 2,
    },
  });
  await expectFail(
    () =>
      packAndReceiveFinishedGoodsWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("pack-smp-bad"),
          bundle_id: smpBundle.id,
          qty: 2,
          location_id: location.id,
        },
      }),
    "SAMPLE_NOT_SELLABLE",
    "sample output cannot be received into a sellable location"
  );
  const stillUnpacked = (await mfg.listBundles({ id: smpBundle.id }))[0];
  assert(
    stillUnpacked.packed_qty === 0,
    "and the refusal happens before anything is packed"
  );
  const sellableBefore = (await fg.sellableFor([sku]))[sku] ?? 0;
  const packedSample = await packAndReceiveFinishedGoodsWorkflow(container).run(
    {
      input: {
        ...actor,
        idempotency_key: k("pack-smp"),
        bundle_id: smpBundle.id,
        qty: 2,
        location_id: sampleLocation.id,
      },
    }
  );
  assert(
    packedSample.result.finished_goods.batch_id &&
      ((await fg.sellableFor([sku]))[sku] ?? 0) === sellableBefore,
    "into a showroom location it is received but adds nothing to sellable stock"
  );

  console.log("# FR-MRP-004/005: every suggestion type");
  // Pure rules first.
  const base = {
    gross: 30,
    available: 0,
    incoming: 0,
    safety_stock: 0,
    mo_ids: [] as string[],
  };
  const incomingCovers = grossToNet([
    { ...base, material_id: "m1", incoming: 30 },
  ]);
  assert(
    incomingCovers.length === 0,
    "confirmed incoming that covers the demand removes the shortage"
  );
  const partlyCovered = grossToNet([
    { ...base, material_id: "m1", incoming: 20 },
  ]);
  assert(
    partlyCovered[0]?.type === "PURCHASE" &&
      partlyCovered[0].suggested_qty === 10,
    "incoming 20 of 30 leaves a PURCHASE of 10"
  );
  const withBuffer = grossToNet([
    { ...base, material_id: "m1", gross: 0, available: 5, safety_stock: 10 },
  ]);
  assert(
    withBuffer[0]?.type === "PURCHASE" && withBuffer[0].suggested_qty === 5,
    "the safety buffer is topped up: 10 wanted, 5 on hand, buy 5"
  );
  const transfer = grossToNet(
    [
      {
        ...base,
        material_id: "m1",
        available: 100,
        available_by_warehouse: { HCM: 0, HN: 100 },
      },
    ],
    { demand_warehouse: "HCM" }
  );
  assert(
    transfer.length === 1 &&
      transfer[0].type === "TRANSFER" &&
      transfer[0].suggested_qty === 30,
    "stock in another warehouse yields TRANSFER, not PURCHASE"
  );
  const now = new Date("2026-10-10T00:00:00Z");
  const late = grossToNet(
    [
      {
        ...base,
        material_id: "m1",
        incoming: 30,
        earliest_due: new Date("2026-10-20T00:00:00Z"),
        incoming_orders: [
          {
            purchase_order_id: "po1",
            po_number: "PO-1",
            qty: 30,
            expected_at: new Date("2026-10-30T00:00:00Z"),
          },
        ],
      },
    ],
    { now }
  );
  assert(
    late.length === 1 &&
      late[0].type === "RESCHEDULE" &&
      late[0].detail?.reason === "AFTER_NEEDED_BY",
    "a PO that arrives after the MO is due yields RESCHEDULE"
  );
  const overdue = grossToNet(
    [
      {
        ...base,
        material_id: "m1",
        incoming: 30,
        incoming_orders: [
          {
            purchase_order_id: "po2",
            po_number: "PO-2",
            qty: 30,
            expected_at: new Date("2026-10-01T00:00:00Z"),
          },
        ],
      },
    ],
    { now }
  );
  assert(
    overdue[0]?.type === "RESCHEDULE" &&
      overdue[0].detail?.reason === "OVERDUE",
    "a PO whose date has passed yields RESCHEDULE (overdue)"
  );
  const produce = produceSuggestions([
    {
      sku: "s",
      sellable: 10,
      open_production: 0,
      reorder_point: 50,
      reorder_qty: 20,
    },
    {
      sku: "t",
      sellable: 10,
      open_production: 45,
      reorder_point: 50,
      reorder_qty: 20,
    },
  ]);
  assert(
    produce.length === 1 && produce[0].suggested_qty === 40,
    "PRODUCE tops finished stock up to the reorder point, ignoring SKUs already covered by open production"
  );

  // End to end through the workflow, with real stock, POs and finished goods.
  const mrpFabric = await inv.createMaterials({
    code: `MF-${run}`,
    name: "MRP fabric",
    uom: "m",
    track_roll: false,
  });
  const wh = await inv.createMaterialLocations({
    code: `MSTA-${run}`,
    name: "A",
    warehouse_code: `MA-${run}`,
  });
  const wh2 = await inv.createMaterialLocations({
    code: `MSTB-${run}`,
    name: "B",
    warehouse_code: `MB-${run}`,
  });
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("mrp-rcv-b"),
    material_id: mrpFabric.id,
    location_id: wh2.id,
    lot: { lot_no: "MB1" },
    qty: 100,
  });
  void wh;
  const mrpStyle = `MRPSTYLE-${run}`;
  const mrpBom = await createBomWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mrp-bom"),
      product_sku: mrpStyle,
      lines: [
        {
          material_id: mrpFabric.id,
          uom: "m",
          qty_per_unit: 3,
          waste_factor: 0,
        },
      ],
    },
  });
  await releaseBomWorkflow(container).run({
    input: { id: mrpBom.result.id, ...actor },
  });
  const mrpRouting = await createRoutingWorkflow(container).run({
    input: { ...routingInput("mrp-rt", 5), product_sku: mrpStyle },
  });
  await releaseRoutingWorkflow(container).run({
    input: { id: mrpRouting.result.id, ...actor },
  });
  await createManufacturingOrderWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mrp-mo"),
      order_type: "MTS",
      product_sku: mrpStyle,
      lines: [{ sku: `${mrpStyle}-M`, qty: 10 }],
      due_date: new Date(Date.now() + 5 * 24 * 3600e3),
    },
  });
  const supplier = await proc.createSuppliers({
    code: `MSUP-${run}`,
    name: "MRP supplier",
  });
  const lateOrder = await proc.createPurchaseOrderWithLines({
    ...actor,
    idempotency_key: k("mrp-po"),
    supplier_id: supplier.id,
    expected_at: new Date(Date.now() - 2 * 24 * 3600e3),
    lines: [{ material_id: mrpFabric.id, uom: "m", ordered_qty: 50 }],
  });
  for (const action of ["approve", "send"]) {
    await proc.transitionPurchaseOrder({
      ...actor,
      purchase_order_id: lateOrder.purchase_order.id,
      action,
    });
  }
  await setPlanningParamWorkflow(container).run({
    input: { material_id: mrpFabric.id, safety_stock: 0, lead_time_days: 7 },
  });
  const reorderSku = `${style}-REORDER`;
  await setSkuPlanningParamWorkflow(container).run({
    input: { sku: reorderSku, reorder_point: 50, reorder_qty: 20 },
  });
  const mrp = await runMrpWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mrp-run"),
      demand_warehouse: `MA-${run}`,
    },
  });
  const mine = mrp.result.suggestions.filter(
    (s: any) => s.material_id === mrpFabric.id || s.sku === reorderSku
  );
  const typesOf = (id: string) =>
    mine
      .filter((s: any) => s.material_id === id)
      .map((s: any) => s.type)
      .sort();
  assert(
    typesOf(mrpFabric.id).join() === "RESCHEDULE,TRANSFER",
    `workflow: stock in warehouse B yields TRANSFER and the overdue PO yields RESCHEDULE, no PURCHASE (got ${typesOf(mrpFabric.id)})`
  );
  const transferRow = mine.find((s: any) => s.type === "TRANSFER");
  assert(
    transferRow.suggested_qty === 30 &&
      transferRow.detail.from[0].warehouse === `MB-${run}`,
    "the transfer says how much to move and from where"
  );
  const produceRow = mine.find((s: any) => s.sku === reorderSku);
  assert(
    produceRow?.type === "PRODUCE" && produceRow.suggested_qty === 50,
    "a SKU with no stock and nothing in production gets a PRODUCE for the full reorder point"
  );
  const stored = await mfg.listMrpSuggestions({ run_id: mrp.result.id });
  assert(
    stored.length === mrp.result.suggestions.length &&
      stored.some((s: any) => s.type === "PRODUCE" && s.material_id === null),
    "suggestions are stored, PRODUCE ones without a material"
  );
  assert(
    (await proc.listPurchaseOrders({})).every(
      (po: any) => po.created_by !== "mrp"
    ),
    "MRP still creates no purchase order"
  );
  void pg;
  console.log("INTEGRATION TEST PASSED");
}
