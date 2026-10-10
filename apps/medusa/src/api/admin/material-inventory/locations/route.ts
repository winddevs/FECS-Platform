import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { createMaterialLocationWorkflow } from "../../../../workflows/fashion-master-data";
import { listHandler } from "../../../fashion/list-handler";
import type { CreateLocationBody } from "../../../fashion/schemas";

export const GET = listHandler("material_location", "locations", [
  "warehouse_code",
  "kind",
] as const);

export async function POST(
  req: AuthenticatedMedusaRequest<CreateLocationBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await createMaterialLocationWorkflow(req.scope).run({
    input: req.validatedBody,
  });
  res.status(201).json({ location: result });
}
