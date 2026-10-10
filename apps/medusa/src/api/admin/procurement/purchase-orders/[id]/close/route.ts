import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { commandOf } from "../../../../../../lib/http/request-context";
import { transitionPurchaseOrderWorkflow } from "../../../../../../workflows/procurement";
import type { PurchaseOrderActionBody } from "../../../../../fashion/schemas";

export async function POST(
  req: AuthenticatedMedusaRequest<PurchaseOrderActionBody>,
  res: MedusaResponse
): Promise<void> {
  const { actor_id, correlation_id } = commandOf(req);
  const { result } = await transitionPurchaseOrderWorkflow(req.scope).run({
    input: {
      actor_id,
      correlation_id,
      purchase_order_id: req.params.id,
      action: "close",
      reason: req.validatedBody.reason,
    },
  });
  res.status(200).json({ purchase_order: result });
}
