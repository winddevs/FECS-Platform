import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "purchase_order",
    fields: ["*"],
    filters: { id: req.params.id },
  });
  if (data.length === 0) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Purchase order not found",
    });
    return;
  }
  const { data: lines } = await query.graph({
    entity: "purchase_order_line",
    fields: ["*"],
    filters: { purchase_order_id: req.params.id },
  });
  res.json({ purchase_order: data[0], lines });
}
