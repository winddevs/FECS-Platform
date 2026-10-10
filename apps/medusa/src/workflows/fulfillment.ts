import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import {
  cancelCarrierShipmentStep,
  createCarrierShipmentStep,
  ingestCarrierEventsStep,
} from "./steps/fulfillment";

export const createCarrierShipmentWorkflow = createWorkflow(
  "fulfillment-create-carrier-shipment-workflow",
  function (input: Parameters<typeof createCarrierShipmentStep>[0]) {
    return new WorkflowResponse(createCarrierShipmentStep(input));
  }
);

export const cancelCarrierShipmentWorkflow = createWorkflow(
  "fulfillment-cancel-carrier-shipment-workflow",
  function (input: Parameters<typeof cancelCarrierShipmentStep>[0]) {
    return new WorkflowResponse(cancelCarrierShipmentStep(input));
  }
);

export const ingestCarrierEventsWorkflow = createWorkflow(
  "fulfillment-ingest-carrier-events-workflow",
  function (input: Parameters<typeof ingestCarrierEventsStep>[0]) {
    return new WorkflowResponse(ingestCarrierEventsStep(input));
  }
);
