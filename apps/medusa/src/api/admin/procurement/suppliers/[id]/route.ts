import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { updateSupplierWorkflow } from "../../../../../workflows/fashion-master-data";
import { retrieveHandler } from "../../../../fashion/list-handler";
import type { UpdateSupplierBody } from "../../../../fashion/schemas";

export const GET = retrieveHandler("supplier", "supplier");

export async function POST(
  req: AuthenticatedMedusaRequest<UpdateSupplierBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await updateSupplierWorkflow(req.scope).run({
    input: { ...req.validatedBody, id: req.params.id },
  });
  res.status(200).json({ supplier: result });
}
