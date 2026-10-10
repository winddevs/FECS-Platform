import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

import { INTEGRATION_MODULE } from "../../modules/integration";
import type IntegrationModuleService from "../../modules/integration/service";
import type { RecordAuditInput } from "../../modules/integration/service";

/**
 * Appends to the immutable audit trail (FR-ADM-003). Audit rows are never
 * removed, so this step has no compensation.
 */
export const recordAuditStep = createStep(
  "fashion-record-audit",
  async (input: RecordAuditInput, { container }) => {
    const integration =
      container.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
    const audit = await integration.recordAudit(input);
    return new StepResponse({ id: audit.id });
  }
);
