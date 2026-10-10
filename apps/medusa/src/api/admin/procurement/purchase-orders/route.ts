import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../lib/http/request-context";
import { createPurchaseOrderWorkflow } from "../../../../workflows/procurement";
import { listHandler } from "../../../fashion/list-handler";
import type { CreatePurchaseOrderBody } from "../../../fashion/schemas";

export const GET = listHandler("purchase_order", "purchase_orders", [
  "supplier_id",
  "status",
  "po_number",
] as const);

export async function POST(
  req: AuthenticatedMedusaRequest<CreatePurchaseOrderBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await createPurchaseOrderWorkflow(req.scope).run({
    input: { ...req.validatedBody, ...commandOf(req) },
  });
  res.status(201).json(result);
}
