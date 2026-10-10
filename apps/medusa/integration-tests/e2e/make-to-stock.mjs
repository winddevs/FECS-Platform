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
 * Requirement 7.1: fabric bought, checked and cut, T-shirts sewn, inspected and
 * packed; the shelf stock appears in the webshop; a customer buys; the parcel
 * is created at the carrier and tracked to the door.
 */
export const makeToStock = async (ctx) => {
  const { t } = ctx;
  const k = (s) => `${s}-${run}`;

  section(
    "7.1 procurement: buy fabric, receive it on hold, release it after QC"
  );
  const fabric = (
    await api(t.procurement, "POST", "/admin/material-inventory/materials", {
      code: `FAB-COTTON-${run}`,
      name: "Cotton 40s, black",
      uom: "m",
      track_roll: true,
      track_dye_lot: true,
    })
  ).body.material;
  const rawLocation = (
    await api(t.admin, "POST", "/admin/material-inventory/locations", {
      code: `RM-HCM-${run}`,
      name: "Raw material store",
      warehouse_code: "HCM",
    })
  ).body.location;
  const supplier = (
    await api(t.procurement, "POST", "/admin/procurement/suppliers", {
      code: `SUP-${run}`,
      name: "Saigon Textile",
      email: "sales@saigon-textile.example",
    })
  ).body.supplier;
  const po = await api(
    t.procurement,
    "POST",
    "/admin/procurement/purchase-orders",
    {
      supplier_id: supplier.id,
      currency_code: "VND",
      lines: [
        {
          material_id: fabric.id,
          uom: "m",
          ordered_qty: 400,
          unit_price: 90000,
        },
      ],
    }
  );
  check(po.status === 201, "procurement creates a purchase order for 400 m");
  const poId = po.body.purchase_order.id;
  const poLineId = po.body.lines[0].id;
  check(
    (
      await api(
        t.warehouse,
        "POST",
        `/admin/procurement/purchase-orders/${poId}/approve`,
        {}
      )
    ).status === 403,
    "the warehouse cannot approve a purchase order"
  );
  check(
    (
      await api(
        t.procurement,
        "POST",
        `/admin/procurement/purchase-orders/${poId}/approve`,
        {}
      )
    ).status === 200,
    "procurement approves"
  );
  check(
    (
      await api(
        t.procurement,
        "POST",
        `/admin/procurement/purchase-orders/${poId}/send`,
        {}
      )
    ).status === 200,
    "and sends it to the supplier"
  );
  const receipt = await api(
    t.warehouse,
    "POST",
    `/admin/procurement/purchase-orders/${poId}/receipts`,
    {
      location_id: rawLocation.id,
      delivery_note: `DN-${run}`,
      lines: [
        {
          purchase_order_line_id: poLineId,
          qty: 400,
          bucket: "QC_HOLD",
          lot_no: `LOT-${run}`,
          dye_lot_no: "DL-A",
          rolls: [100, 100, 100, 100].map((qty, i) => ({
            roll_code: `${run}-R${i + 1}`,
            qty,
          })),
        },
      ],
    }
  );
  check(
    receipt.status === 201,
    "warehouse receives 4 rolls of 100 m (on QC hold)"
  );
  const availability = async () =>
    (
      await api(
        t.warehouse,
        "GET",
        `/admin/material-inventory/materials/${fabric.id}/availability`
      )
    ).body.availability;
  const sum = (rows, key) => rows.reduce((n, r) => n + Number(r[key]), 0);
  let rows = await availability();
  check(
    sum(rows, "available") === 0 && sum(rows, "qc_hold") === 400,
    "on QC hold: nothing is allocatable yet"
  );
  const balances = (
    await api(
      t.qc,
      "GET",
      `/admin/material-inventory/balances?material_id=${fabric.id}`
    )
  ).body.balances;
  for (const balance of balances) {
    const released = await api(
      t.qc,
      "POST",
      "/admin/material-inventory/qc-decisions",
      {
        balance_id: balance.id,
        qty: 100,
        decision: "RELEASE",
      }
    );
    if (released.status !== 200 && released.status !== 201)
      throw new Error(JSON.stringify(released.body));
  }
  rows = await availability();
  check(
    sum(rows, "available") === 400,
    "after the receiving QC all 400 m are available"
  );
  const po1 = await api(
    t.procurement,
    "GET",
    `/admin/procurement/purchase-orders/${poId}`
  );
  check(
    po1.body.purchase_order.status === "RECEIVED",
    "the purchase order is fully received"
  );

  section(
    "7.1 planning: BOM, routing, manufacturing order, material reservation"
  );
  const style = "TEE-BLK";
  const bom = await api(t.planner, "POST", "/admin/manufacturing/boms", {
    product_sku: style,
    lines: [
      {
        material_id: fabric.id,
        uom: "m",
        qty_per_unit: 1.5,
        waste_factor: 0.05,
      },
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
          code: "SEW",
          name: "Sew",
          work_center_type: "SEWING",
          standard_minutes: 12,
        },
        {
          seq: 20,
          code: "FIN",
          name: "Finish",
          work_center_type: "FINISH",
          standard_minutes: 4,
        },
        {
          seq: 30,
          code: "QC",
          name: "Final QC",
          work_center_type: "QC",
          qc_gate: true,
          standard_minutes: 1,
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
  // One commerce FG location per Medusa stock location (enforced by the
  // platform); the database outlives test runs, so reuse it when it exists.
  const existingFg = (
    await api(t.admin, "GET", "/admin/finished-goods/locations")
  ).body.locations.find(
    (l) => l.medusa_stock_location_id === ctx.stockLocation.id
  );
  const fgLocation =
    existingFg ??
    (
      await api(t.admin, "POST", "/admin/finished-goods/locations", {
        code: `FG-HCM-${run}`,
        name: "HCM finished goods (webshop)",
        warehouse_code: "HCM",
        is_commerce: true,
        medusa_stock_location_id: ctx.stockLocation.id,
      })
    ).body.location;
  const duplicate = await api(
    t.admin,
    "POST",
    "/admin/finished-goods/locations",
    {
      code: `FG-DUP-${run}`,
      name: "Second location for the same stock location",
      warehouse_code: "HCM",
      medusa_stock_location_id: ctx.stockLocation.id,
    }
  );
  check(
    duplicate.status >= 400 && duplicate.status < 500,
    "a second FG location cannot claim the same Medusa stock location"
  );
  ctx.fgLocation = fgLocation;
  const fgBalances = async (sku) =>
    (await api(t.warehouse, "GET", `/admin/finished-goods/balances?sku=${sku}`))
      .body.balances;
  const fgOnHand = async (sku) =>
    Number((await fgBalances(sku))[0]?.on_hand ?? 0);
  const medusaStock = async (sku) => {
    const items = await api(
      t.admin,
      "GET",
      `/admin/inventory-items?sku=${sku}&fields=id,sku,*location_levels`
    );
    return Number(
      items.body.inventory_items?.[0]?.location_levels?.[0]?.stocked_quantity ??
        -1
    );
  };
  // The database outlives a run, so every stock figure is checked relative to
  // where it started.
  const base = {
    fgM: await fgOnHand("TEE-BLK-M"),
    fgL: await fgOnHand("TEE-BLK-L"),
    medusaM: await medusaStock("TEE-BLK-M"),
    medusaL: await medusaStock("TEE-BLK-L"),
  };

  const mo = await api(t.planner, "POST", "/admin/manufacturing/mos", {
    order_type: "MTS",
    product_sku: style,
    lines: [
      { sku: "TEE-BLK-M", qty: 30 },
      { sku: "TEE-BLK-L", qty: 20 },
    ],
  });
  check(
    mo.status === 201 && mo.body.status === "PLANNED",
    "planner plans an MO for 50 T-shirts"
  );
  check(
    mo.body.requirements[0].required_qty === 78.75,
    "BOM explosion: 50 x 1.5 m + 5% waste = 78.75 m"
  );
  const moId = mo.body.id;
  const shortage = await api(
    t.planner,
    "POST",
    `/admin/manufacturing/mos/${moId}/check-material`,
    {}
  );
  check(
    shortage.status === 200 && shortage.body.material_status === "READY",
    "material check: READY"
  );
  check(
    (
      await api(t.planner, "POST", `/admin/manufacturing/mos/${moId}/reserve`, {
        planner_approved: true,
      })
    ).status === 200,
    "fabric is reserved for the MO (not consumed)"
  );
  rows = await availability();
  check(
    sum(rows, "reserved") === 78.75 && sum(rows, "on_hand") === 400,
    "reservation: reserved 78.75, on hand unchanged"
  );
  const released = await api(
    t.planner,
    "POST",
    `/admin/manufacturing/mos/${moId}/release`,
    {}
  );
  check(released.status === 200, "MO released to the shop floor");
  const batchId = released.body.batches[0].id;

  section("7.1 production: issue, cut, sew, QC, pack");
  check(
    (
      await api(t.cutter, "POST", `/admin/manufacturing/mos/${moId}/issue`, {
        material_id: fabric.id,
        qty: 78.75,
      })
    ).status === 201,
    "the cutter issues 78.75 m"
  );
  rows = await availability();
  check(
    sum(rows, "on_hand") === 321.25 && sum(rows, "reserved") === 0,
    "issue lowers on hand and reservation together"
  );
  check(
    (
      await api(t.cutter, "POST", `/admin/manufacturing/mos/${moId}/cut-plan`, {
        batch_id: batchId,
        fabric_material_id: fabric.id,
        lays: await layPlan(t.cutter, moId, {
          "TEE-BLK-M": 30,
          "TEE-BLK-L": 20,
        }),
      })
    ).status === 201,
    "cut plan recorded"
  );
  const cut = await api(
    t.cutter,
    "POST",
    `/admin/manufacturing/mos/${moId}/cut`,
    {
      batch_id: batchId,
      fabric_material_id: fabric.id,
      actual_consumption: 78.75,
      bundles: [
        { sku: "TEE-BLK-M", qty: 30 },
        { sku: "TEE-BLK-L", qty: 20 },
      ],
    }
  );
  check(
    cut.status === 201 && cut.body.reconciliation.within_tolerance,
    "cut done; fabric reconciles within tolerance"
  );
  const bundleM = cut.body.bundles.find((b) => b.sku === "TEE-BLK-M");
  const bundleL = cut.body.bundles.find((b) => b.sku === "TEE-BLK-L");
  const scan = await api(
    t.sewer,
    "GET",
    `/admin/manufacturing/bundles/by-code/${bundleM.bundle_code}`
  );
  check(
    scan.body.current_operation.code === "SEW",
    "scanning the bundle label shows the sewing operation"
  );

  const sewM = await api(
    t.sewer,
    "POST",
    `/admin/manufacturing/bundles/${bundleM.id}/operations`,
    {
      op_seq: 10,
      input_qty: 30,
      good_qty: 29,
      reject_qty: 1,
    }
  );
  check(
    sewM.status === 201 && sewM.body.bundle.waiting_qty === 29,
    "M bundle: 29 good, 1 rejected at sewing"
  );
  await api(
    t.sewer,
    "POST",
    `/admin/manufacturing/bundles/${bundleM.id}/operations`,
    { op_seq: 20, input_qty: 29, good_qty: 29 }
  );
  await api(
    t.sewer,
    "POST",
    `/admin/manufacturing/bundles/${bundleL.id}/operations`,
    { op_seq: 10, input_qty: 20, good_qty: 20 }
  );
  await api(
    t.sewer,
    "POST",
    `/admin/manufacturing/bundles/${bundleL.id}/operations`,
    { op_seq: 20, input_qty: 20, good_qty: 20 }
  );
  check(
    (
      await api(
        t.packer,
        "POST",
        `/admin/manufacturing/bundles/${bundleM.id}/pack`,
        { qty: 1, location_id: fgLocation.id }
      )
    ).status === 400,
    "nothing can be packed before QC releases it"
  );
  const inspM = await api(
    t.qc,
    "POST",
    `/admin/manufacturing/bundles/${bundleM.id}/inspections`,
    { pass_qty: 28, rework_qty: 1 }
  );
  check(
    inspM.status === 201 && inspM.body.bundle.qc_released_qty === 28,
    "QC passes 28 of M, sends 1 to rework"
  );
  const inspL = await api(
    t.qc,
    "POST",
    `/admin/manufacturing/bundles/${bundleL.id}/inspections`,
    { pass_qty: 20 }
  );
  check(inspL.status === 201, "QC passes all 20 of L");
  const rework = await api(
    t.supervisor,
    "POST",
    `/admin/manufacturing/bundles/${bundleM.id}/rework`,
    { good_qty: 1, scrap_qty: 0 }
  );
  check(
    rework.status === 201 || rework.status === 200,
    `the reworked piece goes back through QC as its own bundle (${rework.status} ${JSON.stringify(rework.body).slice(0, 200)})`
  );
  const reworkBundle = rework.body.rework_bundle;
  check(Boolean(reworkBundle), "rework bundle created");
  await api(
    t.qc,
    "POST",
    `/admin/manufacturing/bundles/${reworkBundle.id}/inspections`,
    { pass_qty: 1 }
  );
  const packM = await api(
    t.packer,
    "POST",
    `/admin/manufacturing/bundles/${bundleM.id}/pack`,
    { qty: 28, location_id: fgLocation.id }
  );
  check(
    packM.status === 201 &&
      packM.body.finished_goods.sellable === base.fgM + 28,
    "28 M packed -> 28 more sellable finished goods"
  );
  await api(
    t.packer,
    "POST",
    `/admin/manufacturing/bundles/${reworkBundle.id}/pack`,
    { qty: 1, location_id: fgLocation.id }
  );
  await api(
    t.packer,
    "POST",
    `/admin/manufacturing/bundles/${bundleL.id}/pack`,
    { qty: 20, location_id: fgLocation.id }
  );
  check(
    (await fgOnHand("TEE-BLK-M")) === base.fgM + 29,
    "FG ledger: 29 x M added"
  );
  const moAfter = await api(
    t.planner,
    "GET",
    `/admin/manufacturing/mos/${moId}`
  );
  check(
    moAfter.body.manufacturing_order.completed_qty === 49,
    "MO shows 49 pieces completed (1 reject)"
  );
  const trace = await api(
    t.admin,
    "GET",
    `/admin/finished-goods/batches/${packM.body.finished_goods.batch_id}/trace`
  );
  check(
    trace.body.batch.mo_id === moId,
    "every FG batch traces back to its MO, fabric lots and versions"
  );

  section("7.1 commerce: stock reaches the webshop through the event bus");
  await eventually(
    "Medusa stock for TEE-BLK-M to include the 29 new pieces (outbox -> Redis -> worker -> projection)",
    async () => (await medusaStock("TEE-BLK-M")) === base.medusaM + 29
  );
  check(true, "projection reached Medusa inventory: +29 M");
  await eventually(
    "Medusa stock for TEE-BLK-L to include the 20 new pieces",
    async () => (await medusaStock("TEE-BLK-L")) === base.medusaL + 20
  );
  check(true, "projection reached Medusa inventory: +20 L");
  const catalogue = await store(
    ctx.publishableKey,
    undefined,
    "GET",
    `/store/products?handle=basic-tee-black&region_id=${ctx.region.id}&fields=*variants,+variants.inventory_quantity`
  );
  const m = catalogue.body.products[0].variants.find(
    (v) => v.sku === "TEE-BLK-M"
  );
  check(
    m.inventory_quantity === base.medusaM + 29,
    `the storefront shows ${base.medusaM + 29} in stock for M`
  );

  section("7.1 the customer buys; the parcel is created and tracked");
  const customer = await newCustomer(ctx, "lan");
  ctx.customerLan = customer;
  const placed = await placeOrder(ctx, customer, [["TEE-BLK-M", 2]]);
  check(
    Boolean(placed.order),
    "order placed for 2 x M (cart -> shipping -> payment -> complete)"
  );
  const order = await orderDetail(ctx, placed.order.id);
  ctx.mtsOrder = order;
  check(
    order.items.length === 1 && Number(order.items[0].quantity) === 2,
    "order has the 2 T-shirts"
  );
  const fulfilment = await api(
    t.warehouse,
    "POST",
    `/admin/orders/${order.id}/fulfillments`,
    {
      location_id: ctx.stockLocation.id,
      items: [{ id: order.items[0].id, quantity: 2 }],
    }
  );
  check(
    fulfilment.status === 200,
    "warehouse creates the fulfilment in Medusa"
  );
  const shipment = await eventually("carrier shipment SUCCEEDED", async () => {
    const list = await api(
      t.support,
      "GET",
      `/admin/fulfillment/shipments?order_id=${order.id}`
    );
    const s = list.body.shipments?.[0];
    return s?.create_state === "SUCCEEDED" && s.tracking_number ? s : null;
  });
  check(
    /^JT\d+/.test(shipment.tracking_number),
    `J&T waybill ${shipment.tracking_number} created automatically`
  );
  let parcels = (await mock.state()).parcels.filter(
    (p) => p.txlogisticId === shipment.merchant_reference
  );
  check(
    parcels.length === 1,
    "exactly one parcel at the carrier for this fulfilment"
  );
  check(
    parcels[0].items.some((i) => i.sku === "TEE-BLK-M" && i.qty === 2),
    "the parcel lists the 2 T-shirts"
  );
  await eventually(
    "FG ledger shipped out 2 pieces of M",
    async () => (await fgOnHand("TEE-BLK-M")) === base.fgM + 27
  );
  check(true, "fulfilment shipped 2 pieces out of the FG ledger ");
  await eventually(
    "Medusa stock converges with the FG ledger after the sale",
    async () => (await medusaStock("TEE-BLK-M")) === base.medusaM + 27
  );
  check(true, "Medusa and the FG ledger agree (no double deduction)");

  const bill = shipment.tracking_number;
  await mock.scan(bill, "Pickup scan", {
    scanTime: new Date(Date.now() - 4 * 3600e3).toISOString(),
  });
  await mock.scan(bill, "Departure scan", {
    scanTime: new Date(Date.now() - 3 * 3600e3).toISOString(),
  });
  await mock.scan(bill, "Out for delivery", {
    scanTime: new Date(Date.now() - 1 * 3600e3).toISOString(),
  });
  const status = async () =>
    (
      await store(
        ctx.publishableKey,
        customer.token,
        "GET",
        `/store/fashion/orders/${order.id}/shipments`
      )
    ).body.shipments?.[0]?.status;
  await eventually(
    "customer sees OUT_FOR_DELIVERY",
    async () => (await status()) === "OUT_FOR_DELIVERY"
  );
  check(true, "webhook -> inbox -> worker: the customer sees OUT_FOR_DELIVERY");
  await mock.scan(bill, "Departure scan", {
    scanTime: new Date(Date.now() - 3 * 3600e3).toISOString(),
  });
  await new Promise((r) => setTimeout(r, 4000));
  check(
    (await status()) === "OUT_FOR_DELIVERY",
    "a late, repeated scan does not move the parcel backwards"
  );
  await mock.scan(bill, "Delivered - signed");
  await eventually(
    "customer sees DELIVERED",
    async () => (await status()) === "DELIVERED"
  );
  check(true, "the customer sees DELIVERED");
  const events = await api(
    t.support,
    "GET",
    `/admin/fulfillment/shipments/${shipment.id}`
  );
  check(events.status === 200, "support can read the shipment history");

  const inventoryOk = await api(
    t.warehouse,
    "GET",
    "/admin/material-inventory/reconciliation"
  );
  check(
    inventoryOk.body.ok === true,
    "material ledger reconciles with balances"
  );
  const fgOk = await api(
    t.warehouse,
    "GET",
    "/admin/finished-goods/reconciliation"
  );
  check(fgOk.body.ledger.ok === true, "finished-goods ledger reconciles");

  ctx.fabric = fabric;
  ctx.rawLocation = rawLocation;
  ctx.fgBalances = fgBalances;
  ctx.fgOnHand = fgOnHand;
  ctx.medusaStock = medusaStock;
  ctx.base = base;
  ctx.mtsShipment = shipment;
  return ctx;
};
