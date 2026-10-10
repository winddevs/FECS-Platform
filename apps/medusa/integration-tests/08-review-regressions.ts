import { ExecArgs } from "@medusajs/framework/types";

import { CarrierError } from "../src/integrations/carrier/provider";
import { registerCarrierProvider } from "../src/integrations/carrier/registry";
import { SandboxCarrierProvider } from "../src/integrations/carrier/sandbox";
import { registerMessageChannel } from "../src/integrations/channel/registry";
import { SandboxChannel } from "../src/integrations/channel/sandbox";
import { JTCarrierProvider } from "../src/integrations/jt/provider";
import { parseScanTime } from "../src/integrations/jt/provider";
import { mapJtStatus } from "../src/integrations/jt/status-map";
import { hasPermission, rolesFromMetadata } from "../src/lib/authz/permissions";
import { touchesRoleMetadata } from "../src/lib/authz/protect-role-metadata";
import { TOPICS } from "../src/lib/events/envelope";
import { buildShipmentRequest } from "../src/lib/fulfillment/build-request";
import { handleInboundMessage } from "../src/lib/social/handle-inbound";
import {
  flushDeferredNotifications,
  notifyCustomer,
} from "../src/lib/social/notify";
import { outboxRowFor } from "../src/lib/tx";
import { decideTransition } from "../src/modules/fulfillment/lib/shipment-state";
import { planAllocation } from "../src/modules/materialInventory/lib/allocation";
import {
  exceedsCeiling,
  refundCeiling,
  returnedValue,
} from "../src/modules/returns/lib/refund-cap";
import { parseIntent } from "../src/modules/socialCommerce/lib/intent";
import {
  cancelCarrierShipmentWorkflow,
  createCarrierShipmentWorkflow,
} from "../src/workflows/fulfillment";
import {
  cancelManufacturingOrderWorkflow,
  createBomWorkflow,
  createManufacturingOrderWorkflow,
  createRoutingWorkflow,
  issueMaterialToMoWorkflow,
  releaseBomWorkflow,
  releaseManufacturingOrderWorkflow,
  releaseRoutingWorkflow,
  reserveMoMaterialsWorkflow,
} from "../src/workflows/manufacturing";
import { settlePendingReceipt } from "../src/workflows/steps/procurement";

/**
 * Regression tests for the defects found in the code review. They run the real
 * workflows (including compensations) and real concurrency, which the first
 * suites did not.
 */
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
    const text = `${e.code ?? ""} ${e.message}`;
    assert(
      text.includes(needle),
      `${msg} (got: ${e.code ?? ""} ${String(e.message).slice(0, 120)})`
    );
    return;
  }
  throw new Error(`ASSERT FAILED: expected failure "${needle}": ${msg}`);
};

const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export default async function verify({ container }: ExecArgs) {
  const inv: any = container.resolve("materialInventory");
  const mfg: any = container.resolve("manufacturing");
  const proc: any = container.resolve("procurement");
  const ful: any = container.resolve("fashionFulfillment");
  const actor = { actor_id: "user_review", correlation_id: "cor_review" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;

  console.log("# authorization helpers");
  assert(
    touchesRoleMetadata({ metadata: { fashion_roles: ["ERP_ADMIN"] } }),
    "writing fashion_roles is detected"
  );
  assert(
    touchesRoleMetadata({ metadata: { fashion_roles: null } }),
    "removing fashion_roles is detected too"
  );
  assert(
    !touchesRoleMetadata({ metadata: { theme: "dark" } }) &&
      !touchesRoleMetadata({}),
    "unrelated metadata is left alone"
  );
  assert(
    hasPermission(
      rolesFromMetadata({ fashion_roles: ["ERP_ADMIN"] }),
      "roles:manage"
    ),
    "ERP_ADMIN can manage roles"
  );
  assert(
    !hasPermission(
      rolesFromMetadata({ fashion_roles: ["COMMERCE_ADMIN", "PROCUREMENT"] }),
      "roles:manage"
    ),
    "other roles cannot manage roles"
  );
  assert(
    hasPermission(
      rolesFromMetadata({ fashion_roles: ["COMMERCE_ADMIN"] }),
      "commerce:admin"
    ) && !hasPermission([], "commerce:admin"),
    "legacy commerce admin routes need a role"
  );

  console.log("# sandbox providers no longer accept unsigned webhooks");
  delete process.env.SANDBOX_WEBHOOK_SECRET;
  assert(
    new SandboxCarrierProvider("JT").verifyWebhook({}, "{}") === false &&
      new SandboxChannel("MESSENGER").verifyWebhook({}, "{}") === false,
    "no secret configured -> every webhook rejected"
  );

  console.log("# refund ceiling");
  const value = returnedValue([
    { unit_total: 100, qty: 2 },
    { unit_total: 50, qty: 1 },
  ]);
  assert(value === 250, "returned value is the sum of line value x qty");
  assert(refundCeiling(value, 100) === 150, "other refunds reduce the ceiling");
  assert(
    exceedsCeiling(150.01, 150) && !exceedsCeiling(150, 150),
    "amount above the ceiling is refused, equal is fine"
  );

  console.log("# MO fixtures");
  const style = `RG-${run}`;
  const sku = `${style}-M`;
  const fabric = await inv.createMaterials({
    code: `FAB-${run}`,
    name: "Cotton",
    uom: "m",
  });
  const button = await inv.createMaterials({
    code: `BTN-${run}`,
    name: "Button",
    uom: "pcs",
  });
  const loc = await inv.createMaterialLocations({
    code: `RM-${run}`,
    name: "RM",
    warehouse_code: "HCM",
  });
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("rcv-btn"),
    material_id: button.id,
    location_id: loc.id,
    lot: { lot_no: "B1" },
    qty: 1000,
  });
  const bom = await createBomWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("bom"),
      product_sku: style,
      lines: [
        // Buttons come first so they are reserved BEFORE the fabric shortage
        // aborts the saga: that is what makes the compensation observable.
        {
          material_id: button.id,
          uom: "pcs",
          qty_per_unit: 4,
          waste_factor: 0,
        },
        { material_id: fabric.id, uom: "m", qty_per_unit: 2, waste_factor: 0 },
      ],
    },
  });
  await releaseBomWorkflow(container).run({
    input: { id: bom.result.id, ...actor },
  });
  const rt = await createRoutingWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("rt"),
      product_sku: style,
      operations: [
        {
          seq: 10,
          code: "SEW",
          name: "Sew",
          work_center_type: "SEWING",
          standard_minutes: 10,
        },
        {
          seq: 20,
          code: "QC",
          name: "QC",
          work_center_type: "QC",
          standard_minutes: 1,
          qc_gate: true,
        },
      ],
    },
  });
  await releaseRoutingWorkflow(container).run({
    input: { id: rt.result.id, ...actor },
  });
  const mo = await createManufacturingOrderWorkflow(container).run({
    input: {
      ...actor,
      idempotency_key: k("mo"),
      order_type: "MTS",
      product_sku: style,
      lines: [{ sku, qty: 10 }],
    },
  });
  const moId = mo.result.id;
  const onHand = async (materialId: string) =>
    (await inv.getAvailability(materialId)).reduce(
      (s: number, r: any) => s + r.on_hand,
      0
    );
  const available = async (materialId: string) =>
    (await inv.getUsableAvailability([materialId]))[materialId] ?? 0;

  console.log("# reservation saga: retry after a compensated attempt");
  await expectFail(
    () =>
      reserveMoMaterialsWorkflow(container).run({
        input: { mo_id: moId, ...actor },
      }),
    "INSUFFICIENT_STOCK",
    "first attempt fails: no fabric yet"
  );
  assert(
    (await available(button.id)) === 1000,
    "compensation released the button reservation"
  );
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("rcv-fab"),
    material_id: fabric.id,
    location_id: loc.id,
    lot: { lot_no: "F1" },
    qty: 100,
  });
  const reserved = await reserveMoMaterialsWorkflow(container).run({
    input: { mo_id: moId, ...actor },
  });
  assert(
    reserved.result.status === "MATERIAL_RESERVED",
    "retry reaches MATERIAL_RESERVED"
  );
  assert(
    (await available(button.id)) === 960,
    "buttons are REALLY reserved again (a replayed released reservation would leave 1000)"
  );
  assert((await available(fabric.id)) === 80, "fabric is reserved (100 - 20)");
  const again = await reserveMoMaterialsWorkflow(container)
    .run({ input: { mo_id: moId, ...actor } })
    .then(
      () => "ok",
      (e: any) => String(e.message)
    );
  assert(
    typeof again === "string" && (await available(button.id)) === 960,
    "a second reserve does not reserve twice"
  );

  console.log("# issue refuses before stock moves");
  const fabricOnHand = await onHand(fabric.id);
  await expectFail(
    () =>
      issueMaterialToMoWorkflow(container).run({
        input: {
          mo_id: moId,
          ...actor,
          material_id: fabric.id,
          qty: 5,
          idempotency_key: k("iss-early"),
        },
      }),
    "shop-floor work is not allowed",
    "cannot issue while the MO is only MATERIAL_RESERVED"
  );
  assert(
    (await onHand(fabric.id)) === fabricOnHand,
    "no stock moved by the refused issue"
  );

  await releaseManufacturingOrderWorkflow(container).run({
    input: { mo_id: moId, ...actor },
  });
  await issueMaterialToMoWorkflow(container).run({
    input: {
      mo_id: moId,
      ...actor,
      material_id: fabric.id,
      qty: 5,
      idempotency_key: k("iss-1"),
    },
  });
  assert(
    (await onHand(fabric.id)) === fabricOnHand - 5,
    "issue moved exactly 5 m"
  );
  await expectFail(
    () =>
      issueMaterialToMoWorkflow(container).run({
        input: {
          mo_id: moId,
          ...actor,
          material_id: fabric.id,
          qty: 16,
          idempotency_key: k("iss-over"),
        },
      }),
    "more than reserved",
    "cannot issue more than reserved"
  );
  assert(
    (await onHand(fabric.id)) === fabricOnHand - 5,
    "the refused over-issue moved nothing"
  );

  console.log("# cancel: refused cancel must not touch reservations");
  await expectFail(
    () =>
      cancelManufacturingOrderWorkflow(container).run({
        input: { mo_id: moId, ...actor, reason: "test" },
      }),
    "MO_HAS_ISSUED_MATERIAL",
    "cancel refused while material is still issued"
  );
  const stillHeld = await inv.reservationsForReference("MO", moId);
  assert(
    stillHeld.reduce((s: number, r: any) => s + r.outstanding, 0) > 0,
    "reservations are still held after the refused cancel"
  );
  assert(
    (await mfg.listManufacturingOrders({ id: moId }))[0].status === "RELEASED",
    "MO is still RELEASED"
  );

  console.log("# concurrent returns cannot exceed what was issued");
  const [bal] = await inv.listMaterialBalances({ material_id: fabric.id });
  const attempts = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      inv.returnMaterial({
        ...actor,
        idempotency_key: k(`ret-${i}`),
        material_id: fabric.id,
        lot_id: bal.lot_id,
        roll_id: bal.roll_id,
        location_id: loc.id,
        qty: 5,
        bucket: "GOOD",
        reference_type: "MO",
        reference_id: moId,
      })
    )
  );
  assert(
    attempts.filter((a) => a.status === "fulfilled").length === 1,
    "5 parallel returns of the full issued quantity -> exactly 1 succeeds"
  );
  assert(
    (await onHand(fabric.id)) === fabricOnHand,
    "on-hand is back to the original, not inflated"
  );
  const rec = await inv.reconcile();
  assert(rec.ok, `inventory reconciles ${JSON.stringify(rec.issues)}`);

  console.log("# cancel succeeds once nothing is stranded, and is repeatable");
  const cancelled = await cancelManufacturingOrderWorkflow(container).run({
    input: { mo_id: moId, ...actor, reason: "done" },
  });
  assert(cancelled.result.status === "CANCELLED", "MO cancelled");
  const afterCancel = await inv.reservationsForReference("MO", moId);
  assert(
    afterCancel.every((r: any) => r.outstanding === 0),
    "all reservations released after the cancel"
  );
  assert(
    (await available(button.id)) === 1000 &&
      (await available(fabric.id)) === 100,
    "stock is available again"
  );
  const repeat = await cancelManufacturingOrderWorkflow(container).run({
    input: { mo_id: moId, ...actor, reason: "again" },
  });
  assert(repeat.result.status === "CANCELLED", "repeating the cancel succeeds");

  console.log("# goods receipt: ledger decides between roll-forward and void");
  const supplier = await proc.createSuppliers({
    code: `SUP-${run}`,
    name: "Supplier",
  });
  const po = await proc.createPurchaseOrderWithLines({
    ...actor,
    idempotency_key: k("po"),
    supplier_id: supplier.id,
    lines: [
      { material_id: button.id, uom: "pcs", ordered_qty: 100, unit_price: 1 },
    ],
  });
  const lineId = po.lines[0].id;
  for (const action of ["approve", "send"]) {
    await proc.transitionPurchaseOrder({
      ...actor,
      purchase_order_id: po.purchase_order.id,
      action,
    });
  }
  const post = (key: string, qty: number) =>
    proc.postGoodsReceipt({
      ...actor,
      idempotency_key: key,
      purchase_order_id: po.purchase_order.id,
      location_id: loc.id,
      lines: [{ purchase_order_line_id: lineId, qty, lot_no: `L-${key}` }],
    });
  const poReceived = async () =>
    Number((await proc.listPurchaseOrderLines({ id: lineId }))[0].received_qty);

  // A: stock WAS posted but the receipt was left PENDING (workflow died).
  const grnA = await post(k("grn-a"), 30);
  await inv.receiveMaterialBatch(
    grnA.lines.map((l: any) => ({
      ...actor,
      idempotency_key: `grn:${grnA.receipt.id}:${l.id}`,
      material_id: l.material_id,
      location_id: grnA.location_id,
      lot: { lot_no: l.lot_no },
      qty: Number(l.qty),
      reference_type: "GOODS_RECEIPT",
      reference_id: grnA.receipt.id,
    }))
  );
  assert(
    (await settlePendingReceipt(container as any, grnA.receipt.id)) ===
      "POSTED",
    "stock already posted -> receipt rolls forward to POSTED"
  );
  assert(
    (await poReceived()) === 30,
    "PO keeps its received quantity (no un-counted stock)"
  );

  // B: nothing was posted -> void, PO restored, key can be reused.
  const grnB = await post(k("grn-b"), 20);
  assert((await poReceived()) === 50, "second receipt counted on the PO");
  assert(
    (await settlePendingReceipt(container as any, grnB.receipt.id)) === "VOID",
    "no stock posted -> receipt voided"
  );
  assert((await poReceived()) === 30, "PO quantity restored by the void");
  const retried = await post(k("grn-b"), 20);
  assert(
    retried.receipt.id !== grnB.receipt.id && retried.receipt.status !== "VOID",
    "retry with the same key creates a fresh receipt, not the voided one"
  );

  console.log("# carrier: only an explicit 404 proves a parcel is absent");
  const realFetch = globalThis.fetch;
  const jtReal = new JTCarrierProvider({
    baseUrl: "http://jt.invalid",
    apiAccount: "a",
    privateKey: "k",
    webhookSecret: "s",
    signatureHeader: "x-signature",
    timeoutMs: 1000,
  });
  const respond = (status: number, body: unknown = {}) => {
    globalThis.fetch = (async () => jsonResponse(status, body)) as typeof fetch;
  };
  try {
    respond(404);
    assert(
      (await jtReal.findByMerchantReference("F-1")) === null,
      "404 -> absent"
    );
    respond(200, { data: { billCode: "JT123" } });
    assert(
      (await jtReal.findByMerchantReference("F-1"))?.tracking_number ===
        "JT123",
      "found parcel is returned"
    );
    for (const status of [400, 401, 403, 408, 500]) {
      respond(status, { success: false, message: "nope" });
      await expectFail(
        () => jtReal.findByMerchantReference("F-1"),
        "J&T",
        `status ${status} on the lookup is NOT read as "absent"`
      );
    }
    respond(200, { success: false, message: "system busy" });
    await expectFail(
      () => jtReal.findByMerchantReference("F-1"),
      "rejected",
      "success:false on the lookup is NOT read as absent"
    );
    const kindOf = async (status: number) => {
      respond(status, {});
      try {
        await jtReal.createShipment(
          buildShipmentRequest(
            {
              id: "o",
              display_id: 1,
              total: 1,
              payment_status: "paid",
              shipping_address: {
                first_name: "A",
                last_name: "B",
                phone: "0900000000",
                address_1: "1",
                city: "x",
                province: "y",
                country_code: "vn",
              },
            },
            { id: "f", items: [{ title: "T", sku: "S", quantity: 1 }] },
            {} as any
          )
        );
      } catch (e) {
        return e instanceof CarrierError ? e.kind : "other";
      }
      return "ok";
    };
    assert((await kindOf(401)) === "RETRYABLE", "401 on create is retryable");
    assert((await kindOf(408)) === "AMBIGUOUS", "408 on create is ambiguous");
    assert((await kindOf(400)) === "FINAL", "400 on create is final");
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log("# shipments: no overwrite, no resurrection, safe cancel");
  const jt = new SandboxCarrierProvider("JT");
  registerCarrierProvider(jt);
  const order = {
    id: `order_${run}`,
    display_id: 7,
    total: 100000,
    payment_status: "paid",
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
      { id, items: [{ title: "Tee", sku: "TEE-M", quantity: 1 }] },
      {} as any
    ),
  });
  const ok = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_ok_${run}`),
  });
  const absent = await ful.confirmAbsentAtCarrier(ok.result.id);
  assert(
    absent.changed === false,
    "confirm-absent cannot overwrite a SUCCEEDED shipment"
  );
  await ful.recordCreateOutcome({
    ...actor,
    shipment_id: ok.result.id,
    outcome: { kind: "AMBIGUOUS", message: "late failure from a slow worker" },
  });
  const [stillOk] = await ful.listCarrierShipments({ id: ok.result.id });
  assert(
    stillOk.create_state === "SUCCEEDED" && stillOk.tracking_number,
    "a late failure outcome does not undo a success"
  );

  jt.failure = "AMBIGUOUS_BEFORE_CREATE";
  const unknown = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_unk_${run}`),
  });
  assert(unknown.result.create_state === "UNKNOWN", "timeout -> UNKNOWN");
  const cancelUnknown = await cancelCarrierShipmentWorkflow(container).run({
    input: { shipment_id: unknown.result.id, ...actor },
  });
  assert(
    cancelUnknown.result.applied !== false,
    "an unresolved shipment can be cancelled after the carrier confirms no parcel"
  );
  const stuck = await ful.listStuckCreations({
    older_than_seconds: 0,
    limit: 100,
  });
  assert(
    !stuck.some((s: any) => s.id === unknown.result.id),
    "a cancelled shipment is not picked up by the retry job"
  );
  const createsBefore = jt.createCalls;
  await expectFail(
    () =>
      createCarrierShipmentWorkflow(container).run({
        input: make(`ful_unk_${run}`),
      }),
    "cancelled",
    "creating a cancelled shipment again is refused"
  );
  assert(jt.createCalls === createsBefore, "the carrier was not contacted");

  const moving = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_mv_${run}`),
  });
  await ful.updateCarrierShipments({
    id: moving.result.id,
    status: "IN_TRANSIT",
  });
  await expectFail(
    () =>
      cancelCarrierShipmentWorkflow(container).run({
        input: { shipment_id: moving.result.id, ...actor },
      }),
    "can no longer be cancelled",
    "a parcel in transit cannot be cancelled"
  );
  assert(
    jt.parcels.get(moving.result.tracking_number)?.cancelled === false,
    "the carrier parcel was NOT cancelled by the refused cancel"
  );

  console.log("# social: intent parsing");
  const intentOf = (text: string) => parseIntent(text).name;
  assert(
    intentOf("Hủy đơn #1234") === "ORDER",
    '"Hủy đơn #1234" is not an opt-out'
  );
  assert(
    intentOf("Huy ơi đơn 1234 tới đâu") === "ORDER",
    'the name "Huy" is not an opt-out'
  );
  assert(intentOf("stop") === "STOP" && intentOf("STOP.") === "STOP", "stop");
  assert(intentOf("Hủy đăng ký") === "STOP", "Vietnamese unsubscribe");
  assert(intentOf("đăng ký") === "START", '"đăng ký" re-subscribes');
  assert(intentOf("dang ky") === "START", "unaccented re-subscribe");
  assert(
    intentOf("do you support cod?") === "HELP",
    '"support" does not trigger a human handoff'
  );
  assert(
    intentOf("gặp nhân viên") === "HANDOFF" &&
      intentOf("I want to talk to a human") === "HANDOFF",
    "explicit handoff requests still work"
  );
  assert(
    intentOf("nhân viên giao hàng đến chưa") !== "HANDOFF",
    "delivery staff is not a handoff"
  );
  assert(
    intentOf("call 0901234567") === "HELP",
    "a bare number is not an order"
  );
  assert(
    intentOf("reorder please") === "HELP",
    '"reorder" is not an order word'
  );
  assert(
    parseIntent("track 1234").name === "TRACKING" &&
      (parseIntent("track 1234") as { ref: string | null }).ref === "1234",
    "tracking with a reference"
  );

  console.log("# social: link retry, consent and deferred notifications");
  const social: any = container.resolve("socialCommerce");
  const channel = new SandboxChannel("MESSENGER");
  registerMessageChannel(channel);
  const page = `page_${run}`;
  const customer = `cus_review_${run}`;
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
  const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const message = (
    psid: string,
    text: string,
    id: string,
    at = new Date()
  ) => ({
    channel: "MESSENGER",
    account_id: page,
    external_user_id: psid,
    message_id: `mid_${run}_${id}`,
    text,
    occurred_at: at,
  });
  const identityOf = async (psid: string) =>
    (
      await social.listCustomerChannelIdentities({
        account_id: page,
        external_user_id: psid,
      })
    )[0];

  // LINK whose reply fails once: the redelivery must still say "linked".
  const psid1 = `psid1_${run}`;
  const code1 = (await social.createLinkCode(customer)).code;
  channel.failNext = "RETRYABLE";
  let threw = false;
  try {
    await handleInboundMessage(
      deps,
      message(psid1, `link ${code1}`, "l1", days(3))
    );
  } catch {
    threw = true;
  }
  assert(threw, "a retryable send failure is rethrown for the inbox retry");
  const relinked = await handleInboundMessage(
    deps,
    message(psid1, `link ${code1}`, "l1", days(3))
  );
  assert(
    relinked.status === "REPLIED" && /linked/i.test((relinked as any).reply),
    "the redelivered LINK answers 'linked', not 'invalid'"
  );
  const linked = await identityOf(psid1);
  assert(
    linked.customer_id === customer &&
      Number(linked.failed_link_attempts) === 0 &&
      !linked.link_locked_until,
    "no failed attempt was counted and the identity is not locked"
  );

  // Notification outside the 24h window is deferred, then delivered.
  const sentBefore = channel.sent.length;
  const first = await notifyCustomer(
    { service: social, channel },
    {
      customer_id: customer,
      dedupe_key: `shipment:${run}:OUT_FOR_DELIVERY`,
      event_type: "shipment.out_for_delivery",
      text: "Your parcel is out for delivery",
    }
  );
  assert(
    first.sent === 0 && first.skipped[0]?.reason === "OUTSIDE_WINDOW",
    "outside the window nothing is sent now"
  );
  const [deferred] = await social.listDeferred(linked.id, 10);
  assert(
    deferred?.text === "Your parcel is out for delivery",
    "...but it is kept as DEFERRED with its text"
  );
  const dup = await notifyCustomer(
    { service: social, channel },
    {
      customer_id: customer,
      dedupe_key: `shipment:${run}:OUT_FOR_DELIVERY`,
      event_type: "shipment.out_for_delivery",
      text: "Your parcel is out for delivery",
    }
  );
  assert(
    dup.skipped[0]?.reason === "DUPLICATE",
    "a redelivered event is a duplicate"
  );
  await handleInboundMessage(deps, message(psid1, "hello", "h1"));
  assert(
    channel.sent
      .slice(sentBefore)
      .some(
        (m) =>
          m.text === "Your parcel is out for delivery" && m.kind === "UPDATE"
      ),
    "when the customer writes again, the deferred notification is delivered"
  );
  assert(
    (await social.listDeferred(linked.id, 10)).length === 0,
    "and it leaves the queue"
  );

  // A channel outage defers instead of losing the notification.
  channel.failNext = "RETRYABLE";
  const outage = await notifyCustomer(
    { service: social, channel },
    {
      customer_id: customer,
      dedupe_key: `shipment:${run}:DELIVERED`,
      event_type: "shipment.delivered",
      text: "Delivered",
    }
  );
  assert(outage.sent === 0, "outage: not sent");
  assert(
    (await social.listDeferred(linked.id, 10)).length === 1,
    "outage: kept for retry"
  );
  const flushed = await flushDeferredNotifications(
    { service: social, channel },
    await identityOf(psid1)
  );
  assert(
    flushed.sent === 1,
    "the sweeper delivers it once the channel is back"
  );

  // LINK must not override an explicit opt-out.
  const psid2 = `psid2_${run}`;
  await handleInboundMessage(deps, message(psid2, "stop", "s1"));
  const code2 = (await social.createLinkCode(customer)).code;
  await handleInboundMessage(deps, message(psid2, `link ${code2}`, "s2"));
  const optedOut = await identityOf(psid2);
  assert(
    optedOut.customer_id === customer &&
      optedOut.consent_status === "OPTED_OUT",
    "linking an account does not re-subscribe someone who said STOP"
  );

  console.log("# outbox: per-aggregate order and no give-up");
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const aggregate = `agg_${run}`;
  for (const i of [1, 2, 3]) {
    await social.createSocialOutboxEvents([
      outboxRowFor({
        eventType: "social.handoff_requested.v1",
        aggregateType: "customer_channel_identity",
        aggregateId: aggregate,
        producer: "test",
        topic: TOPICS.notification,
        actor: { actor_id: "test" },
        data: { i },
      }),
    ]);
    await sleep(15);
  }
  const published: number[] = [];
  const mine = (row: any) => row.payload?.data?.i as number;
  const forAggregate = (row: any) => row.payload?.aggregate_id === aggregate;
  const failFirst = async (row: any) => {
    if (forAggregate(row) && mine(row) === 1) throw new Error("bus down");
    if (forAggregate(row)) published.push(mine(row));
  };
  const record = async (row: any) => {
    if (forAggregate(row)) published.push(mine(row));
  };
  await social.publishOutbox(50, failFirst);
  assert(
    published.length === 0,
    "when event 1 fails, events 2 and 3 of the same aggregate wait behind it"
  );
  const mgr2 = container.resolve("__pg_connection__") as any;
  await mgr2.raw(
    `UPDATE social_outbox_event SET attempts = 25, available_at = now() - interval '1 second'
     WHERE payload->>'aggregate_id' = ?`,
    [aggregate]
  );
  await social.publishOutbox(50, failFirst);
  const stillPending = await mgr2.raw(
    `SELECT status FROM social_outbox_event WHERE payload->>'aggregate_id' = ? AND (payload->'data'->>'i')::int = 1`,
    [aggregate]
  );
  assert(
    stillPending.rows[0].status === "PENDING",
    "after 26 failed attempts the event is still PENDING, never given up"
  );
  await mgr2.raw(
    `UPDATE social_outbox_event SET available_at = now() - interval '1 second'
     WHERE payload->>'aggregate_id' = ?`,
    [aggregate]
  );
  for (let i = 0; i < 4 && published.length < 3; i += 1) {
    await social.publishOutbox(50, record);
  }
  assert(
    JSON.stringify(published) === "[1,2,3]",
    `the aggregate's events are published in order (got ${JSON.stringify(published)})`
  );

  console.log("# carrier status mapping");
  const mapped = (text: string) => mapJtStatus(text);
  assert(
    mapped("Undelivered") === "DELIVERY_FAILED",
    '"Undelivered" is a failure'
  );
  assert(
    mapped("Consignee refused to sign") === "DELIVERY_FAILED",
    '"refused to sign" is a failure, not a delivery'
  );
  assert(mapped("Not delivered") === "DELIVERY_FAILED", '"Not delivered"');
  assert(
    mapped("Parcel assigned to courier") !== "DELIVERED",
    '"assigned" is not "signed"'
  );
  assert(mapped("Departure from hub") === "IN_TRANSIT", "departure is leaving");
  assert(mapped("Arrival at hub") === "ARRIVED_HUB", "arrival is arriving");
  assert(
    mapped("Problem parcel") === "EXCEPTION",
    "problem parcel is an exception"
  );
  assert(
    mapped("Delivered - signed") === "DELIVERED",
    "real delivery still works"
  );

  console.log("# scan time parsing");
  assert(
    parseScanTime("2026-10-01 10:00:00")?.toISOString() ===
      "2026-10-01T03:00:00.000Z",
    "a time without a zone is Vietnam local time"
  );
  assert(
    parseScanTime("2026-10-01T10:00:00Z")?.toISOString() ===
      "2026-10-01T10:00:00.000Z",
    "an explicit zone is respected"
  );
  assert(
    parseScanTime(undefined) === null &&
      parseScanTime("") === null &&
      parseScanTime("not a date") === null,
    "missing or invalid times are dropped, never replaced by now()"
  );
  assert(
    decideTransition("DELIVERY_FAILED", "RETURNED").apply &&
      decideTransition("IN_TRANSIT", "RETURNED").apply &&
      !decideTransition("CREATED", "RETURNED").apply,
    "RETURNED is reachable from any picked-up state"
  );

  console.log("# stale tracking events");
  const tracked = await createCarrierShipmentWorkflow(container).run({
    input: make(`ful_stale_${run}`),
  });
  const tn = tracked.result.tracking_number;
  const hours = (n: number) => new Date(Date.now() - (3 - n) * 3600 * 1000);
  const ev = (status: string, canonical: string, at: Date) => ({
    carrier_status: status,
    canonical,
    description: null,
    occurred_at: at,
  });
  await ful.recordTrackingEvents({
    ...actor,
    carrier_code: "JT",
    tracking_number: tn,
    events: [ev("Problem parcel", "EXCEPTION", hours(2))],
  });
  const stale = await ful.recordTrackingEvents({
    ...actor,
    carrier_code: "JT",
    tracking_number: tn,
    events: [ev("Pickup scan", "PICKED_UP", hours(1))],
  });
  const [afterStale] = await ful.listCarrierShipments({
    id: tracked.result.id,
  });
  assert(
    stale.applied === 0 && afterStale.status === "EXCEPTION",
    "an older scan cannot pull a shipment back out of EXCEPTION"
  );
  const fresh = await ful.recordTrackingEvents({
    ...actor,
    carrier_code: "JT",
    tracking_number: tn,
    events: [ev("In transit", "IN_TRANSIT", hours(3))],
  });
  assert(fresh.applied === 1, "a newer scan is applied");

  console.log("# fabric allocation order (TDD s.11)");
  const cand = (
    id: string,
    over: Partial<{
      available: number;
      on_hand: number;
      initial: number;
      received_at: number;
    }>
  ) => ({
    balance_id: id,
    lot_id: "lot",
    roll_id: id,
    location_id: "loc",
    dye_lot_no: "D1",
    available: 100,
    on_hand: 100,
    initial: 100,
    received_at: 1,
    ...over,
  });
  const policy = {
    policy: "SAME_DYE_LOT_FIFO" as const,
    track_dye_lot: true,
    max_dye_lots: 1,
  };
  const units = (n: number) => n * 10000;
  const planOf = (cands: any[], need: number) =>
    planAllocation(cands, units(need), policy).lines.map((l) => [
      l.balance_id,
      l.qty / 10000,
    ]);
  assert(
    JSON.stringify(
      planOf(
        [
          cand("older_full", { received_at: 1 }),
          cand("opened", {
            available: units(40),
            on_hand: units(40),
            initial: units(100),
            received_at: 9,
          }),
        ].map((c) => ({ ...c, available: c.available, on_hand: c.on_hand })),
        30
      )
    ) === '[["opened",30]]',
    "an opened roll is used before an older untouched roll"
  );
  assert(
    JSON.stringify(
      planOf(
        [
          cand("full", {
            available: units(100),
            on_hand: units(100),
            initial: units(100),
          }),
          cand("opened", {
            available: units(40),
            on_hand: units(40),
            initial: units(100),
          }),
        ],
        60
      )
    ) === '[["opened",40],["full",20]]',
    "when no opened roll covers it, the fragment is used up first"
  );
  assert(
    JSON.stringify(
      planOf(
        [
          cand("reserved_unopened", {
            available: units(30),
            on_hand: units(100),
            initial: units(100),
          }),
          cand("full", {
            available: units(100),
            on_hand: units(100),
            initial: units(100),
            received_at: 0,
          }),
        ],
        25
      )
    ) === '[["reserved_unopened",25]]',
    "a fully reserved but UNOPENED roll is not 'partial' and falls back to best fit"
  );

  console.log("# receipts: dye lot and tracking data are validated up front");
  const dyed = await inv.createMaterials({
    code: `DYE-${run}`,
    name: "Dyed",
    uom: "m",
    track_roll: true,
    track_dye_lot: true,
  });
  await expectFail(
    () =>
      inv.receiveMaterial({
        ...actor,
        idempotency_key: k("no-dye"),
        material_id: dyed.id,
        location_id: loc.id,
        lot: { lot_no: "L1" },
        rolls: [{ roll_code: `NODYE-${run}`, qty: 10 }],
      }),
    "dye lot",
    "a dye-lot tracked material needs a dye lot number"
  );
  await expectFail(
    () =>
      inv.validateReceipt({
        location_id: loc.id,
        lines: [{ material_id: dyed.id, dye_lot_no: "D1", has_rolls: false }],
      }),
    "roll-tracked",
    "a roll-tracked material needs rolls[]"
  );
  await inv.validateReceipt({
    location_id: loc.id,
    lines: [{ material_id: dyed.id, dye_lot_no: "D1", has_rolls: true }],
  });
  assert(true, "a consistent receipt passes validation");

  console.log("# inbox: a poison event reaches the dead-letter queue");
  const integration: any = container.resolve("integration");
  const mgr3 = container.resolve("__pg_connection__") as any;
  await integration.receiveInboxEvent({
    provider: "poison",
    external_event_id: `poison_${run}`,
    event_type: "x",
    payload: { a: 1 },
  });
  await mgr3.raw(
    `UPDATE inbox_event SET status='PROCESSING', attempts=7, updated_at = now() - interval '10 minutes'
     WHERE provider='poison' AND external_event_id = ?`,
    [`poison_${run}`]
  );
  const claimedPoison = await integration.claimInboxBatch(500);
  assert(
    !claimedPoison.some(
      (r: any) =>
        r.provider === "poison" && r.payload.a === 1 && r.attempts >= 8
    ),
    "a row whose worker died 8 times is not handed out again"
  );
  const poisoned = await mgr3.raw(
    `SELECT status FROM inbox_event WHERE provider='poison' AND external_event_id = ?`,
    [`poison_${run}`]
  );
  assert(poisoned.rows[0].status === "DLQ", "...it goes to the DLQ");

  console.log("# return shipment attaches once, whenever it is created");
  const rmaSvc: any = container.resolve("returns");
  const rmaReq = await rmaSvc.requestReturn({
    ...actor,
    idempotency_key: k("rma-att"),
    order_id: `order_att_${run}`,
    customer_id: "cus_1",
    type: "RETURN",
    reason: "test",
    items: [{ order_line_id: "l1", sku: "S", qty: 1 }],
    eligibility: { eligible: true, reasons: [] },
  });
  await rmaSvc.authorizeReturn({ ...actor, return_id: rmaReq.id });
  const attach1 = await rmaSvc.attachReturnShipment({
    ...actor,
    return_id: rmaReq.id,
    shipment_id: "shp_late",
  });
  const attach2 = await rmaSvc.attachReturnShipment({
    ...actor,
    return_id: rmaReq.id,
    shipment_id: "shp_late",
  });
  assert(
    attach1.status === "IN_TRANSIT" && attach2.skipped === true,
    "the first attach moves the RMA to IN_TRANSIT, a redelivery is a no-op"
  );

  console.log("INTEGRATION TEST PASSED");
}
