import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { updateMaterialWorkflow } from "../../../../../workflows/fashion-master-data";
import { retrieveHandler } from "../../../../fashion/list-handler";
import type { UpdateMaterialBody } from "../../../../fashion/schemas";

export const GET = retrieveHandler("material", "material");

export async function POST(
  req: AuthenticatedMedusaRequest<UpdateMaterialBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await updateMaterialWorkflow(req.scope).run({
    input: { ...req.validatedBody, id: req.params.id },
  });
  res.status(200).json({ material: result });
}
