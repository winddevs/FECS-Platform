import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

import { retryProductionRequestStep } from "./steps/mto";

export const retryProductionRequestWorkflow = createWorkflow(
  "mto-retry-production-request-workflow",
  function (input: Parameters<typeof retryProductionRequestStep>[0]) {
    return new WorkflowResponse(retryProductionRequestStep(input));
  }
);
