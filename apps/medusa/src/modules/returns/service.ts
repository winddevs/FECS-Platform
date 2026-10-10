import type { Context, DAL } from "@medusajs/framework/types";
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils";

import { domainError, ErrorCodes } from "../../lib/errors";
import { TOPICS } from "../../lib/events/envelope";
import {
  drainOutbox,
  newId,
  type DrainResult,
  type OutboxPublishFn,
} from "../../lib/outbox/outbox";
import {
  executorOf,
  flushOf,
  outboxRowFor,
  runIdempotent,
  type Command,
} from "../../lib/tx";
import { exceedsCeiling, refundCeiling } from "./lib/refund-cap";
import {
  RETURNS_IDEMPOTENCY_TABLE,
  RETURNS_OUTBOX_TABLE,
  ReturnAuthorization,
  ReturnItem,
  ReturnsIdempotencyRecord,
  ReturnsOutboxEvent,
  type ReturnStatus,
} from "./models/returns";
import type { InspectItemInput, RequestReturnInput } from "./types";

const PRODUCER = "returns";

type Actor = { actor_id: string; correlation_id?: string | null };

type RmaRow = {
  id: string;
  rma_no: string;
  order_id: string;
  customer_id: string | null;
  type: string;
  status: ReturnStatus;
  eligibility: { eligible: boolean; reasons: string[] };
  refund_status: string;
  exchange_sku: string | null;
  updated_at: Date | string;
};

const RMA_COLUMNS =
  "id, rma_no, order_id, customer_id, type, status, eligibility, refund_status, exchange_sku, updated_at";

/** A refund stuck in REQUESTED longer than this is treated as unresolved. */
const REFUND_STALE_SECONDS = 300;

const ALLOWED: Record<ReturnStatus, readonly ReturnStatus[]> = {
  REQUESTED: ["AUTHORIZED", "REJECTED", "CANCELLED"],
  AUTHORIZED: ["IN_TRANSIT", "RECEIVED", "CANCELLED"],
  IN_TRANSIT: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["INSPECTED"],
  INSPECTED: ["CLOSED"],
  REJECTED: [],
  CLOSED: [],
  CANCELLED: [],
};

class ReturnsModuleService extends MedusaService({
  ReturnAuthorization,
  ReturnItem,
  ReturnsOutboxEvent,
  ReturnsIdempotencyRecord,
}) {
  protected baseRepository_: DAL.RepositoryService;

  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(...(arguments as unknown as []));
    this.baseRepository_ = container.baseRepository;
  }

  private async emit(
    ctx: Context,
    eventType: string,
    rma: { id: string; order_id: string },
    actor: Actor,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    await this.createReturnsOutboxEvents(
      [
        outboxRowFor({
          eventType,
          aggregateType: "return_authorization",
          aggregateId: rma.id,
          producer: PRODUCER,
          topic: TOPICS.fulfillment,
          actor,
          data: { return_id: rma.id, order_id: rma.order_id, ...data },
        }),
      ],
      ctx
    );
  }

  private async lockRma(ctx: Context, id: string): Promise<RmaRow> {
    const [row] = await executorOf(ctx).execute<RmaRow>(
      `SELECT ${RMA_COLUMNS} FROM "return_authorization" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (!row) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        `Return ${id} not found`
      );
    }
    return row;
  }

  private async move(
    ctx: Context,
    rma: RmaRow,
    to: ReturnStatus,
    actor: Actor,
    extra: Record<string, unknown> = {}
  ) {
    if (!ALLOWED[rma.status].includes(to)) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Return ${rma.rma_no} cannot move from ${rma.status} to ${to}`
      );
    }
    await this.updateReturnAuthorizations(
      { id: rma.id, status: to, ...extra },
      ctx
    );
    await flushOf(ctx);
    await this.emit(ctx, `returns.return_${to.toLowerCase()}.v1`, rma, actor, {
      from: rma.status,
      to,
    });
    rma.status = to;
  }

  @InjectTransactionManager()
  async requestReturn(
    input: RequestReturnInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await runIdempotent(
      ctx,
      RETURNS_IDEMPOTENCY_TABLE,
      "request-return",
      input,
      async () => {
        if (
          input.items.length === 0 ||
          input.items.some((i) => !Number.isInteger(i.qty) || i.qty <= 0)
        ) {
          throw domainError(
            MedusaError.Types.INVALID_DATA,
            ErrorCodes.INVALID_STATE,
            "Return items need positive whole quantities"
          );
        }
        if (input.type === "EXCHANGE" && !input.exchange_sku) {
          throw domainError(
            MedusaError.Types.INVALID_DATA,
            ErrorCodes.INVALID_STATE,
            "An exchange needs exchange_sku"
          );
        }
        const rmaNo = `RMA-${(newId("rma").split("_")[1] ?? "").slice(-8)}`;
        const rma = await this.createReturnAuthorizations(
          {
            rma_no: rmaNo,
            order_id: input.order_id,
            customer_id: input.customer_id ?? null,
            type: input.type,
            status: "REQUESTED",
            reason: input.reason,
            eligibility: input.eligibility as unknown as Record<
              string,
              unknown
            >,
            exchange_sku: input.exchange_sku ?? null,
            created_by: input.actor_id,
          },
          ctx
        );
        const items = await this.createReturnItems(
          input.items.map((i) => ({
            return_id: rma.id,
            order_line_id: i.order_line_id,
            sku: i.sku,
            qty: i.qty,
          })),
          ctx
        );
        await this.emit(
          ctx,
          "returns.return_requested.v1",
          { id: rma.id, order_id: input.order_id },
          input,
          {
            rma_no: rmaNo,
            eligible: input.eligibility.eligible,
          }
        );
        return {
          id: rma.id,
          rma_no: rmaNo,
          status: "REQUESTED",
          eligibility: input.eligibility,
          items: items.map((i) => ({ id: i.id, sku: i.sku, qty: i.qty })),
        };
      }
    );
  }

  /** Ineligible returns need an explicit, audited override reason (FR-RET-001). */
  @InjectTransactionManager()
  async authorizeReturn(
    input: Actor & { return_id: string; override_reason?: string | null },
    @MedusaContext() ctx: Context = {}
  ) {
    const rma = await this.lockRma(ctx, input.return_id);
    if (!rma.eligibility.eligible && !input.override_reason?.trim()) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `NOT_ELIGIBLE: ${rma.eligibility.reasons.join(", ")} - an override reason is required`
      );
    }
    await this.move(ctx, rma, "AUTHORIZED", input, {
      authorized_by: input.actor_id,
      override_reason: rma.eligibility.eligible
        ? null
        : (input.override_reason ?? null),
    });
    return {
      id: rma.id,
      rma_no: rma.rma_no,
      status: "AUTHORIZED",
      overridden: !rma.eligibility.eligible,
    };
  }

  @InjectTransactionManager()
  async rejectReturn(
    input: Actor & { return_id: string; reason: string },
    @MedusaContext() ctx: Context = {}
  ) {
    const rma = await this.lockRma(ctx, input.return_id);
    await this.move(ctx, rma, "REJECTED", input, {
      override_reason: input.reason,
    });
    return { id: rma.id, status: "REJECTED" };
  }

  @InjectTransactionManager()
  async attachReturnShipment(
    input: Actor & { return_id: string; shipment_id: string },
    @MedusaContext() ctx: Context = {}
  ) {
    const rma = await this.lockRma(ctx, input.return_id);
    await this.move(ctx, rma, "IN_TRANSIT", input, {
      return_shipment_id: input.shipment_id,
    });
    return { id: rma.id, status: "IN_TRANSIT" };
  }

  /**
   * Goods are physically back. They are NOT sellable: stock only appears after
   * return QC assigns a disposition (BR-006).
   */
  @InjectTransactionManager()
  async receiveReturn(
    input: Actor & { return_id: string },
    @MedusaContext() ctx: Context = {}
  ) {
    const rma = await this.lockRma(ctx, input.return_id);
    await this.move(ctx, rma, "RECEIVED", input);
    return { id: rma.id, status: "RECEIVED" };
  }

  /**
   * Records the QC disposition. Invariants enforced here:
   *  - A_GRADE may only go to a commerce (sellable) location;
   *  - every other grade must go to a NON-commerce location;
   *  - SCRAP posts no stock at all.
   */
  @InjectTransactionManager()
  async inspectReturnItem(
    input: InspectItemInput,
    @MedusaContext() ctx: Context = {}
  ) {
    const [item] = await executorOf(ctx).execute<{
      id: string;
      return_id: string;
      sku: string;
      qty: number;
      disposition: string;
    }>(
      `SELECT id, return_id, sku, qty, disposition FROM "rma_item" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.return_item_id]
    );
    if (!item) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Return item not found"
      );
    }
    const rma = await this.lockRma(ctx, item.return_id);
    // An item that already has its disposition is a replay. This must come
    // before the status check: inspecting the last item moves the RMA to
    // INSPECTED, and a retry of the stock posting would otherwise be refused.
    if (item.disposition !== "PENDING") {
      return {
        return_item_id: item.id,
        disposition: item.disposition,
        replay: true as const,
      };
    }
    if (rma.status !== "RECEIVED") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Items can be inspected only once the return is RECEIVED (is ${rma.status})`
      );
    }
    const needsLocation = input.disposition !== "SCRAP";
    if (needsLocation && !input.destination_location_id) {
      throw domainError(
        MedusaError.Types.INVALID_DATA,
        ErrorCodes.INVALID_STATE,
        "A destination location is required for this disposition"
      );
    }
    if (input.disposition === "A_GRADE" && !input.destination_is_commerce) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "A-grade returns must be restocked to a sellable location"
      );
    }
    if (
      needsLocation &&
      input.disposition !== "A_GRADE" &&
      input.destination_is_commerce
    ) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `${input.disposition} stock must never enter a sellable location`
      );
    }

    await this.updateReturnItems(
      {
        id: item.id,
        disposition: input.disposition,
        destination_location_id: needsLocation
          ? (input.destination_location_id ?? null)
          : null,
        inspected_by: input.actor_id,
        inspected_at: new Date(),
        inspection_notes: input.notes ?? null,
      },
      ctx
    );
    await flushOf(ctx);

    const [{ pending }] = await executorOf(ctx).execute<{ pending: string }>(
      `SELECT count(*) AS pending FROM "rma_item" WHERE return_id = ? AND disposition = 'PENDING' AND deleted_at IS NULL`,
      [rma.id]
    );
    if (Number(pending) === 0) {
      await this.move(ctx, rma, "INSPECTED", input);
    }
    await this.emit(ctx, "returns.item_inspected.v1", rma, input, {
      return_item_id: item.id,
      sku: item.sku,
      qty: Number(item.qty),
      disposition: input.disposition,
    });
    return {
      return_item_id: item.id,
      return_id: rma.id,
      order_id: rma.order_id,
      sku: item.sku,
      qty: Number(item.qty),
      disposition: input.disposition,
      destination_location_id: needsLocation
        ? (input.destination_location_id ?? null)
        : null,
      all_inspected: Number(pending) === 0,
      replay: false as const,
    };
  }

  @InjectTransactionManager()
  async markItemStockPosted(
    itemId: string,
    @MedusaContext() ctx: Context = {}
  ) {
    await this.updateReturnItems({ id: itemId, stock_posted: true }, ctx);
    return { id: itemId };
  }

  /** Items that passed QC but whose stock has not been posted yet. */
  private async unpostedItems(ctx: Context, returnId: string): Promise<number> {
    const [row] = await executorOf(ctx).execute<{ n: string }>(
      `SELECT count(*) AS n FROM "rma_item"
       WHERE return_id = ? AND deleted_at IS NULL
         AND disposition NOT IN ('PENDING', 'SCRAP') AND stock_posted = false`,
      [returnId]
    );
    return Number(row?.n ?? 0);
  }

  /**
   * Refund gate (FR-RET-005, BR-005). Atomic compare-and-set under the RMA row
   * lock: only one caller can move NONE/FAILED to REQUESTED, so two concurrent
   * requests can never both reach the payment provider. The amount is capped
   * by the value of the returned pieces minus other refunds on the same order.
   *
   * `needs_reconcile` is true when an earlier attempt was left in REQUESTED:
   * the caller must check the payment for a refund tagged with this RMA before
   * refunding again.
   */
  @InjectTransactionManager()
  async requestRefund(
    input: Actor & {
      return_id: string;
      payment_id: string;
      amount: number;
      /** Value of the returned pieces, computed from the order by the caller. */
      returned_value: number;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    const rma = await this.lockRma(ctx, input.return_id);
    if (rma.status !== "INSPECTED" && rma.status !== "CLOSED") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Refunds are possible only after return QC"
      );
    }
    if (rma.refund_status === "COMPLETED") {
      return {
        id: rma.id,
        refund_status: "COMPLETED",
        replay: true as const,
        needs_reconcile: false,
      };
    }
    if ((await this.unpostedItems(ctx, rma.id)) > 0) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Returned stock has not been posted yet; finish return QC first"
      );
    }
    if (!(input.amount > 0)) {
      throw domainError(
        MedusaError.Types.INVALID_DATA,
        ErrorCodes.INVALID_STATE,
        "A refund amount is required"
      );
    }

    const ex = executorOf(ctx);
    // Refunds on one order share a ceiling, so they are serialised per order.
    await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
      `rma-refund:${rma.order_id}`,
    ]);
    const [others] = await ex.execute<{ total: string }>(
      `SELECT COALESCE(SUM(refund_amount), 0) AS total FROM "return_authorization"
       WHERE order_id = ? AND id <> ? AND deleted_at IS NULL
         AND refund_status IN ('REQUESTED', 'COMPLETED')`,
      [rma.order_id, rma.id]
    );
    const ceiling = refundCeiling(
      input.returned_value,
      Number(others?.total ?? 0)
    );
    if (exceedsCeiling(input.amount, ceiling)) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Refund of ${input.amount} exceeds the refundable value ${ceiling} of the returned items`
      );
    }

    let needsReconcile = false;
    if (rma.refund_status === "REQUESTED") {
      const ageSeconds =
        (Date.now() - new Date(rma.updated_at).getTime()) / 1000;
      if (ageSeconds < REFUND_STALE_SECONDS) {
        throw domainError(
          MedusaError.Types.CONFLICT,
          ErrorCodes.DUPLICATE,
          "A refund for this return is already in progress"
        );
      }
      needsReconcile = true;
    }
    await this.updateReturnAuthorizations(
      {
        id: rma.id,
        refund_status: "REQUESTED",
        refund_payment_id: input.payment_id,
        refund_amount: input.amount,
      },
      ctx
    );
    await flushOf(ctx);
    await this.emit(ctx, "returns.refund_requested.v1", rma, input, {
      payment_id: input.payment_id,
      amount: input.amount,
    });
    return {
      id: rma.id,
      refund_status: "REQUESTED",
      replay: false as const,
      needs_reconcile: needsReconcile,
    };
  }

  @InjectTransactionManager()
  async completeRefund(
    input: Actor & { return_id: string; ok: boolean; error?: string | null },
    @MedusaContext() ctx: Context = {}
  ) {
    const rma = await this.lockRma(ctx, input.return_id);
    if (rma.refund_status === "COMPLETED") {
      return { id: rma.id, refund_status: "COMPLETED" };
    }
    await this.updateReturnAuthorizations(
      { id: rma.id, refund_status: input.ok ? "COMPLETED" : "FAILED" },
      ctx
    );
    await flushOf(ctx);
    if (input.ok) {
      await this.emit(ctx, "returns.refund_completed.v1", rma, input);
      if (rma.status === "INSPECTED") {
        await this.move(ctx, rma, "CLOSED", input);
      }
    }
    return { id: rma.id, refund_status: input.ok ? "COMPLETED" : "FAILED" };
  }

  @InjectTransactionManager()
  async closeReturn(
    input: Actor & { return_id: string },
    @MedusaContext() ctx: Context = {}
  ) {
    const rma = await this.lockRma(ctx, input.return_id);
    if ((await this.unpostedItems(ctx, rma.id)) > 0) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Returned stock has not been posted yet; finish return QC first"
      );
    }
    await this.move(ctx, rma, "CLOSED", input);
    return { id: rma.id, status: "CLOSED" };
  }

  /** Quantity already tied to non-rejected returns, per order line. */
  @InjectTransactionManager()
  async alreadyReturned(
    orderId: string,
    @MedusaContext() ctx: Context = {}
  ): Promise<Record<string, number>> {
    const rows = await executorOf(ctx).execute<{
      order_line_id: string;
      qty: string;
    }>(
      `SELECT i.order_line_id, SUM(i.qty) AS qty
       FROM "rma_item" i JOIN "return_authorization" r ON r.id = i.return_id AND r.deleted_at IS NULL
       WHERE r.order_id = ? AND r.status NOT IN ('REJECTED', 'CANCELLED') AND i.deleted_at IS NULL
       GROUP BY i.order_line_id`,
      [orderId]
    );
    return Object.fromEntries(
      rows.map((r) => [r.order_line_id, Number(r.qty)])
    );
  }

  @InjectTransactionManager()
  async publishOutbox(
    limit: number,
    publish: OutboxPublishFn,
    @MedusaContext() ctx: Context = {}
  ): Promise<DrainResult> {
    return await drainOutbox(
      executorOf(ctx),
      RETURNS_OUTBOX_TABLE,
      limit,
      publish
    );
  }
}

export default ReturnsModuleService;
export type { Command };
