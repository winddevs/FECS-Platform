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
    entity: "routing",
    fields: ["*"],
    filters: { id: req.params.id },
  });
  if (!data[0]) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Routing not found",
    });
    return;
  }
  const { data: operations } = await query.graph({
    entity: "routing_operation",
    fields: ["*"],
    filters: { routing_id: req.params.id },
    pagination: { order: { seq: "ASC" } },
  });
  res.json({ routing: data[0], operations });
}
