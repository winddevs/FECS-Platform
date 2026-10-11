import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { reconcileFgWithMedusa } from "../lib/reconciliation/fg-medusa";
import { FINISHED_GOODS_MODULE } from "../modules/finishedGoods";
import type FinishedGoodsModuleService from "../modules/finishedGoods/service";
import { INTEGRATION_MODULE } from "../modules/integration";
import type IntegrationModuleService from "../modules/integration/service";

/** FG ledger vs balances, and the sellable projection vs Medusa inventory. */
export default async function reconcileFinishedGoods(
  container: MedusaContainer
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const ledger = await container
    .resolve<FinishedGoodsModuleService>(FINISHED_GOODS_MODULE)
    .reconcile();
  for (const issue of ledger.issues) {
    logger.error(
      `[reconcile:finishedGoods] LEDGER_VS_BALANCE ${JSON.stringify(issue)}`
    );
  }
  const projection = await reconcileFgWithMedusa(container);
  const problems = projection.issues.filter((i) => i.check !== "PENDING_SYNC");
  const integration =
    container.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  await integration.setGauge(
    "reconcile.finished_goods.issues",
    ledger.issues.length + problems.length
  );
  await integration.setGauge(
    "reconcile.raw_material_leaks",
    problems.filter((i) => i.check === "RAW_MATERIAL_LEAK").length
  );
  for (const issue of problems) {
    logger.error(
      `[reconcile:finishedGoods] ${issue.check} sku=${issue.sku} ${JSON.stringify(issue.detail)}`
    );
  }
}

export const config = {
  name: "reconcile-finished-goods",
  schedule: "*/5 * * * *",
};
