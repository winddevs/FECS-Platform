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
import { annotate } from "../../lib/observability/annotate";
import {
  drainOutbox,
  newId,
  toOutboxRow,
  type DrainResult,
  type OutboxPublishFn,
} from "../../lib/outbox/outbox";
import { assertPositiveQty, fromUnits, toUnits } from "../../lib/quantity";
import type { SqlExecutor } from "../../lib/sql";
import {
  planAllocation,
  type AllocationCandidate,
  type AllocationPlan,
} from "./lib/allocation";
import {
  applyDelta,
  availableOf,
  balanceKeyOf,
  parseBalance,
  presentBalance,
  toBalanceUpdate,
  type Balance,
  type BalanceDelta,
  type BalanceRow,
} from "./lib/balance";
import { Material } from "./models/material";
import { MaterialBalance } from "./models/material-balance";
import { MaterialLocation } from "./models/material-location";
import { MaterialLot } from "./models/material-lot";
import {
  MaterialReservation,
  MaterialReservationLine,
} from "./models/material-reservation";
import { MaterialRoll } from "./models/material-roll";
import {
  MaterialStockMovement,
  type MovementType,
} from "./models/material-stock-movement";
import {
  MATERIAL_IDEMPOTENCY_TABLE,
  MATERIAL_OUTBOX_TABLE,
  MaterialInventoryIdempotencyRecord,
  MaterialInventoryOutboxEvent,
} from "./models/outbox";
import type {
  ActorContext,
  AdjustStockInput,
  CycleCountInput,
  IssueMaterialInput,
  QcDecisionInput,
  ReceiveMaterialInput,
  ReconciliationIssue,
  ReleaseReservationInput,
  ReserveMaterialInput,
  ReturnMaterialInput,
  ScrapMaterialInput,
  StockBucket,
  TransferStockInput,
} from "./types";

const PRODUCER = "material-inventory";
const MAX_RESERVE_ATTEMPTS = 3;

const BALANCE_COLUMNS =
  "id, balance_key, material_id, lot_id, roll_id, location_id, on_hand_qty, reserved_qty, qc_hold_qty, damaged_qty, version";

type LockedBalances = Map<string, Balance>;

type MovementSpec = {
  type: MovementType;
  qty: number;
  reason?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
};

type ReservationRow = {
  id: string;
  reservation_no: string;
  material_id: string;
  reference_type: string;
  reference_id: string;
  requested_qty: string | number;
  issued_qty: string | number;
  released_qty: string | number;
  status: string;
};

type ReservationLineRow = {
  id: string;
  reservation_id: string;
  balance_id: string;
  material_id: string;
  lot_id: string | null;
  roll_id: string | null;
  location_id: string;
  reserved_qty: string | number;
  issued_qty: string | number;
  released_qty: string | number;
};

const outstandingOf = (line: ReservationLineRow): number =>
  toUnits(line.reserved_qty) -
  toUnits(line.issued_qty) -
  toUnits(line.released_qty);

const reservationStatus = (
  requested: number,
  issued: number,
  released: number
) => {
  const outstanding = requested - issued - released;
  if (outstanding > 0) {
    return issued > 0 ? "PARTIALLY_ISSUED" : "ACTIVE";
  }
  return issued > 0 ? "ISSUED" : "RELEASED";
};

class MaterialInventoryModuleService extends MedusaService({
  Material,
  MaterialLocation,
  MaterialLot,
  MaterialRoll,
  MaterialBalance,
  MaterialStockMovement,
  MaterialReservation,
  MaterialReservationLine,
  MaterialInventoryOutboxEvent,
  MaterialInventoryIdempotencyRecord,
}) {
  protected baseRepository_: DAL.RepositoryService;

  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(...(arguments as unknown as []));
    this.baseRepository_ = container.baseRepository;
  }

  // ---------------------------------------------------------------------
  // Infrastructure helpers
  // ---------------------------------------------------------------------

  private executor(ctx: Context): SqlExecutor {
    return ctx.transactionManager as unknown as SqlExecutor;
  }

  /**
   * ORM writes are buffered until flush; raw SQL (row locks, aggregates) must
   * see them, so flush before any raw read that follows an ORM write.
   */
  private async flush(ctx: Context): Promise<void> {
    await (
      ctx.transactionManager as unknown as { flush: () => Promise<void> }
    ).flush();
  }

  /** Runs `fn` at most once per (scope, key); duplicates replay the response. */
  private async idempotent<T>(
    ctx: Context,
    scope: string,
    input: ActorContext & { idempotency_key: string },
    fn: () => Promise<T>
  ): Promise<T> {
    const {
      idempotency_key,
      correlation_id: _correlation,
      ...payload
    } = input as ActorContext & {
      idempotency_key: string;
    };
    const ex = this.executor(ctx);
    const begin = await beginIdempotent<T>(
      ex,
      MATERIAL_IDEMPOTENCY_TABLE,
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
      MATERIAL_IDEMPOTENCY_TABLE,
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
    await this.createMaterialInventoryOutboxEvents(
      [toOutboxRow(envelope, TOPICS.inventory)],
      ctx
    );
  }

  private async lockBalances(
    ctx: Context,
    ids: string[]
  ): Promise<LockedBalances> {
    const unique = [...new Set(ids)].sort();
    const locked: LockedBalances = new Map();
    if (unique.length === 0) {
      return locked;
    }
    const rows = await this.executor(ctx).execute<BalanceRow>(
      `SELECT ${BALANCE_COLUMNS} FROM "material_balance"
       WHERE id IN (?) AND deleted_at IS NULL
       ORDER BY id
       FOR UPDATE`,
      [unique]
    );
    for (const row of rows) {
      locked.set(row.id, parseBalance(row));
    }
    for (const id of unique) {
      if (!locked.has(id)) {
        throw domainError(
          MedusaError.Types.NOT_FOUND,
          ErrorCodes.NOT_FOUND,
          `Balance ${id} not found`
        );
      }
    }
    return locked;
  }

  /** Serialises get-or-create of a balance row with a transaction advisory lock. */
  private async ensureBalance(
    ctx: Context,
    key: {
      materialId: string;
      lotId: string | null;
      rollId: string | null;
      locationId: string;
    }
  ): Promise<string> {
    const ex = this.executor(ctx);
    const balanceKey = balanceKeyOf(
      key.materialId,
      key.lotId,
      key.rollId,
      key.locationId
    );
    await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
      `mbal:${balanceKey}`,
    ]);
    const [existing] = await ex.execute<{ id: string }>(
      `SELECT id FROM "material_balance" WHERE balance_key = ? AND deleted_at IS NULL`,
      [balanceKey]
    );
    if (existing) {
      return existing.id;
    }
    const created = await this.createMaterialBalances(
      {
        balance_key: balanceKey,
        material_id: key.materialId,
        lot_id: key.lotId,
        roll_id: key.rollId,
        location_id: key.locationId,
      },
      ctx
    );
    await this.flush(ctx);
    return created.id;
  }

  /**
   * Applies `delta` to a locked balance, persists it, and appends the matching
   * immutable ledger entry (when `movement` is provided).
   */
  private async commit(
    ctx: Context,
    locked: LockedBalances,
    balanceId: string,
    delta: BalanceDelta,
    actor: ActorContext,
    movement: (MovementSpec & { idempotency_key?: string }) | null
  ): Promise<Balance> {
    const current = locked.get(balanceId);
    if (!current) {
      throw domainError(
        MedusaError.Types.UNEXPECTED_STATE,
        ErrorCodes.INVARIANT_VIOLATION,
        `Balance ${balanceId} was not locked`
      );
    }
    const next = applyDelta(current, delta);
    await this.updateMaterialBalances(toBalanceUpdate(next), ctx);
    locked.set(balanceId, next);

    if (movement) {
      await this.createMaterialStockMovements(
        {
          movement_type: movement.type,
          material_id: current.materialId,
          lot_id: current.lotId,
          roll_id: current.rollId,
          location_id: current.locationId,
          balance_id: current.id,
          qty: fromUnits(movement.qty),
          on_hand_delta: fromUnits(delta.onHand ?? 0),
          qc_hold_delta: fromUnits(delta.qcHold ?? 0),
          damaged_delta: fromUnits(delta.damaged ?? 0),
          reference_type: movement.reference_type ?? null,
          reference_id: movement.reference_id ?? null,
          reason: movement.reason ?? null,
          actor_id: actor.actor_id,
          correlation_id: actor.correlation_id ?? null,
          idempotency_key: movement.idempotency_key ?? null,
          occurred_at: new Date(),
        },
        ctx
      );
    }
    await this.flush(ctx);
    return next;
  }

  /** Marks a roll DEPLETED when no stock remains anywhere, ACTIVE otherwise. */
  private async syncRollStatus(
    ctx: Context,
    rollId: string | null
  ): Promise<void> {
    if (!rollId) {
      return;
    }
    const ex = this.executor(ctx);
    const [row] = await ex.execute<{ total: string; status: string }>(
      `SELECT COALESCE((SELECT SUM(on_hand_qty) FROM "material_balance"
                        WHERE roll_id = ? AND deleted_at IS NULL), 0) AS total,
              (SELECT status FROM "material_roll" WHERE id = ?) AS status`,
      [rollId, rollId]
    );
    if (!row || row.status === "DAMAGED") {
      return;
    }
    const target = toUnits(row.total) === 0 ? "DEPLETED" : "ACTIVE";
    if (target !== row.status) {
      await this.updateMaterialRolls({ id: rollId, status: target }, ctx);
    }
  }

  private async assertActiveLocation(ctx: Context, locationId: string) {
    const location = await this.retrieveMaterialLocation(locationId, {}, ctx);
    if (!location.is_active) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Location ${location.code} is inactive`
      );
    }
    return location;
  }

  // ---------------------------------------------------------------------
  // Receiving (FR-PROC-004/005, FR-INV-001)
  // ---------------------------------------------------------------------

  @InjectTransactionManager()
  async receiveMaterial(
    input: ReceiveMaterialInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "receive", input, async () => {
      const ex = this.executor(ctx);
      const material = await this.retrieveMaterial(input.material_id, {}, ctx);
      if (!material.is_active) {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          `Material ${material.code} is inactive`
        );
      }
      await this.assertActiveLocation(ctx, input.location_id);

      const bucket: StockBucket = input.bucket ?? "GOOD";
      const dyeLotNo = input.lot.dye_lot_no ?? "";

      // Normalise to a list of (roll?, qty) receipts.
      const receipts: Array<{
        roll_code: string | null;
        qty: number;
        width_cm: number | null;
      }> = [];
      if (material.track_roll) {
        if (!input.rolls?.length || input.qty !== undefined) {
          throw domainError(
            MedusaError.Types.INVALID_DATA,
            ErrorCodes.INVALID_STATE,
            `Material ${material.code} is roll-tracked: provide rolls[] and omit qty`
          );
        }
        const codes = input.rolls.map((r) => r.roll_code);
        if (new Set(codes).size !== codes.length) {
          throw domainError(
            MedusaError.Types.INVALID_DATA,
            ErrorCodes.DUPLICATE,
            "Duplicate roll_code in request"
          );
        }
        for (const roll of input.rolls) {
          assertPositiveQty(roll.qty, `roll ${roll.roll_code} qty`);
          receipts.push({
            roll_code: roll.roll_code,
            qty: toUnits(roll.qty),
            width_cm: roll.width_cm ?? null,
          });
        }
      } else {
        if (input.qty === undefined || input.rolls?.length) {
          throw domainError(
            MedusaError.Types.INVALID_DATA,
            ErrorCodes.INVALID_STATE,
            `Material ${material.code} is not roll-tracked: provide qty and omit rolls[]`
          );
        }
        receipts.push({
          roll_code: null,
          qty: assertPositiveQty(input.qty),
          width_cm: null,
        });
      }

      // Lot find-or-create.
      const lotLockKey = `mlot:${material.id}|${input.lot.lot_no}|${dyeLotNo}`;
      await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
        lotLockKey,
      ]);
      const [existingLot] = await ex.execute<{ id: string }>(
        `SELECT id FROM "material_lot"
         WHERE material_id = ? AND lot_no = ? AND dye_lot_no = ? AND deleted_at IS NULL`,
        [material.id, input.lot.lot_no, dyeLotNo]
      );
      const lotId =
        existingLot?.id ??
        (
          await this.createMaterialLots(
            {
              material_id: material.id,
              lot_no: input.lot.lot_no,
              dye_lot_no: dyeLotNo,
              supplier_id: input.lot.supplier_id ?? null,
              source_type: input.lot.source_type ?? null,
              source_id: input.lot.source_id ?? null,
              received_at: new Date(),
            },
            ctx
          )
        ).id;

      // Rolls.
      const rollIdByCode = new Map<string, string>();
      if (material.track_roll) {
        const codes = receipts.map((r) => r.roll_code as string);
        const clash = await ex.execute<{ roll_code: string }>(
          `SELECT roll_code FROM "material_roll" WHERE roll_code IN (?) AND deleted_at IS NULL`,
          [codes]
        );
        if (clash.length > 0) {
          throw domainError(
            MedusaError.Types.CONFLICT,
            ErrorCodes.DUPLICATE,
            `Roll code(s) already exist: ${clash.map((c) => c.roll_code).join(", ")}`
          );
        }
        const rolls = await this.createMaterialRolls(
          receipts.map((r) => ({
            roll_code: r.roll_code as string,
            material_id: material.id,
            lot_id: lotId,
            initial_qty: fromUnits(r.qty),
            width_cm: r.width_cm,
          })),
          ctx
        );
        for (const roll of rolls) {
          rollIdByCode.set(roll.roll_code, roll.id);
        }
      }

      // Balances: create, lock in deterministic order, then apply.
      const targets: Array<{
        balanceId: string;
        rollId: string | null;
        code: string | null;
        qty: number;
      }> = [];
      for (const receipt of receipts) {
        const rollId = receipt.roll_code
          ? (rollIdByCode.get(receipt.roll_code) ?? null)
          : null;
        const balanceId = await this.ensureBalance(ctx, {
          materialId: material.id,
          lotId: material.track_lot || material.track_roll ? lotId : null,
          rollId,
          locationId: input.location_id,
        });
        targets.push({
          balanceId,
          rollId,
          code: receipt.roll_code,
          qty: receipt.qty,
        });
      }
      const locked = await this.lockBalances(
        ctx,
        targets.map((t) => t.balanceId)
      );

      const delta = (qty: number): BalanceDelta => ({
        onHand: qty,
        qcHold: bucket === "QC_HOLD" ? qty : 0,
        damaged: bucket === "DAMAGED" ? qty : 0,
      });
      for (const target of targets) {
        await this.commit(
          ctx,
          locked,
          target.balanceId,
          delta(target.qty),
          input,
          {
            type: "RECEIPT",
            qty: target.qty,
            reference_type:
              input.reference_type ?? input.lot.source_type ?? null,
            reference_id: input.reference_id ?? input.lot.source_id ?? null,
            idempotency_key: input.idempotency_key,
          }
        );
      }

      const totalQty = targets.reduce((sum, t) => sum + t.qty, 0);
      await this.enqueue(ctx, {
        eventType: "inventory.material_received.v1",
        aggregateType: "material",
        aggregateId: material.id,
        actor: input,
        data: {
          material_id: material.id,
          lot_id: lotId,
          location_id: input.location_id,
          bucket,
          qty: fromUnits(totalQty),
          reference_type: input.reference_type ?? input.lot.source_type ?? null,
          reference_id: input.reference_id ?? input.lot.source_id ?? null,
          rolls: targets
            .filter((t) => t.code)
            .map((t) => ({
              roll_code: t.code,
              roll_id: t.rollId,
              qty: fromUnits(t.qty),
            })),
        },
      });

      return {
        lot: { id: lotId, lot_no: input.lot.lot_no, dye_lot_no: dyeLotNo },
        balances: targets.map((t) =>
          presentBalance(locked.get(t.balanceId) as Balance)
        ),
      };
    });
  }

  /**
   * Receives several lines in ONE transaction (all-or-nothing), e.g. every
   * line of a goods receipt. Each line carries its own idempotency key.
   */
  @InjectTransactionManager()
  async receiveMaterialBatch(
    inputs: ReceiveMaterialInput[],
    @MedusaContext() ctx: Context = {}
  ) {
    const results: Awaited<
      ReturnType<MaterialInventoryModuleService["receiveMaterial"]>
    >[] = [];
    for (const input of inputs) {
      results.push(await this.receiveMaterial(input, ctx));
    }
    return results;
  }

  /** Resolves a QC hold: release to good stock or reject to damaged. */
  @InjectTransactionManager()
  async decideQcHold(
    input: QcDecisionInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "qc-decision", input, async () => {
      const qty = assertPositiveQty(input.qty);
      const locked = await this.lockBalances(ctx, [input.balance_id]);
      const release = input.decision === "RELEASE";
      const after = await this.commit(
        ctx,
        locked,
        input.balance_id,
        { qcHold: -qty, damaged: release ? 0 : qty },
        input,
        {
          type: release ? "QC_RELEASE" : "QC_REJECT",
          qty,
          reason: input.reason ?? null,
          idempotency_key: input.idempotency_key,
        }
      );
      await this.enqueue(ctx, {
        eventType: release
          ? "inventory.qc_released.v1"
          : "inventory.qc_rejected.v1",
        aggregateType: "material_balance",
        aggregateId: after.id,
        actor: input,
        data: {
          balance_id: after.id,
          material_id: after.materialId,
          qty: fromUnits(qty),
        },
      });
      return { balance: presentBalance(after) };
    });
  }

  // ---------------------------------------------------------------------
  // Reservation (FR-INV-004/005/006, BR-004)
  // ---------------------------------------------------------------------

  private async loadCandidates(
    ctx: Context,
    materialId: string,
    locationId: string | null
  ): Promise<AllocationCandidate[]> {
    const params: unknown[] = [materialId];
    let locationFilter = "";
    if (locationId) {
      locationFilter = "AND b.location_id = ?";
      params.push(locationId);
    }
    const rows = await this.executor(ctx).execute<{
      balance_id: string;
      lot_id: string | null;
      roll_id: string | null;
      location_id: string;
      available: string;
      dye_lot_no: string;
      initial_qty: string | null;
      received_at: Date | string;
    }>(
      `SELECT b.id AS balance_id, b.lot_id, b.roll_id, b.location_id,
              (b.on_hand_qty - b.reserved_qty - b.qc_hold_qty - b.damaged_qty) AS available,
              COALESCE(l.dye_lot_no, '') AS dye_lot_no,
              r.initial_qty,
              COALESCE(l.received_at, b.created_at) AS received_at
       FROM "material_balance" b
       JOIN "material_location" loc
         ON loc.id = b.location_id AND loc.kind = 'RAW_MATERIAL'
        AND loc.is_active = true AND loc.deleted_at IS NULL
       LEFT JOIN "material_lot" l ON l.id = b.lot_id
       LEFT JOIN "material_roll" r ON r.id = b.roll_id
       WHERE b.material_id = ? AND b.deleted_at IS NULL
         AND (b.on_hand_qty - b.reserved_qty - b.qc_hold_qty - b.damaged_qty) > 0
         AND (r.id IS NULL OR r.status = 'ACTIVE')
         ${locationFilter}`,
      params
    );
    return rows.map((row) => ({
      balance_id: row.balance_id,
      lot_id: row.lot_id,
      roll_id: row.roll_id,
      location_id: row.location_id,
      dye_lot_no: row.dye_lot_no,
      available: toUnits(row.available),
      initial: row.initial_qty === null ? null : toUnits(row.initial_qty),
      received_at: new Date(row.received_at).getTime(),
    }));
  }

  @InjectTransactionManager()
  async reserveMaterial(
    input: ReserveMaterialInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "reserve", input, async () => {
      const required = assertPositiveQty(input.qty);
      const material = await this.retrieveMaterial(input.material_id, {}, ctx);
      annotate({
        "material.id": material.id,
        "reference.id": input.reference_id,
        "correlation.id": input.correlation_id ?? undefined,
      });

      let plan: AllocationPlan | null = null;
      let locked: LockedBalances = new Map();

      for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt += 1) {
        const candidates = await this.loadCandidates(
          ctx,
          material.id,
          input.location_id ?? null
        );
        const candidatePlan = planAllocation(candidates, required, {
          policy: material.allocation_policy as "FIFO" | "SAME_DYE_LOT_FIFO",
          track_dye_lot: material.track_dye_lot,
          max_dye_lots: Number(material.max_dye_lots),
        });
        if (candidatePlan.shortage > 0) {
          throw domainError(
            MedusaError.Types.NOT_ALLOWED,
            ErrorCodes.INSUFFICIENT_STOCK,
            `Insufficient available stock for ${material.code}: short by ${fromUnits(candidatePlan.shortage)} ${material.uom}`
          );
        }
        if (
          candidatePlan.requires_planner_approval &&
          !input.planner_approved
        ) {
          throw domainError(
            MedusaError.Types.NOT_ALLOWED,
            ErrorCodes.DYE_LOT_POLICY_VIOLATION,
            `Requirement needs ${candidatePlan.dye_lots.length} dye lots (max ${material.max_dye_lots}); planner approval required`
          );
        }

        // Lock chosen rows in id order, then re-check under the lock: another
        // transaction may have reserved them since the candidate query.
        const attemptLocked = await this.lockBalances(
          ctx,
          candidatePlan.lines.map((l) => l.balance_id)
        );
        const stillValid = candidatePlan.lines.every((line) => {
          const balance = attemptLocked.get(line.balance_id);
          return balance !== undefined && availableOf(balance) >= line.qty;
        });
        if (stillValid) {
          plan = candidatePlan;
          locked = attemptLocked;
          break;
        }
      }

      if (!plan) {
        throw domainError(
          MedusaError.Types.CONFLICT,
          ErrorCodes.RESERVATION_CONTENTION,
          "Stock changed concurrently; retry the reservation"
        );
      }

      const reservationNo = `RSV-${newId("rsv").split("_")[1]?.slice(-10) ?? Date.now()}`;
      const reservation = await this.createMaterialReservations(
        {
          reservation_no: reservationNo,
          material_id: material.id,
          reference_type: input.reference_type,
          reference_id: input.reference_id,
          reference_line: input.reference_line ?? null,
          requested_qty: fromUnits(required),
          status: "ACTIVE",
          dye_lot_count: plan.dye_lots.length,
          planner_approved: Boolean(input.planner_approved),
          created_by: input.actor_id,
          idempotency_key: input.idempotency_key,
        },
        ctx
      );

      for (const line of plan.lines) {
        await this.commit(
          ctx,
          locked,
          line.balance_id,
          { reserved: line.qty },
          input,
          null
        );
      }
      await this.createMaterialReservationLines(
        plan.lines.map((line) => ({
          reservation_id: reservation.id,
          balance_id: line.balance_id,
          material_id: material.id,
          lot_id: line.lot_id,
          roll_id: line.roll_id,
          location_id: line.location_id,
          reserved_qty: fromUnits(line.qty),
        })),
        ctx
      );

      await this.enqueue(ctx, {
        eventType: "inventory.material_reserved.v1",
        aggregateType: "material_reservation",
        aggregateId: reservation.id,
        actor: input,
        data: {
          reservation_id: reservation.id,
          reservation_no: reservationNo,
          material_id: material.id,
          qty: fromUnits(required),
          reference_type: input.reference_type,
          reference_id: input.reference_id,
          dye_lots: plan.dye_lots,
        },
      });

      return {
        reservation: {
          id: reservation.id,
          reservation_no: reservationNo,
          material_id: material.id,
          reference_type: input.reference_type,
          reference_id: input.reference_id,
          requested_qty: fromUnits(required),
          status: "ACTIVE",
          dye_lots: plan.dye_lots,
          planner_approved: Boolean(input.planner_approved),
        },
        lines: plan.lines.map((line) => ({
          balance_id: line.balance_id,
          lot_id: line.lot_id,
          roll_id: line.roll_id,
          location_id: line.location_id,
          qty: fromUnits(line.qty),
        })),
      };
    });
  }

  private async lockReservation(ctx: Context, reservationId: string) {
    const ex = this.executor(ctx);
    const [reservation] = await ex.execute<ReservationRow>(
      `SELECT id, reservation_no, material_id, reference_type, reference_id,
              requested_qty, issued_qty, released_qty, status
       FROM "material_reservation" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [reservationId]
    );
    if (!reservation) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        `Reservation ${reservationId} not found`
      );
    }
    const lines = await ex.execute<ReservationLineRow>(
      `SELECT id, reservation_id, balance_id, material_id, lot_id, roll_id, location_id,
              reserved_qty, issued_qty, released_qty
       FROM "material_reservation_line"
       WHERE reservation_id = ? AND deleted_at IS NULL ORDER BY id`,
      [reservationId]
    );
    return { reservation, lines };
  }

  @InjectTransactionManager()
  async releaseReservation(
    input: ReleaseReservationInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "release", input, async () => {
      const { reservation, lines } = await this.lockReservation(
        ctx,
        input.reservation_id
      );
      const outstanding = lines.reduce(
        (sum, line) => sum + outstandingOf(line),
        0
      );
      const toRelease =
        input.qty === undefined ? outstanding : assertPositiveQty(input.qty);
      if (toRelease > outstanding || toRelease <= 0) {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          `Cannot release ${fromUnits(toRelease)}; outstanding is ${fromUnits(outstanding)}`
        );
      }

      const locked = await this.lockBalances(
        ctx,
        lines.map((l) => l.balance_id)
      );
      let remaining = toRelease;
      for (const line of lines) {
        if (remaining <= 0) {
          break;
        }
        const take = Math.min(outstandingOf(line), remaining);
        if (take <= 0) {
          continue;
        }
        await this.commit(
          ctx,
          locked,
          line.balance_id,
          { reserved: -take },
          input,
          null
        );
        await this.updateMaterialReservationLines(
          {
            id: line.id,
            released_qty: fromUnits(toUnits(line.released_qty) + take),
          },
          ctx
        );
        remaining -= take;
      }

      const released = toUnits(reservation.released_qty) + toRelease;
      const status = reservationStatus(
        toUnits(reservation.requested_qty),
        toUnits(reservation.issued_qty),
        released
      );
      await this.updateMaterialReservations(
        { id: reservation.id, released_qty: fromUnits(released), status },
        ctx
      );
      await this.enqueue(ctx, {
        eventType: "inventory.reservation_released.v1",
        aggregateType: "material_reservation",
        aggregateId: reservation.id,
        actor: input,
        data: {
          reservation_id: reservation.id,
          material_id: reservation.material_id,
          qty: fromUnits(toRelease),
          reason: input.reason ?? null,
          status,
        },
      });
      return {
        reservation_id: reservation.id,
        released_qty: fromUnits(toRelease),
        status,
      };
    });
  }

  // ---------------------------------------------------------------------
  // Issue / return (FR-INV-007/008)
  // ---------------------------------------------------------------------

  @InjectTransactionManager()
  async issueMaterial(
    input: IssueMaterialInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "issue", input, async () => {
      const qty = assertPositiveQty(input.qty);
      const { reservation, lines } = await this.lockReservation(
        ctx,
        input.reservation_id
      );
      const outstanding = lines.reduce(
        (sum, line) => sum + outstandingOf(line),
        0
      );
      if (qty > outstanding) {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INSUFFICIENT_STOCK,
          `Cannot issue ${fromUnits(qty)}; reserved outstanding is ${fromUnits(outstanding)}`
        );
      }

      const locked = await this.lockBalances(
        ctx,
        lines.map((l) => l.balance_id)
      );
      let remaining = qty;
      const issuedLines: Array<{
        balance_id: string;
        roll_id: string | null;
        qty: number;
      }> = [];
      for (const line of lines) {
        if (remaining <= 0) {
          break;
        }
        const take = Math.min(outstandingOf(line), remaining);
        if (take <= 0) {
          continue;
        }
        await this.commit(
          ctx,
          locked,
          line.balance_id,
          { onHand: -take, reserved: -take },
          input,
          {
            type: "ISSUE_TO_PRODUCTION",
            qty: take,
            reference_type: reservation.reference_type,
            reference_id: reservation.reference_id,
            idempotency_key: input.idempotency_key,
          }
        );
        await this.updateMaterialReservationLines(
          {
            id: line.id,
            issued_qty: fromUnits(toUnits(line.issued_qty) + take),
          },
          ctx
        );
        await this.syncRollStatus(ctx, line.roll_id);
        issuedLines.push({
          balance_id: line.balance_id,
          roll_id: line.roll_id,
          qty: take,
        });
        remaining -= take;
      }

      const issued = toUnits(reservation.issued_qty) + qty;
      const status = reservationStatus(
        toUnits(reservation.requested_qty),
        issued,
        toUnits(reservation.released_qty)
      );
      await this.updateMaterialReservations(
        { id: reservation.id, issued_qty: fromUnits(issued), status },
        ctx
      );
      await this.enqueue(ctx, {
        eventType: "inventory.material_issued.v1",
        aggregateType: "material_reservation",
        aggregateId: reservation.id,
        actor: input,
        data: {
          reservation_id: reservation.id,
          material_id: reservation.material_id,
          reference_type: reservation.reference_type,
          reference_id: reservation.reference_id,
          qty: fromUnits(qty),
          lines: issuedLines.map((l) => ({ ...l, qty: fromUnits(l.qty) })),
        },
      });
      return {
        reservation_id: reservation.id,
        status,
        issued_qty: fromUnits(qty),
        lines: issuedLines.map((l) => ({ ...l, qty: fromUnits(l.qty) })),
      };
    });
  }

  @InjectTransactionManager()
  async returnMaterial(
    input: ReturnMaterialInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "return", input, async () => {
      const qty = assertPositiveQty(input.qty);
      await this.assertActiveLocation(ctx, input.location_id);
      const ex = this.executor(ctx);

      // Serialise returns per (reference, material). Without this lock two
      // concurrent returns both read the same net-issued figure and both pass.
      await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
        `mret:${input.reference_type}|${input.reference_id}|${input.material_id}`,
      ]);

      // A return can never exceed what the reference actually consumed.
      const [net] = await ex.execute<{ net: string }>(
        `SELECT COALESCE(SUM(CASE WHEN movement_type = 'ISSUE_TO_PRODUCTION' THEN qty ELSE -qty END), 0) AS net
         FROM "material_stock_movement"
         WHERE reference_type = ? AND reference_id = ? AND material_id = ?
           AND movement_type IN ('ISSUE_TO_PRODUCTION', 'RETURN_FROM_PRODUCTION')
           AND roll_id IS NOT DISTINCT FROM ?::text
           AND lot_id IS NOT DISTINCT FROM ?::text`,
        [
          input.reference_type,
          input.reference_id,
          input.material_id,
          input.roll_id ?? null,
          input.lot_id ?? null,
        ]
      );
      if (qty > toUnits(net?.net)) {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.EXCEEDS_ISSUED,
          `Return of ${fromUnits(qty)} exceeds net issued ${fromUnits(toUnits(net?.net))}`
        );
      }

      const balanceId = await this.ensureBalance(ctx, {
        materialId: input.material_id,
        lotId: input.lot_id ?? null,
        rollId: input.roll_id ?? null,
        locationId: input.location_id,
      });
      const locked = await this.lockBalances(ctx, [balanceId]);
      const after = await this.commit(
        ctx,
        locked,
        balanceId,
        {
          onHand: qty,
          qcHold: input.bucket === "QC_HOLD" ? qty : 0,
          damaged: input.bucket === "DAMAGED" ? qty : 0,
        },
        input,
        {
          type: "RETURN_FROM_PRODUCTION",
          qty,
          reference_type: input.reference_type,
          reference_id: input.reference_id,
          idempotency_key: input.idempotency_key,
        }
      );
      await this.syncRollStatus(ctx, input.roll_id ?? null);
      await this.enqueue(ctx, {
        eventType: "inventory.material_returned.v1",
        aggregateType: "material_balance",
        aggregateId: after.id,
        actor: input,
        data: {
          balance_id: after.id,
          material_id: input.material_id,
          qty: fromUnits(qty),
          bucket: input.bucket,
          reference_type: input.reference_type,
          reference_id: input.reference_id,
        },
      });
      return { balance: presentBalance(after) };
    });
  }

  // ---------------------------------------------------------------------
  // Scrap, adjustment, cycle count, transfer (FR-INV-009/010/011)
  // ---------------------------------------------------------------------

  @InjectTransactionManager()
  async scrapMaterial(
    input: ScrapMaterialInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "scrap", input, async () => {
      const qty = assertPositiveQty(input.qty);
      if (!input.reason.trim()) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "Scrap requires a reason"
        );
      }
      // Material issued to an MO is settled with ISSUED - RETURNED. Scrapping
      // it under the MO reference as well would count the same pieces twice
      // (issue, return as DAMAGED, scrap). Production waste is therefore
      // returned as DAMAGED first, then scrapped from that stock without the
      // MO reference.
      if (input.reference_type === "MO") {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          "Material issued to an MO cannot be scrapped under the MO: return it as DAMAGED first, then scrap that stock"
        );
      }
      const locked = await this.lockBalances(ctx, [input.balance_id]);
      const after = await this.commit(
        ctx,
        locked,
        input.balance_id,
        {
          onHand: -qty,
          qcHold: input.source_bucket === "QC_HOLD" ? -qty : 0,
          damaged: input.source_bucket === "DAMAGED" ? -qty : 0,
        },
        input,
        {
          type: "SCRAP",
          qty,
          reason: input.reason,
          reference_type: input.reference_type ?? null,
          reference_id: input.reference_id ?? null,
          idempotency_key: input.idempotency_key,
        }
      );
      await this.syncRollStatus(ctx, after.rollId);
      await this.enqueue(ctx, {
        eventType: "inventory.material_scrapped.v1",
        aggregateType: "material_balance",
        aggregateId: after.id,
        actor: input,
        data: {
          balance_id: after.id,
          material_id: after.materialId,
          qty: fromUnits(qty),
          source_bucket: input.source_bucket,
          reason: input.reason,
        },
      });
      return { balance: presentBalance(after) };
    });
  }

  @InjectTransactionManager()
  async adjustStock(
    input: AdjustStockInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "adjust", input, async () => {
      const qty = assertPositiveQty(input.qty);
      if (!input.reason.trim()) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "Stock adjustment requires a reason"
        );
      }
      const plus = input.direction === "PLUS";
      const locked = await this.lockBalances(ctx, [input.balance_id]);
      const before = locked.get(input.balance_id) as Balance;
      const after = await this.commit(
        ctx,
        locked,
        input.balance_id,
        { onHand: plus ? qty : -qty },
        input,
        {
          type: plus ? "ADJUSTMENT_PLUS" : "ADJUSTMENT_MINUS",
          qty,
          reason: input.reason,
          idempotency_key: input.idempotency_key,
        }
      );
      await this.syncRollStatus(ctx, after.rollId);
      await this.enqueue(ctx, {
        eventType: "inventory.stock_adjusted.v1",
        aggregateType: "material_balance",
        aggregateId: after.id,
        actor: input,
        data: {
          balance_id: after.id,
          material_id: after.materialId,
          direction: input.direction,
          qty: fromUnits(qty),
          on_hand_before: fromUnits(before.onHand),
          on_hand_after: fromUnits(after.onHand),
          reason: input.reason,
        },
      });
      return { balance: presentBalance(after) };
    });
  }

  @InjectTransactionManager()
  async recordCycleCount(
    input: CycleCountInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "cycle-count", input, async () => {
      if (!input.reason.trim()) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "Cycle count requires a reason"
        );
      }
      const counted = toUnits(input.counted_qty);
      if (counted < 0) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "counted_qty cannot be negative"
        );
      }
      const locked = await this.lockBalances(ctx, [input.balance_id]);
      const before = locked.get(input.balance_id) as Balance;
      if (before.version !== input.expected_version) {
        throw domainError(
          MedusaError.Types.CONFLICT,
          ErrorCodes.STALE_VERSION,
          `Balance changed since count started (expected v${input.expected_version}, now v${before.version}); recount`
        );
      }
      const diff = counted - before.onHand;
      if (diff === 0) {
        return { adjusted: false, balance: presentBalance(before) };
      }
      const after = await this.commit(
        ctx,
        locked,
        input.balance_id,
        { onHand: diff },
        input,
        {
          type: diff > 0 ? "ADJUSTMENT_PLUS" : "ADJUSTMENT_MINUS",
          qty: Math.abs(diff),
          reason: `cycle count: ${input.reason}`,
          idempotency_key: input.idempotency_key,
        }
      );
      await this.syncRollStatus(ctx, after.rollId);
      await this.enqueue(ctx, {
        eventType: "inventory.cycle_count_adjusted.v1",
        aggregateType: "material_balance",
        aggregateId: after.id,
        actor: input,
        data: {
          balance_id: after.id,
          material_id: after.materialId,
          expected_on_hand: fromUnits(before.onHand),
          counted_on_hand: fromUnits(counted),
          reason: input.reason,
        },
      });
      return { adjusted: true, balance: presentBalance(after) };
    });
  }

  @InjectTransactionManager()
  async transferStock(
    input: TransferStockInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idempotent(ctx, "transfer", input, async () => {
      const qty = assertPositiveQty(input.qty);
      await this.assertActiveLocation(ctx, input.to_location_id);
      const ex = this.executor(ctx);

      const [source] = await ex.execute<BalanceRow>(
        `SELECT ${BALANCE_COLUMNS} FROM "material_balance" WHERE id = ? AND deleted_at IS NULL`,
        [input.balance_id]
      );
      if (!source) {
        throw domainError(
          MedusaError.Types.NOT_FOUND,
          ErrorCodes.NOT_FOUND,
          `Balance ${input.balance_id} not found`
        );
      }
      if (source.location_id === input.to_location_id) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "Source and destination location are the same"
        );
      }

      const destinationId = await this.ensureBalance(ctx, {
        materialId: source.material_id,
        lotId: source.lot_id,
        rollId: source.roll_id,
        locationId: input.to_location_id,
      });
      const locked = await this.lockBalances(ctx, [
        input.balance_id,
        destinationId,
      ]);
      const transferRef = input.reference_id ?? `xfer_${input.idempotency_key}`;
      const referenceType = input.reference_type ?? "TRANSFER";

      const out = await this.commit(
        ctx,
        locked,
        input.balance_id,
        { onHand: -qty },
        input,
        {
          type: "TRANSFER_OUT",
          qty,
          reference_type: referenceType,
          reference_id: transferRef,
          idempotency_key: input.idempotency_key,
        }
      );
      const incoming = await this.commit(
        ctx,
        locked,
        destinationId,
        { onHand: qty },
        input,
        {
          type: "TRANSFER_IN",
          qty,
          reference_type: referenceType,
          reference_id: transferRef,
          idempotency_key: input.idempotency_key,
        }
      );

      await this.enqueue(ctx, {
        eventType: "inventory.material_transferred.v1",
        aggregateType: "material",
        aggregateId: out.materialId,
        actor: input,
        data: {
          material_id: out.materialId,
          from_location_id: out.locationId,
          to_location_id: incoming.locationId,
          qty: fromUnits(qty),
          roll_id: out.rollId,
          lot_id: out.lotId,
        },
      });
      return { from: presentBalance(out), to: presentBalance(incoming) };
    });
  }

  // ---------------------------------------------------------------------
  // Queries & reconciliation (FR-INV-013, TDD section 47)
  // ---------------------------------------------------------------------

  @InjectTransactionManager()
  async getAvailability(
    materialId: string,
    @MedusaContext() ctx: Context = {}
  ) {
    const rows = await this.executor(ctx).execute<{
      location_id: string;
      on_hand: string;
      reserved: string;
      qc_hold: string;
      damaged: string;
      available: string;
    }>(
      `SELECT location_id,
              SUM(on_hand_qty) AS on_hand, SUM(reserved_qty) AS reserved,
              SUM(qc_hold_qty) AS qc_hold, SUM(damaged_qty) AS damaged,
              SUM(on_hand_qty - reserved_qty - qc_hold_qty - damaged_qty) AS available
       FROM "material_balance"
       WHERE material_id = ? AND deleted_at IS NULL
       GROUP BY location_id ORDER BY location_id`,
      [materialId]
    );
    return rows.map((row) => ({
      location_id: row.location_id,
      on_hand: Number(row.on_hand),
      reserved: Number(row.reserved),
      qc_hold: Number(row.qc_hold),
      damaged: Number(row.damaged),
      available: Number(row.available),
    }));
  }

  @InjectTransactionManager()
  async reconcile(@MedusaContext() ctx: Context = {}): Promise<{
    ok: boolean;
    issues: ReconciliationIssue[];
  }> {
    const ex = this.executor(ctx);
    const issues: ReconciliationIssue[] = [];

    const ledger = await ex.execute<Record<string, string>>(
      `SELECT b.id, b.on_hand_qty, b.qc_hold_qty, b.damaged_qty,
              COALESCE(SUM(m.on_hand_delta), 0) AS led_on_hand,
              COALESCE(SUM(m.qc_hold_delta), 0) AS led_qc_hold,
              COALESCE(SUM(m.damaged_delta), 0) AS led_damaged
       FROM "material_balance" b
       LEFT JOIN "material_stock_movement" m ON m.balance_id = b.id
       WHERE b.deleted_at IS NULL
       GROUP BY b.id
       HAVING b.on_hand_qty <> COALESCE(SUM(m.on_hand_delta), 0)
           OR b.qc_hold_qty <> COALESCE(SUM(m.qc_hold_delta), 0)
           OR b.damaged_qty <> COALESCE(SUM(m.damaged_delta), 0)`
    );
    for (const row of ledger) {
      issues.push({
        check: "LEDGER_VS_BALANCE",
        balance_id: row.id,
        detail: row,
      });
    }

    const reservations = await ex.execute<Record<string, string>>(
      `SELECT b.id, b.reserved_qty,
              COALESCE(SUM(l.reserved_qty - l.issued_qty - l.released_qty), 0) AS line_outstanding
       FROM "material_balance" b
       LEFT JOIN "material_reservation_line" l ON l.balance_id = b.id AND l.deleted_at IS NULL
       WHERE b.deleted_at IS NULL
       GROUP BY b.id
       HAVING b.reserved_qty <> COALESCE(SUM(l.reserved_qty - l.issued_qty - l.released_qty), 0)`
    );
    for (const row of reservations) {
      issues.push({
        check: "RESERVATION_VS_BALANCE",
        balance_id: row.id,
        detail: row,
      });
    }

    const invariants = await ex.execute<Record<string, string>>(
      `SELECT id, on_hand_qty, reserved_qty, qc_hold_qty, damaged_qty
       FROM "material_balance"
       WHERE deleted_at IS NULL
         AND (on_hand_qty < 0 OR reserved_qty < 0 OR qc_hold_qty < 0 OR damaged_qty < 0
              OR reserved_qty + qc_hold_qty + damaged_qty > on_hand_qty)`
    );
    for (const row of invariants) {
      issues.push({
        check: "BALANCE_INVARIANT",
        balance_id: row.id,
        detail: row,
      });
    }

    const orphans = await ex.execute<Record<string, string>>(
      `SELECT l.id, l.balance_id FROM "material_reservation_line" l
       LEFT JOIN "material_reservation" r ON r.id = l.reservation_id AND r.deleted_at IS NULL
       WHERE l.deleted_at IS NULL AND r.id IS NULL`
    );
    for (const row of orphans) {
      issues.push({
        check: "ORPHAN_RESERVATION_LINE",
        balance_id: row.balance_id,
        detail: row,
      });
    }

    return { ok: issues.length === 0, issues };
  }

  /** Usable (raw-material locations only) available quantity per material. */
  @InjectTransactionManager()
  async getUsableAvailability(
    materialIds: string[],
    @MedusaContext() ctx: Context = {}
  ): Promise<Record<string, number>> {
    if (materialIds.length === 0) {
      return {};
    }
    const rows = await this.executor(ctx).execute<{
      material_id: string;
      available: string;
    }>(
      `SELECT b.material_id,
              SUM(b.on_hand_qty - b.reserved_qty - b.qc_hold_qty - b.damaged_qty) AS available
       FROM "material_balance" b
       JOIN "material_location" l
         ON l.id = b.location_id AND l.kind = 'RAW_MATERIAL'
        AND l.is_active = true AND l.deleted_at IS NULL
       WHERE b.deleted_at IS NULL AND b.material_id IN (?)
       GROUP BY b.material_id`,
      [[...new Set(materialIds)]]
    );
    return Object.fromEntries(
      rows.map((row) => [row.material_id, Number(row.available)])
    );
  }

  /**
   * Ledger settlement for a business reference (e.g. an MO): issued, returned
   * and scrapped quantity per material. Used for cut reconciliation and for
   * refusing to cancel an MO that still holds issued material.
   */
  @InjectTransactionManager()
  async summarizeReference(
    referenceType: string,
    referenceId: string,
    @MedusaContext() ctx: Context = {}
  ): Promise<
    Record<string, { issued: number; returned: number; scrapped: number }>
  > {
    const rows = await this.executor(ctx).execute<{
      material_id: string;
      issued: string;
      returned: string;
      scrapped: string;
    }>(
      `SELECT material_id,
              COALESCE(SUM(qty) FILTER (WHERE movement_type = 'ISSUE_TO_PRODUCTION'), 0) AS issued,
              COALESCE(SUM(qty) FILTER (WHERE movement_type = 'RETURN_FROM_PRODUCTION'), 0) AS returned,
              COALESCE(SUM(qty) FILTER (WHERE movement_type = 'SCRAP'), 0) AS scrapped
       FROM "material_stock_movement"
       WHERE reference_type = ? AND reference_id = ?
       GROUP BY material_id`,
      [referenceType, referenceId]
    );
    return Object.fromEntries(
      rows.map((row) => [
        row.material_id,
        {
          issued: Number(row.issued),
          returned: Number(row.returned),
          scrapped: Number(row.scrapped),
        },
      ])
    );
  }

  /**
   * Reservations held for a business reference (e.g. an MO), straight from the
   * source of truth. Callers use it to decide what is still missing, what can
   * still be issued and what must be released, instead of trusting a cached
   * copy on their own side.
   */
  @InjectTransactionManager()
  async reservationsForReference(
    referenceType: string,
    referenceId: string,
    materialId: string | null = null,
    @MedusaContext() ctx: Context = {}
  ): Promise<
    Array<{
      id: string;
      material_id: string;
      status: string;
      requested: number;
      issued: number;
      released: number;
      outstanding: number;
    }>
  > {
    const rows = await this.executor(ctx).execute<{
      id: string;
      material_id: string;
      status: string;
      requested_qty: string;
      issued_qty: string;
      released_qty: string;
    }>(
      `SELECT id, material_id, status, requested_qty, issued_qty, released_qty
       FROM "material_reservation"
       WHERE reference_type = ? AND reference_id = ? AND deleted_at IS NULL
         AND (?::text IS NULL OR material_id = ?::text)
       ORDER BY created_at, id`,
      [referenceType, referenceId, materialId, materialId]
    );
    return rows.map((row) => {
      const requested = toUnits(row.requested_qty);
      const issued = toUnits(row.issued_qty);
      const released = toUnits(row.released_qty);
      return {
        id: row.id,
        material_id: row.material_id,
        status: row.status,
        requested: fromUnits(requested),
        issued: fromUnits(issued),
        released: fromUnits(released),
        outstanding: fromUnits(Math.max(0, requested - issued - released)),
      };
    });
  }

  /**
   * Quantity already issued by earlier attempts of one logical issue request
   * (all its per-reservation keys share a prefix). Lets a retried multi-
   * reservation issue continue where it stopped instead of double issuing.
   */
  @InjectTransactionManager()
  async issuedUnderKeyPrefix(
    prefix: string,
    @MedusaContext() ctx: Context = {}
  ): Promise<number> {
    const [row] = await this.executor(ctx).execute<{ qty: string }>(
      `SELECT COALESCE(SUM(qty), 0) AS qty FROM "material_stock_movement"
       WHERE movement_type = 'ISSUE_TO_PRODUCTION' AND starts_with(idempotency_key, ?)`,
      [prefix]
    );
    return fromUnits(toUnits(row?.qty ?? 0));
  }

  // ---------------------------------------------------------------------
  // Outbox publishing
  // ---------------------------------------------------------------------

  @InjectTransactionManager()
  async publishOutbox(
    limit: number,
    publish: OutboxPublishFn,
    @MedusaContext() ctx: Context = {}
  ): Promise<DrainResult> {
    return await drainOutbox(
      this.executor(ctx),
      MATERIAL_OUTBOX_TABLE,
      limit,
      publish
    );
  }
}

export default MaterialInventoryModuleService;
