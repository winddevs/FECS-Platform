import { MedusaError } from "@medusajs/framework/utils";
import {
  createStep,
  StepResponse,
  type StepFunction,
} from "@medusajs/framework/workflows-sdk";

import { domainError, ErrorCodes } from "../../lib/errors";
import { MANUFACTURING_MODULE } from "../../modules/manufacturing";
import type ManufacturingModuleService from "../../modules/manufacturing/service";
import type {
  ApplyInspectionInput,
  CancelMoInput,
  CompleteCutInput,
  CreateBomInput,
  CreateMoInput,
  CreateRoutingInput,
  CutPlanInput,
  ExecuteOperationInput,
  MoActor,
  MrpInput,
  PackBundleInput,
  ReleaseMoInput,
  ReleaseVersionedInput,
  ReturnReworkInput,
} from "../../modules/manufacturing/types";
import { MATERIAL_INVENTORY_MODULE } from "../../modules/materialInventory";
import type MaterialInventoryModuleService from "../../modules/materialInventory/service";
import { PROCUREMENT_MODULE } from "../../modules/procurement";
import type ProcurementModuleService from "../../modules/procurement/service";
import { QUALITY_MODULE } from "../../modules/quality";
import type QualityModuleService from "../../modules/quality/service";
import type { RecordInspectionInput } from "../../modules/quality/types";

type Resolver = { resolve: <T>(key: string) => T };
const mfg = (c: Resolver) =>
  c.resolve<ManufacturingModuleService>(MANUFACTURING_MODULE);
const inv = (c: Resolver) =>
  c.resolve<MaterialInventoryModuleService>(MATERIAL_INVENTORY_MODULE);

/**
 * Thin step wrapper. The explicit return type keeps workflow inputs typed
 * (createStep's own inference collapses inside a generic helper).
 */
const wrap = <I, O>(
  name: string,
  fn: (input: I, c: Resolver) => Promise<O>
): StepFunction<I, O> =>
  createStep(
    name,
    (async (input: unknown, { container }: { container: Resolver }) =>
      new StepResponse(await fn(input as I, container))) as never
  ) as unknown as StepFunction<I, O>;

// ---- master data ---------------------------------------------------------
export const createBomStep = wrap("mfg-create-bom", (i: CreateBomInput, c) =>
  mfg(c).createBomVersion(i)
);
export const releaseBomStep = wrap(
  "mfg-release-bom",
  (i: ReleaseVersionedInput, c) => mfg(c).releaseBomVersion(i)
);
export const createRoutingStep = wrap(
  "mfg-create-routing",
  (i: CreateRoutingInput, c) => mfg(c).createRoutingVersion(i)
);
export const releaseRoutingStep = wrap(
  "mfg-release-routing",
  (i: ReleaseVersionedInput, c) => mfg(c).releaseRoutingVersion(i)
);

type WorkCenterInput = {
  code: string;
  name: string;
  type: string;
  capacity_minutes_per_day?: number;
  efficiency_pct?: number;
};
export const createWorkCenterStep = createStep(
  "mfg-create-work-center",
  async (input: WorkCenterInput, { container }) => {
    const created = await mfg(container).createWorkCenters(input);
    return new StepResponse(created, created.id);
  },
  async (id, { container }) => {
    if (id) {
      await mfg(container).deleteWorkCenters(id);
    }
  }
);

type PlanningParamInput = {
  material_id: string;
  safety_stock: number;
  lead_time_days: number;
};
export const setPlanningParamStep = wrap(
  "mfg-set-planning-param",
  async (input: PlanningParamInput, c) => {
    const service = mfg(c);
    const [existing] = await service.listMaterialPlanningParams({
      material_id: input.material_id,
    });
    return existing
      ? await service.updateMaterialPlanningParams({
          id: existing.id,
          ...input,
        })
      : await service.createMaterialPlanningParams(input);
  }
);

// ---- MO lifecycle ----------------------------------------------------------
export const createMoStep = wrap("mfg-create-mo", (i: CreateMoInput, c) =>
  mfg(c).createManufacturingOrderFrom(i)
);
export const planMoStep = wrap("mfg-plan-mo", (i: MoActor, c) =>
  mfg(c).planManufacturingOrder(i)
);
export const holdMoStep = wrap(
  "mfg-hold-mo",
  (i: MoActor & { reason: string }, c) => mfg(c).holdManufacturingOrder(i)
);
export const resumeMoStep = wrap("mfg-resume-mo", (i: MoActor, c) =>
  mfg(c).resumeManufacturingOrder(i)
);
export const releaseMoStep = wrap("mfg-release-mo", (i: ReleaseMoInput, c) =>
  mfg(c).releaseManufacturingOrder(i)
);

/** Reads requirements and checks usable raw-material stock (FR-MFG-003). */
export const checkMaterialStep = wrap(
  "mfg-check-material",
  async (i: MoActor, c) => {
    const requirements = await mfg(c).listMoMaterialRequirements({
      mo_id: i.mo_id,
    });
    const availability = await inv(c).getUsableAvailability(
      requirements.map((r) => r.material_id)
    );
    return await mfg(c).applyMaterialReadiness({ ...i, availability });
  }
);

type ReserveInput = MoActor & { planner_approved?: boolean };
type Reserved = Array<{
  material_id: string;
  reservation_id: string;
  qty: number;
}>;

/**
 * Manufacturing never touches stock directly (FR-MFG-004): it asks Material
 * Inventory to reserve. If any requirement fails, reservations already made by
 * this step are released before the error is rethrown.
 */
export const reserveMoMaterialsStep = createStep(
  "mfg-reserve-materials",
  async (input: ReserveInput, { container }) => {
    const requirements = await mfg(container).listMoMaterialRequirements({
      mo_id: input.mo_id,
    });
    const made: Reserved = [];
    const actor = {
      actor_id: input.actor_id,
      correlation_id: input.correlation_id,
    };
    try {
      for (const req of requirements) {
        const missing = Number(req.required_qty) - Number(req.reserved_qty);
        if (missing <= 0) {
          made.push({
            material_id: req.material_id,
            reservation_id: req.reservation_id as string,
            qty: Number(req.reserved_qty),
          });
          continue;
        }
        const result = await inv(container).reserveMaterial({
          ...actor,
          idempotency_key: `mo:${input.mo_id}:reserve:${req.material_id}`,
          material_id: req.material_id,
          qty: missing,
          reference_type: "MO",
          reference_id: input.mo_id,
          reference_line: req.id,
          planner_approved: input.planner_approved,
        });
        made.push({
          material_id: req.material_id,
          reservation_id: result.reservation.id,
          qty: Number(req.reserved_qty) + missing,
        });
      }
    } catch (error) {
      await releaseAll(container, made, actor, input.mo_id);
      throw error;
    }
    return new StepResponse(made, {
      made,
      actor,
      mo_id: input.mo_id,
    });
  },
  async (comp, { container }) => {
    if (comp) {
      await releaseAll(container, comp.made, comp.actor, comp.mo_id);
    }
  }
);

const releaseAll = async (
  c: Resolver,
  reservations: Reserved,
  actor: { actor_id: string; correlation_id?: string | null },
  moId: string
): Promise<void> => {
  for (const r of reservations) {
    await inv(c).releaseReservation({
      ...actor,
      idempotency_key: `mo:${moId}:release:${r.reservation_id}`,
      reservation_id: r.reservation_id,
      reason: "reservation saga compensation",
    });
  }
};

export const recordReservationsStep = wrap(
  "mfg-record-reservations",
  (i: MoActor & { reservations: Reserved }, c) =>
    mfg(c).recordMaterialReservations(i)
);

// ---- cancel ---------------------------------------------------------------
export const releaseMoReservationsStep = wrap(
  "mfg-release-reservations",
  async (i: MoActor, c) => {
    const requirements = await mfg(c).listMoMaterialRequirements({
      mo_id: i.mo_id,
    });
    const released: string[] = [];
    for (const req of requirements) {
      if (!req.reservation_id) {
        continue;
      }
      const [reservation] = await inv(c).listMaterialReservations({
        id: req.reservation_id,
      });
      if (
        !reservation ||
        reservation.status === "RELEASED" ||
        reservation.status === "ISSUED"
      ) {
        continue;
      }
      await inv(c).releaseReservation({
        actor_id: i.actor_id,
        correlation_id: i.correlation_id,
        idempotency_key: `mo:${i.mo_id}:cancel-release:${req.reservation_id}`,
        reservation_id: req.reservation_id,
        reason: "manufacturing order cancelled",
      });
      released.push(req.reservation_id);
    }
    return released;
  }
);

export const cancelMoStep = wrap(
  "mfg-cancel-mo",
  async (i: MoActor & { reason: string }, c) => {
    const settlement = await inv(c).summarizeReference("MO", i.mo_id);
    const input: CancelMoInput = { ...i, settlement };
    return await mfg(c).cancelManufacturingOrder(input);
  }
);

// ---- material issue to production -------------------------------------------
type IssueToMoInput = MoActor & {
  material_id: string;
  qty: number;
  idempotency_key: string;
};
export const issueToMoStep = wrap(
  "mfg-issue-to-mo",
  async (i: IssueToMoInput, c) => {
    const [req] = await mfg(c).listMoMaterialRequirements({
      mo_id: i.mo_id,
      material_id: i.material_id,
    });
    if (!req?.reservation_id) {
      throw domainError(
        MedusaError.Types.NOT_ALLOWED,
        ErrorCodes.INVALID_STATE,
        "Material is not reserved for this MO"
      );
    }
    return await inv(c).issueMaterial({
      actor_id: i.actor_id,
      correlation_id: i.correlation_id,
      idempotency_key: `${i.idempotency_key}:inventory`,
      reservation_id: req.reservation_id,
      qty: i.qty,
    });
  }
);
export const recordMoIssueStep = wrap(
  "mfg-record-issue",
  (i: IssueToMoInput, c) =>
    mfg(c).recordMaterialIssue({
      actor_id: i.actor_id,
      correlation_id: i.correlation_id,
      idempotency_key: `${i.idempotency_key}:mo`,
      mo_id: i.mo_id,
      material_id: i.material_id,
      qty: i.qty,
    })
);

// ---- cutting ------------------------------------------------------------------
export const createCutPlanStep = wrap("mfg-cut-plan", (i: CutPlanInput, c) =>
  mfg(c).createCutPlanFor(i)
);

type CompleteCutRequest = Omit<CompleteCutInput, "settlement"> & {
  fabric_material_id: string;
};
export const completeCutStep = wrap(
  "mfg-complete-cut",
  async (i: CompleteCutRequest, c) => {
    const summary = await inv(c).summarizeReference("MO", i.mo_id);
    const settlement = summary[i.fabric_material_id] ?? {
      issued: 0,
      returned: 0,
      scrapped: 0,
    };
    const { fabric_material_id: _fabric, ...rest } = i;
    return await mfg(c).completeCutBatch({ ...rest, settlement });
  }
);

// ---- shop floor ------------------------------------------------------------------
export const executeOperationStep = wrap(
  "mfg-execute-operation",
  (i: ExecuteOperationInput, c) => mfg(c).executeOperation(i)
);
export const applyInspectionStep = wrap(
  "mfg-apply-inspection",
  (i: ApplyInspectionInput, c) => mfg(c).applyInspectionResult(i)
);
export const returnReworkStep = wrap(
  "mfg-return-rework",
  (i: ReturnReworkInput, c) => mfg(c).returnReworkToQc(i)
);
export const packBundleStep = wrap("mfg-pack-bundle", (i: PackBundleInput, c) =>
  mfg(c).packBundle(i)
);

export const recordInspectionStep = wrap(
  "quality-record-inspection",
  (i: RecordInspectionInput, c) =>
    c.resolve<QualityModuleService>(QUALITY_MODULE).recordInspection(i)
);

// ---- MRP -----------------------------------------------------------------------------
export const runMrpStep = wrap(
  "mfg-run-mrp",
  async (i: Omit<MrpInput, "available" | "incoming">, c) => {
    const ids = await mfg(c).planningMaterialIds();
    const [available, incoming] = await Promise.all([
      inv(c).getUsableAvailability(ids),
      c
        .resolve<ProcurementModuleService>(PROCUREMENT_MODULE)
        .confirmedIncoming(ids),
    ]);
    return await mfg(c).runMrp({ ...i, available, incoming });
  }
);
export const decideSuggestionStep = wrap(
  "mfg-decide-suggestion",
  (
    i: {
      suggestion_id: string;
      decision: "APPROVED" | "REJECTED";
      actor_id: string;
      correlation_id?: string | null;
    },
    c
  ) => mfg(c).decideMrpSuggestion(i)
);
