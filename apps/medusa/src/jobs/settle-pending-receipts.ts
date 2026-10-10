import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { PROCUREMENT_MODULE } from "../modules/procurement";
import type ProcurementModuleService from "../modules/procurement/service";
import { settlePendingReceipt } from "../workflows/steps/procurement";

const BATCH_SIZE = 25;
/** Longer than any healthy receive workflow, so a live one is never touched. */
const MIN_AGE_SECONDS = 15 * 60;

/**
 * Goods receipts stuck in PENDING_INVENTORY (the workflow died between
 * creating the receipt and posting its stock) are settled from the ledger:
 * rolled forward when stock was posted, voided when it was not.
 */
export default async function settlePendingReceipts(
  container: MedusaContainer
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const procurement =
    container.resolve<ProcurementModuleService>(PROCUREMENT_MODULE);
  const stale = await procurement.listStalePendingReceipts({
    older_than_seconds: MIN_AGE_SECONDS,
    limit: BATCH_SIZE,
  });
  for (const receipt of stale) {
    try {
      const outcome = await settlePendingReceipt(container, receipt.id);
      logger.warn(
        `Stale goods receipt ${receipt.receipt_no} settled: ${outcome}`
      );
    } catch (error) {
      logger.error(
        `Could not settle goods receipt ${receipt.receipt_no}: ${(error as Error).message}`
      );
    }
  }
}

export const config = {
  name: "settle-pending-receipts",
  schedule: "*/10 * * * *",
};
