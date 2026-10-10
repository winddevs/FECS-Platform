import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/** MO with its frozen versions, material requirements, batches and bundles. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "manufacturing_order",
    fields: ["*"],
    filters: { id: req.params.id },
  });
  if (!data[0]) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Manufacturing order not found",
    });
    return;
  }
  const filters = { mo_id: req.params.id };
  const [requirements, batches, bundles] = await Promise.all([
    query.graph({ entity: "mo_material_requirement", fields: ["*"], filters }),
    query.graph({ entity: "production_batch", fields: ["*"], filters }),
    query.graph({ entity: "bundle", fields: ["*"], filters }),
  ]);
  res.json({
    manufacturing_order: data[0],
    requirements: requirements.data,
    batches: batches.data,
    bundles: bundles.data,
  });
}
