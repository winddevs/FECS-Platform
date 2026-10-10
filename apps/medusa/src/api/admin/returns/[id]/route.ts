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
    entity: "return_authorization",
    fields: ["*"],
    filters: { id: req.params.id },
  });
  if (!data[0]) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Return not found",
    });
    return;
  }
  const { data: items } = await query.graph({
    entity: "rma_item",
    fields: ["*"],
    filters: { return_id: req.params.id },
  });
  res.json({ return: data[0], items });
}
