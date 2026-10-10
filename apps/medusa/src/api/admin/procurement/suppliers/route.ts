import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { createSupplierWorkflow } from "../../../../workflows/fashion-master-data";
import { listHandler } from "../../../fashion/list-handler";
import type { CreateSupplierBody } from "../../../fashion/schemas";

export const GET = listHandler("supplier", "suppliers", [
  "status",
  "code",
] as const);

export async function POST(
  req: AuthenticatedMedusaRequest<CreateSupplierBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await createSupplierWorkflow(req.scope).run({
    input: req.validatedBody,
  });
  res.status(201).json({ supplier: result });
}
