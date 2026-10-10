import {
  api,
  check,
  eventually,
  layPlan,
  mock,
  run,
  section,
  store,
} from "./lib.mjs";
import { newCustomer, orderDetail, placeOrder } from "./setup.mjs";

/**
 * Requirement 7.2: a customer orders a made-to-measure blazer. Nothing is on a
 * shelf; paying triggers production; the customer follows a simplified status
 * (never the internal operations); the finished pieces are reserved for that
 * order and shipped to it.
 */
export const madeToOrder = async (ctx) => {
  const { t, fabric } = ctx;
  if (!fabric) {
    throw new Error(
      "made-to-order needs the fabric stock from the make-to-stock journey"
    );
  }
  const style = "BLZ-NVY";

  section("7.2 the blazer's recipe (BOM + routing) exists, the shelf is empty");
  const bom = await api(t.planner, "POST", "/admin/manufacturing/boms", {
    product_sku: style,
    lines: [
      { material_id: fabric.id, uom: "m", qty_per_unit: 3, waste_factor: 0 },
    ],
  });
  await api(
    t.planner,
    "POST",
    `/admin/manufacturing/boms/${bom.body.id}/release`,
    {}
  );
  const routing = await api(
    t.planner,
    "POST",
    "/admin/manufacturing/routings",
    {
      product_sku: style,
      operations: [
        {
          seq: 10,
          code: "TAILOR",
          name: "Tailor",
          work_center_type: "SEWING",
          standard_minutes: 90,
        },
        {
          seq: 20,
          code: "QC",
          name: "Final QC",
          work_center_type: "QC",
          qc_gate: true,
        },
      ],
    }
  );
  await api(
    t.planner,
    "POST",
    `/admin/manufacturing/routings/${routing.body.id}/release`,
    {}
  );

  section("7.2 the customer orders and pays");
  const customer = await newCustomer(ctx, "minh");
  const placed = await placeOrder(ctx, customer, [["BLZ-NVY-M", 2]]);
  check(
    Boolean(placed.order),
    "order accepted although there is no stock (made to order)"
  );
  const order = await orderDetail(ctx, placed.order.id);
  ctx.mtoOrder = order;
  const request = await eventually(
    "a production request for the order",
    async () => {
      const list = await api(
        t.planner,
        "GET",
        `/admin/manufacturing/production-requests?order_id=${order.id}`
      );
      return list.body.production_requests?.[0];
    }
  );
  check(
    request.qty === 2 && request.sku === "BLZ-NVY-M",
    `order.placed raised a production request for 2 x BLZ-NVY-M (${JSON.stringify(request)})`
  );
  check(
    request.status === "REQUESTED",
    "it waits for payment before any fabric is committed"
  );
  const before = (
    await api(
      t.warehouse,
      "GET",
      `/admin/material-inventory/materials/${fabric.id}/availability`
    )
  ).body.availability;
  const reservedBefore = before.reduce((n, r) => n + Number(r.reserved), 0);

  const payment = order.payment_collections[0].payments[0];
  const captured = await api(
    t.finance,
    "POST",
    `/admin/payments/${payment.id}/capture`,
    {}
  );
  check(captured.status === 200, "payment captured");

  section(
    "7.2 payment triggers production: MO created, fabric reserved, released"
  );
  const created = await eventually(
    "request becomes MO_CREATED",
    async () => {
      const list = await api(
        t.planner,
        "GET",
        `/admin/manufacturing/production-requests?order_id=${order.id}`
      );
      const r = list.body.production_requests?.[0];
      return r?.status === "MO_CREATED" && r.mo_id
        ? r
        : r?.status === "FAILED"
          ? Promise.reject(new Error(r.error))
          : null;
    },
    { timeout: 240_000, every: 3000 }
  );
  check(
    Boolean(created.mo_id),
    "the worker created a manufacturing order from the paid order"
  );
  const moDetail = await api(
    t.planner,
    "GET",
    `/admin/manufacturing/mos/${created.mo_id}`
  );
  const mo = moDetail.body.manufacturing_order;
  check(
    mo.order_type === "MTO" && mo.customer_order_id === order.id,
    "an MTO manufacturing order linked to the customer order"
  );
  check(
    mo.status === "RELEASED",
    "material reserved and the MO released automatically"
  );
  const after = (
    await api(
      t.warehouse,
      "GET",
      `/admin/material-inventory/materials/${fabric.id}/availability`
    )
  ).body.availability;
  check(
    after.reduce((n, r) => n + Number(r.reserved), 0) - reservedBefore === 6,
    "6 m of fabric (2 x 3 m) reserved for this order"
  );
  const productionStatus = async () =>
    (
      await store(
        ctx.publishableKey,
        customer.token,
        "GET",
        `/store/fashion/orders/${order.id}/production-status`
      )
    ).body;
  check(
    (await productionStatus()).production_status === "IN_PRODUCTION",
    "the customer sees IN_PRODUCTION"
  );

  section(
    "7.2 production runs; the customer only ever sees the simplified status"
  );
  const batchId = moDetail.body.batches[0].id;
  await api(t.cutter, "POST", `/admin/manufacturing/mos/${mo.id}/issue`, {
    material_id: fabric.id,
    qty: 6,
  });
  await api(t.cutter, "POST", `/admin/manufacturing/mos/${mo.id}/cut-plan`, {
    batch_id: batchId,
    fabric_material_id: fabric.id,
    lays: await layPlan(t.cutter, mo.id, { "BLZ-NVY-M": 2 }),
  });
  const cut = await api(
    t.cutter,
    "POST",
    `/admin/manufacturing/mos/${mo.id}/cut`,
    {
      batch_id: batchId,
      fabric_material_id: fabric.id,
      actual_consumption: 6,
      bundles: [{ sku: "BLZ-NVY-M", qty: 2 }],
    }
  );
  check(cut.status === 201, "cut");
  const bundle = cut.body.bundles[0];
  await api(
    t.sewer,
    "POST",
    `/admin/manufacturing/bundles/${bundle.id}/operations`,
    { op_seq: 10, input_qty: 2, good_qty: 2 }
  );
  const seen = new Set([(await productionStatus()).production_status]);
  await api(
    t.qc,
    "POST",
    `/admin/manufacturing/bundles/${bundle.id}/inspections`,
    { pass_qty: 2 }
  );
  seen.add((await productionStatus()).production_status);
  const pack = await api(
    t.packer,
    "POST",
    `/admin/manufacturing/bundles/${bundle.id}/pack`,
    { qty: 2, location_id: ctx.fgLocation.id }
  );
  check(pack.status === 201, "packed into finished goods");
  const final = await eventually(
    "READY_TO_SHIP",
    async () => (await productionStatus()).production_status === "READY_TO_SHIP"
  );
  seen.add("READY_TO_SHIP");
  check(
    final,
    "the customer sees READY_TO_SHIP once the pieces are reserved for the order"
  );
  const allowed = new Set([
    "PREPARING_PRODUCTION",
    "IN_PRODUCTION",
    "QUALITY_CHECK",
    "PREPARING_SHIPMENT",
    "READY_TO_SHIP",
  ]);
  check(
    [...seen].every((s) => allowed.has(s)),
    `only simplified statuses were exposed (${[...seen].join(" > ")})`
  );
  const body = JSON.stringify(await productionStatus());
  check(
    !/bundle|operation|work_center|cut|rework|mo_/i.test(body),
    "no internal production detail leaks to the customer"
  );
  const allocations = await api(
    t.warehouse,
    "GET",
    `/admin/finished-goods/allocations?order_id=${order.id}`
  );
  check(
    allocations.body.allocations.length === 1 &&
      allocations.body.allocations[0].qty === 2,
    "the 2 blazers are allocated to this order, outside general stock"
  );
  const ordinary = await store(
    ctx.publishableKey,
    undefined,
    "GET",
    `/store/products?handle=made-to-order-blazer-navy&region_id=${ctx.region.id}&fields=*variants`
  );
  check(
    ordinary.status === 200,
    "the blazer stays purchasable (no stock gate) for other customers"
  );

  section("7.2 shipping the made-to-order pieces");
  const fulfilment = await api(
    t.warehouse,
    "POST",
    `/admin/orders/${order.id}/fulfillments`,
    {
      location_id: ctx.stockLocation.id,
      items: [{ id: order.items[0].id, quantity: 2 }],
    }
  );
  check(fulfilment.status === 200, "fulfilment created");
  const shipment = await eventually(
    "blazer shipment at the carrier",
    async () => {
      const list = await api(
        t.support,
        "GET",
        `/admin/fulfillment/shipments?order_id=${order.id}`
      );
      const s = list.body.shipments?.[0];
      return s?.create_state === "SUCCEEDED" ? s : null;
    }
  );
  check(
    Boolean(shipment.tracking_number),
    `waybill ${shipment.tracking_number} created`
  );
  await eventually("allocation shipped", async () => {
    const a = await api(
      t.warehouse,
      "GET",
      `/admin/finished-goods/allocations?order_id=${order.id}`
    );
    return a.body.allocations[0]?.status === "SHIPPED";
  });
  check(true, "the allocation is consumed by the shipment");
  const parcels = (await mock.state()).parcels.filter(
    (p) => p.txlogisticId === shipment.merchant_reference
  );
  check(parcels.length === 1, "one parcel at the carrier");
  ctx.mtoShipment = shipment;
  ctx.mtoCustomer = customer;
  return ctx;
};
