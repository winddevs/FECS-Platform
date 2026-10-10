import { ExecArgs } from "@medusajs/framework/types";

const canon = (v: any): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val).sort(([a], [b]) => a.localeCompare(b))
        )
      : val
  );
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${msg}`);
  }
  console.log(`  ok - ${msg}`);
};

const expectFail = async (
  fn: () => Promise<unknown>,
  code: string,
  msg: string
) => {
  try {
    await fn();
  } catch (e: any) {
    const text = `${e.code ?? ""} ${e.message}`;
    assert(text.includes(code), `${msg} (got: ${e.code ?? e.message})`);
    return;
  }
  throw new Error(`ASSERT FAILED: expected failure ${code}: ${msg}`);
};

export default async function verify({ container }: ExecArgs) {
  const inv: any = container.resolve("materialInventory");
  const proc: any = container.resolve("procurement");
  const integ: any = container.resolve("integration");
  const actor = { actor_id: "user_test", correlation_id: "cor_test" };
  const run = Date.now().toString(36);

  // Earlier suites on the same database leave events behind; start from empty.
  for (;;) {
    const leftover = await inv.publishOutbox(500, async () => {});
    if (leftover.published === 0) break;
  }
  console.log("# setup");
  const material = await inv.createMaterials({
    code: `FAB-${run}`,
    name: "Cotton",
    uom: "m",
    track_roll: true,
    track_dye_lot: true,
    max_dye_lots: 1,
  });
  const loc = await inv.createMaterialLocations({
    code: `RM-${run}`,
    name: "RM",
    warehouse_code: "HCM",
  });
  const loc2 = await inv.createMaterialLocations({
    code: `RM2-${run}`,
    name: "RM2",
    warehouse_code: "HCM",
  });
  const wip = await inv.createMaterialLocations({
    code: `WIP-${run}`,
    name: "WIP",
    warehouse_code: "HCM",
    kind: "WIP",
  });
  console.log(
    "  material",
    material.id,
    "qty types:",
    typeof (await inv.listMaterials({ id: material.id }))[0].max_dye_lots
  );

  console.log("# receive");
  const rcvA = await inv.receiveMaterial({
    ...actor,
    idempotency_key: `rcv-a-${run}`,
    material_id: material.id,
    location_id: loc.id,
    lot: { lot_no: "L1", dye_lot_no: "DA" },
    rolls: [
      { roll_code: `R1-${run}`, qty: 100 },
      { roll_code: `R2-${run}`, qty: 50.5 },
      { roll_code: `R3-${run}`, qty: 30 },
    ],
  });
  assert(rcvA.balances.length === 3, "3 balances created");
  assert(rcvA.balances[1].on_hand === 50.5, "decimal qty preserved");
  const replay = await inv.receiveMaterial({
    ...actor,
    idempotency_key: `rcv-a-${run}`,
    material_id: material.id,
    location_id: loc.id,
    lot: { lot_no: "L1", dye_lot_no: "DA" },
    rolls: [
      { roll_code: `R1-${run}`, qty: 100 },
      { roll_code: `R2-${run}`, qty: 50.5 },
      { roll_code: `R3-${run}`, qty: 30 },
    ],
  });
  assert(
    canon(replay) === canon(rcvA),
    "idempotent replay returns same response"
  );
  await expectFail(
    () =>
      inv.receiveMaterial({
        ...actor,
        idempotency_key: `rcv-a-${run}`,
        material_id: material.id,
        location_id: loc.id,
        lot: { lot_no: "L1", dye_lot_no: "DA" },
        rolls: [{ roll_code: `OTHER-${run}`, qty: 1 }],
      }),
    "IDEMPOTENCY_KEY_REUSED",
    "key reuse with different payload rejected"
  );
  await expectFail(
    () =>
      inv.receiveMaterial({
        ...actor,
        idempotency_key: `rcv-dup-${run}`,
        material_id: material.id,
        location_id: loc.id,
        lot: { lot_no: "L9", dye_lot_no: "DZ" },
        rolls: [{ roll_code: `R1-${run}`, qty: 1 }],
      }),
    "DUPLICATE",
    "duplicate roll code rejected"
  );
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: `rcv-b-${run}`,
    material_id: material.id,
    location_id: loc.id,
    lot: { lot_no: "L2", dye_lot_no: "DB" },
    rolls: [{ roll_code: `R4-${run}`, qty: 200 }],
  });
  const qc = await inv.receiveMaterial({
    ...actor,
    idempotency_key: `rcv-qc-${run}`,
    material_id: material.id,
    location_id: loc.id,
    lot: { lot_no: "L3", dye_lot_no: "DC" },
    bucket: "QC_HOLD",
    rolls: [{ roll_code: `R5-${run}`, qty: 500 }],
  });
  assert(
    qc.balances[0].available === 0 && qc.balances[0].qc_hold === 500,
    "QC hold qty is unavailable"
  );

  console.log("# reserve / dye-lot policy");
  const r1 = await inv.reserveMaterial({
    ...actor,
    idempotency_key: `rsv1-${run}`,
    material_id: material.id,
    qty: 120,
    reference_type: "MO",
    reference_id: "mo_1",
  });
  assert(
    (r1.reservation.dye_lots.length === 1 &&
      r1.reservation.dye_lots[0] === "DB") ||
      r1.reservation.dye_lots[0] === "DA",
    "single dye lot chosen"
  );
  console.log(
    "  chose dye lot",
    r1.reservation.dye_lots,
    "lines",
    JSON.stringify(r1.lines.map((l: any) => l.qty))
  );
  // Dye lot A (180.5) is older and can satisfy 120 -> FIFO prefers A. Remaining A=60.5, B=200
  assert(
    r1.reservation.dye_lots[0] === "DA",
    "oldest sufficient dye lot (DA) preferred"
  );
  await expectFail(
    () =>
      inv.reserveMaterial({
        ...actor,
        idempotency_key: `rsv2-${run}`,
        material_id: material.id,
        qty: 5000,
        reference_type: "MO",
        reference_id: "mo_2",
      }),
    "INSUFFICIENT_STOCK",
    "over-reserve rejected"
  );
  // 250 needs both DA(60.5) and DB(200) -> 2 dye lots > max 1 -> approval needed
  await expectFail(
    () =>
      inv.reserveMaterial({
        ...actor,
        idempotency_key: `rsv3-${run}`,
        material_id: material.id,
        qty: 250,
        reference_type: "MO",
        reference_id: "mo_3",
      }),
    "DYE_LOT_POLICY_VIOLATION",
    "multi dye lot needs approval"
  );
  const r3 = await inv.reserveMaterial({
    ...actor,
    idempotency_key: `rsv3b-${run}`,
    material_id: material.id,
    qty: 250,
    reference_type: "MO",
    reference_id: "mo_3",
    planner_approved: true,
  });
  assert(
    r3.reservation.dye_lots.length === 2,
    "approved multi-dye-lot reservation"
  );
  // remaining available: 260.5 - 250 = 10.5
  let rec = await inv.reconcile();
  assert(
    rec.ok,
    `reconcile ok after reservations ${JSON.stringify(rec.issues)}`
  );

  console.log(
    "# concurrency: 12 parallel reservations of 3 against 10.5 available"
  );
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, i) =>
      inv.reserveMaterial({
        ...actor,
        idempotency_key: `par-${run}-${i}`,
        material_id: material.id,
        qty: 3,
        reference_type: "MO",
        reference_id: `mo_par_${i}`,
      })
    )
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter(
    (r) => r.status === "rejected"
  ) as PromiseRejectedResult[];
  console.log("  fulfilled", ok, "rejected", rejected.length, "reasons", [
    ...new Set(rejected.map((r) => r.reason.code ?? r.reason.message)),
  ]);
  assert(ok === 3, "exactly floor(10.5/3)=3 succeed, no oversell");
  rec = await inv.reconcile();
  assert(
    rec.ok,
    `reconcile ok after concurrent reservations ${JSON.stringify(rec.issues)}`
  );

  console.log("# concurrent duplicate idempotency key");
  const dupes = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      inv.releaseReservation({
        ...actor,
        idempotency_key: `dup-rel-${run}`,
        reservation_id: r3.reservation.id,
        qty: 10,
      })
    )
  );
  assert(
    dupes.every((d) => d.status === "fulfilled"),
    "all duplicates succeed"
  );
  const lines = await inv.listMaterialReservations({ id: r3.reservation.id });
  assert(
    Number(lines[0].released_qty) === 10,
    `released exactly once (released=${lines[0].released_qty})`
  );

  console.log("# issue / return / scrap / adjust / count / transfer");
  const iss = await inv.issueMaterial({
    ...actor,
    idempotency_key: `iss-${run}`,
    reservation_id: r1.reservation.id,
    qty: 70,
  });
  assert(iss.status === "PARTIALLY_ISSUED", "partially issued");
  await expectFail(
    () =>
      inv.issueMaterial({
        ...actor,
        idempotency_key: `iss2-${run}`,
        reservation_id: r1.reservation.id,
        qty: 100,
      }),
    "INSUFFICIENT_STOCK",
    "cannot issue beyond reservation"
  );
  const issLine = iss.lines[0];
  const balRow = (
    await inv.listMaterialBalances({ id: issLine.balance_id })
  )[0];
  await expectFail(
    () =>
      inv.returnMaterial({
        ...actor,
        idempotency_key: `ret0-${run}`,
        material_id: material.id,
        lot_id: balRow.lot_id,
        roll_id: balRow.roll_id,
        location_id: loc.id,
        qty: 9999,
        bucket: "GOOD",
        reference_type: "MO",
        reference_id: "mo_1",
      }),
    "EXCEEDS_ISSUED",
    "cannot return more than issued"
  );
  const ret = await inv.returnMaterial({
    ...actor,
    idempotency_key: `ret-${run}`,
    material_id: material.id,
    lot_id: balRow.lot_id,
    roll_id: balRow.roll_id,
    location_id: loc.id,
    qty: 1,
    bucket: "QC_HOLD",
    reference_type: "MO",
    reference_id: "mo_1",
  });
  assert(ret.balance.qc_hold >= 1, "returned to QC_HOLD");
  await expectFail(
    () =>
      inv.scrapMaterial({
        ...actor,
        idempotency_key: `scr-${run}`,
        balance_id: issLine.balance_id,
        qty: 1,
        source_bucket: "GOOD",
        reason: " ",
        reference_type: "DAMAGE_NOTE",
        reference_id: `dn-${run}`,
      }),
    "reason",
    "scrap requires reason"
  );
  await expectFail(
    () =>
      inv.scrapMaterial({
        ...actor,
        idempotency_key: `scr1b-${run}`,
        balance_id: issLine.balance_id,
        qty: 1,
        source_bucket: "QC_HOLD",
        reason: "stained",
        reference_type: "",
        reference_id: "",
      }),
    "business reference",
    "scrap requires a business reference (FR-INV-009)"
  );
  const scr = await inv.scrapMaterial({
    ...actor,
    idempotency_key: `scr2-${run}`,
    balance_id: issLine.balance_id,
    qty: 1,
    source_bucket: "QC_HOLD",
    reason: "stained",
    reference_type: "DAMAGE_NOTE",
    reference_id: `dn-${run}`,
  });
  assert(scr.balance.qc_hold === 0, "scrapped from qc_hold");
  const all = await inv.listMaterialBalances({ material_id: material.id });
  const target = all.find(
    (b: any) =>
      Number(b.on_hand_qty) -
        Number(b.reserved_qty) -
        Number(b.qc_hold_qty) -
        Number(b.damaged_qty) >=
      1
  );
  const targetOnHand = Number(target.on_hand_qty);
  const cc = await inv.recordCycleCount({
    ...actor,
    idempotency_key: `cc-${run}`,
    balance_id: target.id,
    counted_qty: targetOnHand - 0.5,
    expected_version: target.version,
    reason: "count",
  });
  assert(
    cc.status === "PENDING_APPROVAL" && cc.adjusted === false,
    "a count waits for approval before anything is adjusted"
  );
  assert(
    (await inv.listMaterialBalances({ id: target.id }))[0].on_hand_qty ==
      targetOnHand,
    "balance untouched until approved"
  );
  await expectFail(
    () =>
      inv.decideCycleCount({
        ...actor,
        idempotency_key: `ccd0-${run}`,
        count_id: cc.count_id,
        decision: "APPROVE",
      }),
    "someone other than the counter",
    "the counter cannot approve their own count"
  );
  const approved = await inv.decideCycleCount({
    actor_id: "user_approver",
    idempotency_key: `ccd-${run}`,
    count_id: cc.count_id,
    decision: "APPROVE",
    reason: "recounted",
  });
  assert(
    approved.adjusted && approved.balance.on_hand === targetOnHand - 0.5,
    "approved cycle count adjusts"
  );
  await expectFail(
    () =>
      inv.recordCycleCount({
        ...actor,
        idempotency_key: `cc2-${run}`,
        balance_id: target.id,
        counted_qty: 1,
        expected_version: target.version,
        reason: "stale",
      }),
    "STALE_VERSION",
    "stale count rejected"
  );
  const bal3 = (await inv.listMaterialBalances({ id: rcvA.balances[0].id }))[0];
  const xfer = await inv.transferStock({
    ...actor,
    idempotency_key: `xf-${run}`,
    balance_id: target.id,
    to_location_id: loc2.id,
    qty: 0.5,
  });
  assert(xfer.to.on_hand === 0.5, "transfer in");
  const avail = await inv.getAvailability(material.id);
  console.log("  availability", JSON.stringify(avail));
  rec = await inv.reconcile();
  assert(rec.ok, `reconcile ok at end ${JSON.stringify(rec.issues)}`);
  void bal3;
  void wip;

  console.log("# ledger immutability / DB constraints");
  const mgr = container.resolve("__pg_connection__") as any;
  await expectFail(
    async () => {
      await mgr.raw(`UPDATE material_stock_movement SET qty = 1`);
    },
    "append-only",
    "movement UPDATE blocked"
  );
  await expectFail(
    async () => {
      await mgr.raw(`DELETE FROM material_stock_movement`);
    },
    "append-only",
    "movement DELETE blocked"
  );
  await expectFail(
    async () => {
      await mgr.raw(
        `UPDATE material_balance SET reserved_qty = on_hand_qty + 1 WHERE id = ?`,
        [target.id]
      );
    },
    "material_balance_reserved_within_on_hand",
    "CHECK constraint blocks invariants break"
  );

  console.log("# procurement flow");
  const sup = await proc.createSuppliers({
    code: `SUP-${run}`,
    name: "Supplier",
  });
  const po = await proc.createPurchaseOrderWithLines({
    ...actor,
    idempotency_key: `po-${run}`,
    supplier_id: sup.id,
    lines: [
      { material_id: material.id, uom: "m", ordered_qty: 100, unit_price: 10 },
    ],
  });
  const poId = po.purchase_order.id;
  const lineId = po.lines[0].id;
  await expectFail(
    () =>
      proc.postGoodsReceipt({
        ...actor,
        idempotency_key: `g0-${run}`,
        purchase_order_id: poId,
        location_id: loc.id,
        lines: [{ purchase_order_line_id: lineId, qty: 10, lot_no: "X" }],
      }),
    "INVALID_STATE",
    "cannot receive against DRAFT"
  );
  await proc.transitionPurchaseOrder({
    ...actor,
    purchase_order_id: poId,
    action: "approve",
  });
  await expectFail(
    () =>
      proc.transitionPurchaseOrder({
        ...actor,
        purchase_order_id: poId,
        action: "close",
      }),
    "INVALID_STATE",
    "illegal transition rejected"
  );
  await proc.transitionPurchaseOrder({
    ...actor,
    purchase_order_id: poId,
    action: "send",
  });
  const grn = await proc.postGoodsReceipt({
    ...actor,
    idempotency_key: `g1-${run}`,
    purchase_order_id: poId,
    location_id: loc.id,
    lines: [
      {
        purchase_order_line_id: lineId,
        qty: 60,
        lot_no: "PO-L1",
        dye_lot_no: "DP",
        rolls: [
          { roll_code: `P1-${run}`, qty: 35 },
          { roll_code: `P2-${run}`, qty: 25 },
        ],
      },
    ],
  });
  await expectFail(
    () =>
      proc.postGoodsReceipt({
        ...actor,
        idempotency_key: `g2-${run}`,
        purchase_order_id: poId,
        location_id: loc.id,
        lines: [{ purchase_order_line_id: lineId, qty: 50, lot_no: "PO-L2" }],
      }),
    "OVER_RECEIPT",
    "over receipt beyond tolerance rejected"
  );
  let po1 = (await proc.listPurchaseOrders({ id: poId }))[0];
  assert(po1.status === "PARTIALLY_RECEIVED", "PO partially received");
  const batch = await inv.receiveMaterialBatch(
    grn.lines.map((l: any) => ({
      ...actor,
      idempotency_key: `grn:${grn.receipt.id}:${l.id}`,
      material_id: l.material_id,
      location_id: grn.location_id,
      lot: {
        lot_no: l.lot_no,
        dye_lot_no: l.dye_lot_no,
        supplier_id: grn.supplier_id,
        source_type: "GOODS_RECEIPT",
        source_id: grn.receipt.id,
      },
      rolls: l.rolls,
    }))
  );
  assert(batch.length === 1, "inventory receipt posted");
  await proc.markGoodsReceiptPosted(grn.receipt.id);
  // void of a posted receipt must be refused
  await expectFail(
    () => proc.voidGoodsReceipt(grn.receipt.id),
    "INVALID_STATE",
    "posted receipt cannot be voided"
  );
  // void flow for a pending receipt
  const grn2 = await proc.postGoodsReceipt({
    ...actor,
    idempotency_key: `g3-${run}`,
    purchase_order_id: poId,
    location_id: loc.id,
    lines: [
      {
        purchase_order_line_id: lineId,
        qty: 40,
        lot_no: "PO-L3",
        dye_lot_no: "DP",
        rolls: [{ roll_code: `P3-${run}`, qty: 40 }],
      },
    ],
  });
  po1 = (await proc.listPurchaseOrders({ id: poId }))[0];
  assert(po1.status === "RECEIVED", "PO fully received");
  await proc.voidGoodsReceipt(grn2.receipt.id);
  po1 = (await proc.listPurchaseOrders({ id: poId }))[0];
  assert(po1.status === "PARTIALLY_RECEIVED", "void reverts PO status");
  const trace = await inv.listMaterialLots({
    source_type: "GOODS_RECEIPT",
    source_id: grn.receipt.id,
  });
  assert(trace.length === 1, "lot traceable back to goods receipt");

  console.log("# outbox / inbox / audit");
  const published: string[] = [];
  const drained = await inv.publishOutbox(100, async (row: any) => {
    published.push(row.event_type);
  });
  assert(
    drained.published > 5 && drained.failed === 0,
    `outbox drained (${drained.published})`
  );
  const again = await inv.publishOutbox(100, async () => {});
  assert(again.published === 0, "outbox not republished");
  const ib1 = await integ.receiveInboxEvent({
    provider: "meta",
    external_event_id: `e-${run}`,
    event_type: "msg",
    payload: { a: 1 },
  });
  const ib2 = await integ.receiveInboxEvent({
    provider: "meta",
    external_event_id: `e-${run}`,
    event_type: "msg",
    payload: { a: 1 },
  });
  assert(!ib1.duplicate && ib2.duplicate && ib1.id === ib2.id, "inbox dedup");
  const batchClaim = await integ.claimInboxBatch(10);
  assert(
    batchClaim.some((b: any) => b.id === ib1.id),
    "inbox claim"
  );
  const mf = await integ.markInboxFailed(ib1.id, "boom");
  assert(mf.status === "RETRY", "inbox retry scheduled");
  const audit = await integ.recordAudit({
    actor_id: "u",
    action: "x",
    resource_type: "t",
    resource_id: "1",
  });
  await expectFail(
    async () => {
      await mgr.raw(`UPDATE audit_log SET action='y' WHERE id = ?`, [audit.id]);
    },
    "append-only",
    "audit UPDATE blocked"
  );
  console.log("INTEGRATION TEST PASSED");
}
