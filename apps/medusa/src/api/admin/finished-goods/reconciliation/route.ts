import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { reconcileFgWithMedusa } from "../../../../lib/reconciliation/fg-medusa";
import { FINISHED_GOODS_MODULE } from "../../../../modules/finishedGoods";
import type FinishedGoodsModuleService from "../../../../modules/finishedGoods/service";

/** FG ledger vs balances, and projection vs Medusa inventory. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const ledger = await req.scope
    .resolve<FinishedGoodsModuleService>(FINISHED_GOODS_MODULE)
    .reconcile();
  const projection = await reconcileFgWithMedusa(req.scope);
  const ok = ledger.ok && projection.ok;
  res.status(ok ? 200 : 409).json({ ok, ledger, projection });
}
