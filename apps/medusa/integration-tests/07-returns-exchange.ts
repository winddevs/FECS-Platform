import type { ExecArgs } from "@medusajs/framework/types";

import { evaluateReturnEligibility } from "../src/modules/returns/lib/eligibility";
import { receiveFinishedGoodsWorkflow } from "../src/workflows/finished-goods";
import {
  inspectReturnItemWorkflow,
  reserveExchangeWorkflow,
} from "../src/workflows/returns";

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
      `${msg} (got: ${e.code ?? ""} ${String(e.message).slice(0, 110)})`
    );
    return;
  }
  throw new Error(`ASSERT FAILED: expected failure "${needle}": ${msg}`);
};

export default async function test({ container }: ExecArgs) {
  const rma: any = container.resolve("returns");
  const fg: any = container.resolve("finishedGoods");
  const actor = { actor_id: "user_cs", correlation_id: "cor_p8" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;
  const sku = `DRESS-${run}-S`;
  const exchangeSku = `DRESS-${run}-M`;

  console.log("# eligibility policy");
  const day = 24 * 3600 * 1000;
  const facts = {
    now: new Date(),
    window_days: 14,
    delivered_at: new Date(Date.now() - 3 * day),
    purchased: { l1: 2 },
    already_returned: {},
    final_sale_skus: [] as string[],
  };
  const items = [{ order_line_id: "l1", sku, qty: 1 }];
  assert(
    evaluateReturnEligibility(facts, items).eligible,
    "delivered 3 days ago -> eligible"
  );
  assert(
    evaluateReturnEligibility(
      { ...facts, delivered_at: null },
      items
    ).reasons.includes("NOT_DELIVERED"),
    "undelivered order is not returnable"
  );
  assert(
    evaluateReturnEligibility(
      { ...facts, delivered_at: new Date(Date.now() - 30 * day) },
      items
    ).reasons.includes("OUTSIDE_RETURN_WINDOW"),
    "outside window"
  );
  assert(
    evaluateReturnEligibility(
      { ...facts, already_returned: { l1: 2 } },
      items
    ).reasons.some((r) => r.startsWith("QTY_EXCEEDS")),
    "cannot return more than purchased"
  );
  assert(
    evaluateReturnEligibility(
      { ...facts, final_sale_skus: [sku] },
      items
    ).reasons.some((r) => r.startsWith("FINAL_SALE")),
    "final-sale items excluded"
  );

  console.log("# FG locations");
  const sellable = await fg.createFgLocations({
    code: `SELL-${run}`,
    name: "Sellable",
    warehouse_code: "HCM",
    is_commerce: true,
  });
  const bGrade = await fg.createFgLocations({
    code: `BGR-${run}`,
    name: "B-grade",
    warehouse_code: "HCM",
    is_commerce: false,
  });
  const quarantine = await fg.createFgLocations({
    code: `QRN-${run}`,
    name: "Quarantine",
    warehouse_code: "HCM",
    is_commerce: false,
  });
  await receiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("seed"),
      sku: exchangeSku,
      qty: 5,
      location_id: sellable.id,
      mo_id: "mo_seed",
      packing_record_id: `pack_${run}`,
    },
  });

  console.log("# request -> authorize");
  const orderId = `order_${run}`;
  const base = {
    ...actor,
    order_id: orderId,
    customer_id: "cus_1",
    type: "RETURN" as const,
    reason: "too small",
    items: [
      { order_line_id: "l1", sku, qty: 1 },
      { order_line_id: "l2", sku, qty: 1 },
      { order_line_id: "l3", sku, qty: 1 },
      { order_line_id: "l4", sku, qty: 1 },
    ],
  };
  const req = await rma.requestReturn({
    ...base,
    idempotency_key: k("req"),
    eligibility: { eligible: false, reasons: ["OUTSIDE_RETURN_WINDOW"] },
  });
  assert(
    req.status === "REQUESTED" && req.items.length === 4,
    "RMA created with items"
  );
  const replay = await rma.requestReturn({
    ...base,
    idempotency_key: k("req"),
    eligibility: { eligible: false, reasons: ["OUTSIDE_RETURN_WINDOW"] },
  });
  assert(replay.id === req.id, "request is idempotent");
  await expectFail(
    () => rma.authorizeReturn({ ...actor, return_id: req.id }),
    "NOT_ELIGIBLE",
    "ineligible return cannot be authorized without an override reason"
  );
  await expectFail(
    () => rma.receiveReturn({ ...actor, return_id: req.id }),
    "INVALID_STATE",
    "cannot receive before authorization"
  );
  const auth = await rma.authorizeReturn({
    ...actor,
    return_id: req.id,
    override_reason: "goodwill: manufacturing defect reported",
  });
  assert(auth.overridden === true, "override recorded");
  await expectFail(
    () => rma.authorizeReturn({ ...actor, return_id: req.id }),
    "INVALID_STATE",
    "cannot authorize twice"
  );

  console.log("# receive: returned goods are NOT sellable");
  await rma.receiveReturn({ ...actor, return_id: req.id });
  const [a, b, c, d] = req.items;
  assert(
    ((await fg.sellableFor([sku]))[sku] ?? 0) === 0,
    "received returns add no sellable stock (BR-006)"
  );

  console.log("# return QC disposition rules");
  const inspect = (
    itemId: string,
    disposition: string,
    locationId?: string,
    key = itemId
  ) =>
    inspectReturnItemWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k(`insp-${key}`),
        return_item_id: itemId,
        disposition: disposition as any,
        destination_location_id: locationId,
      },
    });
  await expectFail(
    () => inspect(a.id, "A_GRADE", bGrade.id, "a1"),
    "sellable location",
    "A-grade can only go to a sellable location"
  );
  await expectFail(
    () => inspect(a.id, "B_GRADE", sellable.id, "a2"),
    "never enter a sellable",
    "B-grade can never enter a sellable location"
  );
  await expectFail(
    () => inspect(a.id, "A_GRADE", undefined, "a3"),
    "destination",
    "stock dispositions need a destination"
  );
  assert(
    ((await fg.sellableFor([sku]))[sku] ?? 0) === 0,
    "rejected inspections left stock untouched"
  );

  const ra = await inspect(a.id, "A_GRADE", sellable.id, "a4");
  assert(
    ra.result.stock_posted === true && (await fg.sellableFor([sku]))[sku] === 1,
    "A-grade restocked: sellable +1 only after QC"
  );
  await inspect(a.id, "A_GRADE", sellable.id, "a5");
  assert(
    (await fg.sellableFor([sku]))[sku] === 1,
    "re-running the inspection does not double-post stock"
  );
  await inspect(b.id, "B_GRADE", bGrade.id);
  await inspect(c.id, "DAMAGED", quarantine.id);
  assert(
    (await fg.sellableFor([sku]))[sku] === 1,
    "B-grade / damaged go to non-commerce locations; ATS unchanged"
  );
  const bBalance = (
    await fg.listFgBalances({ sku, location_id: bGrade.id })
  )[0];
  assert(
    bBalance.on_hand === 1,
    "B-grade physically tracked as secondary stock"
  );
  let [state] = await rma.listReturnAuthorizations({ id: req.id });
  assert(
    state.status === "RECEIVED",
    "RMA stays RECEIVED until every item is inspected"
  );
  const rd = await inspect(d.id, "SCRAP");
  assert(rd.result.stock_posted === false, "scrap posts no stock");
  [state] = await rma.listReturnAuthorizations({ id: req.id });
  assert(state.status === "INSPECTED", "all items inspected -> INSPECTED");
  // Retrying the LAST inspection (e.g. after a stock posting failure) must be a
  // replay, not "the return is no longer RECEIVED".
  const lastRetry = await rma.inspectReturnItem({
    ...actor,
    idempotency_key: k("insp-d-retry"),
    return_item_id: d.id,
    disposition: "SCRAP",
  });
  assert(lastRetry.replay === true, "retry of the last inspection is a replay");

  console.log("# refund gate and close");
  const early = await rma.requestReturn({
    ...base,
    idempotency_key: k("req2"),
    items: [{ order_line_id: "l9", sku, qty: 1 }],
    eligibility: { eligible: true, reasons: [] },
  });
  await expectFail(
    () =>
      rma.requestRefund({
        ...actor,
        return_id: early.id,
        payment_id: "pay_1",
        amount: 10,
        returned_value: 1000,
      }),
    "after return QC",
    "no refund before return QC"
  );
  await expectFail(
    () =>
      rma.requestRefund({
        ...actor,
        return_id: req.id,
        payment_id: "pay_1",
        amount: 5000,
        returned_value: 300,
      }),
    "exceeds the refundable value",
    "refund above the value of the returned pieces is refused"
  );
  // Two concurrent refund requests: exactly one may reach the provider.
  const racers = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      rma.requestRefund({
        ...actor,
        return_id: req.id,
        payment_id: "pay_1",
        amount: 100,
        returned_value: 300,
      })
    )
  );
  assert(
    racers.filter((r) => r.status === "fulfilled").length === 1,
    "only one of 4 concurrent refund requests wins the compare-and-set"
  );
  assert(
    racers
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .every((r) => String(r.reason?.message).includes("already in progress")),
    "the others are told a refund is in progress"
  );
  [state] = await rma.listReturnAuthorizations({ id: req.id });
  assert(state.refund_status === "REQUESTED", "refund is REQUESTED");
  const done = await rma.completeRefund({
    ...actor,
    return_id: req.id,
    ok: true,
  });
  assert(done.refund_status === "COMPLETED", "refund completion recorded");
  [state] = await rma.listReturnAuthorizations({ id: req.id });
  assert(state.status === "CLOSED", "RMA closed after refund");
  assert(
    (
      await rma.requestRefund({
        ...actor,
        return_id: req.id,
        payment_id: "pay_1",
        amount: 100,
        returned_value: 300,
      })
    ).replay === true,
    "refund cannot be requested twice"
  );

  console.log("# exchange reserves the replacement outside general stock");
  const ex = await rma.requestReturn({
    ...base,
    idempotency_key: k("req3"),
    order_id: `order_ex_${run}`,
    type: "EXCHANGE",
    exchange_sku: exchangeSku,
    items: [{ order_line_id: "l7", sku, qty: 2 }],
    eligibility: { eligible: true, reasons: [] },
  });
  await rma.authorizeReturn({ ...actor, return_id: ex.id });
  const reserved = await reserveExchangeWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("exr"),
      return_id: ex.id,
      location_id: sellable.id,
    },
  });
  assert(
    reserved.result.skipped === false &&
      (await fg.sellableFor([exchangeSku]))[exchangeSku] === 3,
    "replacement units allocated (5 - 2 = 3 sellable)"
  );
  await expectFail(
    () =>
      rma.requestReturn({
        ...base,
        idempotency_key: k("req4"),
        type: "EXCHANGE",
        items: [{ order_line_id: "l8", sku, qty: 1 }],
        eligibility: { eligible: true, reasons: [] },
      }),
    "exchange_sku",
    "exchange needs a replacement SKU"
  );

  assert((await fg.reconcile()).ok, "FG ledger reconciles after returns");
  const drained = await rma.publishOutbox(200, async () => {});
  assert(
    drained.published > 5 && drained.failed === 0,
    `returns outbox drained (${drained.published})`
  );
  console.log("INTEGRATION TEST PASSED");
}
