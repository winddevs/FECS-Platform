import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { updateMaterialLocationWorkflow } from "../../../../../workflows/fashion-master-data";
import { retrieveHandler } from "../../../../fashion/list-handler";
import type { UpdateLocationBody } from "../../../../fashion/schemas";

export const GET = retrieveHandler("material_location", "location");

export async function POST(
  req: AuthenticatedMedusaRequest<UpdateLocationBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await updateMaterialLocationWorkflow(req.scope).run({
    input: { ...req.validatedBody, id: req.params.id },
  });
  res.status(200).json({ location: result });
}
