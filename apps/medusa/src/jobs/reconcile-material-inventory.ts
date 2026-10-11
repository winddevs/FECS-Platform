import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { INTEGRATION_MODULE } from "../modules/integration";
import type IntegrationModuleService from "../modules/integration/service";
import { MATERIAL_INVENTORY_MODULE } from "../modules/materialInventory";
import type MaterialInventoryModuleService from "../modules/materialInventory/service";

/**
 * Detects ledger/balance/reservation drift (TDD section 47). Logs one
 * structured error per issue so alerting can fire on "stock mismatch".
 * It only reads: repairs are always a deliberate, audited action.
 */
export default async function reconcileMaterialInventory(
  container: MedusaContainer
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const inventory = container.resolve<MaterialInventoryModuleService>(
    MATERIAL_INVENTORY_MODULE
  );

  const { ok, issues } = await inventory.reconcile();
  // Published for the metrics endpoint, so a mismatch alerts instead of only logging.
  await container
    .resolve<IntegrationModuleService>(INTEGRATION_MODULE)
    .setGauge("reconcile.material_inventory.issues", issues.length);
  if (ok) {
    return;
  }
  for (const issue of issues) {
    logger.error(
      `[reconcile:materialInventory] ${issue.check} balance=${issue.balance_id ?? "n/a"} ${JSON.stringify(issue.detail)}`
    );
  }
}

export const config = {
  name: "reconcile-material-inventory",
  schedule: "*/15 * * * *",
};
