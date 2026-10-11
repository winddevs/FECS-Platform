import { ExecArgs } from "@medusajs/framework/types";

import { registerCarrierProvider } from "../src/integrations/carrier/registry";
import { SandboxCarrierProvider } from "../src/integrations/carrier/sandbox";
import { registerMessageChannel } from "../src/integrations/channel/registry";
import { SandboxChannel } from "../src/integrations/channel/sandbox";
import { mapJtStatus } from "../src/integrations/jt/status-map";
import { renderLabelSvg, code128Modules } from "../src/lib/labels/code128";
import { handleInboundMessage } from "../src/lib/social/handle-inbound";
import { describeCustomerNotification } from "../src/lib/social/notification-events";
import { planAllocation } from "../src/modules/materialInventory/lib/allocation";
import notifyCustomerEvents from "../src/subscribers/notify-customer-events";
import notifyOrderConfirmed from "../src/subscribers/notify-order-confirmed";
import {
  cancelCarrierShipmentWorkflow,
  createCarrierShipmentWorkflow,
} from "../src/workflows/fulfillment";

/**
 * Closes the gaps found when the platform was graded against the requirement
 * document: inventory (FR-INV-006/009/010/011/012/013), procurement
 * (FR-PROC-001/002), notifications (FR-NOT-001/004) and audit (FR-ADM-003).
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
    const text = `${e.code ?? ""} ${e.message}`;
    assert(
      text.includes(needle),
      `${msg} (got: ${e.code ?? ""} ${String(e.message).slice(0, 120)})`
    );
    return;
  }
  throw new Error(`ASSERT FAILED: expected failure "${needle}": ${msg}`);
};

export default async function verify({ container }: ExecArgs) {
  const inv: any = container.resolve("materialInventory");
  const proc: any = container.resolve("procurement");
  const integ: any = container.resolve("integration");
  const social: any = container.resolve("socialCommerce");
  const pg = container.resolve("__pg_connection__") as any;
  const actor = { actor_id: "user_gap", correlation_id: "cor_gap" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;

  console.log("# FR-INV-006: FIFO and roll-fragment reduction");
  const candidate = (
    id: string,
    available: number,
    at: number,
    initial = 100
  ) => ({
    balance_id: id,
    lot_id: "lot",
    roll_id: id,
    location_id: "loc",
    dye_lot_no: "",
    available,
    initial,
    on_hand: available,
    received_at: at,
  });
  const rolls = [
    candidate("old-big", 100, 1),
    candidate("mid-small", 30, 2),
    candidate("new-exact", 40, 3),
  ];
  const plainFifo = planAllocation(rolls, 40, {
    policy: "FIFO",
    track_dye_lot: false,
    max_dye_lots: 1,
    reduce_fragments: false,
  });
  assert(
    plainFifo.lines.length === 1 && plainFifo.lines[0].balance_id === "old-big",
    "plain FIFO takes the oldest roll even though it leaves a fragment"
  );
  const reduced = planAllocation(rolls, 40, {
    policy: "FIFO",
    track_dye_lot: false,
    max_dye_lots: 1,
    reduce_fragments: true,
  });
  assert(
    reduced.lines.length === 1 && reduced.lines[0].balance_id === "new-exact",
    "fragment reduction picks the roll that leaves no remainder"
  );
  const fifoStock = await inv.createMaterials({
    code: `FIFO-${run}`,
    name: "Fifo fabric",
    uom: "m",
    track_roll: true,
    track_dye_lot: false,
    allocation_policy: "FIFO",
    roll_fragment_reduction: false,
  });
  const store = await inv.createMaterialLocations({
    code: `G-RM-${run}`,
    name: "Store",
    warehouse_code: "HCM",
  });
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("fifo-a"),
    material_id: fifoStock.id,
    location_id: store.id,
    lot: { lot_no: "F1" },
    rolls: [{ roll_code: `FA-${run}`, qty: 100 }],
  });
  await new Promise((r) => setTimeout(r, 15));
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("fifo-b"),
    material_id: fifoStock.id,
    location_id: store.id,
    lot: { lot_no: "F2" },
    rolls: [{ roll_code: `FB-${run}`, qty: 40 }],
  });
  const fifoRes = await inv.reserveMaterial({
    ...actor,
    idempotency_key: k("fifo-res"),
    material_id: fifoStock.id,
    qty: 40,
    reference_type: "MO",
    reference_id: `mo_fifo_${run}`,
  });
  const fifoRoll = (await inv.listMaterialRolls({ roll_code: `FA-${run}` }))[0];
  assert(
    fifoRes.lines.length === 1 && fifoRes.lines[0].roll_id === fifoRoll.id,
    "a material with fragment reduction off is allocated in plain FIFO order"
  );

  console.log("# FR-INV-010: asynchronous inter-warehouse transfer");
  const fabric = await inv.createMaterials({
    code: `XF-${run}`,
    name: "Transfer fabric",
    uom: "m",
    track_roll: true,
  });
  const hcm = await inv.createMaterialLocations({
    code: `X-HCM-${run}`,
    name: "HCM",
    warehouse_code: `WH-A-${run}`,
  });
  const hn = await inv.createMaterialLocations({
    code: `X-HN-${run}`,
    name: "HN",
    warehouse_code: `WH-B-${run}`,
  });
  const truck = await inv.createMaterialLocations({
    code: `X-TRUCK-${run}`,
    name: "Truck",
    warehouse_code: `WH-A-${run}`,
    kind: "IN_TRANSIT",
  });
  const rcv = await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("xf-rcv"),
    material_id: fabric.id,
    location_id: hcm.id,
    lot: { lot_no: "XL1" },
    rolls: [{ roll_code: `XR-${run}`, qty: 80 }],
  });
  const srcBalance = rcv.balances[0].id;
  await expectFail(
    () =>
      inv.transferStock({
        ...actor,
        idempotency_key: k("xf-direct"),
        balance_id: srcBalance,
        to_location_id: hn.id,
        qty: 10,
      }),
    "TRANSFER_BETWEEN_WAREHOUSES",
    "a direct transfer between warehouses is refused"
  );
  const sameSite = await inv.createMaterialLocations({
    code: `X-HCM2-${run}`,
    name: "HCM aisle 2",
    warehouse_code: `WH-A-${run}`,
  });
  const direct = await inv.transferStock({
    ...actor,
    idempotency_key: k("xf-same"),
    balance_id: srcBalance,
    to_location_id: sameSite.id,
    qty: 5,
  });
  assert(direct.to.on_hand === 5, "a same-site transfer moves stock at once");
  await expectFail(
    () =>
      inv.dispatchTransfer({
        ...actor,
        idempotency_key: k("xf-bad"),
        balance_id: srcBalance,
        to_location_id: sameSite.id,
        qty: 5,
      }),
    "Same-site",
    "dispatch is only for another warehouse"
  );
  const dispatched = await inv.dispatchTransfer({
    ...actor,
    idempotency_key: k("xf-disp"),
    balance_id: srcBalance,
    to_location_id: hn.id,
    qty: 30,
    transit_location_id: truck.id,
  });
  assert(dispatched.status === "IN_TRANSIT", "dispatch puts stock in transit");
  const availability = await inv.getAvailability(fabric.id);
  const at = (loc: string) =>
    availability.find((row: any) => row.location_id === loc)?.on_hand ?? 0;
  assert(
    at(hcm.id) === 45 && at(truck.id) === 30 && at(hn.id) === 0,
    "30 m left the source and wait in transit, not yet at the destination"
  );
  assert(
    (await inv.getUsableAvailability([fabric.id]))[fabric.id] === 50,
    "transit stock is not usable (45 at HCM + 5 aisle 2)"
  );
  assert((await inv.reconcile()).ok, "ledger reconciles while in transit");
  const received = await inv.receiveTransfer({
    ...actor,
    idempotency_key: k("xf-recv"),
    transfer_id: dispatched.transfer_id,
  });
  assert(received.status === "RECEIVED", "the destination confirms receipt");
  const after = await inv.getAvailability(fabric.id);
  assert(
    after.find((r: any) => r.location_id === hn.id)?.on_hand === 30 &&
      (after.find((r: any) => r.location_id === truck.id)?.on_hand ?? 0) === 0,
    "stock arrived at the destination and left transit"
  );
  await expectFail(
    () =>
      inv.receiveTransfer({
        ...actor,
        idempotency_key: k("xf-recv2"),
        transfer_id: dispatched.transfer_id,
      }),
    "already RECEIVED",
    "a transfer cannot be received twice"
  );
  const second = await inv.dispatchTransfer({
    ...actor,
    idempotency_key: k("xf-disp2"),
    balance_id: srcBalance,
    to_location_id: hn.id,
    qty: 10,
    transit_location_id: truck.id,
  });
  await inv.cancelTransfer({
    ...actor,
    idempotency_key: k("xf-cancel"),
    transfer_id: second.transfer_id,
    reason: "truck cancelled",
  });
  const back = await inv.getAvailability(fabric.id);
  assert(
    back.find((r: any) => r.location_id === hcm.id)?.on_hand === 45,
    "a cancelled transfer returns the stock to the source"
  );
  assert((await inv.reconcile()).ok, "ledger reconciles after the transfers");

  console.log("# FR-INV-013: reconciliation detects injected drift");
  const [anyBalance] = await inv.listMaterialBalances({ id: srcBalance });
  await pg.raw(
    `UPDATE material_balance SET on_hand_qty = on_hand_qty + 1 WHERE id = ?`,
    [srcBalance]
  );
  let rec = await inv.reconcile();
  assert(
    !rec.ok &&
      rec.issues.some(
        (i: any) =>
          i.check === "LEDGER_VS_BALANCE" && i.balance_id === srcBalance
      ),
    "a balance that disagrees with the ledger is reported"
  );
  await pg.raw(
    `UPDATE material_balance SET on_hand_qty = on_hand_qty - 1 WHERE id = ?`,
    [srcBalance]
  );
  void anyBalance;
  const roll = (await inv.listMaterialRolls({ roll_code: `XR-${run}` }))[0];
  await pg.raw(`UPDATE material_roll SET status = 'DEPLETED' WHERE id = ?`, [
    roll.id,
  ]);
  rec = await inv.reconcile();
  assert(
    rec.issues.some(
      (i: any) => i.check === "ROLL_STATE" && i.detail.roll_code === `XR-${run}`
    ),
    "a roll marked DEPLETED that still holds stock is reported"
  );
  await pg.raw(`UPDATE material_roll SET status = 'ACTIVE' WHERE id = ?`, [
    roll.id,
  ]);
  const reservation = (
    await inv.listMaterialReservations({ id: fifoRes.reservation.id })
  )[0];
  await pg.raw(
    `UPDATE material_reservation SET requested_qty = requested_qty + 3 WHERE id = ?`,
    [reservation.id]
  );
  rec = await inv.reconcile();
  assert(
    rec.issues.some((i: any) => i.check === "RESERVATION_HEADER_VS_LINES"),
    "a reservation header that disagrees with its lines is reported"
  );
  await pg.raw(
    `UPDATE material_reservation SET requested_qty = requested_qty - 3 WHERE id = ?`,
    [reservation.id]
  );
  assert((await inv.reconcile()).ok, "once repaired the ledger reconciles");

  console.log("# FR-INV-011: a stale count cannot be approved");
  const fresh = (await inv.listMaterialBalances({ id: srcBalance }))[0];
  const count = await inv.recordCycleCount({
    ...actor,
    idempotency_key: k("cc-stale"),
    balance_id: srcBalance,
    counted_qty: Number(fresh.on_hand_qty) - 2,
    expected_version: fresh.version,
    reason: "recount",
  });
  await inv.adjustStock({
    ...actor,
    idempotency_key: k("cc-move"),
    balance_id: srcBalance,
    direction: "PLUS",
    qty: 1,
    reason: "late receipt found",
  });
  const staleResult = await inv.decideCycleCount({
    actor_id: "user_boss",
    idempotency_key: k("cc-dec"),
    count_id: count.count_id,
    decision: "APPROVE",
  });
  assert(
    staleResult.status === "STALE" && staleResult.adjusted === false,
    "stock that moved after the count makes the count stale, nothing is posted"
  );
  assert(
    (await inv.listMaterialCycleCounts({ id: count.count_id }))[0].status ===
      "STALE",
    "and the count is marked STALE"
  );
  const rejectable = await inv.recordCycleCount({
    ...actor,
    idempotency_key: k("cc-rej"),
    balance_id: srcBalance,
    counted_qty: 1,
    expected_version: (await inv.listMaterialBalances({ id: srcBalance }))[0]
      .version,
    reason: "bad count",
  });
  const rejected = await inv.decideCycleCount({
    actor_id: "user_boss",
    idempotency_key: k("cc-rej-dec"),
    count_id: rejectable.count_id,
    decision: "REJECT",
    reason: "miscounted",
  });
  assert(
    rejected.status === "REJECTED" && !rejected.adjusted,
    "a rejected count adjusts nothing"
  );

  console.log("# FR-INV-012: barcode labels");
  const modules = code128Modules(`XR-${run}`);
  assert(
    modules.startsWith("11010010000") && modules.endsWith("1100011101011"),
    "Code 128 starts with the B start symbol and ends with the stop pattern"
  );
  assert(
    (modules.length - 13) % 11 === 0,
    "every symbol is 11 modules wide (plus the 13-module stop)"
  );
  const svg = renderLabelSvg(`XR-${run}`, { headline: ["Cotton", "Lot 1"] });
  assert(
    svg.startsWith("<svg") && svg.includes("<rect") && svg.includes("Cotton"),
    "the label is a printable SVG with the headline and the bars"
  );
  assert(
    !renderLabelSvg("A&B<").includes("A&B<"),
    "text on the label is escaped"
  );

  console.log("# FR-PROC-001/002: qualified suppliers and PO closing");
  const otherMaterial = await inv.createMaterials({
    code: `OTHER-${run}`,
    name: "Other",
    uom: "pcs",
  });
  const supplier = await proc.createSuppliers({
    code: `GSUP-${run}`,
    name: "Qualified supplier",
    supported_material_ids: [fabric.id],
    tax_code: "0312345678",
    default_currency_code: "VND",
    lead_time_days: 14,
  });
  const stored = (await proc.listSuppliers({ id: supplier.id }))[0];
  assert(
    stored.tax_code === "0312345678" && stored.lead_time_days === 14,
    "commercial references are stored on the supplier"
  );
  await expectFail(
    () =>
      proc.createPurchaseOrderWithLines({
        ...actor,
        idempotency_key: k("po-bad"),
        supplier_id: supplier.id,
        lines: [{ material_id: otherMaterial.id, uom: "pcs", ordered_qty: 10 }],
      }),
    "SUPPLIER_NOT_QUALIFIED",
    "a PO line for a material the supplier is not qualified for is refused"
  );
  const po = await proc.createPurchaseOrderWithLines({
    ...actor,
    idempotency_key: k("po-ok"),
    supplier_id: supplier.id,
    lines: [{ material_id: fabric.id, uom: "m", ordered_qty: 20 }],
  });
  const poId = po.purchase_order.id;
  const draftCancel = await proc.createPurchaseOrderWithLines({
    ...actor,
    idempotency_key: k("po-cancel"),
    supplier_id: supplier.id,
    lines: [{ material_id: fabric.id, uom: "m", ordered_qty: 5 }],
  });
  const cancelled = await proc.transitionPurchaseOrder({
    ...actor,
    purchase_order_id: draftCancel.purchase_order.id,
    action: "cancel",
    reason: "ordered by mistake",
  });
  assert(cancelled.status === "CANCELLED", "a draft PO can be cancelled");
  await expectFail(
    () =>
      proc.transitionPurchaseOrder({
        ...actor,
        purchase_order_id: draftCancel.purchase_order.id,
        action: "approve",
      }),
    "INVALID_STATE",
    "a cancelled PO cannot be approved"
  );
  for (const action of ["approve", "send"]) {
    await proc.transitionPurchaseOrder({
      ...actor,
      purchase_order_id: poId,
      action,
    });
  }
  const grn = await proc.postGoodsReceipt({
    ...actor,
    idempotency_key: k("po-grn"),
    purchase_order_id: poId,
    location_id: store.id,
    lines: [
      {
        purchase_order_line_id: po.lines[0].id,
        qty: 20,
        lot_no: "GL1",
        rolls: [{ roll_code: `GR-${run}`, qty: 20 }],
      },
    ],
  });
  await expectFail(
    () =>
      proc.transitionPurchaseOrder({
        ...actor,
        purchase_order_id: poId,
        action: "cancel",
      }),
    "INVALID_STATE",
    "a PO with receipts cannot be cancelled"
  );
  const closed = await proc.transitionPurchaseOrder({
    ...actor,
    purchase_order_id: poId,
    action: "close",
  });
  assert(
    closed.status === "CLOSED" && closed.from === "RECEIVED",
    "a fully received PO can be closed"
  );
  void grn;

  console.log("# FR-NOT-001/004: customer notifications from domain events");
  const channel = new SandboxChannel("MESSENGER");
  registerMessageChannel(channel);
  const page = `page_gap_${run}`;
  const customer = `cus_gap_${run}`;
  const deps: any = {
    service: social,
    channel,
    readers: {
      findOrder: async () => null,
      shipmentsForOrder: async () => [],
      productionStatusForOrder: async () => null,
      searchProducts: async () => [],
      createCheckoutLink: async () => null,
    },
    locale: "en",
    flags: { readTools: true, stateChange: false },
  };
  const psid = `psid_gap_${run}`;
  const code = (await social.createLinkCode(customer)).code;
  await handleInboundMessage(deps, {
    channel: "MESSENGER",
    account_id: page,
    external_user_id: psid,
    message_id: `mid_gap_${run}`,
    text: `link ${code}`,
    occurred_at: new Date(),
  });
  const orderId = `order_gap_${run}`;
  const fakeScope = {
    resolve: (key: string) =>
      key === "query"
        ? {
            graph: async () => ({
              data: [{ id: orderId, customer_id: customer, display_id: 4242 }],
            }),
          }
        : container.resolve(key),
  } as any;
  process.env.META_MESSENGER_ENABLED = "true";
  process.env.META_SHIPMENT_NOTIFICATION_ENABLED = "true";
  process.env.SOCIAL_DEFAULT_LOCALE = "en";
  const envelope = (event_type: string, data: Record<string, unknown>) => ({
    event_id: `evt_${event_type}_${run}`,
    event_type,
    event_version: 1,
    aggregate_type: "x",
    aggregate_id: "x",
    occurred_at: new Date().toISOString(),
    correlation_id: "cor",
    causation_id: null,
    producer: "test",
    data,
  });
  const sentBefore = channel.sent.length;
  await notifyCustomerEvents({
    event: {
      name: "returns.return_received.v1",
      data: envelope("returns.return_received.v1", {
        return_id: `ret_${run}`,
        order_id: orderId,
      }),
    },
    container: fakeScope,
  } as any);
  await notifyCustomerEvents({
    event: {
      name: "returns.refund_completed.v1",
      data: envelope("returns.refund_completed.v1", {
        return_id: `ret_${run}`,
        order_id: orderId,
      }),
    },
    container: fakeScope,
  } as any);
  await notifyOrderConfirmed({
    event: { name: "order.placed", data: { id: orderId } },
    container: fakeScope,
  } as any);
  const texts = channel.sent.slice(sentBefore).map((m) => m.text);
  assert(
    texts.some((t) => /received your returned items/i.test(t)),
    "'return received' reaches the customer"
  );
  assert(
    texts.some((t) => /refund .* completed/i.test(t)),
    "'refund completed' reaches the customer"
  );
  assert(
    texts.some((t) => /order is confirmed/i.test(t)),
    "'order confirmed' reaches the customer on Messenger"
  );
  const again = channel.sent.length;
  await notifyOrderConfirmed({
    event: { name: "order.placed", data: { id: orderId } },
    container: fakeScope,
  } as any);
  assert(
    channel.sent.length === again,
    "a redelivered order.placed is deduped"
  );
  assert(
    describeCustomerNotification(
      envelope("returns.item_inspected.v1", { order_id: orderId }),
      "en"
    ) === null,
    "internal events are not customer-facing"
  );
  assert(
    describeCustomerNotification(
      envelope("fulfillment.shipment_status_changed.v1", {
        to: "DELIVERED",
        order_id: orderId,
        shipment_id: "s1",
        return_id: "ret",
      }),
      "en"
    ) === null,
    "return parcels do not trigger delivery messages"
  );

  console.log("# FR-NOT-002: the customer can switch a category off");
  const inbound = (text: string, id: string) =>
    handleInboundMessage(deps, {
      channel: "MESSENGER",
      account_id: page,
      external_user_id: psid,
      message_id: `mid_pref_${id}_${run}`,
      text,
      occurred_at: new Date(),
    });
  const shipmentEvent = (to: string, shipmentId: string) =>
    envelope("fulfillment.shipment_status_changed.v1", {
      shipment_id: shipmentId,
      order_id: orderId,
      to,
      tracking_number: "TRK1",
      return_id: null,
    });
  const muteReply = (await inbound("mute shipping", "m1")) as any;
  assert(
    /notifications are off/i.test(muteReply.reply),
    "'mute shipping' is confirmed"
  );
  const notifications = () =>
    channel.sent.filter((m) => m.text.startsWith("Order #")).length;
  const mutedBefore = notifications();
  await notifyCustomerEvents({
    event: {
      name: "fulfillment.shipment_status_changed.v1",
      data: shipmentEvent("OUT_FOR_DELIVERY", `shp_pref_${run}`),
    },
    container: fakeScope,
  } as any);
  assert(notifications() === mutedBefore, "a muted category is not sent");
  await notifyCustomerEvents({
    event: {
      name: "returns.refund_completed.v1",
      data: envelope("returns.refund_completed.v1", {
        return_id: `ret2_${run}`,
        order_id: orderId,
      }),
    },
    container: fakeScope,
  } as any);
  assert(notifications() === mutedBefore + 1, "other categories still arrive");
  await inbound("unmute shipping", "m2");
  await notifyCustomerEvents({
    event: {
      name: "fulfillment.shipment_status_changed.v1",
      data: shipmentEvent("DELIVERED", `shp_pref2_${run}`),
    },
    container: fakeScope,
  } as any);
  assert(
    notifications() === mutedBefore + 2,
    "after 'unmute shipping' shipment updates arrive again"
  );
  const vi = (await inbound("tắt thông báo giao hàng", "m3")) as any;
  assert(
    /notifications are off/i.test(vi.reply),
    "the Vietnamese command works too"
  );
  await inbound("unmute delivery", "m4");

  console.log(
    "# FR-FUL-002/005: status codes from the carrier contract win over keywords"
  );
  const contract = {
    JT_STATUS_MAP_JSON: '{"S-20":"PICKED_UP","S-90":"DELIVERED","bad":"NOPE"}',
  };
  assert(
    mapJtStatus("S-20", contract as any) === "PICKED_UP" &&
      mapJtStatus(" s-90 ", contract as any) === "DELIVERED",
    "configured codes are matched exactly, ignoring case and spaces"
  );
  assert(
    mapJtStatus("bad", contract as any) === null &&
      mapJtStatus("Out for delivery", contract as any) === "OUT_FOR_DELIVERY",
    "an invalid entry is ignored and unlisted text still uses the keyword rules"
  );
  assert(
    mapJtStatus("S-20", { JT_STATUS_MAP_JSON: "{not json" } as any) === null,
    "a malformed value falls back to the keyword rules"
  );

  console.log("# FR-ADM-003: shipment actions are audited");
  const provider = new SandboxCarrierProvider("SANDBOX");
  registerCarrierProvider(provider);
  const shipOrder = `order_ship_${run}`;
  const created = await createCarrierShipmentWorkflow(container).run({
    input: {
      ...actor,
      carrier_code: provider.code,
      order_id: shipOrder,
      medusa_fulfillment_id: `ful_${run}`,
      request: {
        merchant_reference: `mr_${run}`,
        sender: {
          name: "Shop",
          phone: "0900000001",
          address_line: "1 Factory Rd",
          province: "HCM",
        },
        receiver: {
          name: "A",
          phone: "0900000000",
          address_line: "1 Main",
          province: "HCM",
        },
        parcel: {
          weight_grams: 500,
          declared_value: 100000,
          items: [{ name: "X", qty: 1, sku: "X" }],
        },
        cod_amount: 0,
      },
    } as any,
  });
  const shipmentId = (created.result as any).id;
  await cancelCarrierShipmentWorkflow(container).run({
    input: { ...actor, shipment_id: shipmentId },
  });
  const rows = await integ.listAuditLogs({ resource_id: shipmentId });
  const actions = rows.map((r: any) => r.action);
  assert(
    actions.includes("fulfillment.shipment.create") &&
      actions.includes("fulfillment.shipment.cancel"),
    "creating and cancelling a shipment leave audit rows"
  );
  assert(
    rows.every(
      (r: any) => r.actor_id === actor.actor_id && r.created_at !== undefined
    ),
    "each row records the actor and the time"
  );

  console.log("INTEGRATION TEST PASSED");
}
