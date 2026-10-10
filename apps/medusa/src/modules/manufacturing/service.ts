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
import { assertPositiveQty, fromUnits, toUnits } from "../../lib/quantity";
import { safeTable } from "../../lib/sql";
import {
  executorOf,
  flushOf,
  outboxRowFor,
  runIdempotent,
  type Command,
} from "../../lib/tx";
import { explodeBom } from "./lib/bom-explosion";
import {
  applyInspection,
  assertInvariant,
  assertRoutingEndsWithGate,
  pack,
  reportOperation,
  returnRework,
  sortOps,
  type BundleState,
  type FlowOp,
} from "./lib/bundle-flow";
import { assertTransition, SHOP_FLOOR_STATUSES } from "./lib/mo-state";
import { grossToNet } from "./lib/mrp";
import { Bom, BomLine } from "./models/bom";
import {
  ManufacturingOrder,
  MoMaterialRequirement,
  ProductionBatch,
  ProductionRequest,
  type MoStatus,
} from "./models/manufacturing-order";
import {
  MANUFACTURING_IDEMPOTENCY_TABLE,
  MANUFACTURING_OUTBOX_TABLE,
  ManufacturingIdempotencyRecord,
  ManufacturingOutboxEvent,
  MaterialPlanningParam,
  MrpRun,
  MrpSuggestion,
} from "./models/mrp";
import { Routing, RoutingOperation, WorkCenter } from "./models/routing";
import {
  Bundle,
  CutPlan,
  ManufacturingException,
  OperationExecution,
  PackingRecord,
} from "./models/shop-floor";
import type {
  ApplyInspectionInput,
  CancelMoInput,
  CompleteCutInput,
  CreateBomInput,
  CreateMoInput,
  CreateRoutingInput,
  CutPlanInput,
  ExecuteOperationInput,
  MaterialReadinessInput,
  MoActor,
  MoRow,
  MrpInput,
  PackBundleInput,
  PackedResult,
  RecordReservationsInput,
  ReleaseMoInput,
  ReleaseVersionedInput,
  ReturnReworkInput,
} from "./types";

const PRODUCER = "manufacturing";
const DEFAULT_FABRIC_TOLERANCE_PCT = 2;

const MO_COLUMNS =
  "id, mo_number, status, held_from_status, order_type, product_sku, planned_qty, completed_qty, bom_id, routing_id, customer_order_id, lines";
const BUNDLE_COLUMNS =
  "id, bundle_code, mo_id, batch_id, sku, parent_bundle_id, qty, current_seq, waiting_qty, buffer_qty, rework_qty, reject_qty, rework_out_qty, qc_released_qty, packed_qty";

type BundleRow = BundleState & {
  id: string;
  bundle_code: string;
  mo_id: string;
  batch_id: string;
  sku: string;
  parent_bundle_id: string | null;
};

const shortId = (prefix: string): string =>
  (newId(prefix).split("_")[1] ?? String(Date.now())).slice(-8);

const stamp = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const toNumbers = (row: BundleRow): BundleRow => ({
  ...row,
  qty: Number(row.qty),
  current_seq: Number(row.current_seq),
  waiting_qty: Number(row.waiting_qty),
  buffer_qty: Number(row.buffer_qty),
  rework_qty: Number(row.rework_qty),
  reject_qty: Number(row.reject_qty),
  rework_out_qty: Number(row.rework_out_qty),
  qc_released_qty: Number(row.qc_released_qty),
  packed_qty: Number(row.packed_qty),
});

const bundlePatch = (state: BundleState) => ({
  current_seq: state.current_seq,
  waiting_qty: state.waiting_qty,
  buffer_qty: state.buffer_qty,
  rework_qty: state.rework_qty,
  reject_qty: state.reject_qty,
  rework_out_qty: state.rework_out_qty,
  qc_released_qty: state.qc_released_qty,
  packed_qty: state.packed_qty,
});

class ManufacturingModuleService extends MedusaService({
  Bom,
  BomLine,
  Routing,
  RoutingOperation,
  WorkCenter,
  ManufacturingOrder,
  MoMaterialRequirement,
  ProductionBatch,
  ProductionRequest,
  CutPlan,
  ManufacturingException,
  Bundle,
  OperationExecution,
  PackingRecord,
  MaterialPlanningParam,
  MrpRun,
  MrpSuggestion,
  ManufacturingOutboxEvent,
  ManufacturingIdempotencyRecord,
}) {
  protected baseRepository_: DAL.RepositoryService;

  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(...(arguments as unknown as []));
    this.baseRepository_ = container.baseRepository;
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private idem<T>(
    ctx: Context,
    scope: string,
    input: Command,
    fn: () => Promise<T>
  ) {
    return runIdempotent(
      ctx,
      MANUFACTURING_IDEMPOTENCY_TABLE,
      scope,
      input,
      fn
    );
  }

  private async emit(
    ctx: Context,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    actor: { actor_id: string; correlation_id?: string | null },
    data: Record<string, unknown>
  ): Promise<void> {
    await this.createManufacturingOutboxEvents(
      [
        outboxRowFor({
          eventType,
          aggregateType,
          aggregateId,
          producer: PRODUCER,
          topic: TOPICS.manufacturing,
          actor,
          data,
        }),
      ],
      ctx
    );
  }

  private async lockMo(ctx: Context, id: string): Promise<MoRow> {
    annotate({ "mo.id": id });
    const [row] = await executorOf(ctx).execute<MoRow>(
      `SELECT ${MO_COLUMNS} FROM "manufacturing_order" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (!row) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        `Manufacturing order ${id} not found`
      );
    }
    return {
      ...row,
      planned_qty: Number(row.planned_qty),
      completed_qty: Number(row.completed_qty),
    };
  }

  private async lockBundle(ctx: Context, id: string): Promise<BundleRow> {
    annotate({ "bundle.id": id });
    const [row] = await executorOf(ctx).execute<BundleRow>(
      `SELECT ${BUNDLE_COLUMNS} FROM "bundle" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [id]
    );
    if (!row) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        `Bundle ${id} not found`
      );
    }
    return toNumbers(row);
  }

  private async loadOps(
    ctx: Context,
    routingId: string
  ): Promise<Array<FlowOp & { standard_minutes: number }>> {
    const rows = await executorOf(ctx).execute<{
      seq: number;
      code: string;
      qc_gate: boolean;
      standard_minutes: string;
    }>(
      `SELECT seq, code, qc_gate, standard_minutes FROM "routing_operation"
       WHERE routing_id = ? AND deleted_at IS NULL ORDER BY seq`,
      [routingId]
    );
    return rows.map((r) => ({
      seq: Number(r.seq),
      code: r.code,
      qc_gate: r.qc_gate,
      standard_minutes: Number(r.standard_minutes),
    }));
  }

  private async moveMo(
    ctx: Context,
    mo: MoRow,
    to: MoStatus,
    actor: { actor_id: string; correlation_id?: string | null },
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    assertTransition(mo.status as MoStatus, to);
    await this.updateManufacturingOrders(
      { id: mo.id, status: to, ...extra },
      ctx
    );
    await flushOf(ctx);
    await this.emit(
      ctx,
      "manufacturing.mo_status_changed.v1",
      "manufacturing_order",
      mo.id,
      actor,
      {
        mo_id: mo.id,
        mo_number: mo.mo_number,
        from: mo.status,
        to,
        customer_order_id: mo.customer_order_id,
      }
    );
    mo.status = to;
  }

  private assertShopFloor(mo: MoRow): void {
    if (!SHOP_FLOOR_STATUSES.includes(mo.status as MoStatus)) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Manufacturing order ${mo.mo_number} is ${mo.status}; shop-floor work is not allowed`
      );
    }
  }

  // -------------------------------------------------------------------
  // BOM / routing (FR-MRP-001/003)
  // -------------------------------------------------------------------

  @InjectTransactionManager()
  async createBomVersion(
    input: CreateBomInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "create-bom", input, async () => {
      if (input.lines.length === 0) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "A BOM needs at least one line"
        );
      }
      const ex = executorOf(ctx);
      await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
        `bom:${input.product_sku}`,
      ]);
      const [{ next }] = await ex.execute<{ next: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM "bom" WHERE product_sku = ?`,
        [input.product_sku]
      );
      const bom = await this.createBoms(
        {
          product_sku: input.product_sku,
          version: Number(next),
          output_uom: input.output_uom ?? "pcs",
          notes: input.notes ?? null,
          created_by: input.actor_id,
          status: "DRAFT",
        },
        ctx
      );
      // The released-parent trigger reads the header, so it must exist first.
      await flushOf(ctx);
      await this.createBomLines(
        input.lines.map((line, index) => {
          assertPositiveQty(line.qty_per_unit, "qty_per_unit");
          return {
            bom_id: bom.id,
            line_no: index + 1,
            material_id: line.material_id,
            uom: line.uom,
            qty_per_unit: line.qty_per_unit,
            waste_factor: line.waste_factor ?? 0,
          };
        }),
        ctx
      );
      return {
        id: bom.id,
        product_sku: input.product_sku,
        version: Number(next),
        status: "DRAFT",
      };
    });
  }

  @InjectTransactionManager()
  async releaseBomVersion(
    input: ReleaseVersionedInput,
    @MedusaContext() ctx: Context = {}
  ) {
    const [bom] = await executorOf(ctx).execute<{
      id: string;
      status: string;
      product_sku: string;
      version: number;
    }>(
      `SELECT id, status, product_sku, version FROM "bom" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.id]
    );
    if (!bom) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        `BOM ${input.id} not found`
      );
    }
    if (bom.status === "RELEASED") {
      return {
        id: bom.id,
        status: "RELEASED",
        product_sku: bom.product_sku,
        version: Number(bom.version),
      };
    }
    if (bom.status !== "DRAFT") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `BOM is ${bom.status}`
      );
    }
    await this.updateBoms(
      {
        id: bom.id,
        status: "RELEASED",
        released_by: input.actor_id,
        released_at: new Date(),
      },
      ctx
    );
    await flushOf(ctx);
    await this.emit(
      ctx,
      "manufacturing.bom_released.v1",
      "bom",
      bom.id,
      input,
      {
        bom_id: bom.id,
        product_sku: bom.product_sku,
        version: Number(bom.version),
      }
    );
    return {
      id: bom.id,
      status: "RELEASED",
      product_sku: bom.product_sku,
      version: Number(bom.version),
    };
  }

  @InjectTransactionManager()
  async createRoutingVersion(
    input: CreateRoutingInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "create-routing", input, async () => {
      if (input.operations.length === 0) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "A routing needs at least one operation"
        );
      }
      const seqs = input.operations.map((o) => o.seq);
      if (new Set(seqs).size !== seqs.length) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.DUPLICATE,
          "Operation seq values must be unique"
        );
      }
      const ex = executorOf(ctx);
      await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
        `routing:${input.product_sku}`,
      ]);
      const [{ next }] = await ex.execute<{ next: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM "routing" WHERE product_sku = ?`,
        [input.product_sku]
      );
      const routing = await this.createRoutings(
        {
          product_sku: input.product_sku,
          version: Number(next),
          notes: input.notes ?? null,
          created_by: input.actor_id,
          status: "DRAFT",
        },
        ctx
      );
      await flushOf(ctx);
      await this.createRoutingOperations(
        input.operations.map((op) => ({
          routing_id: routing.id,
          seq: op.seq,
          code: op.code,
          name: op.name,
          work_center_type: op.work_center_type,
          standard_minutes: op.standard_minutes ?? 0,
          qc_gate: op.qc_gate ?? false,
        })),
        ctx
      );
      return {
        id: routing.id,
        product_sku: input.product_sku,
        version: Number(next),
        status: "DRAFT",
      };
    });
  }

  @InjectTransactionManager()
  async releaseRoutingVersion(
    input: ReleaseVersionedInput,
    @MedusaContext() ctx: Context = {}
  ) {
    const ex = executorOf(ctx);
    const [routing] = await ex.execute<{
      id: string;
      status: string;
      product_sku: string;
      version: number;
    }>(
      `SELECT id, status, product_sku, version FROM "routing" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.id]
    );
    if (!routing) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        `Routing ${input.id} not found`
      );
    }
    if (routing.status === "RELEASED") {
      return {
        id: routing.id,
        status: "RELEASED",
        product_sku: routing.product_sku,
        version: Number(routing.version),
      };
    }
    if (routing.status !== "DRAFT") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Routing is ${routing.status}`
      );
    }
    assertRoutingEndsWithGate(await this.loadOps(ctx, routing.id));
    await this.updateRoutings(
      {
        id: routing.id,
        status: "RELEASED",
        released_by: input.actor_id,
        released_at: new Date(),
      },
      ctx
    );
    await flushOf(ctx);
    await this.emit(
      ctx,
      "manufacturing.routing_released.v1",
      "routing",
      routing.id,
      input,
      {
        routing_id: routing.id,
        product_sku: routing.product_sku,
        version: Number(routing.version),
      }
    );
    return {
      id: routing.id,
      status: "RELEASED",
      product_sku: routing.product_sku,
      version: Number(routing.version),
    };
  }

  // -------------------------------------------------------------------
  // Manufacturing order lifecycle (FR-MFG-001..004, 014)
  // -------------------------------------------------------------------

  private async latestReleased(
    ctx: Context,
    table: "bom" | "routing",
    sku: string,
    id?: string | null
  ) {
    const ex = executorOf(ctx);
    const rows = id
      ? await ex.execute<{
          id: string;
          version: number;
          status: string;
          product_sku: string;
        }>(
          `SELECT id, version, status, product_sku FROM "${table}" WHERE id = ? AND deleted_at IS NULL`,
          [id]
        )
      : await ex.execute<{
          id: string;
          version: number;
          status: string;
          product_sku: string;
        }>(
          `SELECT id, version, status, product_sku FROM "${table}"
           WHERE product_sku = ? AND status = 'RELEASED' AND deleted_at IS NULL
           ORDER BY version DESC LIMIT 1`,
          [sku]
        );
    const row = rows[0];
    if (!row || row.status !== "RELEASED" || row.product_sku !== sku) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `No released ${table} for ${sku}`
      );
    }
    return { id: row.id, version: Number(row.version) };
  }

  @InjectTransactionManager()
  async createManufacturingOrderFrom(
    input: CreateMoInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "create-mo", input, async () => {
      if (
        input.lines.length === 0 ||
        input.lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0)
      ) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "MO lines need positive whole-number quantities"
        );
      }
      if (input.order_type === "MTO" && !input.customer_order_id) {
        throw domainError(
          MedusaError.Types.INVALID_DATA,
          ErrorCodes.INVALID_STATE,
          "An MTO manufacturing order needs customer_order_id"
        );
      }
      const bom = await this.latestReleased(
        ctx,
        "bom",
        input.product_sku,
        input.bom_id
      );
      const routing = await this.latestReleased(
        ctx,
        "routing",
        input.product_sku,
        input.routing_id
      );
      const planned = input.lines.reduce((sum, l) => sum + l.qty, 0);

      const bomLines = await executorOf(ctx).execute<{
        material_id: string;
        uom: string;
        qty_per_unit: string;
        waste_factor: string;
      }>(
        `SELECT material_id, uom, qty_per_unit, waste_factor FROM "bom_line"
         WHERE bom_id = ? AND deleted_at IS NULL ORDER BY line_no`,
        [bom.id]
      );
      const requirements = explodeBom(bomLines, planned);

      const moNumber = `MO-${stamp()}-${shortId("mo")}`;
      const mo = await this.createManufacturingOrders(
        {
          mo_number: moNumber,
          order_type: input.order_type,
          status: "DRAFT",
          product_sku: input.product_sku,
          lines: input.lines as unknown as Record<string, unknown>,
          planned_qty: planned,
          bom_id: bom.id,
          bom_version: bom.version,
          routing_id: routing.id,
          routing_version: routing.version,
          customer_order_id: input.customer_order_id ?? null,
          due_date: input.due_date ?? null,
          notes: input.notes ?? null,
          created_by: input.actor_id,
        },
        ctx
      );
      await this.createMoMaterialRequirements(
        requirements.map((r) => ({
          mo_id: mo.id,
          material_id: r.material_id,
          uom: r.uom,
          required_qty: r.required_qty,
        })),
        ctx
      );
      await this.emit(
        ctx,
        "manufacturing.mo_created.v1",
        "manufacturing_order",
        mo.id,
        input,
        {
          mo_id: mo.id,
          mo_number: moNumber,
          order_type: input.order_type,
          product_sku: input.product_sku,
          planned_qty: planned,
          bom_version: bom.version,
          routing_version: routing.version,
          customer_order_id: input.customer_order_id ?? null,
        }
      );
      return {
        id: mo.id,
        mo_number: moNumber,
        status: "DRAFT",
        planned_qty: planned,
        bom_id: bom.id,
        bom_version: bom.version,
        routing_id: routing.id,
        routing_version: routing.version,
        requirements,
      };
    });
  }

  @InjectTransactionManager()
  async planManufacturingOrder(
    input: MoActor,
    @MedusaContext() ctx: Context = {}
  ) {
    const mo = await this.lockMo(ctx, input.mo_id);
    if (mo.status !== "PLANNED") {
      await this.moveMo(ctx, mo, "PLANNED", input);
    }
    return { id: mo.id, status: mo.status };
  }

  /** FR-MFG-003: READY / PARTIAL / SHORTAGE from inventory availability. */
  @InjectTransactionManager()
  async applyMaterialReadiness(
    input: MaterialReadinessInput,
    @MedusaContext() ctx: Context = {}
  ) {
    const mo = await this.lockMo(ctx, input.mo_id);
    if (mo.status !== "PLANNED" && mo.status !== "MATERIAL_CHECK") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Material check is not possible in status ${mo.status}`
      );
    }
    const reqs = await this.listMoMaterialRequirements(
      { mo_id: mo.id },
      {},
      ctx
    );
    let ready = 0;
    const detail: Array<{
      material_id: string;
      required: number;
      available: number;
      status: string;
    }> = [];
    for (const req of reqs) {
      const available = toUnits(input.availability[req.material_id] ?? 0);
      // Already-reserved quantity is no longer "available" but still covers us.
      const covered = available + toUnits(req.reserved_qty);
      const ok = covered >= toUnits(req.required_qty);
      ready += ok ? 1 : 0;
      await this.updateMoMaterialRequirements(
        { id: req.id, availability_status: ok ? "READY" : "SHORTAGE" },
        ctx
      );
      detail.push({
        material_id: req.material_id,
        required: Number(req.required_qty),
        available: fromUnits(available),
        status: ok ? "READY" : "SHORTAGE",
      });
    }
    const status =
      ready === reqs.length ? "READY" : ready === 0 ? "SHORTAGE" : "PARTIAL";
    await this.updateManufacturingOrders(
      { id: mo.id, material_status: status },
      ctx
    );
    await flushOf(ctx);
    if (mo.status === "PLANNED") {
      await this.moveMo(ctx, mo, "MATERIAL_CHECK", input);
    }
    return { id: mo.id, status: mo.status, material_status: status, detail };
  }

  @InjectTransactionManager()
  async recordMaterialReservations(
    input: RecordReservationsInput,
    @MedusaContext() ctx: Context = {}
  ) {
    const mo = await this.lockMo(ctx, input.mo_id);
    if (mo.status !== "MATERIAL_CHECK") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Reservations are recorded in MATERIAL_CHECK, not ${mo.status}`
      );
    }
    const reqs = await this.listMoMaterialRequirements(
      { mo_id: mo.id },
      {},
      ctx
    );
    const byMaterial = new Map(reqs.map((r) => [r.material_id, r]));
    for (const r of input.reservations) {
      const req = byMaterial.get(r.material_id);
      if (!req) {
        throw domainError(
          MedusaError.Types.NOT_FOUND,
          ErrorCodes.NOT_FOUND,
          `No requirement for material ${r.material_id}`
        );
      }
      await this.updateMoMaterialRequirements(
        { id: req.id, reserved_qty: r.qty, reservation_id: r.reservation_id },
        ctx
      );
      byMaterial.set(r.material_id, {
        ...req,
        reserved_qty: r.qty,
      } as typeof req);
    }
    await flushOf(ctx);
    const allReserved = [...byMaterial.values()].every(
      (r) => toUnits(r.reserved_qty) >= toUnits(r.required_qty)
    );
    if (allReserved) {
      await this.moveMo(ctx, mo, "MATERIAL_RESERVED", input);
    }
    return { id: mo.id, status: mo.status, fully_reserved: allReserved };
  }

  @InjectTransactionManager()
  async releaseManufacturingOrder(
    input: ReleaseMoInput,
    @MedusaContext() ctx: Context = {}
  ) {
    const mo = await this.lockMo(ctx, input.mo_id);
    if (mo.status === "RELEASED") {
      const batches = await this.listProductionBatches(
        { mo_id: mo.id },
        {},
        ctx
      );
      return {
        id: mo.id,
        status: "RELEASED",
        batches: batches.map((b) => ({
          id: b.id,
          batch_no: b.batch_no,
          planned_qty: b.planned_qty,
        })),
      };
    }
    await this.moveMo(ctx, mo, "RELEASED", input);

    const splits = input.batches?.length
      ? input.batches
      : [{ planned_qty: mo.planned_qty }];
    const total = splits.reduce((sum, b) => sum + b.planned_qty, 0);
    if (
      total !== mo.planned_qty ||
      splits.some((b) => !Number.isInteger(b.planned_qty) || b.planned_qty <= 0)
    ) {
      throw domainError(
        MedusaError.Types.INVALID_DATA,
        ErrorCodes.INVALID_STATE,
        `Batch quantities must add up to the MO quantity (${mo.planned_qty})`
      );
    }
    const batches = await this.createProductionBatches(
      splits.map((b, i) => ({
        mo_id: mo.id,
        batch_no: `${mo.mo_number}-B${i + 1}`,
        planned_qty: b.planned_qty,
      })),
      ctx
    );
    return {
      id: mo.id,
      status: "RELEASED",
      batches: batches.map((b) => ({
        id: b.id,
        batch_no: b.batch_no,
        planned_qty: b.planned_qty,
      })),
    };
  }

  @InjectTransactionManager()
  async holdManufacturingOrder(
    input: MoActor & { reason: string },
    @MedusaContext() ctx: Context = {}
  ) {
    const mo = await this.lockMo(ctx, input.mo_id);
    const from = mo.status;
    await this.moveMo(ctx, mo, "ON_HOLD", input, { held_from_status: from });
    return { id: mo.id, status: "ON_HOLD", held_from_status: from };
  }

  @InjectTransactionManager()
  async resumeManufacturingOrder(
    input: MoActor,
    @MedusaContext() ctx: Context = {}
  ) {
    const mo = await this.lockMo(ctx, input.mo_id);
    if (mo.status !== "ON_HOLD" || !mo.held_from_status) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Manufacturing order is not on hold"
      );
    }
    const target = mo.held_from_status as MoStatus;
    await this.moveMo(ctx, mo, target, input, { held_from_status: null });
    return { id: mo.id, status: target };
  }

  /**
   * Cancel only when no material is stranded in production: every issued unit
   * must be returned or scrapped (TDD s.60 - never a status flip only).
   */
  @InjectTransactionManager()
  async cancelManufacturingOrder(
    input: CancelMoInput,
    @MedusaContext() ctx: Context = {}
  ) {
    const mo = await this.lockMo(ctx, input.mo_id);
    // Repeating a cancel must succeed so the workflow can finish releasing
    // reservations after a partial failure.
    if (mo.status === "CANCELLED") {
      return { id: mo.id, status: "CANCELLED" };
    }
    const stranded = Object.entries(input.settlement)
      .map(([material_id, s]) => ({
        material_id,
        net: toUnits(s.issued) - toUnits(s.returned) - toUnits(s.scrapped),
      }))
      .filter((s) => s.net > 0);
    if (stranded.length > 0) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `MO_HAS_ISSUED_MATERIAL: return or scrap issued material first (${stranded
          .map((s) => `${s.material_id}: ${fromUnits(s.net)}`)
          .join(", ")})`
      );
    }
    const openBundles = await executorOf(ctx).execute<{ n: string }>(
      `SELECT count(*) AS n FROM "bundle"
       WHERE mo_id = ? AND deleted_at IS NULL
         AND (waiting_qty + buffer_qty + rework_qty > 0 OR qc_released_qty > packed_qty)`,
      [mo.id]
    );
    if (Number(openBundles[0]?.n ?? 0) > 0) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "WIP still exists on the shop floor; scrap or finish it first"
      );
    }
    await this.moveMo(ctx, mo, "CANCELLED", input, { notes: input.reason });
    return { id: mo.id, status: "CANCELLED" };
  }

  /**
   * Read-only pre-check used BEFORE stock is issued: the MO must be on the
   * shop floor and the issue must fit what is reserved for it. It does not
   * replace the check in `recordMaterialIssue`; it only keeps stock from
   * moving when that check would certainly fail.
   */
  @InjectTransactionManager()
  async assertCanIssue(
    input: {
      mo_id: string;
      material_id: string;
      qty: number;
      /** Key the MO-side record will use; an existing one means a replay. */
      record_idempotency_key?: string;
    },
    @MedusaContext() ctx: Context = {}
  ): Promise<void> {
    if (input.record_idempotency_key) {
      const [done] = await executorOf(ctx).execute<{ id: string }>(
        `SELECT id FROM ${safeTable(MANUFACTURING_IDEMPOTENCY_TABLE)}
         WHERE scope = 'mo-issue' AND idempotency_key = ? AND deleted_at IS NULL`,
        [input.record_idempotency_key]
      );
      if (done) {
        return;
      }
    }
    const mo = await this.lockMo(ctx, input.mo_id);
    this.assertShopFloor(mo);
    const qty = assertPositiveQty(input.qty);
    const [req] = await this.listMoMaterialRequirements(
      { mo_id: mo.id, material_id: input.material_id },
      {},
      ctx
    );
    if (!req) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "No requirement for that material"
      );
    }
    if (toUnits(req.issued_qty) + qty > toUnits(req.reserved_qty)) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INSUFFICIENT_STOCK,
        "Cannot issue more than reserved for this MO"
      );
    }
  }

  @InjectTransactionManager()
  async recordMaterialIssue(
    input: Command & { mo_id: string; material_id: string; qty: number },
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "mo-issue", input, async () => {
      const mo = await this.lockMo(ctx, input.mo_id);
      this.assertShopFloor(mo);
      const qty = assertPositiveQty(input.qty);
      const [req] = await this.listMoMaterialRequirements(
        { mo_id: mo.id, material_id: input.material_id },
        {},
        ctx
      );
      if (!req) {
        throw domainError(
          MedusaError.Types.NOT_FOUND,
          ErrorCodes.NOT_FOUND,
          "No requirement for that material"
        );
      }
      const issued = toUnits(req.issued_qty) + qty;
      if (issued > toUnits(req.reserved_qty)) {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INSUFFICIENT_STOCK,
          "Cannot issue more than reserved for this MO"
        );
      }
      await this.updateMoMaterialRequirements(
        { id: req.id, issued_qty: fromUnits(issued) },
        ctx
      );
      return {
        mo_id: mo.id,
        material_id: input.material_id,
        issued_qty: fromUnits(issued),
      };
    });
  }

  // -------------------------------------------------------------------
  // Cutting (FR-MFG-006/007/008)
  // -------------------------------------------------------------------

  @InjectTransactionManager()
  async createCutPlanFor(
    input: CutPlanInput,
    @MedusaContext() ctx: Context = {}
  ) {
    const mo = await this.lockMo(ctx, input.mo_id);
    this.assertShopFloor(mo);
    const [batch] = await this.listProductionBatches(
      { id: input.batch_id, mo_id: mo.id },
      {},
      ctx
    );
    if (!batch || batch.status !== "OPEN") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Batch not found or already cut"
      );
    }
    const skus = new Set(mo.lines.map((l) => l.sku));
    for (const lay of input.lays) {
      for (const sku of Object.keys(lay.size_ratio)) {
        if (!skus.has(sku)) {
          throw domainError(
            MedusaError.Types.INVALID_DATA,
            ErrorCodes.INVALID_STATE,
            `SKU ${sku} is not part of ${mo.mo_number}`
          );
        }
      }
    }
    const planned = input.lays.reduce(
      (sum, lay) => sum + toUnits(lay.planned_consumption),
      0
    );
    const plan = await this.createCutPlans(
      {
        batch_id: batch.id,
        mo_id: mo.id,
        lays: input.lays as unknown as Record<string, unknown>,
        planned_consumption: fromUnits(planned),
        fabric_material_id: input.fabric_material_id,
      },
      ctx
    );
    return {
      id: plan.id,
      batch_id: batch.id,
      planned_consumption: fromUnits(planned),
    };
  }

  /**
   * Records the cut: creates bundles (WIP), closes the batch, and reconciles
   * fabric (issued ~ consumed + returned + scrap, FR-MFG-007). Variance beyond
   * tolerance opens a manufacturing exception.
   */
  @InjectTransactionManager()
  async completeCutBatch(
    input: CompleteCutInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "complete-cut", input, async () => {
      const mo = await this.lockMo(ctx, input.mo_id);
      this.assertShopFloor(mo);
      const [batch] = await this.listProductionBatches(
        { id: input.batch_id, mo_id: mo.id },
        {},
        ctx
      );
      if (!batch || batch.status !== "OPEN") {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          "Batch not found or already cut"
        );
      }

      // Bundles may not exceed what the MO asked for, unless approved.
      const existing = await executorOf(ctx).execute<{
        sku: string;
        n: string;
      }>(
        `SELECT sku, COALESCE(SUM(qty), 0) AS n FROM "bundle"
         WHERE mo_id = ? AND parent_bundle_id IS NULL AND deleted_at IS NULL GROUP BY sku`,
        [mo.id]
      );
      const cutBySku = new Map(existing.map((r) => [r.sku, Number(r.n)]));
      const wanted = new Map(mo.lines.map((l) => [l.sku, l.qty]));
      const addBySku = new Map<string, number>();
      for (const b of input.bundles) {
        if (!wanted.has(b.sku)) {
          throw domainError(
            MedusaError.Types.INVALID_DATA,
            ErrorCodes.INVALID_STATE,
            `SKU ${b.sku} is not part of ${mo.mo_number}`
          );
        }
        if (!Number.isInteger(b.qty) || b.qty <= 0) {
          throw domainError(
            MedusaError.Types.INVALID_DATA,
            ErrorCodes.INVALID_STATE,
            "Bundle quantities must be positive whole numbers"
          );
        }
        addBySku.set(b.sku, (addBySku.get(b.sku) ?? 0) + b.qty);
      }
      const overproduced: Array<{ sku: string; planned: number; cut: number }> =
        [];
      for (const [sku, add] of addBySku) {
        const total = (cutBySku.get(sku) ?? 0) + add;
        if (total > (wanted.get(sku) as number)) {
          overproduced.push({
            sku,
            planned: wanted.get(sku) as number,
            cut: total,
          });
        }
      }
      if (overproduced.length > 0 && !input.overproduction_approved) {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          `OVERPRODUCTION_APPROVAL_REQUIRED: ${overproduced.map((o) => `${o.sku} ${o.cut}/${o.planned}`).join(", ")}`
        );
      }

      const ops = await this.loadOps(ctx, mo.routing_id);
      const first = sortOps(ops)[0];
      let counter = (await this.listBundles({ batch_id: batch.id }, {}, ctx))
        .length;
      const bundles = await this.createBundles(
        input.bundles.map((b) => {
          counter += 1;
          return {
            bundle_code: `${batch.batch_no}-${String(counter).padStart(3, "0")}`,
            mo_id: mo.id,
            batch_id: batch.id,
            sku: b.sku,
            qty: b.qty,
            current_seq: first.seq,
            waiting_qty: b.qty,
          };
        }),
        ctx
      );
      await this.updateProductionBatches({ id: batch.id, status: "CUT" }, ctx);

      // Fabric reconciliation. Issues are booked per MO, not per batch, so the
      // book-vs-physical comparison is cumulative: all fabric consumed by the
      // MO's cut batches against what was issued. It is only meaningful once
      // the last open batch is cut; earlier batches must merely not consume
      // more than was issued.
      const consumed = toUnits(input.actual_consumption);
      const issued = toUnits(input.settlement.issued);
      const returned = toUnits(input.settlement.returned);
      const scrapped = toUnits(input.settlement.scrapped);
      const tolerance = Math.floor(
        (issued * (input.tolerance_pct ?? DEFAULT_FABRIC_TOLERANCE_PCT)) / 100
      );
      if (issued <= 0) {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          "No fabric has been issued to this MO; issue it before cutting"
        );
      }
      const [others] = await executorOf(ctx).execute<{
        consumed: string;
        open_batches: string;
      }>(
        `SELECT
           COALESCE((SELECT SUM(actual_consumption) FROM "cut_plan"
                     WHERE mo_id = ? AND status = 'CUT' AND batch_id <> ? AND deleted_at IS NULL), 0) AS consumed,
           (SELECT count(*) FROM "production_batch"
            WHERE mo_id = ? AND status = 'OPEN' AND id <> ? AND deleted_at IS NULL) AS open_batches`,
        [mo.id, batch.id, mo.id, batch.id]
      );
      const consumedAll = toUnits(others?.consumed ?? 0) + consumed;
      if (consumedAll > issued - returned - scrapped + tolerance) {
        throw domainError(
          MedusaError.Types.NOT_ALLOWED,
          ErrorCodes.INVALID_STATE,
          `Cut would consume ${fromUnits(consumedAll)} of fabric but only ${fromUnits(issued - returned - scrapped)} is still issued to this MO`
        );
      }
      const isLastBatch = Number(others?.open_batches ?? 0) === 0;
      const explained = consumedAll + returned + scrapped;
      const variance = isLastBatch ? issued - explained : 0;
      const withinTolerance = Math.abs(variance) <= tolerance;
      const [plan] = await this.listCutPlans({ batch_id: batch.id }, {}, ctx);
      if (plan) {
        await this.updateCutPlans(
          {
            id: plan.id,
            status: "CUT",
            actual_consumption: input.actual_consumption,
          },
          ctx
        );
      }
      if (!withinTolerance) {
        await this.createManufacturingExceptions(
          {
            mo_id: mo.id,
            type: "FABRIC_VARIANCE",
            detail: {
              batch_id: batch.id,
              issued: fromUnits(issued),
              consumed: input.actual_consumption,
              returned: input.settlement.returned,
              scrapped: input.settlement.scrapped,
              unexplained: fromUnits(variance),
            },
          },
          ctx
        );
      }
      if (overproduced.length > 0) {
        await this.createManufacturingExceptions(
          {
            mo_id: mo.id,
            type: "OVERPRODUCTION_APPROVED",
            detail: { overproduced, approved_by: input.actor_id },
          },
          ctx
        );
      }
      await this.emit(
        ctx,
        "manufacturing.batch_cut.v1",
        "production_batch",
        batch.id,
        input,
        {
          mo_id: mo.id,
          batch_id: batch.id,
          bundles: bundles.length,
          fabric_variance: fromUnits(variance),
          within_tolerance: withinTolerance,
        }
      );
      return {
        batch_id: batch.id,
        bundles: bundles.map((b) => ({
          id: b.id,
          bundle_code: b.bundle_code,
          sku: b.sku,
          qty: b.qty,
        })),
        reconciliation: {
          issued: fromUnits(issued),
          explained: fromUnits(explained),
          variance: fromUnits(variance),
          within_tolerance: withinTolerance,
        },
        overproduction: overproduced,
      };
    });
  }

  // -------------------------------------------------------------------
  // Shop floor (FR-MFG-008..013)
  // -------------------------------------------------------------------

  private async afterShopFloorChange(
    ctx: Context,
    moId: string,
    actor: { actor_id: string; correlation_id?: string | null }
  ) {
    const mo = await this.lockMo(ctx, moId);
    await flushOf(ctx);
    const [agg] = await executorOf(ctx).execute<{
      packed: string;
      wip_ops: string;
      at_gate: string;
      buffered: string;
      unpacked: string;
    }>(
      `SELECT COALESCE(SUM(b.packed_qty), 0) AS packed,
              COALESCE(SUM(CASE WHEN b.waiting_qty > 0 AND NOT o.qc_gate THEN 1 ELSE 0 END), 0) AS wip_ops,
              COALESCE(SUM(CASE WHEN b.waiting_qty > 0 AND o.qc_gate THEN 1 ELSE 0 END), 0) AS at_gate,
              COALESCE(SUM(b.buffer_qty), 0) AS buffered,
              COALESCE(SUM(b.qc_released_qty - b.packed_qty), 0) AS unpacked
       FROM "bundle" b
       JOIN "manufacturing_order" m ON m.id = b.mo_id
       LEFT JOIN "routing_operation" o ON o.routing_id = m.routing_id AND o.seq = b.current_seq AND o.deleted_at IS NULL
       WHERE b.mo_id = ? AND b.deleted_at IS NULL`,
      [mo.id]
    );
    const packed = Number(agg.packed);
    const wipOps = Number(agg.wip_ops);
    const atGate = Number(agg.at_gate);
    const buffered = Number(agg.buffered);
    const unpacked = Number(agg.unpacked);

    if (packed !== mo.completed_qty) {
      await this.updateManufacturingOrders(
        { id: mo.id, completed_qty: packed },
        ctx
      );
      mo.completed_qty = packed;
    }

    const status = mo.status as MoStatus;
    const target = (() => {
      if (packed >= mo.planned_qty && unpacked === 0) return "COMPLETED";
      if (
        packed > 0 &&
        wipOps === 0 &&
        atGate === 0 &&
        buffered === 0 &&
        unpacked === 0
      )
        return "PARTIALLY_COMPLETED";
      // Everything still in the factory has passed QC and only awaits packing.
      if (
        unpacked > 0 &&
        wipOps === 0 &&
        atGate === 0 &&
        (status === "IN_PROGRESS" || status === "QC_PENDING")
      )
        return "PACKING";
      if (wipOps === 0 && atGate > 0 && status === "IN_PROGRESS")
        return "QC_PENDING";
      if (
        wipOps > 0 &&
        (status === "QC_PENDING" ||
          status === "RELEASED" ||
          status === "PARTIALLY_COMPLETED" ||
          status === "PACKING")
      )
        return "IN_PROGRESS";
      if (status === "RELEASED") return "IN_PROGRESS";
      return status;
    })();
    if (target !== status) {
      try {
        await this.moveMo(ctx, mo, target, actor);
      } catch {
        // A non-allowed automatic move is simply skipped; explicit commands
        // remain the only way to force other transitions.
      }
    }
  }

  @InjectTransactionManager()
  async executeOperation(
    input: ExecuteOperationInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "op-exec", input, async () => {
      const bundle = await this.lockBundle(ctx, input.bundle_id);
      const mo = await this.lockMo(ctx, bundle.mo_id);
      this.assertShopFloor(mo);
      const ops = await this.loadOps(ctx, mo.routing_id);
      const next = reportOperation(bundle, ops, {
        op_seq: input.op_seq,
        input_qty: input.input_qty,
        good_qty: input.good_qty,
        rework_qty: input.rework_qty ?? 0,
        reject_qty: input.reject_qty ?? 0,
      });
      assertInvariant(next);
      const op = ops.find((o) => o.seq === input.op_seq) as FlowOp & {
        standard_minutes: number;
      };
      await this.updateBundles({ id: bundle.id, ...bundlePatch(next) }, ctx);
      const execution = await this.createOperationExecutions(
        {
          bundle_id: bundle.id,
          mo_id: mo.id,
          op_seq: input.op_seq,
          op_code: op.code,
          work_center_id: input.work_center_id ?? null,
          input_qty: input.input_qty,
          good_qty: input.good_qty,
          rework_qty: input.rework_qty ?? 0,
          reject_qty: input.reject_qty ?? 0,
          standard_minutes_total: op.standard_minutes * input.input_qty,
          actor_id: input.actor_id,
          idempotency_key: input.idempotency_key,
          occurred_at: new Date(),
        },
        ctx
      );
      await this.afterShopFloorChange(ctx, mo.id, input);
      return {
        execution_id: execution.id,
        bundle: { id: bundle.id, ...bundlePatch(next) },
      };
    });
  }

  /** Applies a Quality decision to a bundle waiting at a QC gate (FR-MFG-011). */
  @InjectTransactionManager()
  async applyInspectionResult(
    input: ApplyInspectionInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "apply-inspection", input, async () => {
      const bundle = await this.lockBundle(ctx, input.bundle_id);
      const mo = await this.lockMo(ctx, bundle.mo_id);
      this.assertShopFloor(mo);
      const ops = await this.loadOps(ctx, mo.routing_id);
      const next = applyInspection(bundle, ops, {
        pass_qty: input.pass_qty,
        rework_qty: input.rework_qty,
        reject_qty: input.reject_qty,
        hold_qty: input.hold_qty,
      });
      assertInvariant(next);
      await this.updateBundles({ id: bundle.id, ...bundlePatch(next) }, ctx);
      await this.afterShopFloorChange(ctx, mo.id, input);
      return { bundle: { id: bundle.id, ...bundlePatch(next) } };
    });
  }

  @InjectTransactionManager()
  async returnReworkToQc(
    input: ReturnReworkInput,
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.idem(ctx, "rework-return", input, async () => {
      const bundle = await this.lockBundle(ctx, input.bundle_id);
      const mo = await this.lockMo(ctx, bundle.mo_id);
      this.assertShopFloor(mo);
      const next = returnRework(bundle, {
        good_qty: input.good_qty,
        scrap_qty: input.scrap_qty,
      });
      assertInvariant(next);
      await this.updateBundles({ id: bundle.id, ...bundlePatch(next) }, ctx);

      let child: { id: string; bundle_code: string; qty: number } | null = null;
      if (input.good_qty > 0) {
        const ops = sortOps(await this.loadOps(ctx, mo.routing_id));
        const last = ops[ops.length - 1];
        const [{ n }] = await executorOf(ctx).execute<{ n: string }>(
          `SELECT count(*) AS n FROM "bundle" WHERE parent_bundle_id = ? AND deleted_at IS NULL`,
          [bundle.id]
        );
        const created = await this.createBundles(
          {
            bundle_code: `${bundle.bundle_code}-RW${Number(n) + 1}`,
            mo_id: mo.id,
            batch_id: bundle.batch_id,
            sku: bundle.sku,
            parent_bundle_id: bundle.id,
            qty: input.good_qty,
            current_seq: last.seq,
            waiting_qty: input.good_qty,
          },
          ctx
        );
        child = {
          id: created.id,
          bundle_code: created.bundle_code,
          qty: input.good_qty,
        };
      }
      await this.afterShopFloorChange(ctx, mo.id, input);
      return {
        bundle: { id: bundle.id, ...bundlePatch(next) },
        rework_bundle: child,
      };
    });
  }

  @InjectTransactionManager()
  async packBundle(
    input: PackBundleInput,
    @MedusaContext() ctx: Context = {}
  ): Promise<PackedResult> {
    return await this.idem(ctx, "pack", input, async () => {
      const bundle = await this.lockBundle(ctx, input.bundle_id);
      const mo = await this.lockMo(ctx, bundle.mo_id);
      this.assertShopFloor(mo);
      const next = pack(bundle, input.qty);
      assertInvariant(next);
      await this.updateBundles(
        { id: bundle.id, packed_qty: next.packed_qty },
        ctx
      );
      const packNo = `PK-${shortId("pk")}`;
      const record = await this.createPackingRecords(
        {
          pack_no: packNo,
          bundle_id: bundle.id,
          mo_id: mo.id,
          batch_id: bundle.batch_id,
          sku: bundle.sku,
          qty: input.qty,
          packed_by: input.actor_id,
        },
        ctx
      );
      await this.afterShopFloorChange(ctx, mo.id, input);
      const result: PackedResult = {
        packing_record_id: record.id,
        pack_no: packNo,
        mo_id: mo.id,
        batch_id: bundle.batch_id,
        bundle_id: bundle.id,
        sku: bundle.sku,
        qty: input.qty,
      };
      await this.emit(
        ctx,
        "manufacturing.output_packed.v1",
        "packing_record",
        record.id,
        input,
        { ...result }
      );
      return result;
    });
  }

  // -------------------------------------------------------------------
  // MRP (FR-MRP-004/005/006)
  // -------------------------------------------------------------------

  @InjectTransactionManager()
  async runMrp(input: MrpInput, @MedusaContext() ctx: Context = {}) {
    return await this.idem(ctx, "mrp-run", input, async () => {
      const demand = await executorOf(ctx).execute<{
        material_id: string;
        gross: string;
        mo_ids: string[];
      }>(
        `SELECT r.material_id, SUM(r.required_qty - r.reserved_qty) AS gross, array_agg(DISTINCT r.mo_id) AS mo_ids
         FROM "mo_material_requirement" r
         JOIN "manufacturing_order" m ON m.id = r.mo_id AND m.deleted_at IS NULL
         WHERE r.deleted_at IS NULL AND m.status IN ('PLANNED', 'MATERIAL_CHECK')
         GROUP BY r.material_id
         HAVING SUM(r.required_qty - r.reserved_qty) > 0`
      );
      const params = await this.listMaterialPlanningParams({}, {}, ctx);
      const safety = new Map(
        params.map((p) => [p.material_id, Number(p.safety_stock)])
      );
      // Materials with only a safety-stock need are planned too.
      const materialIds = new Set([
        ...demand.map((d) => d.material_id),
        ...params.map((p) => p.material_id),
      ]);
      const demandBy = new Map(demand.map((d) => [d.material_id, d]));

      const suggestions = grossToNet(
        [...materialIds].map((material_id) => ({
          material_id,
          gross: Number(demandBy.get(material_id)?.gross ?? 0),
          available: input.available[material_id] ?? 0,
          incoming: input.incoming[material_id] ?? 0,
          safety_stock: safety.get(material_id) ?? 0,
          mo_ids: demandBy.get(material_id)?.mo_ids ?? [],
        }))
      );

      const runNo = `MRP-${stamp()}-${shortId("mrp")}`;
      const run = await this.createMrpRuns(
        {
          run_no: runNo,
          status: "COMPLETED",
          parameters: (input.parameters ?? {}) as Record<string, unknown>,
          summary: {
            materials: materialIds.size,
            suggestions: suggestions.length,
          },
          created_by: input.actor_id,
        },
        ctx
      );
      const created = suggestions.length
        ? await this.createMrpSuggestions(
            suggestions.map((s) => ({
              run_id: run.id,
              type: s.type,
              material_id: s.material_id,
              gross_requirement: s.gross_requirement,
              available: s.available,
              confirmed_incoming: s.confirmed_incoming,
              safety_buffer: s.safety_buffer,
              net_requirement: s.net_requirement,
              suggested_qty: s.suggested_qty,
              mo_ids: s.mo_ids as unknown as Record<string, unknown>,
            })),
            ctx
          )
        : [];
      await this.emit(
        ctx,
        "manufacturing.mrp_run_completed.v1",
        "mrp_run",
        run.id,
        input,
        {
          run_id: run.id,
          run_no: runNo,
          suggestions: created.length,
        }
      );
      return { id: run.id, run_no: runNo, suggestions };
    });
  }

  /** Materials MRP must plan: unreserved MO demand plus safety-stock materials. */
  @InjectTransactionManager()
  async planningMaterialIds(
    @MedusaContext() ctx: Context = {}
  ): Promise<string[]> {
    const rows = await executorOf(ctx).execute<{ material_id: string }>(
      `SELECT DISTINCT r.material_id FROM "mo_material_requirement" r
       JOIN "manufacturing_order" m ON m.id = r.mo_id AND m.deleted_at IS NULL
       WHERE r.deleted_at IS NULL AND m.status IN ('PLANNED', 'MATERIAL_CHECK')
       UNION
       SELECT material_id FROM "material_planning_param" WHERE deleted_at IS NULL`
    );
    return rows.map((row) => row.material_id);
  }

  @InjectTransactionManager()
  async decideMrpSuggestion(
    input: {
      suggestion_id: string;
      decision: "APPROVED" | "REJECTED";
      actor_id: string;
      correlation_id?: string | null;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    const [row] = await executorOf(ctx).execute<{ id: string; status: string }>(
      `SELECT id, status FROM "mrp_suggestion" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.suggestion_id]
    );
    if (!row) {
      throw domainError(
        MedusaError.Types.NOT_FOUND,
        ErrorCodes.NOT_FOUND,
        "Suggestion not found"
      );
    }
    if (row.status !== "PENDING") {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        `Suggestion already ${row.status}`
      );
    }
    await this.updateMrpSuggestions(
      { id: row.id, status: input.decision, decided_by: input.actor_id },
      ctx
    );
    return { id: row.id, status: input.decision };
  }

  // -------------------------------------------------------------------
  // Made-to-order production requests (Phase 7)
  // -------------------------------------------------------------------

  /** Idempotent per order line: replays of `order.placed` create nothing new. */
  @InjectTransactionManager()
  async enqueueProductionRequests(
    input: {
      order_id: string;
      actor_id: string;
      correlation_id?: string | null;
      payment_confirmed: boolean;
      lines: Array<{
        order_line_id: string;
        sku: string;
        product_sku: string;
        qty: number;
      }>;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    const ex = executorOf(ctx);
    let created = 0;
    for (const line of input.lines) {
      const rows = await ex.execute<{ id: string }>(
        `INSERT INTO "production_request"
           (id, order_id, order_line_id, sku, product_sku, qty, status, payment_confirmed, attempts, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'REQUESTED', ?, 0, now(), now())
         ON CONFLICT (order_line_id) WHERE deleted_at IS NULL DO NOTHING
         RETURNING id`,
        [
          newId("preq"),
          input.order_id,
          line.order_line_id,
          line.sku,
          line.product_sku,
          line.qty,
          input.payment_confirmed,
        ]
      );
      created += rows.length;
    }
    if (created > 0) {
      await this.emit(
        ctx,
        "manufacturing.production_requested.v1",
        "production_request",
        input.order_id,
        input,
        {
          order_id: input.order_id,
          lines: input.lines.length,
        }
      );
    }
    return { created, existing: input.lines.length - created };
  }

  /** Claims due requests; SKIP LOCKED lets several workers share the queue. */
  @InjectTransactionManager()
  async claimDueProductionRequests(
    limit: number,
    @MedusaContext() ctx: Context = {}
  ) {
    const ex = executorOf(ctx);
    const rows = await ex.execute<{
      id: string;
      order_id: string;
      sku: string;
      product_sku: string;
      qty: number;
      status: string;
      payment_confirmed: boolean;
      mo_id: string | null;
      attempts: number;
    }>(
      `SELECT id, order_id, sku, product_sku, qty, status, payment_confirmed, mo_id, attempts
       FROM "production_request"
       WHERE status IN ('REQUESTED', 'WAITING_MATERIAL') AND deleted_at IS NULL
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       ORDER BY created_at LIMIT ? FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    if (rows.length > 0) {
      // Push the next attempt out so a slow worker is not raced by the next tick.
      await ex.execute(
        `UPDATE "production_request" SET next_attempt_at = now() + interval '60 seconds', updated_at = now() WHERE id IN (?)`,
        [rows.map((r) => r.id)]
      );
    }
    return rows.map((r) => ({
      ...r,
      qty: Number(r.qty),
      attempts: Number(r.attempts),
    }));
  }

  @InjectTransactionManager()
  async updateProductionRequest(
    input: {
      id: string;
      status?: (typeof import("./models/manufacturing-order").REQUEST_STATUSES)[number];
      mo_id?: string | null;
      payment_confirmed?: boolean;
      error?: string | null;
      retry_in_seconds?: number | null;
      increment_attempts?: boolean;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    const [row] = await executorOf(ctx).execute<{ attempts: number }>(
      `SELECT attempts FROM "production_request" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.id]
    );
    await this.updateProductionRequests(
      {
        id: input.id,
        ...(input.status ? { status: input.status } : {}),
        ...(input.mo_id !== undefined ? { mo_id: input.mo_id } : {}),
        ...(input.payment_confirmed !== undefined
          ? { payment_confirmed: input.payment_confirmed }
          : {}),
        ...(input.error !== undefined
          ? { last_error: input.error?.slice(0, 500) ?? null }
          : {}),
        ...(input.increment_attempts
          ? { attempts: Number(row?.attempts ?? 0) + 1 }
          : {}),
        ...(input.retry_in_seconds !== undefined
          ? {
              next_attempt_at:
                input.retry_in_seconds === null
                  ? null
                  : new Date(Date.now() + input.retry_in_seconds * 1000),
            }
          : {}),
      },
      ctx
    );
    return { id: input.id };
  }

  // -------------------------------------------------------------------
  // Work centers & reads
  // -------------------------------------------------------------------

  /** Effective capacity and same-day executed load per work center (FR-MFG-010). */
  @InjectTransactionManager()
  async workCenterLoad(day: Date, @MedusaContext() ctx: Context = {}) {
    const rows = await executorOf(ctx).execute<{
      id: string;
      code: string;
      type: string;
      is_active: boolean;
      capacity_minutes_per_day: number;
      efficiency_pct: number;
      load_minutes: string;
    }>(
      `SELECT w.id, w.code, w.type, w.is_active, w.capacity_minutes_per_day, w.efficiency_pct,
              COALESCE(SUM(e.standard_minutes_total) FILTER (
                WHERE e.occurred_at >= ?::date AND e.occurred_at < (?::date + interval '1 day')), 0) AS load_minutes
       FROM "work_center" w
       LEFT JOIN "operation_execution" e ON e.work_center_id = w.id AND e.deleted_at IS NULL
       WHERE w.deleted_at IS NULL
       GROUP BY w.id ORDER BY w.code`,
      [day.toISOString().slice(0, 10), day.toISOString().slice(0, 10)]
    );
    return rows.map((r) => {
      const effective =
        (Number(r.capacity_minutes_per_day) * Number(r.efficiency_pct)) / 100;
      const load = Number(r.load_minutes);
      return {
        id: r.id,
        code: r.code,
        type: r.type,
        is_active: r.is_active,
        effective_capacity_minutes: effective,
        load_minutes: load,
        utilization_pct:
          effective > 0 ? Math.round((load / effective) * 1000) / 10 : 0,
      };
    });
  }

  @InjectTransactionManager()
  async publishOutbox(
    limit: number,
    publish: OutboxPublishFn,
    @MedusaContext() ctx: Context = {}
  ): Promise<DrainResult> {
    return await drainOutbox(
      executorOf(ctx),
      MANUFACTURING_OUTBOX_TABLE,
      limit,
      publish
    );
  }
}

export default ManufacturingModuleService;
