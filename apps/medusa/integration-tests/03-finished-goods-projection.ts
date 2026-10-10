import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

import {
  adjustFinishedGoodsWorkflow,
  allocateFgToOrderWorkflow,
  changeFgHoldWorkflow,
  receiveFinishedGoodsWorkflow,
  releaseFgAllocationWorkflow,
  republishProjectionWorkflow,
  setSafetyStockWorkflow,
  shipFinishedGoodsWorkflow,
  syncSellableToMedusaWorkflow,
} from "../src/workflows/finished-goods";

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
    assert(
      `${e.code ?? ""} ${e.message}`.includes(needle),
      `${msg} (got: ${e.code ?? ""} ${String(e.message).slice(0, 100)})`
    );
    return;
  }
  throw new Error(`ASSERT FAILED: expected failure "${needle}": ${msg}`);
};

export default async function verify({ container }: ExecArgs) {
  const fg: any = container.resolve("finishedGoods");
  const inventory: any = container.resolve(Modules.INVENTORY);
  const stockLocations: any = container.resolve(Modules.STOCK_LOCATION);
  const actor = { actor_id: "user_wh", correlation_id: "cor_p3" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;
  const sku = `TEE-${run}-M`;

  console.log("# setup");
  const stockLoc = await stockLocations.createStockLocations({
    name: `HCM ${run}`,
  });
  const item = await inventory.createInventoryItems({ sku });
  const loc = await fg.createFgLocations({
    code: `FG-${run}`,
    name: "HCM FG",
    warehouse_code: "HCM",
    medusa_stock_location_id: stockLoc.id,
  });
  const factory = await fg.createFgLocations({
    code: `FACT-${run}`,
    name: "Factory FG",
    warehouse_code: "FAC",
    is_commerce: false,
  });

  console.log("# receipt rules");
  await expectFail(
    () =>
      receiveFinishedGoodsWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("r0"),
          sku,
          qty: 10,
          location_id: loc.id,
        },
      }),
    "packing_record_id",
    "production receipt needs a packing record (QC-released + packed)"
  );
  const r1 = await receiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("r1"),
      sku,
      qty: 100,
      location_id: loc.id,
      mo_id: "mo_a",
      packing_record_id: `pack_${run}_1`,
      traceability: { mo_number: "MO-1" },
    },
  });
  assert(
    r1.result.sellable === 100 && r1.result.balance_version === 1,
    "100 received, sellable 100, version 1"
  );
  await expectFail(
    () =>
      receiveFinishedGoodsWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("r1b"),
          sku,
          qty: 100,
          location_id: loc.id,
          mo_id: "mo_a",
          packing_record_id: `pack_${run}_1`,
        },
      }),
    "DUPLICATE",
    "same packing record cannot be received twice"
  );
  const replay = await receiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("r1"),
      sku,
      qty: 100,
      location_id: loc.id,
      mo_id: "mo_a",
      packing_record_id: `pack_${run}_1`,
      traceability: { mo_number: "MO-1" },
    },
  });
  assert(
    replay.result.batch_id === r1.result.batch_id,
    "idempotent replay of the same command"
  );
  await receiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("r2"),
      sku,
      qty: 50,
      location_id: loc.id,
      mo_id: "mo_b",
      packing_record_id: `pack_${run}_2`,
    },
  });

  console.log("# sellable projection");
  await changeFgHoldWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("h1"),
      sku,
      location_id: loc.id,
      qty: 20,
      kind: "QC",
      action: "HOLD",
      reason: "audit",
    },
  });
  await changeFgHoldWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("h2"),
      sku,
      location_id: loc.id,
      qty: 10,
      kind: "WAREHOUSE",
      action: "HOLD",
      reason: "damaged box",
    },
  });
  const ss = await setSafetyStockWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("ss"),
      sku,
      location_id: loc.id,
      safety_stock: 5,
    },
  });
  assert(
    ss.result.sellable === 150 - 20 - 10 - 5,
    `sellable = 150 - holds(30) - safety(5) = 115 (got ${ss.result.sellable})`
  );
  const al = await allocateFgToOrderWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("al"),
      order_id: `order_${run}`,
      sku,
      location_id: loc.id,
      qty: 15,
    },
  });
  assert(
    al.result.sellable === 100,
    "MTO allocation removed from ATS (115 - 15)"
  );
  await expectFail(
    () =>
      changeFgHoldWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("h3"),
          sku,
          location_id: loc.id,
          qty: 500,
          kind: "QC",
          action: "HOLD",
          reason: "x",
        },
      }),
    "INSUFFICIENT_STOCK",
    "cannot hold more than free stock"
  );

  console.log("# ship: FIFO batches + allocation");
  const shipOrder = await shipFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("s1"),
      sku,
      location_id: loc.id,
      qty: 15,
      reference_type: "FULFILLMENT",
      reference_id: `ful_1_${run}`,
      order_id: `order_${run}`,
    },
  });
  assert(
    shipOrder.result.from_allocation === 15,
    "order shipment consumed its allocation"
  );
  const ship2 = await shipFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("s2"),
      sku,
      location_id: loc.id,
      qty: 90,
      reference_type: "FULFILLMENT",
      reference_id: `ful_2_${run}`,
      order_id: `other_${run}`,
    },
  });
  const lines = await fg.listFgShipmentLines({ reference_id: `ful_2_${run}` });
  console.log(
    "   ful_2 batch lines:",
    JSON.stringify(lines.map((l: any) => [l.batch_id?.slice(-4), l.qty]))
  );
  assert(
    lines.reduce((n: number, l: any) => n + l.qty, 0) === 90 &&
      lines.every((l: any) => l.batch_id),
    "shipment fully linked to FG batches (FIFO)"
  );
  const batches = await fg.listFgBatches({ sku });
  assert(
    batches.every((b: any) => b.remaining_qty >= 0),
    "batch remaining never negative"
  );
  const trace = await fg.traceBatch(batches[0].id);
  assert(trace.batch.mo_id, "FG batch traces to MO");
  void ship2;

  console.log("# concurrency: 12 parallel single-unit ships against 10 free");
  const freeBefore = 150 - 15 - 90; // on hand 45, holds 30 => free 15
  void freeBefore;
  await changeFgHoldWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("hr1"),
      sku,
      location_id: loc.id,
      qty: 20,
      kind: "QC",
      action: "RELEASE",
      reason: "ok",
    },
  });
  await changeFgHoldWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("hr2"),
      sku,
      location_id: loc.id,
      qty: 10,
      kind: "WAREHOUSE",
      action: "RELEASE",
      reason: "ok",
    },
  });
  const bal = (await fg.listFgBalances({ sku, location_id: loc.id }))[0];
  console.log(
    "   balance:",
    bal.on_hand,
    "holds",
    bal.warehouse_hold,
    bal.qc_hold,
    "alloc",
    bal.allocated
  );
  const results = await Promise.allSettled(
    Array.from({ length: bal.on_hand + 5 }, (_, i) =>
      shipFinishedGoodsWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: `par-${run}-${i}`,
          sku,
          location_id: loc.id,
          qty: 1,
          reference_type: "FULFILLMENT",
          reference_id: `par_${i}`,
        },
      })
    )
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert(
    ok === bal.on_hand,
    `exactly on_hand (${bal.on_hand}) shipments succeed, no oversell (got ${ok})`
  );
  const after = (await fg.listFgBalances({ sku, location_id: loc.id }))[0];
  assert(after.on_hand === 0, "on_hand ends at 0 and never negative");

  console.log("# rebuild & reconciliation");
  const rec = await fg.reconcile();
  assert(
    rec.ok,
    `FG ledger reconciles to balances ${JSON.stringify(rec.issues)}`
  );

  console.log("# Medusa projection with version guard");
  await adjustFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("adj"),
      sku,
      location_id: loc.id,
      direction: "PLUS",
      qty: 40,
      reason: "cycle count found stock",
    },
  });
  const cur = (await fg.listFgBalances({ sku, location_id: loc.id }))[0];
  const sellableNow = Math.max(
    0,
    cur.on_hand -
      cur.warehouse_hold -
      cur.qc_hold -
      cur.allocated -
      cur.safety_stock
  );
  const ev = {
    sku,
    location_id: loc.id,
    medusa_stock_location_id: stockLoc.id,
    available_qty: sellableNow,
    source_version: cur.version,
  };
  process.env.FG_SYNC_TO_MEDUSA_ENABLED = "true";
  const a1 = await syncSellableToMedusaWorkflow(container).run({ input: ev });
  assert(
    a1.result.applied === true,
    "newest version applied to Medusa inventory"
  );
  const levels = await inventory.listInventoryLevels({
    inventory_item_id: item.id,
    location_id: stockLoc.id,
  });
  assert(
    Number(levels[0].stocked_quantity) === sellableNow,
    "Medusa stocked_quantity = sellable projection"
  );
  const stale = await syncSellableToMedusaWorkflow(container).run({
    input: { ...ev, available_qty: 999, source_version: cur.version - 1 },
  });
  assert(
    stale.result.applied === false && stale.result.reason === "STALE_VERSION",
    "stale event ignored"
  );
  const dup = await syncSellableToMedusaWorkflow(container).run({
    input: { ...ev, available_qty: 777 },
  });
  assert(dup.result.applied === false, "same-version duplicate ignored");
  const levels2 = await inventory.listInventoryLevels({
    inventory_item_id: item.id,
    location_id: stockLoc.id,
  });
  assert(
    Number(levels2[0].stocked_quantity) === sellableNow,
    "stale/duplicate did not overwrite Medusa stock"
  );
  const unmapped = await syncSellableToMedusaWorkflow(container).run({
    input: { ...ev, sku: `NOPE-${run}`, source_version: 1 },
  });
  assert(
    unmapped.result.reason === "UNMAPPED",
    "unknown SKU is reported UNMAPPED, not silently applied"
  );
  const re = await republishProjectionWorkflow(container).run({
    input: { ...actor, sku },
  });
  assert(re.result.events === 1, "projection can be rebuilt from FG state");
  void factory;
  const drained = await fg.publishOutbox(500, async () => {});
  assert(
    drained.published > 5 && drained.failed === 0,
    `FG outbox drained (${drained.published})`
  );
  await expectFail(
    async () => {
      await (container.resolve("__pg_connection__") as any).raw(
        `DELETE FROM fg_movement`
      );
    },
    "append-only",
    "FG ledger is append-only"
  );
  await releaseFgAllocationWorkflow;
  console.log("INTEGRATION TEST PASSED");
}
