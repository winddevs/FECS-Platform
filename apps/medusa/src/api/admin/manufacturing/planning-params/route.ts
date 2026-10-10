import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { setPlanningParamWorkflow } from "../../../../workflows/manufacturing";

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { result } = await setPlanningParamWorkflow(req.scope).run({
    input: req.validatedBody as never,
  });
  res.status(200).json({ planning_param: result });
}
