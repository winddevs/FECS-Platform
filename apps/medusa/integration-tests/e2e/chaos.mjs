// Building blocks for the failure scenarios in docker/e2e/chaos.sh. The shell
// script stops and starts containers; this script does the HTTP side and
// prints machine-readable `RESULT {json}` lines.
//
//   SCENARIO=place|await-shipment|shipment-state|stock|scan-burst|arm
import { check, eventually, login, mock, api, run } from "./lib.mjs";
import { newCustomer, orderDetail, placeOrder, setup } from "./setup.mjs";

const scenario = process.env.SCENARIO;
const arg = process.env.ARG ?? "";
const result = (value) => console.log(`RESULT ${JSON.stringify(value)}`);

if (scenario === "arm") {
  const [operation, mode, remaining] = arg.split(":");
  await mock.fail(operation, mode, Number(remaining ?? 1));
  result({ armed: { operation, mode, remaining } });
  process.exit(0);
}

const ctx = await setup().catch(() => null);
if (!ctx) {
  console.error("platform not ready");
  process.exit(1);
}
const shipmentsOf = async (orderId) =>
  (
    await api(
      ctx.t.support,
      "GET",
      `/admin/fulfillment/shipments?order_id=${orderId}`
    )
  ).body.shipments ?? [];

if (scenario === "place") {
  // An order for one T-shirt, paid, with the fulfilment created in Medusa.
  const customer = await newCustomer(ctx, "chaos");
  const placed = await placeOrder(ctx, customer, [["TEE-BLK-M", 1]]);
  if (!placed.order) {
    console.error("order failed", JSON.stringify(placed.error?.body));
    process.exit(1);
  }
  const order = await orderDetail(ctx, placed.order.id);
  const fulfilment = await api(
    ctx.t.warehouse,
    "POST",
    `/admin/orders/${order.id}/fulfillments`,
    {
      location_id: ctx.stockLocation.id,
      items: [{ id: order.items[0].id, quantity: 1 }],
    }
  );
  if (fulfilment.status !== 200) {
    console.error(
      "fulfilment failed",
      fulfilment.status,
      JSON.stringify(fulfilment.body)
    );
    process.exit(1);
  }
  result({ order_id: order.id });
} else if (scenario === "shipment-state") {
  const list = await shipmentsOf(arg);
  result({
    shipments: list.map((s) => ({
      create_state: s.create_state,
      status: s.status,
      tracking: s.tracking_number,
    })),
  });
} else if (scenario === "await-shipment") {
  const [orderId, wantParcels] = arg.split(":");
  const shipment = await eventually(
    "shipment SUCCEEDED",
    async () => {
      const s = (await shipmentsOf(orderId))[0];
      return s?.create_state === "SUCCEEDED" && s.tracking_number ? s : null;
    },
    { timeout: 240_000, every: 3000 }
  );
  const parcels = (await mock.state()).parcels.filter(
    (p) => p.txlogisticId === shipment.merchant_reference
  );
  check(
    parcels.length === Number(wantParcels ?? 1),
    `exactly ${wantParcels ?? 1} parcel at the carrier for ${shipment.merchant_reference} (no duplicate waybill)`
  );
  result({ tracking: shipment.tracking_number, parcels: parcels.length });
} else if (scenario === "scan-burst") {
  // The same carrier push delivered many times at once (retries, two workers).
  const [orderId] = arg.split(":");
  const shipment = (await shipmentsOf(orderId))[0];
  const body = JSON.stringify({
    billCode: shipment.tracking_number,
    details: [{ scanType: "Pickup scan", scanTime: "2026-10-10T08:00:00Z" }],
  });
  const { createHmac } = await import("node:crypto");
  const signature = createHmac(
    "sha256",
    process.env.JT_WEBHOOK_SECRET ?? "jt-webhook-secret"
  )
    .update(body)
    .digest("hex");
  const responses = await Promise.all(
    Array.from({ length: 12 }, () =>
      fetch(`${process.env.BASE_URL}/webhooks/jt/tracking`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-signature": signature,
        },
        body,
      }).then((r) => r.json())
    )
  );
  const stored = responses.filter((r) => r.duplicate === false).length;
  check(
    stored === 1,
    `12 identical pushes -> 1 stored, ${12 - stored} deduplicated`
  );
  await eventually(
    "status PICKED_UP",
    async () => (await shipmentsOf(orderId))[0]?.status === "PICKED_UP"
  );
  const events = await api(
    ctx.t.support,
    "GET",
    `/admin/fulfillment/shipments/${shipment.id}`
  );
  result({ ok: true, status: events.status });
} else {
  console.error(`unknown SCENARIO ${scenario}`);
  process.exit(1);
}
void login;
void run;
