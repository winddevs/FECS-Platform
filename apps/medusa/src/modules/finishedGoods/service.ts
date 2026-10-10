import type { Context, DAL } from "@medusajs/framework/types";
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils";

import { domainError, ErrorCodes } from "../../lib/errors";
import { TOPICS } from "../../lib/events/envelope";
import { annotate } from "../../lib/observability/annotate";
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
import { freeOf, sellableOf, shouldApplyVersion } from "./lib/projection";
import {
  CommerceSyncState,
  FG_IDEMPOTENCY_TABLE,
  FG_OUTBOX_TABLE,
  FgAllocation,
  FgBalance,
  FgBatch,
  FgLocation,
  FgMovement,
  FgShipmentLine,
  FinishedGoodsIdempotencyRecord,
  FinishedGoodsOutboxEvent,
  type FG_MOVEMENT_TYPES,
} from "./models/fg";

const PRODUCER = "finished-goods";

type MovementType = (typeof FG_MOVEMENT_TYPES)[number];

type BalanceRow = {
  id: string;
  sku: string;
  location_id: string;
  on_hand: number;
  warehouse_hold: number;
  qc_hold: number;
  allocated: number;
  safety_stock: number;
  version: number;
};

type Delta = Partial<
  Record<"on_hand" | "warehouse_hold" | "qc_hold" | "allocated", number>
>;

const BALANCE_COLUMNS =
  "id, sku, location_id, on_hand, warehouse_hold, qc_hold, allocated, safety_stock, version";

const positiveInt = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw domainError(
      MedusaError.Types.INVALID_DATA,
      ErrorCodes.INVALID_STATE,
      `${label} must be a positive whole number`
    );
  }
  return value;
};

const shortId = (prefix: string): string =>
  (newId(prefix).split("_")[1] ?? String(Date.now())).slice(-8);

export type ReceiveFgInput = Command & {
  sku: string;
  qty: number;
  location_id: string;
  source?: "PRODUCTION" | "RETURN";
  mo_id?: string | null;
  production_batch_id?: string | null;
  packing_record_id?: string | null;
  return_item_id?: string | null;
  traceability?: Record<string, unknown> | null;
  /** MTO: goods go straight to this order and never enter general ATS. */
  allocate_to_order_id?: string | null;
};

export type ProjectionEvent = {
  sku: string;
  location_id: string;
  medusa_stock_location_id: string | null;
  available_qty: number;
  source_version: number;
};

class FinishedGoodsModuleService extends MedusaService({
  FgLocation,
  FgBatch,
  FgBalance,
  FgMovement,
  FgAllocation,
  FgShipmentLine,
  CommerceSyncState,
  FinishedGoodsOutboxEvent,
  FinishedGoodsIdempotencyRecord,
}) {
  protected baseRepository_: DAL.RepositoryService;

  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(...(arguments as unknown as []));
    this.baseRepository_ = container.baseRepository;
  }

  private idem<T>(
    ctx: Context,
    scope: string,
    input: Command,
    fn: () => Promise<T>
  ) {
    return runIdempotent(ctx, FG_IDEMPOTENCY_TABLE, scope, input, fn);
  }

  private async emit(
    ctx: Context,
    eventType: string,
    aggregateId: string,
    actor: { actor_id: string; correlation_id?: string | null },
    data: Record<string, unknown>
  ): Promise<void> {
    await this.createFinishedGoodsOutboxEvents(
      [
        outboxRowFor({
          eventType,
          aggregateType: "fg_balance",
          aggregateId,
          producer: PRODUCER,
          topic: TOPICS.finishedGoods,
          actor,
          data,
        }),
      ],
      ctx
    );
  }

  private async location(ctx: Context, id: string) {
    const location = await this.retrieveFgLocation(id, {}, ctx);
    if (!location.is_active) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `FG location ${location.code} is inactive`
      );
    }
    return location;
  }

  /** Serialised get-or-create, then a row lock (balances are mutated in place). */
  private async lockedBalance(
    ctx: Context,
    sku: string,
    locationId: string
  ): Promise<BalanceRow> {
    annotate({ sku, "warehouse.id": locationId });
    const ex = executorOf(ctx);
    await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
      `fgbal:${sku}|${locationId}`,
    ]);
    let [row] = await ex.execute<BalanceRow>(
      `SELECT ${BALANCE_COLUMNS} FROM "fg_balance"
       WHERE sku = ? AND location_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [sku, locationId]
    );
    if (!row) {
      await this.createFgBalances({ sku, location_id: locationId }, ctx);
      await flushOf(ctx);
      [row] = await ex.execute<BalanceRow>(
        `SELECT ${BALANCE_COLUMNS} FROM "fg_balance"
         WHERE sku = ? AND location_id = ? AND deleted_at IS NULL FOR UPDATE`,
        [sku, locationId]
      );
    }
    return row;
  }

  /**
   * Applies a delta, enforces invariants, writes the ledger row and, for
   * commerce locations, emits the versioned sellable projection.
   */
  private async mutate(
    ctx: Context,
    balance: BalanceRow,
    delta: Delta,
    spec: {
      type: MovementType;
      qty: number;
      actor: { actor_id: string; correlation_id?: string | null };
      batch_id?: string | null;
      reference_type?: string | null;
      reference_id?: string | null;
      reason?: string | null;
    },
    safetyStock?: number
  ): Promise<BalanceRow> {
    const next: BalanceRow = {
      ...balance,
      on_hand: balance.on_hand + (delta.on_hand ?? 0),
      warehouse_hold: balance.warehouse_hold + (delta.warehouse_hold ?? 0),
      qc_hold: balance.qc_hold + (delta.qc_hold ?? 0),
      allocated: balance.allocated + (delta.allocated ?? 0),
      safety_stock: safetyStock ?? balance.safety_stock,
      version: balance.version + 1,
    };
    const negative = [
      next.on_hand,
      next.warehouse_hold,
      next.qc_hold,
      next.allocated,
    ].some((v) => v < 0);
    if (negative || freeOf(next) < 0) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INSUFFICIENT_STOCK,
        `Insufficient free finished goods for ${balance.sku} (free ${freeOf(balance)})`
      );
    }

    await this.updateFgBalances(
      {
        id: next.id,
        on_hand: next.on_hand,
        warehouse_hold: next.warehouse_hold,
        qc_hold: next.qc_hold,
        allocated: next.allocated,
        safety_stock: next.safety_stock,
        version: next.version,
      },
      ctx
    );
    await this.createFgMovements(
      {
        movement_type: spec.type,
        sku: next.sku,
        location_id: next.location_id,
        balance_id: next.id,
        batch_id: spec.batch_id ?? null,
        qty: spec.qty,
        on_hand_delta: delta.on_hand ?? 0,
        warehouse_hold_delta: delta.warehouse_hold ?? 0,
        qc_hold_delta: delta.qc_hold ?? 0,
        allocated_delta: delta.allocated ?? 0,
        balance_version: next.version,
        reference_type: spec.reference_type ?? null,
        reference_id: spec.reference_id ?? null,
        reason: spec.reason ?? null,
        actor_id: spec.actor.actor_id,
        occurred_at: new Date(),
      },
      ctx
    );

    const location = await this.retrieveFgLocation(next.location_id, {}, ctx);
    if (location.is_commerce) {
      const projection: ProjectionEvent = {
        sku: next.sku,
        location_id: next.location_id,
        medusa_stock_location_id: location.medusa_stock_location_id,
        available_qty: sellableOf(next),
        source_version: next.version,
      };
      await this.emit(
        ctx,
        "finished-goods.sellable_changed.v1",
        next.id,
        spec.actor,
        {
          ...projection,
        }
      );
    }
    return next;
  }

  // -------------------------------------------------------------------
  // Receipts (FR-FG-001/002, BR-003)
  // -------------------------------------------------------------------

  /**
   * FG receipt for QC-released, packed output. The packing record is the
   * idempotency anchor: the same packing record can never be received twice.
   */
  @InjectTransactionManager()
  async receiveFinishedGoods(
    input: ReceiveFgInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "fg-receive", input, async () => {
      const qty = positiveInt(input.qty, "qty");
      const location = await this.location(ctx, input.location_id);
      const ex = executorOf(ctx);
      const source = input.source ?? "PRODUCTION";

      if (source === "PRODUCTION" && !input.packing_record_id) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "Production receipts require a packing_record_id (QC-released + packed)"
        );
      }
      if (input.packing_record_id) {
        const [dup] = await ex.execute<{ id: string }>(
          `SELECT id FROM "fg_batch" WHERE packing_record_id = ? AND deleted_at IS NULL`,
          [input.packing_record_id]
        );
        if (dup) {
          throw domainError(
            MedusaError.Types.CONFLICT,
            ErrorCodes.DUPLICATE,
            `Packing record ${input.packing_record_id} was already received`
          );
        }
      }

      const batchNo = `FGB-${shortId("fgb")}`;
      const batch = await this.createFgBatches(
        {
          batch_no: batchNo,
          sku: input.sku,
          source,
          location_id: location.id,
          qty,
          remaining_qty: qty,
          mo_id: input.mo_id ?? null,
          production_batch_id: input.production_batch_id ?? null,
          packing_record_id: input.packing_record_id ?? null,
          return_item_id: input.return_item_id ?? null,
          produced_at: new Date(),
          traceability: input.traceability ?? null,
        },
        ctx
      );
      await flushOf(ctx);

      const balance = await this.lockedBalance(ctx, input.sku, location.id);
      const allocateTo = input.allocate_to_order_id ?? null;
      const after = await this.mutate(
        ctx,
        balance,
        { on_hand: qty, allocated: allocateTo ? qty : 0 },
        {
          type: "RECEIPT",
          qty,
          actor: input,
          batch_id: batch.id,
          reference_type: source === "PRODUCTION" ? "MO" : "RETURN",
          reference_id: input.mo_id ?? input.return_item_id ?? null,
        }
      );
      let allocationId: string | null = null;
      if (allocateTo) {
        const allocation = await this.createFgAllocations(
          {
            order_id: allocateTo,
            sku: input.sku,
            location_id: location.id,
            qty,
            batch_id: batch.id,
          },
          ctx
        );
        allocationId = allocation.id;
      }
      await this.emit(
        ctx,
        "finished-goods.receipt_posted.v1",
        batch.id,
        input,
        {
          batch_id: batch.id,
          batch_no: batchNo,
          sku: input.sku,
          qty,
          mo_id: input.mo_id ?? null,
          allocated_to_order_id: allocateTo,
        }
      );
      return {
        batch_id: batch.id,
        batch_no: batchNo,
        balance_version: after.version,
        sellable: sellableOf(after),
        allocation_id: allocationId,
      };
    });
  }

  // -------------------------------------------------------------------
  // Holds, adjustments, allocation, shipping
  // -------------------------------------------------------------------

  @InjectTransactionManager()
  async changeHold(
    input: Command & {
      sku: string;
      location_id: string;
      qty: number;
      kind: "WAREHOUSE" | "QC";
      action: "HOLD" | "RELEASE";
      reason: string;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "fg-hold", input, async () => {
      const qty = positiveInt(input.qty, "qty");
      const balance = await this.lockedBalance(
        ctx,
        input.sku,
        input.location_id
      );
      const sign = input.action === "HOLD" ? 1 : -1;
      const field = input.kind === "QC" ? "qc_hold" : "warehouse_hold";
      const after = await this.mutate(
        ctx,
        balance,
        { [field]: sign * qty },
        {
          type: input.action === "HOLD" ? "HOLD" : "RELEASE_HOLD",
          qty,
          actor: input,
          reason: input.reason,
        }
      );
      return { version: after.version, sellable: sellableOf(after) };
    });
  }

  @InjectTransactionManager()
  async adjustFinishedGoods(
    input: Command & {
      sku: string;
      location_id: string;
      direction: "PLUS" | "MINUS";
      qty: number;
      reason: string;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "fg-adjust", input, async () => {
      const qty = positiveInt(input.qty, "qty");
      if (!input.reason.trim()) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "Adjustment requires a reason"
        );
      }
      const balance = await this.lockedBalance(
        ctx,
        input.sku,
        input.location_id
      );
      const plus = input.direction === "PLUS";
      const after = await this.mutate(
        ctx,
        balance,
        { on_hand: plus ? qty : -qty },
        {
          type: plus ? "ADJUST_PLUS" : "ADJUST_MINUS",
          qty,
          actor: input,
          reason: input.reason,
        }
      );
      return {
        version: after.version,
        on_hand: after.on_hand,
        sellable: sellableOf(after),
      };
    });
  }

  @InjectTransactionManager()
  async setSafetyStock(
    input: Command & { sku: string; location_id: string; safety_stock: number },
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "fg-safety", input, async () => {
      if (!Number.isInteger(input.safety_stock) || input.safety_stock < 0) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "safety_stock must be >= 0"
        );
      }
      const balance = await this.lockedBalance(
        ctx,
        input.sku,
        input.location_id
      );
      const after = await this.mutate(
        ctx,
        balance,
        {},
        {
          type: "ADJUST_PLUS",
          qty: 0,
          actor: input,
          reason: "safety stock change",
        },
        input.safety_stock
      );
      return { version: after.version, sellable: sellableOf(after) };
    });
  }

  /** Reserves free physical stock for one order (outside general ATS). */
  @InjectTransactionManager()
  async allocateToOrder(
    input: Command & {
      order_id: string;
      sku: string;
      location_id: string;
      qty: number;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "fg-allocate", input, async () => {
      const qty = positiveInt(input.qty, "qty");
      const balance = await this.lockedBalance(
        ctx,
        input.sku,
        input.location_id
      );
      const after = await this.mutate(
        ctx,
        balance,
        { allocated: qty },
        {
          type: "ALLOCATE",
          qty,
          actor: input,
          reference_type: "ORDER",
          reference_id: input.order_id,
        }
      );
      const allocation = await this.createFgAllocations(
        {
          order_id: input.order_id,
          sku: input.sku,
          location_id: input.location_id,
          qty,
        },
        ctx
      );
      return {
        allocation_id: allocation.id,
        version: after.version,
        sellable: sellableOf(after),
      };
    });
  }

  @InjectTransactionManager()
  async releaseAllocation(
    input: Command & { allocation_id: string },
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "fg-deallocate", input, async () => {
      const [alloc] = await executorOf(ctx).execute<{
        id: string;
        sku: string;
        location_id: string;
        qty: number;
        shipped_qty: number;
        status: string;
        order_id: string;
      }>(
        `SELECT id, sku, location_id, qty, shipped_qty, status, order_id FROM "fg_allocation"
         WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [input.allocation_id]
      );
      if (!alloc || alloc.status !== "ALLOCATED") {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          "Allocation not found or not active"
        );
      }
      const open = Number(alloc.qty) - Number(alloc.shipped_qty);
      const balance = await this.lockedBalance(
        ctx,
        alloc.sku,
        alloc.location_id
      );
      const after = await this.mutate(
        ctx,
        balance,
        { allocated: -open },
        {
          type: "DEALLOCATE",
          qty: open,
          actor: input,
          reference_type: "ORDER",
          reference_id: alloc.order_id,
        }
      );
      await this.updateFgAllocations({ id: alloc.id, status: "RELEASED" }, ctx);
      return {
        released: open,
        version: after.version,
        sellable: sellableOf(after),
      };
    });
  }

  /** Physical shipment out of FG (pick/pack handoff to the carrier). */
  @InjectTransactionManager()
  async shipFinishedGoods(
    input: Command & {
      sku: string;
      location_id: string;
      qty: number;
      reference_type: string;
      reference_id: string;
      order_id?: string | null;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "fg-ship", input, async () => {
      const qty = positiveInt(input.qty, "qty");
      const ex = executorOf(ctx);
      let allocation:
        | { id: string; qty: number; shipped_qty: number }
        | undefined;
      if (input.order_id) {
        [allocation] = await ex.execute<{
          id: string;
          qty: number;
          shipped_qty: number;
        }>(
          `SELECT id, qty, shipped_qty FROM "fg_allocation"
           WHERE order_id = ? AND sku = ? AND location_id = ? AND status = 'ALLOCATED' AND deleted_at IS NULL
           ORDER BY created_at LIMIT 1 FOR UPDATE`,
          [input.order_id, input.sku, input.location_id]
        );
      }
      const balance = await this.lockedBalance(
        ctx,
        input.sku,
        input.location_id
      );
      const fromAllocation = allocation
        ? Math.min(qty, Number(allocation.qty) - Number(allocation.shipped_qty))
        : 0;
      const after = await this.mutate(
        ctx,
        balance,
        { on_hand: -qty, allocated: -fromAllocation },
        {
          type: "SHIP",
          qty,
          actor: input,
          reference_type: input.reference_type,
          reference_id: input.reference_id,
        }
      );
      await this.consumeBatches(
        ctx,
        input,
        qty,
        allocation ? fromAllocation : 0
      );
      if (allocation && fromAllocation > 0) {
        const shipped = Number(allocation.shipped_qty) + fromAllocation;
        await this.updateFgAllocations(
          {
            id: allocation.id,
            shipped_qty: shipped,
            status: shipped >= Number(allocation.qty) ? "SHIPPED" : "ALLOCATED",
          },
          ctx
        );
      }
      return {
        version: after.version,
        on_hand: after.on_hand,
        sellable: sellableOf(after),
        from_allocation: fromAllocation,
      };
    });
  }

  /**
   * Links a shipment to the FG batches it came from: the order's own allocated
   * batch first (MTO), then oldest-first (FIFO) for the rest.
   */
  private async consumeBatches(
    ctx: Context,
    input: {
      sku: string;
      location_id: string;
      qty: number;
      reference_type: string;
      reference_id: string;
      order_id?: string | null;
      actor_id: string;
    },
    qty: number,
    fromAllocation: number
  ): Promise<void> {
    const ex = executorOf(ctx);
    let remaining = qty;
    const lines: Array<{ batch_id: string | null; qty: number }> = [];

    if (fromAllocation > 0 && input.order_id) {
      const [alloc] = await ex.execute<{ batch_id: string | null }>(
        `SELECT batch_id FROM "fg_allocation"
         WHERE order_id = ? AND sku = ? AND location_id = ? AND deleted_at IS NULL
         ORDER BY created_at LIMIT 1`,
        [input.order_id, input.sku, input.location_id]
      );
      if (alloc?.batch_id) {
        const [batch] = await ex.execute<{ id: string; remaining_qty: number }>(
          `SELECT id, remaining_qty FROM "fg_batch" WHERE id = ? FOR UPDATE`,
          [alloc.batch_id]
        );
        const take = Math.min(
          Number(batch?.remaining_qty ?? 0),
          fromAllocation
        );
        if (batch && take > 0) {
          await this.updateFgBatches(
            { id: batch.id, remaining_qty: Number(batch.remaining_qty) - take },
            ctx
          );
          lines.push({ batch_id: batch.id, qty: take });
          remaining -= take;
        }
      }
    }
    if (remaining > 0) {
      const batches = await ex.execute<{ id: string; remaining_qty: number }>(
        `SELECT id, remaining_qty FROM "fg_batch"
         WHERE sku = ? AND location_id = ? AND remaining_qty > 0 AND deleted_at IS NULL
         ORDER BY produced_at, id FOR UPDATE`,
        [input.sku, input.location_id]
      );
      for (const batch of batches) {
        if (remaining <= 0) break;
        const take = Math.min(Number(batch.remaining_qty), remaining);
        await this.updateFgBatches(
          { id: batch.id, remaining_qty: Number(batch.remaining_qty) - take },
          ctx
        );
        lines.push({ batch_id: batch.id, qty: take });
        remaining -= take;
      }
    }
    if (remaining > 0) {
      // Stock that no batch explains (e.g. after a manual adjustment).
      lines.push({ batch_id: null, qty: remaining });
    }
    await this.createFgShipmentLines(
      lines.map((line) => ({
        reference_type: input.reference_type,
        reference_id: input.reference_id,
        order_id: input.order_id ?? null,
        sku: input.sku,
        batch_id: line.batch_id,
        qty: line.qty,
      })),
      ctx
    );
  }

  // -------------------------------------------------------------------
  // Projection (FR-FG-004/006, NFR-CON-005)
  // -------------------------------------------------------------------

  /** Re-emits the current projection at the CURRENT version (rebuild/resync). */
  @InjectTransactionManager()
  async republishProjection(
    input: {
      actor_id: string;
      correlation_id?: string | null;
      sku?: string | null;
    },
    @MedusaContext() ctx: Context = {}
  ): Promise<{ events: number }> {
    const rows = await executorOf(ctx).execute<
      BalanceRow & { medusa_stock_location_id: string | null }
    >(
      `SELECT b.id, b.sku, b.location_id, b.on_hand, b.warehouse_hold, b.qc_hold, b.allocated,
              b.safety_stock, b.version, l.medusa_stock_location_id
       FROM "fg_balance" b
       JOIN "fg_location" l ON l.id = b.location_id AND l.is_commerce = true AND l.deleted_at IS NULL
       WHERE b.deleted_at IS NULL ${input.sku ? "AND b.sku = ?" : ""}`,
      input.sku ? [input.sku] : []
    );
    for (const row of rows) {
      await this.emit(
        ctx,
        "finished-goods.sellable_changed.v1",
        row.id,
        input,
        {
          sku: row.sku,
          location_id: row.location_id,
          medusa_stock_location_id: row.medusa_stock_location_id,
          available_qty: sellableOf(row),
          source_version: Number(row.version),
        }
      );
    }
    return { events: rows.length };
  }

  /**
   * Consumer side. Runs `apply` (the Medusa inventory update) while holding a
   * row lock on the sync state, so a stale or concurrent event can never
   * overwrite a newer one. The version is committed only if `apply` succeeds.
   */
  @InjectTransactionManager()
  async applyProjectionVersion(
    event: ProjectionEvent,
    apply: () => Promise<{ status: "OK" | "UNMAPPED" }>,
    @MedusaContext() ctx: Context = {}
  ): Promise<{ applied: boolean; reason?: string }> {
    const ex = executorOf(ctx);
    await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
      `csync:${event.sku}|${event.location_id}`,
    ]);
    let [state] = await ex.execute<{
      id: string;
      last_applied_version: number;
    }>(
      `SELECT id, last_applied_version FROM "commerce_sync_state"
       WHERE sku = ? AND location_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [event.sku, event.location_id]
    );
    if (!state) {
      const created = await this.createCommerceSyncStates(
        { sku: event.sku, location_id: event.location_id },
        ctx
      );
      state = { id: created.id, last_applied_version: 0 };
    }
    if (
      !shouldApplyVersion(
        event.source_version,
        Number(state.last_applied_version)
      )
    ) {
      return { applied: false, reason: "STALE_VERSION" };
    }
    try {
      const result = await apply();
      await this.updateCommerceSyncStates(
        {
          id: state.id,
          last_applied_version: event.source_version,
          applied_available: event.available_qty,
          status: result.status,
          last_error: null,
        },
        ctx
      );
      return {
        applied: result.status === "OK",
        reason: result.status === "OK" ? undefined : result.status,
      };
    } catch (error) {
      await this.updateCommerceSyncStates(
        {
          id: state.id,
          status: "ERROR",
          last_error: (error instanceof Error
            ? error.message
            : String(error)
          ).slice(0, 500),
        },
        ctx
      );
      throw error;
    }
  }

  // -------------------------------------------------------------------
  // Reads, trace, reconciliation
  // -------------------------------------------------------------------

  @InjectTransactionManager()
  async sellableFor(skus: string[], @MedusaContext() ctx: Context = {}) {
    if (skus.length === 0) {
      return {};
    }
    const rows = await executorOf(ctx).execute<BalanceRow>(
      `SELECT ${BALANCE_COLUMNS} FROM "fg_balance"
       WHERE sku IN (?) AND deleted_at IS NULL AND location_id IN
         (SELECT id FROM "fg_location" WHERE is_commerce = true AND deleted_at IS NULL)`,
      [skus]
    );
    const out: Record<string, number> = {};
    for (const row of rows) {
      out[row.sku] = (out[row.sku] ?? 0) + sellableOf(row);
    }
    return out;
  }

  /** FG batch -> MO -> production batch -> packing record (BO-03). */
  @InjectTransactionManager()
  async traceBatch(batchId: string, @MedusaContext() ctx: Context = {}) {
    const batch = await this.retrieveFgBatch(batchId, {}, ctx);
    return {
      batch: {
        id: batch.id,
        batch_no: batch.batch_no,
        sku: batch.sku,
        qty: batch.qty,
        source: batch.source,
        mo_id: batch.mo_id,
        production_batch_id: batch.production_batch_id,
        packing_record_id: batch.packing_record_id,
        traceability: batch.traceability,
      },
    };
  }

  @InjectTransactionManager()
  async reconcile(@MedusaContext() ctx: Context = {}) {
    const rows = await executorOf(ctx).execute<Record<string, string>>(
      `SELECT b.id, b.sku, b.on_hand, b.warehouse_hold, b.qc_hold, b.allocated, b.version
       FROM "fg_balance" b
       LEFT JOIN "fg_movement" m ON m.balance_id = b.id
       WHERE b.deleted_at IS NULL
       GROUP BY b.id
       HAVING b.on_hand <> COALESCE(SUM(m.on_hand_delta), 0)
           OR b.warehouse_hold <> COALESCE(SUM(m.warehouse_hold_delta), 0)
           OR b.qc_hold <> COALESCE(SUM(m.qc_hold_delta), 0)
           OR b.allocated <> COALESCE(SUM(m.allocated_delta), 0)
           OR b.version <> COALESCE(MAX(m.balance_version), 0)`
    );
    return { ok: rows.length === 0, issues: rows };
  }

  @InjectTransactionManager()
  async publishOutbox(
    limit: number,
    publish: OutboxPublishFn,
    @MedusaContext() ctx: Context = {}
  ): Promise<DrainResult> {
    return await drainOutbox(executorOf(ctx), FG_OUTBOX_TABLE, limit, publish);
  }
}

export default FinishedGoodsModuleService;
