import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { commandOf } from "../../../../../../lib/http/request-context";
import { receiveGoodsWorkflow } from "../../../../../../workflows/procurement";
import type { PostGoodsReceiptBody } from "../../../../../fashion/schemas";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "goods_receipt",
    fields: ["*"],
    filters: { purchase_order_id: req.params.id },
  });
  res.json({ goods_receipts: data });
}

export async function POST(
  req: AuthenticatedMedusaRequest<PostGoodsReceiptBody>,
  res: MedusaResponse
): Promise<void> {
  const { result } = await receiveGoodsWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      ...commandOf(req),
      purchase_order_id: req.params.id,
    },
  });
  res.status(201).json(result);
}
