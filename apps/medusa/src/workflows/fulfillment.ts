import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { recordAuditStep } from "./steps/fashion-audit";
import {
  cancelCarrierShipmentStep,
  createCarrierShipmentStep,
  ingestCarrierEventsStep,
} from "./steps/fulfillment";

/** Shipment creation is audited with its outcome (FR-ADM-003, NFR-AUD-002). */
export const createCarrierShipmentWorkflow = createWorkflow(
  "fulfillment-create-carrier-shipment-workflow",
  function (input: Parameters<typeof createCarrierShipmentStep>[0]) {
    const result = createCarrierShipmentStep(input);
    const audit = transform({ input, result }, ({ input, result }) => ({
      actor_id: input.actor_id,
      action: "fulfillment.shipment.create",
      resource_type: "carrier_shipment",
      resource_id: result.id,
      reason: null,
      before: null,
      after: {
        carrier_code: input.carrier_code,
        create_state: result.create_state,
        tracking_number: result.tracking_number ?? null,
        order_id: input.order_id,
      },
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const cancelCarrierShipmentWorkflow = createWorkflow(
  "fulfillment-cancel-carrier-shipment-workflow",
  function (input: Parameters<typeof cancelCarrierShipmentStep>[0]) {
    const result = cancelCarrierShipmentStep(input);
    const audit = transform({ input, result }, ({ input, result }) => ({
      actor_id: input.actor_id,
      action: "fulfillment.shipment.cancel",
      resource_type: "carrier_shipment",
      resource_id: input.shipment_id,
      reason: null,
      before: null,
      after: result as unknown as Record<string, unknown>,
      correlation_id: input.correlation_id ?? null,
    }));
    recordAuditStep(audit);
    return new WorkflowResponse(result);
  }
);

export const ingestCarrierEventsWorkflow = createWorkflow(
  "fulfillment-ingest-carrier-events-workflow",
  function (input: Parameters<typeof ingestCarrierEventsStep>[0]) {
    return new WorkflowResponse(ingestCarrierEventsStep(input));
  }
);
