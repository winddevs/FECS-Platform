import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import type {
  AdjustStockInput,
  CycleCountInput,
  IssueMaterialInput,
  QcDecisionInput,
  ReceiveMaterialInput,
  ReleaseReservationInput,
  ReserveMaterialInput,
  ReturnMaterialInput,
  ScrapMaterialInput,
  TransferStockInput,
} from "../modules/materialInventory/types";
import { recordAuditStep } from "./steps/fashion-audit";
import {
  adjustStockStep,
  decideQcHoldStep,
  issueMaterialStep,
  receiveMaterialStep,
  recordCycleCountStep,
  releaseReservationStep,
  reserveMaterialStep,
  returnMaterialStep,
  scrapMaterialStep,
  transferStockStep,
} from "./steps/material-inventory";

export const receiveMaterialWorkflow = createWorkflow(
  "material-inventory-receive-workflow",
  function (input: ReceiveMaterialInput) {
    return new WorkflowResponse(receiveMaterialStep(input));
  }
);

export const reserveMaterialWorkflow = createWorkflow(
  "material-inventory-reserve-workflow",
  function (input: ReserveMaterialInput) {
    const result = reserveMaterialStep(input);

    // Exceeding the dye-lot policy is a planner override and must be auditable.
    when(input, (data) => Boolean(data.planner_approved)).then(() => {
      const audit = transform({ input, result }, ({ input, result }) => ({
        actor_id: input.actor_id,
        action: "inventory.reserve.planner_override",
        resource_type: "material_reservation",
        resource_id: result.reservation.id,
        reason: "dye-lot policy override",
        after: {
          material_id: input.material_id,
          qty: input.qty,
          dye_lots: result.reservation.dye_lots,
        },
        correlation_id: input.correlation_id ?? null,
      }));
      recordAuditStep(audit);
    });

    return new WorkflowResponse(result);
  }
);

export const releaseReservationWorkflow = createWorkflow(
  "material-inventory-release-reservation-workflow",
  function (input: ReleaseReservationInput) {
    return new WorkflowResponse(releaseReservationStep(input));
  }
);

export const issueMaterialWorkflow = createWorkflow(
  "material-inventory-issue-workflow",
  function (input: IssueMaterialInput) {
    return new WorkflowResponse(issueMaterialStep(input));
  }
);

export const returnMaterialWorkflow = createWorkflow(
  "material-inventory-return-workflow",
  function (input: ReturnMaterialInput) {
    return new WorkflowResponse(returnMaterialStep(input));
  }
);

export const decideQcHoldWorkflow = createWorkflow(
  "material-inventory-qc-decision-workflow",
  function (input: QcDecisionInput) {
    const result = decideQcHoldStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: `inventory.qc.${input.decision.toLowerCase()}`,
      resource_type: "material_balance",
      resource_id: input.balance_id,
      reason: input.reason ?? null,
      after: { qty: input.qty, decision: input.decision },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const scrapMaterialWorkflow = createWorkflow(
  "material-inventory-scrap-workflow",
  function (input: ScrapMaterialInput) {
    const result = scrapMaterialStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: "inventory.scrap",
      resource_type: "material_balance",
      resource_id: input.balance_id,
      reason: input.reason,
      after: { qty: input.qty, source_bucket: input.source_bucket },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const adjustStockWorkflow = createWorkflow(
  "material-inventory-adjust-workflow",
  function (input: AdjustStockInput) {
    const result = adjustStockStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: "inventory.adjust",
      resource_type: "material_balance",
      resource_id: input.balance_id,
      reason: input.reason,
      after: { direction: input.direction, qty: input.qty },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const cycleCountWorkflow = createWorkflow(
  "material-inventory-cycle-count-workflow",
  function (input: CycleCountInput) {
    const result = recordCycleCountStep(input);
    const audit = transform({ input }, ({ input }) => ({
      actor_id: input.actor_id,
      action: "inventory.cycle_count",
      resource_type: "material_balance",
      resource_id: input.balance_id,
      reason: input.reason,
      after: {
        counted_qty: input.counted_qty,
        expected_version: input.expected_version,
      },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const transferStockWorkflow = createWorkflow(
  "material-inventory-transfer-workflow",
  function (input: TransferStockInput) {
    return new WorkflowResponse(transferStockStep(input));
  }
);
