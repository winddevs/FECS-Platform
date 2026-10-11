import type { ExecArgs } from "@medusajs/framework/types";

import {
  cancelFgTransferWorkflow,
  dispatchFgTransferWorkflow,
  receiveFgTransferWorkflow,
  receiveFinishedGoodsWorkflow,
  shipFinishedGoodsWorkflow,
} from "../src/workflows/finished-goods";

/**
 * Requirement section 25: factory, HCM and HN fulfillment, return QC,
 * quarantine and in-transit locations, and transfers that preserve total
 * stock and traceability.
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
    assert(
      `${e.code ?? ""} ${e.message}`.includes(needle),
      `${msg} (got: ${e.code ?? ""} ${String(e.message).slice(0, 110)})`
    );
    return;
  }
  throw new Error(`ASSERT FAILED: expected failure "${needle}": ${msg}`);
};

export default async function verify({ container }: ExecArgs) {
  const fg: any = container.resolve("finishedGoods");
  const actor = { actor_id: "user_wh", correlation_id: "cor_wh" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;
  const sku = `WH-${run}-M`;

  console.log("# the eight locations of section 25");
  const loc = (
    code: string,
    kind: string,
    commerce: boolean,
    country?: string
  ) =>
    fg.createFgLocations({
      code: `${code}-${run}`,
      name: code,
      warehouse_code: code,
      kind,
      is_commerce: commerce,
      country_code: country ?? null,
    });
  const factory = await loc("FACTORY-FG", "FACTORY", false, "VN");
  const hcm = await loc("HCM", "FULFILLMENT", true, "VN");
  const hn = await loc("HN", "FULFILLMENT", true, "VN");
  const truck = await loc("TRUCK", "IN_TRANSIT", false);
  const returnQc = await loc("RETURN-QC", "RETURN_QC", false, "VN");
  const quarantine = await loc("QUARANTINE", "QUARANTINE", false, "VN");
  assert(
    (await fg.listFgLocations({ kind: "IN_TRANSIT", id: truck.id })).length ===
      1 && (await fg.listFgLocations({ id: hn.id }))[0].country_code === "VN",
    "locations have a kind and a country"
  );
  void returnQc;
  void quarantine;

  const total = async () =>
    (await fg.listFgBalances({ sku })).reduce(
      (sum: number, b: any) => sum + Number(b.on_hand),
      0
    );
  const at = async (id: string) =>
    Number(
      (await fg.listFgBalances({ sku, location_id: id }))[0]?.on_hand ?? 0
    );

  await receiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("rcv1"),
      sku,
      qty: 30,
      location_id: factory.id,
      mo_id: `mo_a_${run}`,
      packing_record_id: `pack_a_${run}`,
    },
  });
  await new Promise((r) => setTimeout(r, 15));
  await receiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("rcv2"),
      sku,
      qty: 20,
      location_id: factory.id,
      mo_id: `mo_b_${run}`,
      packing_record_id: `pack_b_${run}`,
    },
  });
  assert((await total()) === 50, "50 pieces made at the factory");

  console.log("# factory -> HN through a truck");
  await expectFail(
    () =>
      dispatchFgTransferWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("same"),
          sku,
          qty: 5,
          from_location_id: factory.id,
          to_location_id: factory.id,
          transit_location_id: truck.id,
        },
      }),
    "same",
    "a transfer needs two different locations"
  );
  await expectFail(
    () =>
      dispatchFgTransferWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("notruck"),
          sku,
          qty: 5,
          from_location_id: factory.id,
          to_location_id: hn.id,
          transit_location_id: hcm.id,
        },
      }),
    "cannot be used as transit",
    "a sellable location cannot be used as the truck"
  );
  await expectFail(
    () =>
      dispatchFgTransferWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("toomany"),
          sku,
          qty: 51,
          from_location_id: factory.id,
          to_location_id: hn.id,
          transit_location_id: truck.id,
        },
      }),
    "INSUFFICIENT_STOCK",
    "more than the location holds cannot be sent"
  );
  const dispatched = await dispatchFgTransferWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("disp"),
      sku,
      qty: 40,
      from_location_id: factory.id,
      to_location_id: hn.id,
      transit_location_id: truck.id,
    },
  });
  assert(
    (await at(factory.id)) === 10 &&
      (await at(truck.id)) === 40 &&
      (await at(hn.id)) === 0,
    "40 left the factory and are on the truck, not yet at HN"
  );
  assert((await total()) === 50, "total stock is still 50 while in transit");
  assert(
    ((await fg.sellableFor([sku]))[sku] ?? 0) === 0,
    "pieces on the truck are not sellable anywhere"
  );
  const received = await receiveFgTransferWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("recv"),
      transfer_id: dispatched.result.transfer_id,
    },
  });
  assert(
    received.result.status === "RECEIVED" &&
      (await at(hn.id)) === 40 &&
      (await at(truck.id)) === 0 &&
      (await total()) === 50,
    "HN received 40; the truck is empty; the total is still 50"
  );
  assert(
    (await fg.sellableFor([sku]))[sku] === 40,
    "HN is a sellable location, so the 40 pieces are now sellable"
  );
  await expectFail(
    () =>
      receiveFgTransferWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("recv2"),
          transfer_id: dispatched.result.transfer_id,
        },
      }),
    "already RECEIVED",
    "a transfer cannot be received twice"
  );

  console.log("# batches follow the stock");
  const hnBatches = await fg.listFgBatches({ sku, location_id: hn.id });
  assert(
    hnBatches.length === 2 &&
      hnBatches.every((b: any) => b.source === "TRANSFER" && b.parent_batch_id),
    "HN holds batches that point back to the factory batches"
  );
  const fromOldest = hnBatches.find((b: any) => b.mo_id === `mo_a_${run}`);
  const fromNewer = hnBatches.find((b: any) => b.mo_id === `mo_b_${run}`);
  assert(
    fromOldest?.remaining_qty === 30 && fromNewer?.remaining_qty === 10,
    "the oldest batch moved whole (30), the next one partly (10 of 20)"
  );
  assert(
    (await fg.listFgBatches({ sku, location_id: factory.id }))
      .map((b: any) => Number(b.remaining_qty))
      .reduce((a: number, b: number) => a + b, 0) === 10,
    "10 pieces of the second batch stay at the factory"
  );

  console.log("# an order ships from HN and traces back to the original MO");
  await shipFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("ship"),
      sku,
      location_id: hn.id,
      qty: 5,
      reference_type: "FULFILLMENT",
      reference_id: `ful_${run}`,
      order_id: `order_${run}`,
    },
  });
  const line = (await fg.listFgShipmentLines({ order_id: `order_${run}` }))[0];
  const shippedBatch = (await fg.listFgBatches({ id: line.batch_id }))[0];
  assert(
    shippedBatch.mo_id === `mo_a_${run}` &&
      shippedBatch.traceability !== undefined,
    "the shipped batch still names its manufacturing order"
  );
  assert((await total()) === 45, "total drops by exactly what was sold");

  console.log("# cancelling brings the stock back");
  const second = await dispatchFgTransferWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("disp2"),
      sku,
      qty: 10,
      from_location_id: hn.id,
      to_location_id: hcm.id,
      transit_location_id: truck.id,
    },
  });
  assert(
    (await at(hn.id)) === 25 && (await at(truck.id)) === 10,
    "10 pieces left HN"
  );
  await cancelFgTransferWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("cancel"),
      transfer_id: second.result.transfer_id,
      reason: "truck broke down",
    },
  });
  assert(
    (await at(hn.id)) === 35 &&
      (await at(truck.id)) === 0 &&
      (await total()) === 45,
    "the pieces are back at HN and the total is unchanged"
  );

  console.log("# stock that is reserved or held cannot be sent away");
  const hold = (action: "HOLD" | "RELEASE") =>
    fg.changeHold({
      ...actor,
      idempotency_key: k(`hold-${action}-${Math.random()}`),
      sku,
      location_id: hn.id,
      qty: 30,
      kind: "WAREHOUSE",
      action,
      reason: "inspection",
    });
  await hold("HOLD");
  await expectFail(
    () =>
      dispatchFgTransferWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: k("held"),
          sku,
          qty: 10,
          from_location_id: hn.id,
          to_location_id: hcm.id,
          transit_location_id: truck.id,
        },
      }),
    "INSUFFICIENT_STOCK",
    "held stock stays where it is (35 - 30 held = 5 free)"
  );
  await hold("RELEASE");

  console.log("# opposite transfers at the same time do not deadlock");
  const results = await Promise.allSettled([
    dispatchFgTransferWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k("race-a"),
        sku,
        qty: 3,
        from_location_id: hn.id,
        to_location_id: hcm.id,
        transit_location_id: truck.id,
      },
    }),
    dispatchFgTransferWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k("race-b"),
        sku,
        qty: 3,
        from_location_id: factory.id,
        to_location_id: hn.id,
        transit_location_id: truck.id,
      },
    }),
    dispatchFgTransferWorkflow(container).run({
      input: {
        ...actor,
        idempotency_key: k("race-c"),
        sku,
        qty: 3,
        from_location_id: hcm.id,
        to_location_id: factory.id,
        transit_location_id: truck.id,
      },
    }),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert(
    ok >= 2 && (await total()) === 45,
    `concurrent transfers finish (${ok} of 3 had stock) and the total stays 45`
  );

  assert(
    (await fg.reconcile()).ok,
    "the FG ledger reconciles after all transfers"
  );
  console.log("INTEGRATION TEST PASSED");
}
