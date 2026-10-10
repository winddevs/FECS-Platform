import type { Context, DAL } from "@medusajs/framework/types";
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils";

import { domainError, ErrorCodes } from "../../lib/errors";
import { buildEnvelope, TOPICS } from "../../lib/events/envelope";
import {
  beginIdempotent,
  completeIdempotent,
} from "../../lib/idempotency/guard";
import {
  drainOutbox,
  newId,
  toOutboxRow,
  type DrainResult,
  type OutboxPublishFn,
} from "../../lib/outbox/outbox";
import { assertPositiveQty, fromUnits, toUnits } from "../../lib/quantity";
import type { SqlExecutor } from "../../lib/sql";
import { GoodsReceipt, GoodsReceiptLine } from "./models/goods-receipt";
import {
  PROCUREMENT_IDEMPOTENCY_TABLE,
  PROCUREMENT_OUTBOX_TABLE,
  ProcurementIdempotencyRecord,
  ProcurementOutboxEvent,
} from "./models/outbox";
import {
  PurchaseOrder,
  PurchaseOrderLine,
  type PurchaseOrderStatus,
} from "./models/purchase-order";
import { Supplier } from "./models/supplier";
import type {
  ActorContext,
  CreatePurchaseOrderInput,
  PostedGoodsReceipt,
  PostGoodsReceiptInput,
  PurchaseOrderAction,
  TransitionPurchaseOrderInput,
} from "./types";

const PRODUCER = "procurement";

type PoRow = {
  id: string;
  po_number: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
};

type PoLineRow = {
  id: string;
  line_no: number;
  material_id: string;
  ordered_qty: string | number;
  received_qty: string | number;
  over_receipt_pct: number | string;
};

const TRANSITIONS: Record<
  PurchaseOrderAction,
  { from: PurchaseOrderStatus[]; to: PurchaseOrderStatus }
> = {
  approve: { from: ["DRAFT"], to: "APPROVED" },
  send: { from: ["APPROVED"], to: "SENT" },
  close: { from: ["RECEIVED", "PARTIALLY_RECEIVED"], to: "CLOSED" },
  cancel: { from: ["DRAFT", "APPROVED", "SENT"], to: "CANCELLED" },
};

/** Quantity that counts toward PO fulfilment (damaged stock is not accepted). */
const acceptedQty = (bucket: string, qty: number): number =>
  bucket === "DAMAGED" ? 0 : qty;

const shortId = (prefix: string): string =>
  (newId(prefix).split("_")[1] ?? String(Date.now())).slice(-8);

class ProcurementModuleService extends MedusaService({
  Supplier,
  PurchaseOrder,
  PurchaseOrderLine,
  GoodsReceipt,
  GoodsReceiptLine,
  ProcurementOutboxEvent,
  ProcurementIdempotencyRecord,
}) {
  protected baseRepository_: DAL.RepositoryService;

  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(...(arguments as unknown as []));
    this.baseRepository_ = container.baseRepository;
  }

  private executor(ctx: Context): SqlExecutor {
    return ctx.transactionManager as unknown as SqlExecutor;
  }

  private async idempotent<T>(
    ctx: Context,
    scope: string,
    input: ActorContext & { idempotency_key: string },
    fn: () => Promise<T>
  ): Promise<T> {
    const { idempotency_key, correlation_id: _correlation, ...payload } = input;
    const ex = this.executor(ctx);
    const begin = await beginIdempotent<T>(
      ex,
      PROCUREMENT_IDEMPOTENCY_TABLE,
      scope,
      idempotency_key,
      payload
    );
    if (begin.replay) {
      return begin.response;
    }
    const result = await fn();
    await completeIdempotent(
      ex,
      PROCUREMENT_IDEMPOTENCY_TABLE,
      begin.recordId,
      result
    );
    return result;
  }

  private async enqueue(
    ctx: Context,
    input: {
      eventType: string;
      aggregateType: string;
      aggregateId: string;
      actor: ActorContext;
      data: Record<string, unknown>;
    }
  ): Promise<void> {
    const envelope = buildEnvelope({
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      producer: PRODUCER,
      correlationId: input.actor.correlation_id,
      data: { ...input.data, actor_id: input.actor.actor_id },
    });
    await this.createProcurementOutboxEvents(
      [toOutboxRow(envelope, TOPICS.procurement)],
      ctx
    );
  }

  private async lockPurchaseOrder(ctx: Context, id: string) {
    const ex = this.executor(ctx);
    const [po] = await ex.execute<PoRow>(
      `SELECT id, po_number, supplier_id, status FROM "purchase_order"
       WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (!po) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        `Purchase order ${id} not found`
      );
    }
    const lines = await ex.execute<PoLineRow>(
      `SELECT id, line_no, material_id, ordered_qty, received_qty, over_receipt_pct
       FROM "purchase_order_line"
       WHERE purchase_order_id = ? AND deleted_at IS NULL ORDER BY line_no FOR UPDATE`,
      [id]
    );
    return { po, lines };
  }

  private fulfilmentStatus(
    lines: Array<{ ordered: number; received: number }>
  ): PurchaseOrderStatus {
    const anyReceived = lines.some((l) => l.received > 0);
    const allReceived = lines.every((l) => l.received >= l.ordered);
    if (allReceived) {
      return "RECEIVED";
    }
    return anyReceived ? "PARTIALLY_RECEIVED" : "SENT";
  }

  // ---------------------------------------------------------------------
  // Purchase orders
  // ---------------------------------------------------------------------

  @InjectTransactionManager()
  async createPurchaseOrderWithLines(
    input: CreatePurchaseOrderInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "create-po", input, async () => {
      if (input.lines.length === 0) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "A purchase order needs at least one line"
        );
      }
      const supplier = await this.retrieveSupplier(input.supplier_id, {}, ctx);
      if (supplier.status !== "ACTIVE") {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          `Supplier ${supplier.code} is ${supplier.status}`
        );
      }

      const now = new Date();
      const poNumber = `PO-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}-${shortId("po")}`;
      const po = await this.createPurchaseOrders(
        {
          po_number: poNumber,
          supplier_id: supplier.id,
          currency_code: input.currency_code ?? "VND",
          expected_at: input.expected_at ?? null,
          notes: input.notes ?? null,
          created_by: input.actor_id,
          status: "DRAFT",
        },
        ctx
      );
      const lines = await this.createPurchaseOrderLines(
        input.lines.map((line, index) => {
          assertPositiveQty(line.ordered_qty, `line ${index + 1} ordered_qty`);
          return {
            purchase_order_id: po.id,
            line_no: index + 1,
            material_id: line.material_id,
            uom: line.uom,
            ordered_qty: line.ordered_qty,
            unit_price: line.unit_price ?? 0,
            over_receipt_pct: line.over_receipt_pct ?? 5,
          };
        }),
        ctx
      );

      await this.enqueue(ctx, {
        eventType: "procurement.purchase_order_created.v1",
        aggregateType: "purchase_order",
        aggregateId: po.id,
        actor: input,
        data: {
          purchase_order_id: po.id,
          po_number: poNumber,
          supplier_id: supplier.id,
        },
      });

      return {
        purchase_order: {
          id: po.id,
          po_number: poNumber,
          status: "DRAFT",
          supplier_id: supplier.id,
        },
        lines: lines.map((l) => ({
          id: l.id,
          line_no: l.line_no,
          material_id: l.material_id,
          ordered_qty: Number(l.ordered_qty),
        })),
      };
    });
  }

  @InjectTransactionManager()
  async transitionPurchaseOrder(
    input: TransitionPurchaseOrderInput,
    @MedusaContext() ctx: Context = {}
  ) {
    const rule = TRANSITIONS[input.action];
    const { po, lines } = await this.lockPurchaseOrder(
      ctx,
      input.purchase_order_id
    );

    if (!rule.from.includes(po.status)) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Cannot ${input.action} a purchase order in status ${po.status}`
      );
    }
    if (
      input.action === "cancel" &&
      lines.some((l) => toUnits(l.received_qty) > 0)
    ) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Cannot cancel a purchase order that already has receipts; close it instead"
      );
    }

    const now = new Date();
    await this.updatePurchaseOrders(
      {
        id: po.id,
        status: rule.to,
        ...(input.action === "approve"
          ? { approved_by: input.actor_id, approved_at: now }
          : {}),
        ...(input.action === "send" ? { sent_at: now } : {}),
        ...(input.action === "close" ? { closed_at: now } : {}),
      },
      ctx
    );
    await this.enqueue(ctx, {
      eventType: `procurement.purchase_order_${rule.to.toLowerCase()}.v1`,
      aggregateType: "purchase_order",
      aggregateId: po.id,
      actor: input,
      data: {
        purchase_order_id: po.id,
        po_number: po.po_number,
        from: po.status,
        to: rule.to,
        reason: input.reason ?? null,
      },
    });
    return {
      id: po.id,
      po_number: po.po_number,
      from: po.status,
      status: rule.to,
    };
  }

  // ---------------------------------------------------------------------
  // Goods receipt (FR-PROC-003/004/005)
  // ---------------------------------------------------------------------

  /**
   * Records a receipt against a PO. Status stays PENDING_INVENTORY until the
   * stock has been posted by Material Inventory (see receive-goods workflow).
   */
  @InjectTransactionManager()
  async postGoodsReceipt(
    input: PostGoodsReceiptInput,
    @MedusaContext() ctx: Context = {}
  ): Promise<PostedGoodsReceipt> {
    return await this.idempotent(ctx, "post-grn", input, async () => {
      const { po, lines: poLines } = await this.lockPurchaseOrder(
        ctx,
        input.purchase_order_id
      );
      if (po.status !== "SENT" && po.status !== "PARTIALLY_RECEIVED") {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          `Purchase order ${po.po_number} is ${po.status}; goods can only be received against SENT or PARTIALLY_RECEIVED orders`
        );
      }
      if (input.lines.length === 0) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "A goods receipt needs at least one line"
        );
      }

      const lineById = new Map(poLines.map((l) => [l.id, l]));
      const pendingByLine = new Map<string, number>();

      for (const line of input.lines) {
        const poLine = lineById.get(line.purchase_order_line_id);
        if (!poLine) {
          throw domainError(
            MedusaError.Types.NOT_FOUND,
            ErrorCodes.NOT_FOUND,
            `PO line ${line.purchase_order_line_id} does not belong to ${po.po_number}`
          );
        }
        const qty = assertPositiveQty(line.qty);
        if (line.rolls?.length) {
          const rollTotal = line.rolls.reduce(
            (sum, r) => sum + toUnits(r.qty),
            0
          );
          if (rollTotal !== qty) {
            throw domainError(
              MedusaError.Types.INVALID_DATA,
              ErrorCodes.INVALID_STATE,
              `Roll quantities (${fromUnits(rollTotal)}) must add up to line qty (${fromUnits(qty)})`
            );
          }
        }
        const pending =
          (pendingByLine.get(poLine.id) ?? 0) +
          acceptedQty(line.bucket ?? "GOOD", qty);
        pendingByLine.set(poLine.id, pending);

        const ordered = toUnits(poLine.ordered_qty);
        const ceiling = Math.floor(
          (ordered * (100 + Number(poLine.over_receipt_pct))) / 100
        );
        if (toUnits(poLine.received_qty) + pending > ceiling) {
          throw domainError(
            MedusaError.Types.NOT_ALLOWED,
            ErrorCodes.OVER_RECEIPT,
            `Line ${poLine.line_no} would exceed ordered ${fromUnits(ordered)} (+${poLine.over_receipt_pct}% tolerance)`
          );
        }
      }

      const receiptNo = `GRN-${shortId("grn")}`;
      const receipt = await this.createGoodsReceipts(
        {
          receipt_no: receiptNo,
          purchase_order_id: po.id,
          supplier_id: po.supplier_id,
          location_id: input.location_id,
          status: "PENDING_INVENTORY",
          delivery_note: input.delivery_note ?? null,
          received_by: input.actor_id,
          received_at: new Date(),
          idempotency_key: input.idempotency_key,
        },
        ctx
      );
      const createdLines = await this.createGoodsReceiptLines(
        input.lines.map((line) => ({
          goods_receipt_id: receipt.id,
          purchase_order_line_id: line.purchase_order_line_id,
          material_id: (lineById.get(line.purchase_order_line_id) as PoLineRow)
            .material_id,
          qty: line.qty,
          bucket: line.bucket ?? "GOOD",
          lot_no: line.lot_no,
          dye_lot_no: line.dye_lot_no ?? "",
          // DML json() is typed as an object; arrays are valid JSON values.
          rolls: (line.rolls ?? null) as unknown as Record<
            string,
            unknown
          > | null,
        })),
        ctx
      );

      await this.applyReceiptToPo(ctx, po.id, poLines, pendingByLine, 1);

      await this.enqueue(ctx, {
        eventType: "procurement.goods_received.v1",
        aggregateType: "goods_receipt",
        aggregateId: receipt.id,
        actor: input,
        data: {
          goods_receipt_id: receipt.id,
          receipt_no: receiptNo,
          purchase_order_id: po.id,
          supplier_id: po.supplier_id,
          lines: input.lines.map((l) => ({
            purchase_order_line_id: l.purchase_order_line_id,
            qty: l.qty,
            bucket: l.bucket ?? "GOOD",
            lot_no: l.lot_no,
          })),
        },
      });

      return {
        receipt: {
          id: receipt.id,
          receipt_no: receiptNo,
          status: "PENDING_INVENTORY",
        },
        purchase_order_id: po.id,
        supplier_id: po.supplier_id,
        location_id: input.location_id,
        lines: createdLines.map((l, index) => ({
          id: l.id,
          purchase_order_line_id: l.purchase_order_line_id,
          material_id: l.material_id,
          qty: input.lines[index].qty,
          bucket: (input.lines[index].bucket ?? "GOOD") as
            | "GOOD"
            | "QC_HOLD"
            | "DAMAGED",
          lot_no: l.lot_no,
          dye_lot_no: l.dye_lot_no,
          rolls: input.lines[index].rolls ?? null,
        })),
      };
    });
  }

  /** Adds (sign=1) or removes (sign=-1) receipt quantities and refreshes PO status. */
  private async applyReceiptToPo(
    ctx: Context,
    purchaseOrderId: string,
    poLines: PoLineRow[],
    qtyByLine: Map<string, number>,
    sign: 1 | -1
  ): Promise<void> {
    const projected: Array<{ ordered: number; received: number }> = [];
    for (const line of poLines) {
      const delta = (qtyByLine.get(line.id) ?? 0) * sign;
      const received = toUnits(line.received_qty) + delta;
      if (delta !== 0) {
        await this.updatePurchaseOrderLines(
          { id: line.id, received_qty: fromUnits(received) },
          ctx
        );
      }
      projected.push({ ordered: toUnits(line.ordered_qty), received });
    }
    await this.updatePurchaseOrders(
      { id: purchaseOrderId, status: this.fulfilmentStatus(projected) },
      ctx
    );
  }

  @InjectTransactionManager()
  async markGoodsReceiptPosted(
    goodsReceiptId: string,
    @MedusaContext() ctx: Context = {}
  ) {
    const ex = this.executor(ctx);
    const [receipt] = await ex.execute<{ id: string; status: string }>(
      `SELECT id, status FROM "goods_receipt" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [goodsReceiptId]
    );
    if (!receipt) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        `Goods receipt ${goodsReceiptId} not found`
      );
    }
    if (receipt.status === "VOID") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Goods receipt is void"
      );
    }
    if (receipt.status !== "POSTED") {
      await this.updateGoodsReceipts(
        { id: goodsReceiptId, status: "POSTED" },
        ctx
      );
    }
    return { id: goodsReceiptId, status: "POSTED" };
  }

  /**
   * Compensation for a receipt whose inventory posting failed. Only receipts
   * still awaiting inventory can be voided; posted receipts need a return.
   */
  @InjectTransactionManager()
  async voidGoodsReceipt(
    goodsReceiptId: string,
    @MedusaContext() ctx: Context = {}
  ) {
    const ex = this.executor(ctx);
    const [receipt] = await ex.execute<{
      id: string;
      status: string;
      purchase_order_id: string;
    }>(
      `SELECT id, status, purchase_order_id FROM "goods_receipt"
       WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [goodsReceiptId]
    );
    if (!receipt || receipt.status === "VOID") {
      return { id: goodsReceiptId, status: "VOID" };
    }
    if (receipt.status !== "PENDING_INVENTORY") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Only receipts awaiting inventory posting can be voided"
      );
    }

    const { po, lines: poLines } = await this.lockPurchaseOrder(
      ctx,
      receipt.purchase_order_id
    );
    const receiptLines = await ex.execute<{
      purchase_order_line_id: string;
      qty: string;
      bucket: string;
    }>(
      `SELECT purchase_order_line_id, qty, bucket FROM "goods_receipt_line"
       WHERE goods_receipt_id = ? AND deleted_at IS NULL`,
      [goodsReceiptId]
    );
    const qtyByLine = new Map<string, number>();
    for (const line of receiptLines) {
      qtyByLine.set(
        line.purchase_order_line_id,
        (qtyByLine.get(line.purchase_order_line_id) ?? 0) +
          acceptedQty(line.bucket, toUnits(line.qty))
      );
    }
    await this.applyReceiptToPo(ctx, po.id, poLines, qtyByLine, -1);
    await this.updateGoodsReceipts({ id: goodsReceiptId, status: "VOID" }, ctx);
    return { id: goodsReceiptId, status: "VOID" };
  }

  /** Confirmed incoming quantity (ordered - received) of open POs per material. */
  @InjectTransactionManager()
  async confirmedIncoming(
    materialIds: string[],
    @MedusaContext() ctx: Context = {}
  ): Promise<Record<string, number>> {
    if (materialIds.length === 0) {
      return {};
    }
    const rows = await this.executor(ctx).execute<{
      material_id: string;
      incoming: string;
    }>(
      `SELECT l.material_id, SUM(GREATEST(l.ordered_qty - l.received_qty, 0)) AS incoming
       FROM "purchase_order_line" l
       JOIN "purchase_order" p ON p.id = l.purchase_order_id AND p.deleted_at IS NULL
       WHERE l.deleted_at IS NULL AND p.status IN ('SENT', 'PARTIALLY_RECEIVED')
         AND l.material_id IN (?)
       GROUP BY l.material_id`,
      [[...new Set(materialIds)]]
    );
    return Object.fromEntries(
      rows.map((row) => [row.material_id, Number(row.incoming)])
    );
  }

  // ---------------------------------------------------------------------
  // Outbox
  // ---------------------------------------------------------------------

  @InjectTransactionManager()
  async publishOutbox(
    limit: number,
    publish: OutboxPublishFn,
    @MedusaContext() ctx: Context = {}
  ): Promise<DrainResult> {
    return await drainOutbox(
      this.executor(ctx),
      PROCUREMENT_OUTBOX_TABLE,
      limit,
      publish
    );
  }
}

export default ProcurementModuleService;
