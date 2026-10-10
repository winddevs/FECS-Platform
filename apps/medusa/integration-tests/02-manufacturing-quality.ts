import { ExecArgs } from "@medusajs/framework/types";

import {
  cancelManufacturingOrderWorkflow,
  completeCutWorkflow,
  createBomWorkflow,
  createCutPlanWorkflow,
  createManufacturingOrderWorkflow,
  createRoutingWorkflow,
  createWorkCenterWorkflow,
  decideMrpSuggestionWorkflow,
  executeOperationWorkflow,
  inspectBundleWorkflow,
  issueMaterialToMoWorkflow,
  packBundleOnlyWorkflow,
  releaseBomWorkflow,
  releaseManufacturingOrderWorkflow,
  releaseRoutingWorkflow,
  reserveMoMaterialsWorkflow,
  returnReworkWorkflow,
  runMrpWorkflow,
  setPlanningParamWorkflow,
  checkMaterialWorkflow,
} from "../src/workflows/manufacturing";

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
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
  const actor = { actor_id: "user_planner", correlation_id: "cor_p2" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;
  const style = `TSHIRT-${run}`;
  const skuM = `${style}-M`;
  const skuL = `${style}-L`;

  console.log("# setup stock");
  const fabric = await inv.createMaterials({
    code: `FAB-${run}`,
    name: "Cotton",
    uom: "m",
    track_roll: true,
    track_dye_lot: true,
  });
  const button = await inv.createMaterials({
    code: `BTN-${run}`,
    name: "Button",
    uom: "pcs",
    track_roll: false,
  });
  const loc = await inv.createMaterialLocations({
    code: `RM-${run}`,
    name: "RM",
    warehouse_code: "HCM",
  });
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("rcv-btn"),
    material_id: button.id,
    location_id: loc.id,
    lot: { lot_no: "B1" },
    qty: 1000,
  });

  console.log("# BOM / routing versioning");
  const bom1 = await createBomWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("bom1"),
      product_sku: style,
      lines: [
        {
          material_id: fabric.id,
          uom: "m",
          qty_per_unit: 1.5,
          waste_factor: 0.05,
        },
        {
          material_id: button.id,
          uom: "pcs",
          qty_per_unit: 4,
          waste_factor: 0,
        },
      ],
    },
  });
  assert(bom1.result.version === 1, "BOM v1 drafted");
  await releaseBomWorkflow(container).run({
    input: { id: bom1.result.id, ...actor },
  });
  const lines = await mfg.listBomLines({ bom_id: bom1.result.id });
  await expectFail(
    () => mfg.updateBomLines({ id: lines[0].id, qty_per_unit: 9 }),
    "immutable",
    "released BOM line cannot be edited (DB trigger)"
  );
  await expectFail(
    () =>
      mfg.createBomLines({
        bom_id: bom1.result.id,
        line_no: 9,
        material_id: fabric.id,
        uom: "m",
        qty_per_unit: 1,
      }),
    "immutable",
    "released BOM cannot get new lines"
  );
  const bom2 = await createBomWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("bom2"),
      product_sku: style,
      lines: [
        { material_id: fabric.id, uom: "m", qty_per_unit: 2, waste_factor: 0 },
      ],
    },
  });
  assert(bom2.result.version === 2, "new version instead of mutating");

  await expectFail(
    async () => {
      const bad = await createRoutingWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("rt-bad"),
          product_sku: style,
          operations: [
            {
              seq: 10,
              code: "SEW",
              name: "Sew",
              work_center_type: "SEWING",
              standard_minutes: 12,
            },
          ],
        },
      });
      await releaseRoutingWorkflow(container).run({
        input: { id: bad.result.id, ...actor },
      });
    },
    "QC gate",
    "routing must end with a QC gate"
  );
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
          standard_minutes: 12,
        },
        {
          seq: 20,
          code: "FIN",
          name: "Finish",
          work_center_type: "FINISH",
          standard_minutes: 3,
        },
        {
          seq: 30,
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
  const wc = await createWorkCenterWorkflow(container).run({
    input: {
      code: `WC-${run}`,
      name: "Sewing line 1",
      type: "SEWING",
      capacity_minutes_per_day: 480,
      efficiency_pct: 80,
    },
  });

  console.log("# MO creation & BOM explosion");
  const mo = await createManufacturingOrderWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mo"),
      order_type: "MTS",
      product_sku: style,
      lines: [
        { sku: skuM, qty: 60 },
        { sku: skuL, qty: 40 },
      ],
    },
  });
  const moId = mo.result.id;
  assert(
    mo.result.bom_version === 1,
    "MO froze released BOM v1 (draft v2 ignored)"
  );
  const fabReq = mo.result.requirements.find(
    (r: any) => r.material_id === fabric.id
  );
  assert(
    fabReq.required_qty === 157.5,
    `100 pcs x 1.5 x 1.05 = 157.5 (got ${fabReq.required_qty})`
  );
  await releaseBomWorkflow(container).run({
    input: { id: bom2.result.id, ...actor },
  });
  const moAfter = (await mfg.listManufacturingOrders({ id: moId }))[0];
  assert(
    moAfter.bom_version === 1,
    "later BOM release does not change existing MO"
  );
  assert(moAfter.status === "PLANNED", "MO planned");

  console.log("# material readiness & reservation saga");
  const check1 = await checkMaterialWorkflow(container).run({
    input: { mo_id: moId, ...actor },
  });
  assert(
    check1.result.material_status === "PARTIAL",
    `PARTIAL (buttons ok, fabric short) got ${check1.result.material_status}`
  );
  await expectFail(
    () =>
      reserveMoMaterialsWorkflow(container).run({
        input: { mo_id: moId, ...actor },
      }),
    "INSUFFICIENT_STOCK",
    "reservation fails when fabric short"
  );
  const btnAvail = await inv.getUsableAvailability([button.id]);
  assert(
    btnAvail[button.id] === 1000,
    "saga compensation released the button reservation"
  );
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("rcv-fab"),
    material_id: fabric.id,
    location_id: loc.id,
    lot: { lot_no: "F1", dye_lot_no: "D1" },
    rolls: [
      { roll_code: `R1-${run}`, qty: 100 },
      { roll_code: `R2-${run}`, qty: 80 },
    ],
  });
  const reserved = await reserveMoMaterialsWorkflow(container).run({
    input: { mo_id: moId, ...actor },
  });
  assert(
    reserved.result.status === "MATERIAL_RESERVED" &&
      reserved.result.fully_reserved,
    "MO MATERIAL_RESERVED"
  );

  console.log("# release, issue, cut");
  const rel = await releaseManufacturingOrderWorkflow(container).run({
    input: { mo_id: moId, ...actor },
  });
  const batchId = rel.result.batches[0].id;
  await issueMaterialToMoWorkflow(container).run({
    input: {
      mo_id: moId,
      ...actor,
      material_id: fabric.id,
      qty: 157.5,
      idempotency_key: k("iss-fab"),
    },
  });
  await issueMaterialToMoWorkflow(container).run({
    input: {
      mo_id: moId,
      ...actor,
      material_id: fabric.id,
      qty: 157.5,
      idempotency_key: k("iss-fab"),
    },
  });
  const req = (
    await mfg.listMoMaterialRequirements({
      mo_id: moId,
      material_id: fabric.id,
    })
  )[0];
  assert(
    Number(req.issued_qty) === 157.5,
    "issue recorded once (replay did not double count)"
  );
  console.log("   issued_qty on requirement:", req.issued_qty);
  await createCutPlanWorkflow(container).run({
    input: {
      mo_id: moId,
      ...actor,
      batch_id: batchId,
      fabric_material_id: fabric.id,
      lays: [
        {
          roll_code: `R1-${run}`,
          planned_consumption: 100,
          size_ratio: { [skuM]: 3, [skuL]: 2 },
        },
      ],
    },
  });
  await expectFail(
    () =>
      completeCutWorkflow(container).run({
        input: {
          mo_id: moId,
          batch_id: batchId,
          ...actor,
          idempotency_key: k("cut0"),
          fabric_material_id: fabric.id,
          actual_consumption: 150,
          bundles: [
            { sku: skuM, qty: 70 },
            { sku: skuL, qty: 40 },
          ],
        },
      }),
    "OVERPRODUCTION_APPROVAL_REQUIRED",
    "overproduction blocked without approval"
  );
  const cut = await completeCutWorkflow(container).run({
    input: {
      mo_id: moId,
      batch_id: batchId,
      ...actor,
      idempotency_key: k("cut"),
      fabric_material_id: fabric.id,
      actual_consumption: 150,
      bundles: [
        { sku: skuM, qty: 60 },
        { sku: skuL, qty: 40 },
      ],
    },
  });
  console.log("   reconciliation:", JSON.stringify(cut.result.reconciliation));
  assert(
    cut.result.reconciliation.within_tolerance === false,
    "fabric variance beyond tolerance opens an exception"
  );
  assert(
    (
      await mfg.listManufacturingExceptions({
        mo_id: moId,
        type: "FABRIC_VARIANCE",
      })
    ).length === 1,
    "FABRIC_VARIANCE exception recorded"
  );
  const bundles = cut.result.bundles;

  console.log("# shop floor");
  const b1 = bundles.find((b: any) => b.sku === skuM);
  const exec = (over: any) =>
    executeOperationWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k(`op-${Math.random()}`),
        bundle_id: b1.id,
        ...over,
      },
    });
  await expectFail(
    () =>
      exec({
        op_seq: 10,
        input_qty: 60,
        good_qty: 50,
        rework_qty: 8,
        reject_qty: 5,
      }),
    "INVARIANT_VIOLATION",
    "good+rework+reject must not exceed input"
  );
  await expectFail(
    () => exec({ op_seq: 20, input_qty: 10, good_qty: 10 }),
    "INVALID_STATE",
    "cannot skip operations"
  );
  await expectFail(
    () => exec({ op_seq: 10, input_qty: 61, good_qty: 61 }),
    "INVALID_STATE",
    "cannot process more than waiting"
  );
  const e1 = await exec({
    op_seq: 10,
    input_qty: 60,
    good_qty: 55,
    rework_qty: 3,
    reject_qty: 2,
    work_center_id: wc.result.id,
  });
  assert(
    e1.result.bundle.current_seq === 20 && e1.result.bundle.waiting_qty === 55,
    "bundle advanced to FIN with 55 pcs"
  );
  const moNow = (await mfg.listManufacturingOrders({ id: moId }))[0];
  assert(
    moNow.status === "IN_PROGRESS",
    "MO IN_PROGRESS after first operation"
  );
  await exec({ op_seq: 20, input_qty: 55, good_qty: 55 });
  await expectFail(
    () => exec({ op_seq: 30, input_qty: 55, good_qty: 55 }),
    "QC gate",
    "operator cannot complete a QC gate"
  );
  const moQc = (await mfg.listManufacturingOrders({ id: moId }))[0];
  console.log(
    "   MO status with M bundle at gate and L bundle still sewing:",
    moQc.status
  );

  console.log("# quality gate, rework, pack");
  await expectFail(
    () =>
      packBundleOnlyWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("pk0"),
          bundle_id: b1.id,
          qty: 1,
        },
      }),
    "QC-released",
    "cannot pack before QC release (BR-003)"
  );
  const insp = await inspectBundleWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("qc1"),
      bundle_id: b1.id,
      mo_id: moId,
      pass_qty: 50,
      rework_qty: 3,
      reject_qty: 2,
      hold_qty: 0,
    },
  });
  assert(
    insp.result.bundle.qc_released_qty === 50 &&
      insp.result.bundle.rework_qty === 6,
    "QC: 50 released; rework now 6 (3 sewing + 3 final)"
  );
  const replayInsp = await inspectBundleWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("qc1"),
      bundle_id: b1.id,
      mo_id: moId,
      pass_qty: 50,
      rework_qty: 3,
      reject_qty: 2,
      hold_qty: 0,
    },
  });
  assert(
    replayInsp.result.bundle.qc_released_qty === 50,
    "inspection replay is idempotent"
  );
  await expectFail(
    () =>
      returnReworkWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("rw0"),
          bundle_id: b1.id,
          good_qty: 5,
          scrap_qty: 5,
        },
      }),
    "rework",
    "cannot return more rework than exists"
  );
  const rw = await returnReworkWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("rw1"),
      bundle_id: b1.id,
      good_qty: 4,
      scrap_qty: 2,
    },
  });
  assert(
    rw.result.rework_bundle.qty === 4 &&
      rw.result.bundle.qc_released_qty === 50,
    "rework becomes a child bundle; parent good output not inflated"
  );
  const rwInsp = await inspectBundleWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("qc2"),
      bundle_id: rw.result.rework_bundle.id,
      mo_id: moId,
      pass_qty: 4,
    },
  });
  assert(
    rwInsp.result.bundle.qc_released_qty === 4,
    "reworked pieces must re-pass QC"
  );
  const packed1 = await packBundleOnlyWorkflow(container).run({
    input: { ...actor, idempotency_key: k("pk1"), bundle_id: b1.id, qty: 50 },
  });
  await expectFail(
    () =>
      packBundleOnlyWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("pk2"),
          bundle_id: b1.id,
          qty: 1,
        },
      }),
    "QC-released",
    "cannot pack beyond QC release"
  );
  await packBundleOnlyWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("pk3"),
      bundle_id: rw.result.rework_bundle.id,
      qty: 4,
    },
  });
  assert(packed1.result.sku === skuM, "packing record carries the SKU");

  // L bundle: straight through
  const b2 = bundles.find((b: any) => b.sku === skuL);
  const ex2 = (over: any) =>
    executeOperationWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k(`op2-${Math.random()}`),
        bundle_id: b2.id,
        ...over,
      },
    });
  await ex2({ op_seq: 10, input_qty: 40, good_qty: 40 });
  await ex2({ op_seq: 20, input_qty: 40, good_qty: 40 });
  const moGate = (await mfg.listManufacturingOrders({ id: moId }))[0];
  console.log(
    "   MO status with all remaining output waiting at QC gate:",
    moGate.status
  );
  await inspectBundleWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("qc3"),
      bundle_id: b2.id,
      mo_id: moId,
      pass_qty: 40,
    },
  });
  await packBundleOnlyWorkflow(container).run({
    input: { ...actor, idempotency_key: k("pk4"), bundle_id: b2.id, qty: 40 },
  });
  const moEnd = (await mfg.listManufacturingOrders({ id: moId }))[0];
  console.log(
    "   final MO:",
    moEnd.status,
    "completed_qty",
    moEnd.completed_qty,
    "of",
    moEnd.planned_qty
  );
  assert(
    moEnd.completed_qty === 94,
    "packed output = 50 + 4 + 40 (rejects and scrap excluded)"
  );
  assert(
    moEnd.status === "PARTIALLY_COMPLETED",
    "MO partially completed: 6 pcs lost to reject/scrap, rest packed"
  );

  console.log("# cancel guard");
  const mo2 = await createManufacturingOrderWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mo2"),
      order_type: "MTS",
      product_sku: style,
      lines: [{ sku: skuM, qty: 2 }],
    },
  });
  await reserveMoMaterialsWorkflow(container).run({
    input: { mo_id: mo2.result.id, ...actor },
  });
  const rel2 = await releaseManufacturingOrderWorkflow(container).run({
    input: { mo_id: mo2.result.id, ...actor },
  });
  void rel2;
  console.log(
    "   mo2 reqs",
    JSON.stringify(
      (await mfg.listMoMaterialRequirements({ mo_id: mo2.result.id })).map(
        (r: any) => [
          r.material_id.slice(-4),
          r.required_qty,
          r.reserved_qty,
          r.reservation_id,
        ]
      )
    )
  );
  await issueMaterialToMoWorkflow(container).run({
    input: {
      mo_id: mo2.result.id,
      ...actor,
      material_id: fabric.id,
      qty: 4,
      idempotency_key: k("iss-fab2"),
    },
  });
  await expectFail(
    () =>
      cancelManufacturingOrderWorkflow(container).run({
        input: { mo_id: mo2.result.id, ...actor, reason: "customer cancelled" },
      }),
    "MO_HAS_ISSUED_MATERIAL",
    "cancel refused while issued material is stranded"
  );
  const mo3 = await createManufacturingOrderWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mo3"),
      order_type: "MTS",
      product_sku: style,
      lines: [{ sku: skuM, qty: 2 }],
    },
  });
  await reserveMoMaterialsWorkflow(container).run({
    input: { mo_id: mo3.result.id, ...actor },
  });
  const before = (await inv.getUsableAvailability([fabric.id]))[fabric.id];
  await cancelManufacturingOrderWorkflow(container).run({
    input: { mo_id: mo3.result.id, ...actor, reason: "not needed" },
  });
  const after = (await inv.getUsableAvailability([fabric.id]))[fabric.id];
  assert(
    after > before,
    `cancel released the reservation (${before} -> ${after})`
  );
  assert(
    (await mfg.listManufacturingOrders({ id: mo3.result.id }))[0].status ===
      "CANCELLED",
    "MO cancelled"
  );

  console.log("# MRP & work centers");
  const mo4 = await createManufacturingOrderWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mo4"),
      order_type: "MTS",
      product_sku: style,
      lines: [{ sku: skuM, qty: 500 }],
    },
  });
  void mo4;
  await setPlanningParamWorkflow(container).run({
    input: { material_id: button.id, safety_stock: 100, lead_time_days: 7 },
  });
  const mrp = await runMrpWorkflow(container).run({
    input: { ...actor, idempotency_key: k("mrp") },
  });
  const fabricSug = mrp.result.suggestions.find(
    (s: any) => s.material_id === fabric.id
  );
  console.log(
    "   MRP suggestions:",
    JSON.stringify(
      mrp.result.suggestions.map((s: any) => [
        s.type,
        s.material_id.slice(-4),
        s.net_requirement,
      ])
    )
  );
  assert(
    fabricSug && fabricSug.type === "PURCHASE" && fabricSug.net_requirement > 0,
    "MRP recommends PURCHASE for fabric shortage"
  );
  assert(
    (await container.resolve("procurement").listPurchaseOrders({})).every(
      (p: any) => p.created_by !== "mrp"
    ),
    "MRP creates no PO automatically"
  );
  const sugRow = (await mfg.listMrpSuggestions({ run_id: mrp.result.id }))[0];
  await decideMrpSuggestionWorkflow(container).run({
    input: {
      suggestion_id: sugRow.id,
      decision: "APPROVED",
      actor_id: "user_planner",
    },
  });
  const load = await mfg.workCenterLoad(new Date());
  const l = load.find((x: any) => x.id === wc.result.id);
  assert(
    l.effective_capacity_minutes === 384 && l.load_minutes === 12 * 60,
    `work center capacity 384 min, load ${l.load_minutes} min`
  );

  console.log("# DB constraints");
  const mgr = container.resolve("__pg_connection__") as any;
  await expectFail(
    async () => {
      await mgr.raw(
        `UPDATE bundle SET waiting_qty = waiting_qty + 1 WHERE id = ?`,
        [b2.id]
      );
    },
    "bundle_quantity_conservation",
    "bundle conservation CHECK"
  );
  await expectFail(
    async () => {
      await mgr.raw(`UPDATE bom SET version = 99 WHERE id = ?`, [
        bom1.result.id,
      ]);
    },
    "immutable",
    "released BOM header immutable"
  );

  console.log("# outbox");
  const drained = await mfg.publishOutbox(500, async () => {});
  assert(
    drained.published > 10 && drained.failed === 0,
    `manufacturing outbox drained (${drained.published})`
  );
  console.log("INTEGRATION TEST PASSED");
}
