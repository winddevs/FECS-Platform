import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { isEnabled } from "../lib/feature-flags";
import {
  PAYMENT_RETRY_SECONDS,
  isPaymentConfirmed,
  paymentGate,
  processProductionRequest,
} from "../lib/mto/process-request";
import { MANUFACTURING_MODULE } from "../modules/manufacturing";
import type ManufacturingModuleService from "../modules/manufacturing/service";

const BATCH_SIZE = 20;

/**
 * MTO pipeline worker. Payment gate -> MO -> material reservation -> release.
 * Requests waiting for material or payment are retried with backoff; the
 * queue is shared safely across workers (FOR UPDATE SKIP LOCKED).
 */
export default async function processProductionRequests(
  container: MedusaContainer
): Promise<void> {
  if (!isEnabled("MTO_ENABLED") || !isEnabled("MANUFACTURING_ENABLED")) {
    return;
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const mfg =
    container.resolve<ManufacturingModuleService>(MANUFACTURING_MODULE);
  const gate = paymentGate();

  const due = await mfg.claimDueProductionRequests(BATCH_SIZE);
  for (const request of due) {
    try {
      if (!request.payment_confirmed) {
        if (!(await isPaymentConfirmed(container, request.order_id, gate))) {
          await mfg.updateProductionRequest({
            id: request.id,
            retry_in_seconds: PAYMENT_RETRY_SECONDS,
          });
          continue;
        }
        await mfg.updateProductionRequest({
          id: request.id,
          payment_confirmed: true,
        });
      }
      const result = await processProductionRequest(container, {
        ...request,
        payment_confirmed: true,
      });
      if (result.outcome === "FAILED") {
        logger.error(`[mto] request ${request.id} FAILED: ${result.error}`);
      }
    } catch (error) {
      logger.error(
        `[mto] request ${request.id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const config = {
  name: "process-production-requests",
  schedule: "*/30 * * * * *",
};
