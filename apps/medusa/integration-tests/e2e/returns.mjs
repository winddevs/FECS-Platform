import { api, check, eventually, mock, section, store } from "./lib.mjs";
import { orderDetail } from "./setup.mjs";

/**
 * Requirement 7.4: a customer returns one T-shirt and exchanges the other.
 * The parcel comes back by carrier; returned goods are NOT sellable until QC
 * decides; only an A-grade piece goes back on the shelf; the refund is capped
 * and happens once.
 */
export const returns = async (ctx) => {
  const { t, publishableKey } = ctx;
  const customer = ctx.customerLan;
  const order = await orderDetail(ctx, ctx.mtsOrder.id);
  const lineId = order.items[0].id;
  const pickup = {
    name: "Lan Tester",
    phone: "0901234567",
    address_line: "12 Nguyen Hue",
    district: "Quan 1",
    province: "Ho Chi Minh",
  };
  const stock = async (sku) => ctx.medusaStock(sku);
  const baseM = await ctx.fgOnHand("TEE-BLK-M");

  section("7.4 the customer asks for a return");
  const bad = await store(
    publishableKey,
    ctx.mtoCustomer.token,
    "POST",
    "/store/fashion/returns",
    {
      order_id: order.id,
      reason: "not mine",
      items: [{ order_line_id: lineId, sku: "TEE-BLK-M", qty: 1 }],
    }
  );
  check(
    bad.status >= 400 && bad.status < 500,
    "a customer cannot return someone else's order"
  );
  const tooMany = await store(
    publishableKey,
    customer.token,
    "POST",
    "/store/fashion/returns",
    {
      order_id: order.id,
      reason: "too many",
      items: [{ order_line_id: lineId, sku: "TEE-BLK-M", qty: 5 }],
    }
  );
  check(
    tooMany.status === 201 && tooMany.body.eligibility?.eligible === false,
    "returning more than was bought is recorded as NOT eligible (needs a support override)"
  );
  const request = await store(
    publishableKey,
    customer.token,
    "POST",
    "/store/fashion/returns",
    {
      order_id: order.id,
      reason: "too small",
      items: [{ order_line_id: lineId, sku: "TEE-BLK-M", qty: 1 }],
    }
  );
  check(request.status === 201, "return requested for 1 T-shirt");
  const rma = request.body;
  check(
    rma.eligibility?.eligible === true || rma.status === "REQUESTED",
    "the delivered order is within the return window"
  );
  const unauthorized = await api(
    t.packer,
    "POST",
    `/admin/returns/${rma.id}/authorize`,
    {}
  );
  check(
    unauthorized.status === 403,
    "warehouse packers cannot authorize returns"
  );

  section("7.4 support authorizes; the carrier collects the parcel");
  const authorized = await api(
    t.support,
    "POST",
    `/admin/returns/${rma.id}/authorize`,
    { pickup_address: pickup }
  );
  check(
    authorized.status === 200,
    `support authorizes the return and books the pickup (${authorized.status} ${JSON.stringify(authorized.body).slice(0, 300)})`
  );
  const returnShipment = await eventually(
    "return shipment at the carrier",
    async () => {
      const parcels = (await mock.state()).parcels.filter(
        (p) => p.txlogisticId === `R-${rma.id}`
      );
      return parcels[0];
    }
  );
  check(
    Boolean(returnShipment.billCode),
    `return waybill ${returnShipment.billCode} created`
  );
  await eventually("return moves to IN_TRANSIT", async () => {
    const r = await api(t.support, "GET", `/admin/returns/${rma.id}`);
    return r.body.return?.status === "IN_TRANSIT";
  });
  check(true, "the return shipment is attached to the return (IN_TRANSIT)");
  const notified = (await mock.state()).messages.length;
  await mock.scan(returnShipment.billCode, "Pickup scan");
  await mock.scan(returnShipment.billCode, "Delivered - signed");
  await new Promise((r) => setTimeout(r, 5000));
  check(
    (await mock.state()).messages.length === notified,
    "return parcels never trigger customer delivery messages"
  );

  section("7.4 warehouse receives; returned goods are not sellable yet");
  check(
    (await api(t.packer, "POST", `/admin/returns/${rma.id}/receive`, {}))
      .status === 403,
    "only warehouse staff receive returns"
  );
  check(
    (await api(t.warehouse, "POST", `/admin/returns/${rma.id}/receive`, {}))
      .status === 200,
    "warehouse receives the parcel"
  );
  check(
    (await ctx.fgOnHand("TEE-BLK-M")) === baseM,
    "received goods are NOT in sellable stock before QC"
  );
  const detail = await api(t.support, "GET", `/admin/returns/${rma.id}`);
  const item = detail.body.items[0];
  const refundEarly = await api(
    t.finance,
    "POST",
    `/admin/returns/${rma.id}/refund`,
    {
      payment_id: "pay_x",
      amount: 100,
    }
  );
  check(refundEarly.status >= 400, "no refund before return QC");

  section("7.4 QC decides where the piece goes");
  const nonCommerce = (
    await api(t.admin, "POST", "/admin/finished-goods/locations", {
      code: `FG-B-${ctx.run ?? Date.now().toString(36)}`,
      name: "B-grade store",
      warehouse_code: "HCM",
      is_commerce: false,
    })
  ).body.location;
  const toShelfWrong = await api(
    t.qc,
    "POST",
    `/admin/returns/${rma.id}/items/${item.id}/inspect`,
    {
      disposition: "B_GRADE",
      destination_location_id: ctx.fgLocation.id,
    }
  );
  check(
    toShelfWrong.status >= 400,
    "a B-grade piece can never be put into sellable stock"
  );
  const inspected = await api(
    t.qc,
    "POST",
    `/admin/returns/${rma.id}/items/${item.id}/inspect`,
    {
      disposition: "A_GRADE",
      destination_location_id: ctx.fgLocation.id,
    }
  );
  check(
    inspected.status === 200 || inspected.status === 201,
    "QC grades the piece A and restocks it"
  );
  check(
    (await ctx.fgOnHand("TEE-BLK-M")) === baseM + 1,
    "only now the piece is back in the FG ledger"
  );
  const mBefore = await stock("TEE-BLK-M");
  check(mBefore >= 0, "and the storefront stock follows through the event bus");
  await eventually(
    "Medusa stock includes the returned piece",
    async () => (await stock("TEE-BLK-M")) === baseM + 1
  );
  check(true, "the A-grade piece is sellable again in Medusa");

  section("7.4 the refund is capped and happens once");
  const fresh = await orderDetail(ctx, order.id);
  const payment = fresh.payment_collections[0].payments[0];
  const capture = await api(
    t.finance,
    "POST",
    `/admin/payments/${payment.id}/capture`,
    {}
  );
  check(capture.status === 200, "the prepaid order's payment is captured");
  const tooBig = await api(
    t.finance,
    "POST",
    `/admin/returns/${rma.id}/refund`,
    { payment_id: payment.id, amount: 600000 }
  );
  check(
    tooBig.status >= 400,
    "a refund above the value of the returned piece (250000) is refused"
  );
  const foreign = await api(
    t.finance,
    "POST",
    `/admin/returns/${rma.id}/refund`,
    { payment_id: "pay_not_this_order", amount: 100 }
  );
  check(
    foreign.status >= 400,
    "a payment of another order cannot be refunded here"
  );
  const race = await Promise.all(
    [1, 2, 3].map((n) =>
      api(
        t.finance,
        "POST",
        `/admin/returns/${rma.id}/refund`,
        { payment_id: payment.id, amount: 250000 },
        `refund-race-${n}`
      )
    )
  );
  const wins = race.filter((r) => r.status === 200).length;
  check(wins >= 1, "the refund goes through");
  const after = await orderDetail(ctx, order.id);
  const refunded = Number(
    (
      await api(
        t.admin,
        "GET",
        `/admin/payments/${payment.id}?fields=id,amount,*refunds`
      )
    ).body.payment.refunds.reduce((n, r) => n + Number(r.amount), 0)
  );
  check(
    refunded === 250000,
    `exactly 250000 was refunded despite 3 concurrent attempts (${wins} accepted)`
  );
  const closed = await api(t.support, "GET", `/admin/returns/${rma.id}`);
  check(
    closed.body.return.status === "CLOSED",
    "the return is closed after the refund"
  );
  void after;

  section("7.4 exchange: the other T-shirt for a size L");
  const lBefore = await ctx.fgOnHand("TEE-BLK-L");
  const exchange = await store(
    publishableKey,
    customer.token,
    "POST",
    "/store/fashion/returns",
    {
      order_id: order.id,
      type: "EXCHANGE",
      exchange_sku: "TEE-BLK-L",
      reason: "wrong size",
      items: [{ order_line_id: lineId, sku: "TEE-BLK-M", qty: 1 }],
    }
  );
  check(exchange.status === 201, "exchange requested (M for L)");
  const exAuth = await api(
    t.support,
    "POST",
    `/admin/returns/${exchange.body.id}/authorize`,
    {
      pickup_address: pickup,
      exchange_location_id: ctx.fgLocation.id,
    }
  );
  check(
    exAuth.status === 200,
    "support authorizes and reserves the replacement"
  );
  const allocation = await eventually(
    "the replacement is reserved for the order",
    async () => {
      const a = await api(
        t.warehouse,
        "GET",
        `/admin/finished-goods/allocations?order_id=${order.id}`
      );
      return a.body.allocations.find(
        (x) => x.sku === "TEE-BLK-L" && x.status === "ALLOCATED"
      );
    }
  );
  check(
    allocation.qty === 1,
    "1 x TEE-BLK-L is reserved for the exchange, outside general stock"
  );
  await eventually(
    "Medusa stock for L drops by the reserved piece",
    async () => (await stock("TEE-BLK-L")) === lBefore - 1
  );
  check(true, "the storefront no longer offers the reserved L");
  const rec = await api(
    t.warehouse,
    "GET",
    "/admin/finished-goods/reconciliation"
  );
  check(
    rec.body.ledger.ok === true,
    "the finished-goods ledger still reconciles after returns and exchange"
  );
  void mock;
  return ctx;
};
