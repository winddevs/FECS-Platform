import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

import {
  DEFAULT_CARRIER,
  registerCarrierProvider,
} from "../src/integrations/carrier/registry";
import { SandboxCarrierProvider } from "../src/integrations/carrier/sandbox";
import pollCarrierTracking from "../src/jobs/poll-carrier-tracking";
import { createCarrierShipment } from "../src/lib/fulfillment/create-shipment";
import { ingestCarrierEvents } from "../src/lib/fulfillment/ingest-tracking";
import { receiveFinishedGoodsWorkflow } from "../src/workflows/finished-goods";
import {
  cancelCarrierShipmentWorkflow,
  replaceCarrierShipmentWorkflow,
  resolveShipmentExceptionWorkflow,
} from "../src/workflows/fulfillment";
import {
  reserveExchangeWorkflow,
  shipExchangeReplacementWorkflow,
} from "../src/workflows/returns";

/**
 * Fulfillment and returns behavior from the requirement review: polling
 * repairs a missed webhook (FR-FUL-006), delivery failures reach support and
 * a returned parcel can be replaced (FR-FUL-003/008), and an exchange sends
 * its replacement (FR-RET-004).
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
      `${msg} (got: ${e.code ?? ""} ${String(e.message).slice(0, 120)})`
    );
    return;
  }
  throw new Error(`ASSERT FAILED: expected failure "${needle}": ${msg}`);
};

export default async function verify({ container }: ExecArgs) {
  const ful: any = container.resolve("fashionFulfillment");
  const rma: any = container.resolve("returns");
  const fg: any = container.resolve("finishedGoods");
  const orders: any = container.resolve(Modules.ORDER);
  const actor = { actor_id: "user_cs_gap", correlation_id: "cor_cs_gap" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;
  const carrier = new SandboxCarrierProvider(DEFAULT_CARRIER);
  registerCarrierProvider(carrier);

  const request = (reference: string) => ({
    merchant_reference: reference,
    sender: { name: "Shop", phone: "0900000001", address_line: "1 Factory Rd" },
    receiver: {
      name: "Lan",
      phone: "0900000000",
      address_line: "1 Le Loi",
      province: "HCM",
    },
    parcel: {
      weight_grams: 500,
      declared_value: 100000,
      items: [{ name: "Dress", qty: 1, sku: "DRESS" }],
    },
    cod_amount: 0,
  });
  const ship = (tag: string) =>
    createCarrierShipment(ful, carrier, {
      ...actor,
      order_id: `order_${tag}_${run}`,
      medusa_fulfillment_id: `ful_${tag}_${run}`,
      request: request(`F-${tag}-${run}`),
    });
  const scan = (tracking: string, status: string, minutesAgo = 0) =>
    ful.recordTrackingEvents({
      ...actor,
      carrier_code: DEFAULT_CARRIER,
      tracking_number: tracking,
      events: [
        {
          carrier_status: status,
          canonical: status,
          occurred_at: new Date(Date.now() - minutesAgo * 60_000),
        },
      ],
    });

  console.log("# FR-FUL-006: polling repairs a missed webhook");
  const polled = await ship("poll");
  assert(
    polled.create_state === "SUCCEEDED",
    "shipment created at the carrier"
  );
  // The carrier scanned the parcel three times but no webhook arrived.
  carrier.addEvent(
    polled.tracking_number!,
    "Pickup scan",
    new Date(Date.now() - 3 * 3600e3)
  );
  carrier.addEvent(
    polled.tracking_number!,
    "Out for delivery",
    new Date(Date.now() - 2 * 3600e3)
  );
  carrier.addEvent(
    polled.tracking_number!,
    "Delivered - signed",
    new Date(Date.now() - 3600e3)
  );
  await container
    .resolve("__pg_connection__")
    .raw(
      `UPDATE carrier_shipment SET created_at = now() - interval '2 hours' WHERE id = ?`,
      [polled.id]
    );
  process.env.JT_RECONCILIATION_ENABLED = "true";
  await pollCarrierTracking(container as any);
  const afterPoll = (await ful.listCarrierShipments({ id: polled.id }))[0];
  assert(
    afterPoll.status === "DELIVERED" && afterPoll.delivered_at,
    "one run of the poll job brings the shipment to DELIVERED"
  );
  const polledAgain = await ful.claimShipmentsToPoll({
    carrier_code: DEFAULT_CARRIER,
    limit: 50,
    stale_after_seconds: 0,
  });
  assert(
    !polledAgain.some((s: any) => s.id === polled.id),
    "a delivered parcel is no longer polled"
  );

  console.log(
    "# FR-FUL-008: a failed delivery reaches support and clears on redelivery"
  );
  const redelivered = await ship("redeliver");
  await scan(redelivered.tracking_number!, "PICKED_UP", 300);
  await scan(redelivered.tracking_number!, "OUT_FOR_DELIVERY", 200);
  await scan(redelivered.tracking_number!, "DELIVERY_FAILED", 100);
  let open = await ful.listShipmentExceptions({
    shipment_id: redelivered.id,
    status: "OPEN",
  });
  assert(
    open.length === 1 && open[0].type === "DELIVERY_FAILED",
    "DELIVERY_FAILED opens a support exception"
  );
  await scan(redelivered.tracking_number!, "DELIVERY_FAILED", 99);
  assert(
    (
      await ful.listShipmentExceptions({
        shipment_id: redelivered.id,
        status: "OPEN",
      })
    ).length === 1,
    "a repeated scan does not open a second exception"
  );
  await scan(redelivered.tracking_number!, "OUT_FOR_DELIVERY", 50);
  await scan(redelivered.tracking_number!, "DELIVERED", 10);
  const cleared = await ful.listShipmentExceptions({
    shipment_id: redelivered.id,
  });
  assert(
    cleared.length === 1 &&
      cleared[0].status === "RESOLVED" &&
      cleared[0].resolved_by === "system",
    "the exception closes itself when the parcel is delivered after all"
  );

  console.log(
    "# FR-FUL-008: a parcel returned to the sender is a support task"
  );
  const bounced = await ship("bounce");
  await scan(bounced.tracking_number!, "PICKED_UP", 300);
  await scan(bounced.tracking_number!, "DELIVERY_FAILED", 200);
  await scan(bounced.tracking_number!, "RETURNING", 100);
  await scan(bounced.tracking_number!, "RETURNED", 10);
  open = await ful.listShipmentExceptions({
    shipment_id: bounced.id,
    status: "OPEN",
  });
  const types = open.map((e: any) => e.type).sort();
  assert(
    types.join() === "DELIVERY_FAILED,RETURNED_TO_SENDER",
    `both the failed delivery and the return to sender are open (${types})`
  );
  await expectFail(
    () =>
      resolveShipmentExceptionWorkflow(container).run({
        input: {
          ...actor,
          exception_id: open[0].id,
          resolution: "REFUND",
          note: " ",
        },
      }),
    "needs a note",
    "a resolution needs a note"
  );
  for (const exception of open) {
    await resolveShipmentExceptionWorkflow(container).run({
      input: {
        ...actor,
        exception_id: exception.id,
        resolution: "REDELIVER",
        note: "customer asked for another attempt",
      },
    });
  }
  assert(
    (
      await ful.listShipmentExceptions({
        shipment_id: bounced.id,
        status: "OPEN",
      })
    ).length === 0,
    "support resolved both with a note"
  );
  await expectFail(
    () =>
      resolveShipmentExceptionWorkflow(container).run({
        input: {
          ...actor,
          exception_id: open[0].id,
          resolution: "CLOSE",
          note: "again",
        },
      }),
    "already resolved",
    "an exception is resolved once"
  );

  console.log("# FR-FUL-003: a returned parcel is replaced explicitly");
  const live = await ship("live");
  await scan(live.tracking_number!, "PICKED_UP", 100);
  await expectFail(
    () =>
      replaceCarrierShipmentWorkflow(container).run({
        input: { ...actor, shipment_id: live.id, reason: "lost" },
      }),
    "may still be on its way",
    "a parcel that may still be moving cannot be replaced"
  );
  const sameAgain = await createCarrierShipment(ful, carrier, {
    ...actor,
    order_id: `order_bounce_${run}`,
    medusa_fulfillment_id: `ful_bounce_${run}`,
    request: request(`F-bounce-${run}-X`),
  });
  assert(
    sameAgain.id === bounced.id,
    "without an explicit replacement the same fulfillment never gets a second shipment"
  );
  const replaced = await replaceCarrierShipmentWorkflow(container).run({
    input: {
      ...actor,
      shipment_id: bounced.id,
      reason: "returned to sender, customer wants a redelivery",
    },
  });
  const next = replaced.result.shipment as any;
  assert(
    next.id !== bounced.id &&
      next.merchant_reference === `F-bounce-${run}-R1` &&
      next.create_state === "SUCCEEDED",
    "a new shipment F-…-R1 is created at the carrier"
  );
  const old = (await ful.listCarrierShipments({ id: bounced.id }))[0];
  assert(
    old.superseded_at && old.superseded_by_id === next.id,
    "the old row is kept, marked as superseded by the new one"
  );
  const visible = await ful.shipmentsForOrder(`order_bounce_${run}`);
  assert(
    visible.length === 1 && visible[0].id === next.id,
    "customers and agents only see the replacement"
  );
  await expectFail(
    () =>
      replaceCarrierShipmentWorkflow(container).run({
        input: { ...actor, shipment_id: bounced.id, reason: "again" },
      }),
    "already replaced",
    "a shipment is replaced once"
  );
  const second = carrier.parcels.size;
  void second;

  console.log(
    "# FR-FUL-005/006: events from a polled batch go through the same guard"
  );
  const summary = await ingestCarrierEvents(
    ful,
    carrier,
    [
      {
        tracking_number: next.tracking_number,
        carrier_status: "Pickup scan",
        occurred_at: new Date(),
      },
    ],
    actor
  );
  assert(summary.applied === 1, "an ingested scan is applied once");

  console.log("# audit: cancelling a shipment is recorded");
  const cancellable = await ship("cancel");
  await cancelCarrierShipmentWorkflow(container).run({
    input: { ...actor, shipment_id: cancellable.id },
  });
  const integration: any = container.resolve("integration");
  assert(
    (await integration.listAuditLogs({ resource_id: cancellable.id })).some(
      (r: any) => r.action === "fulfillment.shipment.cancel"
    ),
    "the cancel has an audit row"
  );

  console.log("# FR-RET-004: an exchange sends its replacement");
  const sku = `DRESS-${run}-S`;
  const exchangeSku = `DRESS-${run}-M`;
  const sellable = await fg.createFgLocations({
    code: `XSELL-${run}`,
    name: "Sellable",
    warehouse_code: "HCM",
    is_commerce: true,
  });
  await receiveFinishedGoodsWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("x-seed"),
      sku: exchangeSku,
      qty: 5,
      location_id: sellable.id,
      mo_id: "mo_seed",
      packing_record_id: `pack_x_${run}`,
    },
  });
  const order = await orders.createOrders({
    currency_code: "vnd",
    email: "lan@example.test",
    shipping_address: {
      first_name: "Lan",
      last_name: "Nguyen",
      phone: "0900000000",
      address_1: "1 Le Loi",
      city: "District 1",
      province: "HCM",
      country_code: "vn",
    },
    items: [
      { title: "Dress S", quantity: 2, unit_price: 100000, variant_sku: sku },
    ],
  });
  const rmaRow = await rma.requestReturn({
    ...actor,
    idempotency_key: k("x-req"),
    order_id: order.id,
    customer_id: null,
    type: "EXCHANGE",
    exchange_sku: exchangeSku,
    reason: "too small",
    items: [{ order_line_id: order.items[0].id, sku, qty: 2 }],
    eligibility: { eligible: true, reasons: [] },
  });
  await rma.authorizeReturn({ ...actor, return_id: rmaRow.id });
  await reserveExchangeWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("x-reserve"),
      return_id: rmaRow.id,
      location_id: sellable.id,
    },
  });
  await expectFail(
    () =>
      shipExchangeReplacementWorkflow(container).run({
        input: { ...actor, return_id: rmaRow.id },
      }),
    "after the returned goods arrive",
    "the replacement waits until the returned goods are back"
  );
  await rma.receiveReturn({ ...actor, return_id: rmaRow.id });
  const onHandBefore = (
    await fg.listFgBalances({ sku: exchangeSku, location_id: sellable.id })
  )[0].on_hand;
  const sent = await shipExchangeReplacementWorkflow(container).run({
    input: { ...actor, return_id: rmaRow.id },
  });
  assert(
    sent.result.replay === false && sent.result.shipment_id,
    "the replacement is sent once the return is received"
  );
  const parcel = (
    await ful.listCarrierShipments({ exchange_return_id: rmaRow.id })
  )[0];
  assert(
    parcel &&
      parcel.create_state === "SUCCEEDED" &&
      parcel.merchant_reference === `X-${rmaRow.id}` &&
      parcel.request.cod_amount === 0 &&
      parcel.request.receiver.name === "Lan Nguyen" &&
      parcel.request.parcel.items[0].sku === exchangeSku &&
      parcel.request.parcel.items[0].qty === 2,
    "a carrier parcel goes to the customer's address with the replacement, no COD"
  );
  const onHandAfter = (
    await fg.listFgBalances({ sku: exchangeSku, location_id: sellable.id })
  )[0].on_hand;
  assert(
    Number(onHandBefore) - Number(onHandAfter) === 2,
    "the two replacement pieces left the finished-goods ledger"
  );
  const rmaAfter = (await rma.listReturnAuthorizations({ id: rmaRow.id }))[0];
  assert(
    rmaAfter.replacement_shipment_id === parcel.id &&
      rmaAfter.replacement_shipped_at,
    "the return records the replacement shipment"
  );
  const again = await shipExchangeReplacementWorkflow(container).run({
    input: { ...actor, return_id: rmaRow.id },
  });
  assert(
    again.result.replay === true &&
      (await ful.listCarrierShipments({ exchange_return_id: rmaRow.id }))
        .length === 1,
    "asking again sends nothing more"
  );
  assert((await fg.reconcile()).ok, "the finished-goods ledger reconciles");
  const plain = await rma.requestReturn({
    ...actor,
    idempotency_key: k("x-plain"),
    order_id: order.id,
    customer_id: null,
    type: "RETURN",
    reason: "changed my mind",
    items: [{ order_line_id: order.items[0].id, sku, qty: 1 }],
    eligibility: { eligible: true, reasons: [] },
  });
  await expectFail(
    () =>
      shipExchangeReplacementWorkflow(container).run({
        input: { ...actor, return_id: plain.id },
      }),
    "Only an exchange",
    "a plain return has no replacement to send"
  );
  console.log("INTEGRATION TEST PASSED");
}
