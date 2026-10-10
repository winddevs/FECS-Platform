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
  type DrainResult,
  type OutboxPublishFn,
} from "../../lib/outbox/outbox";
import { hashPayload } from "../../lib/sql";
import { executorOf, flushOf, outboxRowFor } from "../../lib/tx";
import {
  decideTransition,
  isActiveStatus,
  type CreateState,
  type ShipmentStatus,
} from "./lib/shipment-state";
import {
  CarrierShipment,
  FULFILLMENT_OUTBOX_TABLE,
  FulfillmentIdempotencyRecord,
  FulfillmentOutboxEvent,
  TrackingEvent,
} from "./models/shipment";

const PRODUCER = "fulfillment";
/** A PENDING row older than this means the creating process died mid-call. */
const STALE_PENDING_SECONDS = 60;

type Actor = { actor_id: string; correlation_id?: string | null };

export type ClaimShipmentInput = Actor & {
  carrier_code: string;
  medusa_fulfillment_id?: string | null;
  return_id?: string | null;
  order_id: string;
  merchant_reference: string;
  request: Record<string, unknown>;
};

export type ClaimAction = "CREATE" | "RECONCILE" | "DONE";

export type ShipmentView = {
  id: string;
  carrier_code: string;
  order_id: string;
  medusa_fulfillment_id: string | null;
  return_id: string | null;
  merchant_reference: string;
  create_state: CreateState;
  status: ShipmentStatus;
  tracking_number: string | null;
  attempts: number;
};

export type CreateOutcome =
  | {
      kind: "SUCCESS";
      tracking_number: string;
      carrier_order_id?: string | null;
    }
  | { kind: "RETRYABLE" | "AMBIGUOUS" | "FINAL"; message: string };

export type MappedTrackingEvent = {
  carrier_status: string;
  canonical: ShipmentStatus | null;
  description?: string | null;
  occurred_at: Date;
};

type ShipmentRow = ShipmentView & {
  request: Record<string, unknown>;
  updated_at: Date | string;
};

const SHIPMENT_COLUMNS =
  "id, carrier_code, order_id, medusa_fulfillment_id, return_id, merchant_reference, create_state, status, tracking_number, attempts, request, updated_at";

class FulfillmentModuleService extends MedusaService({
  CarrierShipment,
  TrackingEvent,
  FulfillmentOutboxEvent,
  FulfillmentIdempotencyRecord,
}) {
  protected baseRepository_: DAL.RepositoryService;

  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(...(arguments as unknown as []));
    this.baseRepository_ = container.baseRepository;
  }

  private async emit(
    ctx: Context,
    eventType: string,
    shipmentId: string,
    actor: Actor,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.createFulfillmentOutboxEvents(
      [
        outboxRowFor({
          eventType,
          aggregateType: "carrier_shipment",
          aggregateId: shipmentId,
          producer: PRODUCER,
          topic: TOPICS.fulfillment,
          actor,
          data,
        }),
      ],
      ctx
    );
  }

  private view(row: ShipmentRow): ShipmentView {
    return {
      id: row.id,
      carrier_code: row.carrier_code,
      order_id: row.order_id,
      medusa_fulfillment_id: row.medusa_fulfillment_id,
      return_id: row.return_id,
      merchant_reference: row.merchant_reference,
      create_state: row.create_state,
      status: row.status,
      tracking_number: row.tracking_number,
      attempts: Number(row.attempts),
    };
  }

  // -------------------------------------------------------------------
  // Creation protocol (FR-FUL-003, TDD s.29/30)
  // -------------------------------------------------------------------

  /**
   * Step 1 of 3. Atomically claims the (carrier, fulfillment) slot. The
   * unique index guarantees one shipment per fulfillment even under races.
   */
  @InjectTransactionManager()
  async claimShipment(
    input: ClaimShipmentInput,
    @MedusaContext() ctx: Context = {}
  ): Promise<{
    action: ClaimAction;
    shipment: ShipmentView;
    request: Record<string, unknown>;
  }> {
    const source = input.medusa_fulfillment_id ?? input.return_id;
    if (!source || (input.medusa_fulfillment_id && input.return_id)) {
      throw domainError(
        MedusaError.Types.INVALID_DATA,
        ErrorCodes.INVALID_STATE,
        "Provide exactly one of medusa_fulfillment_id or return_id"
      );
    }
    const ex = executorOf(ctx);
    await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
      `shipment:${input.carrier_code}|${source}`,
    ]);
    const column = input.medusa_fulfillment_id
      ? "medusa_fulfillment_id"
      : "return_id";
    const [existing] = await ex.execute<ShipmentRow>(
      `SELECT ${SHIPMENT_COLUMNS} FROM "carrier_shipment"
       WHERE carrier_code = ? AND ${column} = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.carrier_code, source]
    );

    if (!existing) {
      const created = await this.createCarrierShipments(
        {
          carrier_code: input.carrier_code,
          medusa_fulfillment_id: input.medusa_fulfillment_id ?? null,
          return_id: input.return_id ?? null,
          order_id: input.order_id,
          merchant_reference: input.merchant_reference,
          create_state: "PENDING",
          status: "CREATED",
          request: input.request,
          attempts: 1,
        },
        ctx
      );
      return {
        action: "CREATE",
        request: input.request,
        shipment: {
          id: created.id,
          carrier_code: input.carrier_code,
          order_id: input.order_id,
          medusa_fulfillment_id: input.medusa_fulfillment_id ?? null,
          return_id: input.return_id ?? null,
          merchant_reference: input.merchant_reference,
          create_state: "PENDING",
          status: "CREATED",
          tracking_number: null,
          attempts: 1,
        },
      };
    }

    const shipment = this.view(existing);
    // A cancelled shipment must never be (re)created at the carrier.
    if (
      existing.status === "CANCELLED" &&
      existing.create_state !== "SUCCEEDED"
    ) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Shipment was cancelled; it will not be created at the carrier"
      );
    }
    switch (existing.create_state) {
      case "SUCCEEDED":
        return { action: "DONE", shipment, request: existing.request };
      case "UNKNOWN":
        return { action: "RECONCILE", shipment, request: existing.request };
      case "PENDING": {
        const ageSeconds =
          (Date.now() - new Date(existing.updated_at).getTime()) / 1000;
        if (ageSeconds < STALE_PENDING_SECONDS) {
          throw domainError(
            MedusaError.Types.CONFLICT,
            ErrorCodes.DUPLICATE,
            "Shipment creation is already in progress"
          );
        }
        // The previous attempt may or may not have reached the carrier.
        return { action: "RECONCILE", shipment, request: existing.request };
      }
      case "FAILED_RETRYABLE":
        await this.updateCarrierShipments(
          {
            id: existing.id,
            create_state: "PENDING",
            attempts: Number(existing.attempts) + 1,
          },
          ctx
        );
        return {
          action: "CREATE",
          shipment: {
            ...shipment,
            create_state: "PENDING",
            attempts: shipment.attempts + 1,
          },
          request: existing.request,
        };
      default:
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          "Carrier rejected this shipment permanently; fix the data and create a replacement"
        );
    }
  }

  /** Step 3 of 3: persist the outcome of the carrier call. */
  @InjectTransactionManager()
  async recordCreateOutcome(
    input: Actor & { shipment_id: string; outcome: CreateOutcome },
    @MedusaContext() ctx: Context = {}
  ): Promise<ShipmentView> {
    const [row] = await executorOf(ctx).execute<ShipmentRow>(
      `SELECT ${SHIPMENT_COLUMNS} FROM "carrier_shipment" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.shipment_id]
    );
    if (!row) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Shipment not found"
      );
    }
    const { outcome } = input;
    if (outcome.kind === "SUCCESS") {
      if (row.create_state === "SUCCEEDED") {
        return this.view(row);
      }
      await this.updateCarrierShipments(
        {
          id: row.id,
          create_state: "SUCCEEDED",
          tracking_number: outcome.tracking_number,
          carrier_order_id: outcome.carrier_order_id ?? null,
          last_error: null,
        },
        ctx
      );
      await this.emit(ctx, "fulfillment.shipment_created.v1", row.id, input, {
        shipment_id: row.id,
        order_id: row.order_id,
        medusa_fulfillment_id: row.medusa_fulfillment_id,
        return_id: row.return_id,
        carrier_code: row.carrier_code,
        tracking_number: outcome.tracking_number,
      });
      return {
        ...this.view(row),
        create_state: "SUCCEEDED",
        tracking_number: outcome.tracking_number,
      };
    }

    // A late failure (e.g. from a slower concurrent attempt) must not undo a
    // creation that already succeeded.
    if (row.create_state === "SUCCEEDED") {
      return this.view(row);
    }
    const state: CreateState =
      outcome.kind === "RETRYABLE"
        ? "FAILED_RETRYABLE"
        : outcome.kind === "AMBIGUOUS"
          ? "UNKNOWN"
          : "FAILED_FINAL";
    await this.updateCarrierShipments(
      {
        id: row.id,
        create_state: state,
        last_error: outcome.message.slice(0, 500),
      },
      ctx
    );
    await this.emit(
      ctx,
      "fulfillment.shipment_create_failed.v1",
      row.id,
      input,
      {
        shipment_id: row.id,
        order_id: row.order_id,
        carrier_code: row.carrier_code,
        create_state: state,
        error: outcome.message.slice(0, 200),
      }
    );
    return { ...this.view(row), create_state: state };
  }

  /**
   * The carrier confirmed it has no parcel for our reference: safe to retry.
   * Conditional on the shipment still being unresolved, so a concurrent
   * reconciler that already recorded SUCCESS is never overwritten.
   */
  @InjectTransactionManager()
  async confirmAbsentAtCarrier(
    shipmentId: string,
    @MedusaContext() ctx: Context = {}
  ): Promise<{ id: string; changed: boolean }> {
    const rows = await executorOf(ctx).execute<{ id: string }>(
      `UPDATE "carrier_shipment"
       SET create_state = 'FAILED_RETRYABLE', last_error = 'reconciled: not found at carrier',
           updated_at = now()
       WHERE id = ? AND create_state IN ('UNKNOWN', 'PENDING') AND status <> 'CANCELLED'
         AND deleted_at IS NULL
       RETURNING id`,
      [shipmentId]
    );
    return { id: shipmentId, changed: rows.length > 0 };
  }

  /** Current state of one shipment, for callers that lost a race. */
  @InjectTransactionManager()
  async shipmentView(
    shipmentId: string,
    @MedusaContext() ctx: Context = {}
  ): Promise<ShipmentView> {
    const [row] = await executorOf(ctx).execute<ShipmentRow>(
      `SELECT ${SHIPMENT_COLUMNS} FROM "carrier_shipment" WHERE id = ? AND deleted_at IS NULL`,
      [shipmentId]
    );
    if (!row) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Shipment not found"
      );
    }
    return this.view(row);
  }

  /**
   * Decides, under the row lock and BEFORE the carrier is contacted, whether a
   * cancel is allowed. Returns what the caller must do at the carrier.
   */
  @InjectTransactionManager()
  async assertCancellable(
    shipmentId: string,
    @MedusaContext() ctx: Context = {}
  ): Promise<ShipmentView & { already_cancelled: boolean }> {
    const [row] = await executorOf(ctx).execute<ShipmentRow>(
      `SELECT ${SHIPMENT_COLUMNS} FROM "carrier_shipment" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [shipmentId]
    );
    if (!row) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Shipment not found"
      );
    }
    if (row.status === "CANCELLED") {
      return { ...this.view(row), already_cancelled: true };
    }
    const decision = decideTransition(row.status, "CANCELLED");
    if (!decision.apply) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Shipment is ${row.status} and can no longer be cancelled`
      );
    }
    return { ...this.view(row), already_cancelled: false };
  }

  @InjectTransactionManager()
  async markCancelled(
    input: Actor & { shipment_id: string },
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.applyStatus(
      ctx,
      input.shipment_id,
      "CANCELLED",
      new Date(),
      input
    );
  }

  // -------------------------------------------------------------------
  // Tracking ingestion (FR-FUL-005/006, TDD s.31/32)
  // -------------------------------------------------------------------

  private async applyStatus(
    ctx: Context,
    shipmentId: string,
    next: ShipmentStatus,
    at: Date,
    actor: Actor
  ) {
    const [row] = await executorOf(ctx).execute<ShipmentRow>(
      `SELECT ${SHIPMENT_COLUMNS} FROM "carrier_shipment" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [shipmentId]
    );
    if (!row) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Shipment not found"
      );
    }
    const decision = decideTransition(row.status, next);
    if (!decision.apply) {
      return {
        applied: false as const,
        reason: decision.reason,
        status: row.status,
      };
    }
    await this.updateCarrierShipments(
      {
        id: row.id,
        status: next,
        last_event_at: at,
        ...(next === "DELIVERED" ? { delivered_at: at } : {}),
      },
      ctx
    );
    await flushOf(ctx);
    await this.emit(
      ctx,
      "fulfillment.shipment_status_changed.v1",
      row.id,
      actor,
      {
        shipment_id: row.id,
        order_id: row.order_id,
        medusa_fulfillment_id: row.medusa_fulfillment_id,
        return_id: row.return_id,
        carrier_code: row.carrier_code,
        tracking_number: row.tracking_number,
        from: row.status,
        to: next,
        occurred_at: at.toISOString(),
      }
    );
    return { applied: true as const, from: row.status, status: next };
  }

  /**
   * Idempotent: each (shipment, status, time) is stored once. Events that the
   * transition guard rejects are still recorded as IGNORED for audit.
   */
  @InjectTransactionManager()
  async recordTrackingEvents(
    input: Actor & {
      carrier_code: string;
      tracking_number: string;
      events: MappedTrackingEvent[];
    },
    @MedusaContext() ctx: Context = {}
  ) {
    const ex = executorOf(ctx);
    const [row] = await ex.execute<ShipmentRow>(
      `SELECT ${SHIPMENT_COLUMNS} FROM "carrier_shipment"
       WHERE carrier_code = ? AND tracking_number = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.carrier_code, input.tracking_number]
    );
    if (!row) {
      return { found: false as const, applied: 0, ignored: 0, duplicates: 0 };
    }
    const ordered = [...input.events].sort(
      (a, b) => a.occurred_at.getTime() - b.occurred_at.getTime()
    );
    const result = {
      found: true as const,
      applied: 0,
      ignored: 0,
      duplicates: 0,
    };

    for (const event of ordered) {
      const hash = hashPayload({
        s: event.carrier_status,
        t: event.occurred_at.toISOString(),
      });
      const [seen] = await ex.execute<{ id: string }>(
        `SELECT id FROM "tracking_event" WHERE shipment_id = ? AND event_hash = ? AND deleted_at IS NULL`,
        [row.id, hash]
      );
      if (seen) {
        result.duplicates += 1;
        continue;
      }
      let outcome: "APPLIED" | "IGNORED" = "IGNORED";
      let reason: string | null = event.canonical ? null : "UNMAPPED_STATUS";
      if (event.canonical) {
        const applied = await this.applyStatus(
          ctx,
          row.id,
          event.canonical,
          event.occurred_at,
          input
        );
        if (applied.applied) {
          outcome = "APPLIED";
        } else {
          reason = applied.reason;
        }
      }
      await this.createTrackingEvents(
        {
          shipment_id: row.id,
          event_hash: hash,
          carrier_status: event.carrier_status,
          description: event.description ?? null,
          canonical_status: event.canonical,
          outcome,
          ignored_reason: reason,
          occurred_at: event.occurred_at,
        },
        ctx
      );
      await flushOf(ctx);
      result[outcome === "APPLIED" ? "applied" : "ignored"] += 1;
    }
    return result;
  }

  // -------------------------------------------------------------------
  // Polling & reconciliation support (FR-FUL-006, NFR-AVL)
  // -------------------------------------------------------------------

  /** Claims shipments to poll (SKIP LOCKED so pollers never overlap). */
  @InjectTransactionManager()
  async claimShipmentsToPoll(
    input: { carrier_code: string; limit: number; stale_after_seconds: number },
    @MedusaContext() ctx: Context = {}
  ): Promise<
    Array<{ id: string; tracking_number: string; status: ShipmentStatus }>
  > {
    const ex = executorOf(ctx);
    const rows = await ex.execute<{
      id: string;
      tracking_number: string;
      status: ShipmentStatus;
    }>(
      `SELECT id, tracking_number, status FROM "carrier_shipment"
       WHERE carrier_code = ? AND create_state = 'SUCCEEDED' AND tracking_number IS NOT NULL
         AND status NOT IN ('DELIVERED', 'RETURNED', 'CANCELLED') AND deleted_at IS NULL
         AND COALESCE(last_polled_at, created_at) < now() - (? || ' seconds')::interval
       ORDER BY COALESCE(last_polled_at, created_at)
       LIMIT ? FOR UPDATE SKIP LOCKED`,
      [input.carrier_code, String(input.stale_after_seconds), input.limit]
    );
    if (rows.length > 0) {
      await ex.execute(
        `UPDATE "carrier_shipment" SET last_polled_at = now() WHERE id IN (?)`,
        [rows.map((r) => r.id)]
      );
    }
    return rows.filter((r) => isActiveStatus(r.status));
  }

  /** Creations that are stuck PENDING/UNKNOWN or retryable and need another pass. */
  @InjectTransactionManager()
  async listStuckCreations(
    input: { older_than_seconds: number; limit: number },
    @MedusaContext() ctx: Context = {}
  ) {
    return await executorOf(ctx).execute<{
      id: string;
      carrier_code: string;
      order_id: string;
      medusa_fulfillment_id: string | null;
      return_id: string | null;
      merchant_reference: string;
      create_state: string;
      request: Record<string, unknown>;
    }>(
      `SELECT id, carrier_code, order_id, medusa_fulfillment_id, return_id, merchant_reference,
              create_state, request
       FROM "carrier_shipment"
       WHERE create_state IN ('PENDING', 'UNKNOWN', 'FAILED_RETRYABLE') AND deleted_at IS NULL
         AND status <> 'CANCELLED'
         AND updated_at < now() - (? || ' seconds')::interval
       ORDER BY updated_at LIMIT ?`,
      [String(input.older_than_seconds), input.limit]
    );
  }

  /** Read model for storefront, CS and agents (FR-FUL-007): local state only. */
  @InjectTransactionManager()
  async shipmentsForOrder(orderId: string, @MedusaContext() ctx: Context = {}) {
    return await executorOf(ctx).execute<{
      id: string;
      carrier_code: string;
      tracking_number: string | null;
      status: string;
      create_state: string;
      medusa_fulfillment_id: string | null;
      return_id: string | null;
      last_event_at: Date | null;
      delivered_at: Date | null;
    }>(
      `SELECT id, carrier_code, tracking_number, status, create_state, medusa_fulfillment_id,
              return_id, last_event_at, delivered_at
       FROM "carrier_shipment" WHERE order_id = ? AND deleted_at IS NULL ORDER BY created_at`,
      [orderId]
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
      FULFILLMENT_OUTBOX_TABLE,
      limit,
      publish
    );
  }
}

export default FulfillmentModuleService;
