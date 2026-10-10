import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { FINISHED_GOODS_MODULE } from "../../../../../../modules/finishedGoods";
import type FinishedGoodsModuleService from "../../../../../../modules/finishedGoods/service";

/** FG batch -> MO -> packing, plus every order/shipment it fed. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const fg = req.scope.resolve<FinishedGoodsModuleService>(
    FINISHED_GOODS_MODULE
  );
  const trace = await fg.traceBatch(req.params.id);
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: shipments } = await query.graph({
    entity: "fg_shipment_line",
    fields: ["*"],
    filters: { batch_id: req.params.id },
  });
  res.json({ ...trace, shipments });
}
