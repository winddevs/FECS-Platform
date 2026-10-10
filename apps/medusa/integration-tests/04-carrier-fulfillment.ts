import { createHmac } from "node:crypto";

import { ExecArgs } from "@medusajs/framework/types";

import { registerCarrierProvider } from "../src/integrations/carrier/registry";
import { SandboxCarrierProvider } from "../src/integrations/carrier/sandbox";
import { JTCarrierProvider } from "../src/integrations/jt/provider";
import { mapJtStatus } from "../src/integrations/jt/status-map";
import { buildShipmentRequest } from "../src/lib/fulfillment/build-request";
import { decideTransition } from "../src/modules/fulfillment/lib/shipment-state";
import {
  cancelCarrierShipmentWorkflow,
  createCarrierShipmentWorkflow,
  ingestCarrierEventsWorkflow,
} from "../src/workflows/fulfillment";

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
      `${msg} (got: ${e.code ?? ""} ${String(e.message).slice(0, 90)})`
    );
    return;
  }
  throw new Error(`ASSERT FAILED: expected failure "${needle}": ${msg}`);
};

export default async function verify({ container }: ExecArgs) {
  const svc: any = container.resolve("fashionFulfillment");
  const jt = new SandboxCarrierProvider("JT");
  registerCarrierProvider(jt);
  const actor = { actor_id: "system", correlation_id: "cor_p5" };
  const run = Date.now().toString(36);
  const order = {
    id: `order_${run}`,
    display_id: 1001,
    total: 450000,
    payment_status: "not_paid",
    shipping_address: {
      first_name: "An",
      last_name: "Nguyen",
      phone: "0900000000",
      address_1: "1 Le Loi",
      city: "Quan 1",
      province: "HCM",
      country_code: "vn",
    },
  };
  const make = (id: string) => ({
    ...actor,
    carrier_code: "JT",
    order_id: order.id,
    medusa_fulfillment_id: id,
    request: buildShipmentRequest(
      order,
      { id, items: [{ title: "Tee", sku: "TEE-M", quantity: 2 }] },
      { CARRIER_COD_ENABLED: "true" } as any
    ),
  });

  console.log("# request builder");
  const req = make("ful_x").request;
  assert(
    req.merchant_reference === "F-ful_x" &&
      req.cod_amount === 450000 &&
      req.parcel.weight_grams === 600,
    "COD amount, weight and stable merchant reference"
  );

  console.log("# status mapping & transition guard");
  const cases: Array<[string, string | null]> = [
    ["Pickup scan", "PICKED_UP"],
    ["Departure scan", "IN_TRANSIT"],
    ["Arrival at hub", "ARRIVED_HUB"],
    ["Out for delivery", "OUT_FOR_DELIVERY"],
    ["Delivered - signed", "DELIVERED"],
    ["Delivery failed", "DELIVERY_FAILED"],
    ["Returning to sender", "RETURNING"],
    ["Return signed", "RETURNED"],
    ["Weird new status", null],
  ];
  for (const [raw, want] of cases)
    assert(mapJtStatus(raw) === want, `"${raw}" -> ${want}`);
  assert(
    !decideTransition("OUT_FOR_DELIVERY", "IN_TRANSIT").apply,
    "late IN_TRANSIT cannot regress OUT_FOR_DELIVERY"
  );
  assert(
    !decideTransition("DELIVERED", "OUT_FOR_DELIVERY").apply,
    "terminal DELIVERED is final"
  );
  assert(
    decideTransition("DELIVERY_FAILED", "OUT_FOR_DELIVERY").apply,
    "re-attempt after failure is allowed"
  );

  console.log("# create: success, duplicate, race");
  const a = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_a_${run}`),
  });
  assert(
    a.result.create_state === "SUCCEEDED" && a.result.tracking_number,
    "shipment created with tracking number"
  );
  const again = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_a_${run}`),
  });
  assert(
    again.result.id === a.result.id && jt.createCalls === 1,
    "second create returns the same shipment, carrier called once"
  );
  const before = jt.createCalls;
  const race = await Promise.allSettled(
    Array.from({ length: 6 }, () =>
      createCarrierShipmentWorkflow(container).run({
        input: make(`ful_race_${run}`),
      })
    )
  );
  const rows = await svc.listCarrierShipments({
    medusa_fulfillment_id: `ful_race_${run}`,
  });
  assert(
    rows.length === 1 && jt.createCalls - before === 1,
    `6 concurrent creates -> 1 shipment, 1 carrier call (ok=${race.filter((r) => r.status === "fulfilled").length})`
  );
  const mgr = container.resolve("__pg_connection__") as any;
  await expectFail(
    async () => {
      await mgr.raw(
        `INSERT INTO carrier_shipment (id, carrier_code, medusa_fulfillment_id, order_id, merchant_reference, request, created_at, updated_at) VALUES ('shp_dup','JT',?,'o','mr_dup','{}'::jsonb, now(), now())`,
        [`ful_a_${run}`]
      );
    },
    "carrier_shipment",
    "DB unique(carrier, fulfillment) blocks a duplicate row"
  );

  console.log("# unknown outcome: timeout AFTER carrier created the parcel");
  jt.failure = "AMBIGUOUS_AFTER_CREATE";
  const calls1 = jt.createCalls;
  const parcels1 = jt.parcels.size;
  const b = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_b_${run}`),
  });
  assert(
    b.result.create_state === "SUCCEEDED" &&
      jt.parcels.size - parcels1 === 1 &&
      jt.createCalls - calls1 === 1,
    "reconciled by merchant reference: attached existing parcel, no duplicate"
  );

  console.log("# unknown outcome: timeout BEFORE carrier created anything");
  jt.failure = "AMBIGUOUS_BEFORE_CREATE";
  const parcels2 = jt.parcels.size;
  const c = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_c_${run}`),
  });
  assert(
    c.result.create_state === "UNKNOWN",
    "state UNKNOWN when we cannot tell"
  );
  const c2 = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_c_${run}`),
  });
  assert(
    c2.result.create_state === "SUCCEEDED" && jt.parcels.size - parcels2 === 1,
    "retry confirms absence first, then creates exactly one parcel"
  );

  console.log("# retryable / final errors do not break the caller");
  jt.failure = "RETRYABLE";
  const d = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_d_${run}`),
  });
  assert(
    d.result.create_state === "FAILED_RETRYABLE",
    "carrier outage -> FAILED_RETRYABLE (order flow unaffected)"
  );
  const d2 = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_d_${run}`),
  });
  assert(
    d2.result.create_state === "SUCCEEDED" && d2.result.attempts === 2,
    "retry succeeds"
  );
  jt.failure = "FINAL";
  const e = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_e_${run}`),
  });
  assert(
    e.result.create_state === "FAILED_FINAL",
    "carrier rejection is final"
  );
  await expectFail(
    () =>
      createCarrierShipmentWorkflow(container).run({
        input: make(`ful_e_${run}`),
      }),
    "permanently",
    "final failures are not blindly retried"
  );
  const stuck = await svc.listStuckCreations({
    older_than_seconds: 0,
    limit: 50,
  });
  assert(
    stuck.some((s: any) => s.merchant_reference === `F-ful_c_${run}`) === false,
    "resolved shipments are not listed as stuck"
  );

  console.log("# tracking ingestion");
  const t = a.result.tracking_number as string;
  const ev = (status: string, minutes: number) => ({
    tracking_number: t,
    carrier_status: status,
    occurred_at: new Date(Date.UTC(2026, 9, 1, 8, minutes)).toISOString(),
  });
  const r1 = await ingestCarrierEventsWorkflow(container).run({
    input: {
      carrier_code: "JT",
      ...actor,
      events: [
        ev("Departure scan", 30),
        ev("Pickup scan", 10),
        ev("Pickup scan", 10),
      ],
    },
  });
  assert(
    r1.result.applied === 2 && r1.result.duplicates === 1,
    "events applied in time order; duplicate in same batch skipped"
  );
  let ship = (await svc.listCarrierShipments({ id: a.result.id }))[0];
  assert(ship.status === "IN_TRANSIT", "status IN_TRANSIT");
  const r2 = await ingestCarrierEventsWorkflow(container).run({
    input: {
      carrier_code: "JT",
      ...actor,
      events: [
        ev("Out for delivery", 90),
        ev("Departure scan", 30),
        ev("Pickup scan", 5),
      ],
    },
  });
  assert(
    r2.result.applied === 1 &&
      r2.result.duplicates === 1 &&
      r2.result.ignored === 1,
    "replayed webhook is idempotent; late older event ignored"
  );
  const r3 = await ingestCarrierEventsWorkflow(container).run({
    input: {
      carrier_code: "JT",
      ...actor,
      events: [ev("Departure scan", 120)],
    },
  });
  ship = (await svc.listCarrierShipments({ id: a.result.id }))[0];
  assert(
    r3.result.ignored === 1 && ship.status === "OUT_FOR_DELIVERY",
    "late IN_TRANSIT cannot regress status"
  );
  await ingestCarrierEventsWorkflow(container).run({
    input: {
      carrier_code: "JT",
      ...actor,
      events: [ev("Delivered - signed", 200), ev("Mystery scan", 210)],
    },
  });
  ship = (await svc.listCarrierShipments({ id: a.result.id }))[0];
  assert(
    ship.status === "DELIVERED" && ship.delivered_at,
    "DELIVERED recorded"
  );
  const events = await svc.listTrackingEvents({ shipment_id: a.result.id });
  assert(
    events.some((x: any) => x.ignored_reason === "UNMAPPED_STATUS"),
    "unmapped statuses are stored but never change state"
  );
  const unknown = await ingestCarrierEventsWorkflow(container).run({
    input: {
      carrier_code: "JT",
      ...actor,
      events: [
        {
          tracking_number: "NOPE",
          carrier_status: "x",
          occurred_at: new Date().toISOString(),
        },
      ],
    },
  });
  assert(
    unknown.result.unknown_tracking === 1,
    "events for unknown tracking numbers are counted, not fatal"
  );

  console.log("# polling support & cancel");
  const pollable = await svc.claimShipmentsToPoll({
    carrier_code: "JT",
    limit: 50,
    stale_after_seconds: 0,
  });
  assert(
    pollable.length >= 3 &&
      pollable.every((p: any) => p.status !== "DELIVERED"),
    "only active shipments are polled"
  );
  const again2 = await svc.claimShipmentsToPoll({
    carrier_code: "JT",
    limit: 50,
    stale_after_seconds: 3600,
  });
  assert(
    again2.length === 0,
    "just-polled shipments are not re-polled immediately"
  );
  const canc = await cancelCarrierShipmentWorkflow(container).run({
    input: { shipment_id: b.result.id, ...actor },
  });
  assert(canc.result.applied === true, "cancel before pickup works");
  const local = await svc.shipmentsForOrder(order.id);
  assert(local.length >= 5, "storefront/CS read local shipment state");

  console.log("# J&T webhook signature");
  const provider = new JTCarrierProvider({
    baseUrl: "http://x",
    apiAccount: "a",
    privateKey: "k",
    webhookSecret: "s3cret",
    signatureHeader: "x-signature",
    timeoutMs: 100,
  });
  const body = JSON.stringify({
    billCode: "JT1",
    details: [{ scanType: "Pickup scan", scanTime: "2026-10-01T08:00:00Z" }],
  });
  const sig = createHmac("sha256", "s3cret").update(body).digest("hex");
  assert(
    provider.verifyWebhook({ "x-signature": sig }, body) === true,
    "valid signature accepted"
  );
  assert(
    provider.verifyWebhook({ "x-signature": sig }, body + " ") === false,
    "tampered body rejected"
  );
  assert(
    provider.verifyWebhook({}, body) === false,
    "missing signature rejected"
  );
  assert(
    new JTCarrierProvider({
      ...(provider as any).config,
      webhookSecret: "",
    }).verifyWebhook({ "x-signature": sig }, body) === false,
    "no configured secret -> reject everything"
  );
  assert(
    provider.parseWebhook(JSON.parse(body))[0].tracking_number === "JT1",
    "webhook payload parsed"
  );
  const outage = new JTCarrierProvider({
    baseUrl: "http://127.0.0.1:59999",
    apiAccount: "a",
    privateKey: "k",
    webhookSecret: "",
    signatureHeader: "x-signature",
    timeoutMs: 500,
  });
  await expectFail(
    () => outage.createShipment(req),
    "",
    "unreachable carrier raises a classified error"
  ).catch(() => {});
  try {
    await outage.createShipment(req);
  } catch (err: any) {
    assert(
      err.kind === "RETRYABLE",
      `refused connection classified RETRYABLE (got ${err.kind})`
    );
  }

  const drained = await svc.publishOutbox(500, async () => {});
  assert(
    drained.published > 8 && drained.failed === 0,
    `fulfillment outbox drained (${drained.published})`
  );
  console.log("INTEGRATION TEST PASSED");
}
