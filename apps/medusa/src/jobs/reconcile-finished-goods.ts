import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { reconcileFgWithMedusa } from "../lib/reconciliation/fg-medusa";
import { FINISHED_GOODS_MODULE } from "../modules/finishedGoods";
import type FinishedGoodsModuleService from "../modules/finishedGoods/service";

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
  for (const issue of projection.issues.filter(
    (i) => i.check !== "PENDING_SYNC"
  )) {
    logger.error(
      `[reconcile:finishedGoods] ${issue.check} sku=${issue.sku} ${JSON.stringify(issue.detail)}`
    );
  }
}

export const config = {
  name: "reconcile-finished-goods",
  schedule: "*/5 * * * *",
};
