import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { setSkuPlanningParamWorkflow } from "../../../../../workflows/manufacturing";
import { listHandler } from "../../../../fashion/list-handler";

export const GET = listHandler("sku_planning_param", "sku_planning_params", [
  "sku",
] as const);

/** Reorder rule of a finished SKU; drives MRP PRODUCE suggestions. */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { result } = await setSkuPlanningParamWorkflow(req.scope).run({
    input: req.validatedBody as never,
  });
  res.status(200).json({ sku_planning_param: result });
}
