import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { productionStatusForOrder } from "../../../../../../lib/mto/production-status";
import { FINISHED_GOODS_MODULE } from "../../../../../../modules/finishedGoods";
import type FinishedGoodsModuleService from "../../../../../../modules/finishedGoods/service";
import { MANUFACTURING_MODULE } from "../../../../../../modules/manufacturing";
import type ManufacturingModuleService from "../../../../../../modules/manufacturing/service";

/** Simplified production status for a made-to-order order (never internal operations). */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { id: req.params.id, customer_id: req.auth_context.actor_id },
  });
  if (!data[0]) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Order not found",
    });
    return;
  }
  const status = await productionStatusForOrder(
    {
      mfg: req.scope.resolve<ManufacturingModuleService>(MANUFACTURING_MODULE),
      fg: req.scope.resolve<FinishedGoodsModuleService>(FINISHED_GOODS_MODULE),
    },
    req.params.id
  );
  res.json({
    production_status: status?.status ?? null,
    made_to_order: status !== null,
  });
}
