import {
  api,
  check,
  eventually,
  kafkaRead,
  KAFKA_PREFIX,
  mock,
  run,
  scrapeMetrics,
  section,
  store,
} from "./lib.mjs";
import { newCustomer, orderDetail, placeOrder } from "./setup.mjs";

/**
 * What the requirement review added on top of the original journeys: money
 * rules, delivery problems, tracking repair, stock operations, the analytics
 * marts and the Kafka feed. Runs after the make-to-stock journey, which
 * leaves fabric and finished goods in the store.
 */
export const platform = async (ctx) => {
  const { t, publishableKey } = ctx;
  const shipmentsOf = async (orderId) =>
    (
      await api(
        t.support,
        "GET",
        `/admin/fulfillment/shipments?order_id=${orderId}`
      )
    ).body.shipments;
  const levels = async (sku) => {
    const items = await api(
      t.admin,
      "GET",
      `/admin/inventory-items?sku=${sku}&fields=id,sku,*location_levels`
    );
    const rows = items.body.inventory_items[0].location_levels;
    return {
      stocked: rows.reduce((n, l) => n + Number(l.stocked_quantity), 0),
      reserved: rows.reduce((n, l) => n + Number(l.reserved_quantity), 0),
    };
  };

  section("FR-COM-002: a promotion changes the price, nothing in production");
  const code = `SAVE10-${run}`;
  const promo = await api(t.admin, "POST", "/admin/promotions", {
    code,
    type: "standard",
    status: "active",
    is_automatic: false,
    application_method: {
      type: "percentage",
      target_type: "items",
      allocation: "each",
      max_quantity: 10,
      value: 10,
      currency_code: "vnd",
    },
  });
  check(
    promo.status === 200 || promo.status === 201,
    `a 10% promotion is created (${promo.status} ${JSON.stringify(promo.body).slice(0, 160)})`
  );
  const shopper = await newCustomer(ctx, "promo");
  const cart = await store(
    publishableKey,
    shopper.token,
    "POST",
    "/store/carts",
    { region_id: ctx.region.id, email: shopper.email }
  );
  const cartId = cart.body.cart.id;
  await store(
    publishableKey,
    shopper.token,
    "POST",
    `/store/carts/${cartId}/line-items`,
    { variant_id: ctx.sku("TEE-BLK-L"), quantity: 1 }
  );
  const discounted = await store(
    publishableKey,
    shopper.token,
    "POST",
    `/store/carts/${cartId}/promotions`,
    { promo_codes: [code] }
  );
  const priced = await store(
    publishableKey,
    shopper.token,
    "GET",
    `/store/carts/${cartId}`
  );
  const subtotal = Number(priced.body.cart.item_subtotal);
  check(
    discounted.status === 200 &&
      subtotal > 0 &&
      Math.round(Number(priced.body.cart.discount_total)) ===
        Math.round(subtotal * 0.1),
    `the cart shows a 10% discount (${priced.body.cart.discount_total} of ${subtotal})`
  );
  const boms = await api(t.planner, "GET", "/admin/manufacturing/boms");
  const mos = await api(t.planner, "GET", "/admin/manufacturing/mos");
  const keys = [
    ...Object.keys(boms.body.boms[0] ?? {}),
    ...Object.keys(
      mos.body.manufacturing_orders?.[0] ?? mos.body.mos?.[0] ?? {}
    ),
  ];
  check(
    keys.length > 0 && !keys.some((key) => /price|cost|margin/i.test(key)),
    "manufacturing masters carry no price or cost fields, so promotions cannot touch them"
  );

  section("FR-COM-005: between order and fulfilment only Medusa reserves");
  const customer = await newCustomer(ctx, "window");
  const lStart = await ctx.fgOnHand("TEE-BLK-L");
  const before = await levels("TEE-BLK-L");
  const placed = await placeOrder(ctx, customer, [["TEE-BLK-L", 1]]);
  check(Boolean(placed.order), "order placed for 1 x TEE-BLK-L");
  const order = await orderDetail(ctx, placed.order.id);
  const during = await levels("TEE-BLK-L");
  check(
    during.reserved === before.reserved + 1,
    "Medusa reserves the piece for the order"
  );
  check(
    (await ctx.fgOnHand("TEE-BLK-L")) === lStart,
    "the finished-goods ledger is untouched until the warehouse fulfils"
  );
  const fulfilment = await api(
    t.warehouse,
    "POST",
    `/admin/orders/${order.id}/fulfillments`,
    {
      location_id: ctx.stockLocation.id,
      items: [{ id: order.items[0].id, quantity: 1 }],
    }
  );
  check(fulfilment.status === 200, "the warehouse creates the fulfilment");
  const shipment = await eventually("carrier shipment", async () => {
    const s = (await shipmentsOf(order.id))[0];
    return s?.create_state === "SUCCEEDED" && s.tracking_number ? s : null;
  });
  await eventually(
    "the ledger ships the piece out",
    async () => (await ctx.fgOnHand("TEE-BLK-L")) === lStart - 1
  );
  check(true, "fulfilment moves the piece out of the finished-goods ledger");
  await eventually(
    "Medusa reservation is consumed",
    async () => (await levels("TEE-BLK-L")).reserved === before.reserved
  );
  check(true, "and the reservation in Medusa is consumed, not doubled");

  section(
    "FR-FUL-004: the carrier's tracking number is on the Medusa fulfillment"
  );
  const labelled = await eventually(
    "tracking label on the fulfillment",
    async () => {
      const o = await api(
        t.admin,
        "GET",
        `/admin/orders/${order.id}?fields=id,*fulfillments,*fulfillments.labels`
      );
      return o.body.order.fulfillments?.[0]?.labels?.find(
        (l) => l.tracking_number === shipment.tracking_number
      );
    }
  );
  check(
    Boolean(labelled),
    `Medusa shows ${shipment.tracking_number} on the fulfillment`
  );

  section("FR-FUL-006: polling repairs scans whose webhook never arrived");
  const bill = shipment.tracking_number;
  await mock.scan(bill, "Pickup scan", { push: false });
  await mock.scan(bill, "Out for delivery", { push: false });
  const statusOf = async () =>
    (
      await store(
        publishableKey,
        customer.token,
        "GET",
        `/store/fashion/orders/${order.id}/shipments`
      )
    ).body.shipments?.[0]?.status;
  check(
    (await statusOf()) !== "OUT_FOR_DELIVERY",
    "no webhook came, so nothing changed yet"
  );
  await eventually(
    "the poll job to catch up",
    async () => (await statusOf()) === "OUT_FOR_DELIVERY",
    { timeout: 180_000, every: 3000 }
  );
  check(true, "the poll job found the two missed scans: OUT_FOR_DELIVERY");

  section("FR-FUL-008: a failed delivery reaches support");
  await mock.scan(bill, "Delivery failed - recipient absent");
  const failed = await eventually("a delivery exception", async () => {
    const list = await api(
      t.support,
      "GET",
      `/admin/fulfillment/exceptions?order_id=${order.id}&status=OPEN`
    );
    return list.body.exceptions?.find((e) => e.type === "DELIVERY_FAILED");
  });
  check(Boolean(failed), "support has a DELIVERY_FAILED task for the order");
  await eventually(
    "the gauge to show it",
    async () =>
      /fashion_shipment_exceptions_open\{type="DELIVERY_FAILED"\} [1-9]/.test(
        await scrapeMetrics()
      ),
    { timeout: 60_000, every: 5000 }
  );
  check(true, "monitoring counts the open exception");
  const tooEarly = await api(
    t.support,
    "POST",
    `/admin/fulfillment/shipments/${shipment.id}/replace`,
    { reason: "customer asked" }
  );
  check(
    tooEarly.status >= 400 && tooEarly.status < 500,
    "a parcel that may still be on its way cannot be replaced"
  );
  check(
    (
      await api(
        t.packer,
        "POST",
        `/admin/fulfillment/exceptions/${failed.id}/resolve`,
        { resolution: "REDELIVER", note: "x" }
      )
    ).status === 403,
    "packers cannot resolve delivery problems"
  );

  await mock.scan(bill, "Returned to sender - signed");
  await eventually("the parcel to be RETURNED", async () => {
    const s = (await shipmentsOf(order.id))[0];
    return s?.status === "RETURNED";
  });
  const open = await api(
    t.support,
    "GET",
    `/admin/fulfillment/exceptions?order_id=${order.id}&status=OPEN`
  );
  check(
    open.body.exceptions.some((e) => e.type === "RETURNED_TO_SENDER"),
    "the return to sender is a task as well"
  );
  for (const exception of open.body.exceptions) {
    const resolved = await api(
      t.support,
      "POST",
      `/admin/fulfillment/exceptions/${exception.id}/resolve`,
      { resolution: "REDELIVER", note: "customer confirmed the address" }
    );
    check(resolved.status === 200, `support resolves ${exception.type}`);
  }

  section("FR-FUL-003: the returned parcel is replaced on purpose");
  const replaced = await api(
    t.support,
    "POST",
    `/admin/fulfillment/shipments/${shipment.id}/replace`,
    { reason: "returned to sender, customer wants a redelivery" }
  );
  check(
    replaced.status === 201 &&
      replaced.body.shipment.merchant_reference.endsWith("-R1") &&
      replaced.body.shipment.create_state === "SUCCEEDED",
    `a replacement shipment is booked (${replaced.status})`
  );
  const newBill = replaced.body.shipment.tracking_number;
  check(newBill && newBill !== bill, `with a new waybill ${newBill}`);
  const visible = await store(
    publishableKey,
    customer.token,
    "GET",
    `/store/fashion/orders/${order.id}/shipments`
  );
  check(
    visible.body.shipments.length === 1 &&
      visible.body.shipments[0].tracking_number === newBill,
    "the customer only sees the replacement"
  );
  await mock.scan(newBill, "Pickup scan");
  await mock.scan(newBill, "Delivered - signed");
  await eventually(
    "the replacement to be delivered",
    async () => (await statusOf()) === "DELIVERED"
  );
  check(true, "the replacement parcel is delivered");

  section("FR-INV-009..013: counts, transfers, labels and scanning");
  const fabric = ctx.fabric;
  const balances = (
    await api(
      t.warehouse,
      "GET",
      `/admin/material-inventory/balances?material_id=${fabric.id}&limit=50`
    )
  ).body.balances.filter((b) => Number(b.on_hand_qty) >= 50);
  check(
    balances.length > 0,
    "the fabric from the purchase order is still in the store"
  );
  const balance = balances[0];
  const rolls = (
    await api(
      t.warehouse,
      "GET",
      `/admin/material-inventory/rolls?material_id=${fabric.id}&limit=50`
    )
  ).body.rolls;
  const roll = rolls.find((r) => r.id === balance.roll_id);
  const labelRes = await api(
    t.warehouse,
    "GET",
    `/admin/material-inventory/labels/roll/${roll.roll_code}`
  );
  check(
    labelRes.status === 200 &&
      String(labelRes.body).includes("<svg") &&
      String(labelRes.body).includes(roll.roll_code),
    `roll ${roll.roll_code} has a printable barcode label`
  );
  const scanned = await api(
    t.warehouse,
    "GET",
    `/admin/material-inventory/scan/${roll.roll_code}`
  );
  check(
    scanned.status === 200 &&
      scanned.body.type === "ROLL" &&
      scanned.body.balances.length >= 1,
    "scanning the roll returns it with its stock"
  );
  const counted = await api(
    t.warehouse,
    "POST",
    "/admin/material-inventory/cycle-counts",
    {
      balance_id: balance.id,
      counted_qty: Number(balance.on_hand_qty) - 0.5,
      expected_version: balance.version,
      reason: "shelf count",
    }
  );
  check(
    counted.status === 201 && counted.body.status === "PENDING_APPROVAL",
    "the count waits for approval"
  );
  const self = await api(
    t.warehouse,
    "POST",
    `/admin/material-inventory/cycle-counts/${counted.body.count_id}/decision`,
    { decision: "APPROVE" }
  );
  check(
    self.status >= 400,
    "the person who counted cannot approve their own count"
  );
  const approved = await api(
    t.admin,
    "POST",
    `/admin/material-inventory/cycle-counts/${counted.body.count_id}/decision`,
    { decision: "APPROVE", reason: "recount agrees" }
  );
  check(
    approved.status === 200 && approved.body.adjusted === true,
    "a second person approves and the stock is adjusted"
  );

  const onHandTotal = async () =>
    (
      await api(
        t.warehouse,
        "GET",
        `/admin/material-inventory/materials/${fabric.id}/availability`
      )
    ).body.availability.reduce((n, r) => n + Number(r.on_hand), 0);
  const totalBefore = await onHandTotal();
  const hn = (
    await api(t.admin, "POST", "/admin/material-inventory/locations", {
      code: `HN-${run}`,
      name: "Hanoi raw material store",
      warehouse_code: `HN-${run}`,
    })
  ).body.location;
  const truck = (
    await api(t.admin, "POST", "/admin/material-inventory/locations", {
      code: `TRUCK-${run}`,
      name: "Truck",
      warehouse_code: "HCM",
      kind: "IN_TRANSIT",
    })
  ).body.location;
  const refused = await api(
    t.warehouse,
    "POST",
    "/admin/material-inventory/transfers",
    { balance_id: balance.id, to_location_id: hn.id, qty: 5 }
  );
  check(
    refused.status >= 400,
    "a direct transfer to another warehouse is refused"
  );
  const dispatch = await api(
    t.warehouse,
    "POST",
    "/admin/material-inventory/transfers/dispatch",
    {
      balance_id: balance.id,
      to_location_id: hn.id,
      qty: 5,
      transit_location_id: truck.id,
    }
  );
  check(dispatch.status === 201, "5 m are dispatched to Hanoi");
  check(
    (await onHandTotal()) === totalBefore,
    "the total is unchanged while the stock is on the truck"
  );
  const received = await api(
    t.warehouse,
    "POST",
    `/admin/material-inventory/transfers/${dispatch.body.transfer_id}/receive`,
    {}
  );
  check(
    received.status === 200 && (await onHandTotal()) === totalBefore,
    "Hanoi receives it and the total is still the same"
  );
  check(
    (await api(t.warehouse, "GET", "/admin/material-inventory/reconciliation"))
      .body.ok === true,
    "the material ledger reconciles after counts and transfers"
  );

  section("FR-ADM-004 / section 26: settings and country profiles");
  const set = await api(t.admin, "PUT", "/admin/settings/returns.window_days", {
    value: 21,
    scope_type: "COUNTRY",
    scope_id: "VN",
  });
  check(set.status === 200, "ERP admin sets a Vietnam-specific return window");
  check(
    (
      await api(t.support, "PUT", "/admin/settings/returns.window_days", {
        value: 5,
      })
    ).status === 403,
    "support cannot change settings"
  );
  check(
    (
      await api(t.admin, "POST", "/admin/country-profiles", {
        country_code: "vn",
        name: "Vietnam",
        currency_code: "VND",
        carrier_code: "JT",
        warehouse_codes: ["HCM"],
        return_window_days: 14,
        social_channels: ["MESSENGER"],
      })
    ).status === 201,
    "the Vietnam country profile names its carrier, currency and channel"
  );
  await api(
    t.admin,
    "DELETE",
    "/admin/settings/returns.window_days?scope_type=COUNTRY&scope_id=VN"
  );

  section("section 27: the analytics marts");
  const mart = async (name) =>
    (await api(t.sre, "GET", `/admin/analytics-marts/${name}?limit=500`)).body
      .rows;
  check(
    (await mart("production_output_daily")).some(
      (r) => r.sku === "TEE-BLK-M" && Number(r.packed_qty) >= 29
    ),
    "production output shows the T-shirts that were packed"
  );
  check(
    (await mart("material_consumption_daily")).some(
      (r) => r.material_id === fabric.id && Number(r.net_consumed) >= 78
    ),
    "material consumption shows the fabric issued to production"
  );
  check(
    (await mart("sell_through_weekly")).some(
      (r) => r.sku === "TEE-BLK-M" && Number(r.sold) >= 2
    ),
    "sell-through counts what customers bought"
  );
  const jt = (await mart("carrier_performance")).find(
    (r) => r.carrier_code === "JT"
  );
  check(
    jt && Number(jt.shipments) >= 2 && Number(jt.problem_parcels) >= 0,
    "carrier performance shows J&T's shipments"
  );
  check(
    (await mart("order_conversion_daily")).some(
      (r) => Number(r.orders_placed) >= 1
    ),
    "order conversion counts completed carts"
  );
  check(
    (await mart("fulfillment_lead_time")).some((r) => r.hours_to_ship !== null),
    "fulfillment lead time is measured per order"
  );
  check(
    (await mart("sku_margin_inputs")).some(
      (r) => r.product_sku === "TEE-BLK" && Number(r.material_cost_per_unit) > 0
    ),
    "SKU margin inputs give the T-shirt a material cost from the purchase order price"
  );
  check(
    (await api(t.cutter, "GET", "/admin/analytics-marts/carrier_performance"))
      .status === 403,
    "a cutting operator cannot read analytics"
  );

  section("NFR-OBS: the new signals are exposed");
  const metrics = await scrapeMetrics();
  for (const needle of [
    'fashion_provider_call_duration_ms_count{provider="jt"',
    "fashion_fg_projection_pending",
    "fashion_qc_inspected_pieces_24h",
    "fashion_reconciliation_issues",
    "fashion_http_auth_failures_total",
  ]) {
    check(metrics.includes(needle), `metrics expose ${needle.split("{")[0]}`);
  }

  section("NFR-AVL-003: the event feed reaches Kafka");
  const topics = [
    "fashion.inventory.events.v1",
    "fashion.manufacturing.events.v1",
    "fashion.finished-goods.events.v1",
    "fashion.fulfillment.events.v1",
  ].map((topic) => `${KAFKA_PREFIX}${topic}`);
  let records = [];
  await eventually(
    "domain events on Kafka",
    async () => {
      records = await kafkaRead(topics, 6);
      const types = new Set(records.map((r) => r.value?.event_type));
      return [
        "inventory.material_received.v1",
        "manufacturing.mo_created.v1",
        "finished-goods.receipt_posted.v1",
        "fulfillment.shipment_created.v1",
        "fulfillment.shipment_exception_opened.v1",
        "inventory.transfer_dispatched.v1",
      ].every((type) => types.has(type));
    },
    { timeout: 120_000, every: 2000 }
  );
  check(
    true,
    "stock receipts, production orders, finished goods, shipments, exceptions and transfers are on Kafka"
  );
  check(
    records.every((r) => r.key === r.value.aggregate_id),
    "every record is keyed by its aggregate id (per-aggregate ordering)"
  );
  const byKey = new Map();
  for (const record of records) {
    byKey.set(record.key, [...(byKey.get(record.key) ?? []), record]);
  }
  const outOfOrder = [...byKey.values()].filter((list) => {
    const times = [...list]
      .sort((a, b) => a.partition - b.partition || a.offset - b.offset)
      .map((r) => r.value.occurred_at);
    return times.join() !== [...times].sort().join();
  });
  check(
    outOfOrder.length === 0,
    "within one aggregate the events arrive in the order they happened"
  );
  check(
    records.some((r) => r.value.causation_id),
    "events caused by a webhook, an order or another event name their cause (causation_id)"
  );
  return ctx;
};
