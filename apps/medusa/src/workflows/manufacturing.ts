import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import type {
  ApplyInspectionInput,
  CompleteCutInput,
  CreateBomInput,
  CreateMoInput,
  CreateRoutingInput,
  CutPlanInput,
  ExecuteOperationInput,
  MoActor,
  PackBundleInput,
  ReleaseMoInput,
  ReleaseVersionedInput,
  ReturnReworkInput,
} from "../modules/manufacturing/types";
import type { RecordInspectionInput } from "../modules/quality/types";
import { recordAuditStep } from "./steps/fashion-audit";
import {
  applyInspectionStep,
  cancelMoStep,
  checkMaterialStep,
  completeCutStep,
  createBomStep,
  createCutPlanStep,
  createMoStep,
  createRoutingStep,
  createWorkCenterStep,
  decideSuggestionStep,
  executeOperationStep,
  holdMoStep,
  issueToMoStep,
  packBundleStep,
  planMoStep,
  recordInspectionStep,
  recordMoIssueStep,
  recordReservationsStep,
  releaseBomStep,
  releaseMoReservationsStep,
  releaseMoStep,
  releaseRoutingStep,
  reserveMoMaterialsStep,
  resumeMoStep,
  returnReworkStep,
  runMrpStep,
  setSkuPlanningParamStep,
  shortCloseMoStep,
  setPlanningParamStep,
} from "./steps/manufacturing";

export const createBomWorkflow = createWorkflow(
  "mfg-create-bom-workflow",
  function (input: CreateBomInput) {
    return new WorkflowResponse(createBomStep(input));
  }
);

export const releaseBomWorkflow = createWorkflow(
  "mfg-release-bom-workflow",
  function (input: ReleaseVersionedInput) {
    const result = releaseBomStep(input);
    const audit = transform({ input, result }, ({ input, result }) => ({
      actor_id: input.actor_id,
      action: "manufacturing.bom.release",
      resource_type: "bom",
      resource_id: input.id,
      after: result,
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const createRoutingWorkflow = createWorkflow(
  "mfg-create-routing-workflow",
  function (input: CreateRoutingInput) {
    return new WorkflowResponse(createRoutingStep(input));
  }
);

export const releaseRoutingWorkflow = createWorkflow(
  "mfg-release-routing-workflow",
  function (input: ReleaseVersionedInput) {
    const result = releaseRoutingStep(input);
    const audit = transform({ input, result }, ({ input, result }) => ({
      actor_id: input.actor_id,
      action: "manufacturing.routing.release",
      resource_type: "routing",
      resource_id: input.id,
      after: result,
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const createWorkCenterWorkflow = createWorkflow(
  "mfg-create-work-center-workflow",
  function (input: Parameters<typeof createWorkCenterStep>[0]) {
    return new WorkflowResponse(createWorkCenterStep(input));
  }
);

export const setPlanningParamWorkflow = createWorkflow(
  "mfg-set-planning-param-workflow",
  function (input: Parameters<typeof setPlanningParamStep>[0]) {
    return new WorkflowResponse(setPlanningParamStep(input));
  }
);

export const setSkuPlanningParamWorkflow = createWorkflow(
  "mfg-set-sku-planning-param-workflow",
  function (input: Parameters<typeof setSkuPlanningParamStep>[0]) {
    return new WorkflowResponse(setSkuPlanningParamStep(input));
  }
);

export const createManufacturingOrderWorkflow = createWorkflow(
  "mfg-create-mo-workflow",
  function (input: CreateMoInput) {
    const mo = createMoStep(input);
    const planInput = transform({ input, mo }, ({ input, mo }) => ({
      mo_id: mo.id,
      actor_id: input.actor_id,
      correlation_id: input.correlation_id ?? null,
    }));
    planMoStep(planInput);
    return new WorkflowResponse(
      transform({ mo }, ({ mo }) => ({ ...mo, status: "PLANNED" }))
    );
  }
);

export const checkMaterialWorkflow = createWorkflow(
  "mfg-check-material-workflow",
  function (input: MoActor) {
    return new WorkflowResponse(checkMaterialStep(input));
  }
);

/** Material check -> reserve (saga with compensation) -> MATERIAL_RESERVED. */
export const reserveMoMaterialsWorkflow = createWorkflow(
  "mfg-reserve-mo-materials-workflow",
  function (input: MoActor & { planner_approved?: boolean }) {
    checkMaterialStep(input);
    const reserved = reserveMoMaterialsStep(input);
    const record = transform({ input, reserved }, ({ input, reserved }) => ({
      mo_id: input.mo_id,
      actor_id: input.actor_id,
      correlation_id: input.correlation_id ?? null,
      reservations: reserved,
    }));
    const result = recordReservationsStep(record);

    when(input, (data) => Boolean(data.planner_approved)).then(() => {
      const audit = transform({ input }, ({ input }) => ({
        actor_id: input.actor_id,
        action: "manufacturing.mo.reserve.planner_override",
        resource_type: "manufacturing_order",
        resource_id: input.mo_id,
        reason: "dye-lot policy override",
        correlation_id: input.correlation_id ?? null,
      }));
      recordAuditStep(audit);
    });
    return new WorkflowResponse(result);
  }
);

export const releaseManufacturingOrderWorkflow = createWorkflow(
  "mfg-release-mo-workflow",
  function (input: ReleaseMoInput) {
    return new WorkflowResponse(releaseMoStep(input));
  }
);

export const holdManufacturingOrderWorkflow = createWorkflow(
  "mfg-hold-mo-workflow",
  function (input: MoActor & { reason: string }) {
    const result = holdMoStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: "manufacturing.mo.hold",
      resource_type: "manufacturing_order",
      resource_id: input.mo_id,
      reason: input.reason,
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const resumeManufacturingOrderWorkflow = createWorkflow(
  "mfg-resume-mo-workflow",
  function (input: MoActor) {
    return new WorkflowResponse(resumeMoStep(input));
  }
);

/**
 * Validates and cancels first (state, stranded material, open WIP). Only a
 * cancelled MO has its reservations released, so a refused cancel never
 * touches stock. Repeating the call finishes any unfinished release.
 */
export const cancelManufacturingOrderWorkflow = createWorkflow(
  "mfg-cancel-mo-workflow",
  function (input: MoActor & { reason: string }) {
    const result = cancelMoStep(input);
    const releaseInput = transform({ input, result }, ({ input }) => input);
    releaseMoReservationsStep(releaseInput);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: "manufacturing.mo.cancel",
      resource_type: "manufacturing_order",
      resource_id: input.mo_id,
      reason: input.reason,
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

/**
 * Closing a partially completed order below plan (FR-MFG-014). Reservations
 * that were never issued are released so no material stays blocked.
 */
export const shortCloseManufacturingOrderWorkflow = createWorkflow(
  "mfg-short-close-mo-workflow",
  function (input: MoActor & { reason: string }) {
    const result = shortCloseMoStep(input);
    const releaseInput = transform({ input, result }, ({ input }) => input);
    releaseMoReservationsStep(releaseInput);
    const audit = transform({ input, result }, ({ input, result }) => ({
      actor_id: input.actor_id,
      action: "manufacturing.mo.short_close",
      resource_type: "manufacturing_order",
      resource_id: input.mo_id,
      reason: input.reason,
      after: result as unknown as Record<string, unknown>,
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

type IssueRequest = MoActor & {
  material_id: string;
  qty: number;
  idempotency_key: string;
};
export const issueMaterialToMoWorkflow = createWorkflow(
  "mfg-issue-material-workflow",
  function (input: IssueRequest) {
    issueToMoStep(input);
    return new WorkflowResponse(recordMoIssueStep(input));
  }
);

export const createCutPlanWorkflow = createWorkflow(
  "mfg-create-cut-plan-workflow",
  function (input: CutPlanInput) {
    return new WorkflowResponse(createCutPlanStep(input));
  }
);

type CutRequest = Omit<CompleteCutInput, "settlement"> & {
  fabric_material_id: string;
};
export const completeCutWorkflow = createWorkflow(
  "mfg-complete-cut-workflow",
  function (input: CutRequest) {
    const result = completeCutStep(input);
    when(input, (data) => Boolean(data.overproduction_approved)).then(() => {
      const audit = transform({ input }, ({ input }) => ({
        actor_id: input.actor_id,
        action: "manufacturing.overproduction.approve",
        resource_type: "production_batch",
        resource_id: input.batch_id,
        reason: "overproduction approved",
        after: { bundles: input.bundles },
        correlation_id: input.correlation_id ?? null,
      }));
      recordAuditStep(audit);
    });
    return new WorkflowResponse(result);
  }
);

export const executeOperationWorkflow = createWorkflow(
  "mfg-execute-operation-workflow",
  function (input: ExecuteOperationInput) {
    return new WorkflowResponse(executeOperationStep(input));
  }
);

/** Quality records the decision; Manufacturing applies it (only PASS progresses). */
export const inspectBundleWorkflow = createWorkflow(
  "mfg-inspect-bundle-workflow",
  function (
    input: Omit<RecordInspectionInput, "target_type" | "target_id"> & {
      bundle_id: string;
      mo_id: string;
    }
  ) {
    const quality = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      correlation_id: input.correlation_id ?? null,
      idempotency_key: `${input.idempotency_key}:quality`,
      target_type: "BUNDLE" as const,
      target_id: input.bundle_id,
      reference_type: "MO",
      reference_id: input.mo_id,
      pass_qty: input.pass_qty,
      rework_qty: input.rework_qty ?? 0,
      reject_qty: input.reject_qty ?? 0,
      hold_qty: input.hold_qty ?? 0,
      defects: input.defects ?? null,
      notes: input.notes ?? null,
    }));
    const inspection = recordInspectionStep(quality);
    const apply = transform(
      { input, inspection },
      ({ input, inspection }): ApplyInspectionInput => ({
        actor_id: input.actor_id,
        correlation_id: input.correlation_id ?? null,
        idempotency_key: `${input.idempotency_key}:apply`,
        bundle_id: input.bundle_id,
        inspection_id: inspection.id,
        pass_qty: inspection.pass_qty,
        rework_qty: inspection.rework_qty,
        reject_qty: inspection.reject_qty,
        hold_qty: inspection.hold_qty,
      })
    );
    const applied = applyInspectionStep(apply);
    return new WorkflowResponse(
      transform({ inspection, applied }, (d) => ({
        inspection: d.inspection,
        ...d.applied,
      }))
    );
  }
);

export const returnReworkWorkflow = createWorkflow(
  "mfg-return-rework-workflow",
  function (input: ReturnReworkInput) {
    return new WorkflowResponse(returnReworkStep(input));
  }
);

export const packBundleOnlyWorkflow = createWorkflow(
  "mfg-pack-bundle-workflow",
  function (input: PackBundleInput) {
    return new WorkflowResponse(packBundleStep(input));
  }
);

export const runMrpWorkflow = createWorkflow(
  "mfg-run-mrp-workflow",
  function (input: Parameters<typeof runMrpStep>[0]) {
    return new WorkflowResponse(runMrpStep(input));
  }
);

export const decideMrpSuggestionWorkflow = createWorkflow(
  "mfg-decide-mrp-suggestion-workflow",
  function (input: Parameters<typeof decideSuggestionStep>[0]) {
    return new WorkflowResponse(decideSuggestionStep(input));
  }
);
