import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { createMaterialWorkflow } from "../../../../workflows/fashion-master-data";
import { listHandler } from "../../../fashion/list-handler";
import type { CreateMaterialBody } from "../../../fashion/schemas";

export const GET = listHandler("material", "materials", [
  "code",
  "material_type",
] as const);

export async function POST(
  req: AuthenticatedMedusaRequest<CreateMaterialBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await createMaterialWorkflow(req.scope).run({
    input: req.validatedBody,
  });
  res.status(201).json({ material: result });
}
