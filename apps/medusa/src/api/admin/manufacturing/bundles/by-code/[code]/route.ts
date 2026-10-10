import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/** Barcode scan: bundle + its MO + the operation it is waiting at. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: bundles } = await query.graph({
    entity: "bundle",
    fields: ["*"],
    filters: { bundle_code: req.params.code },
  });
  const bundle = bundles[0];
  if (!bundle) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Bundle not found",
    });
    return;
  }
  const { data: mos } = await query.graph({
    entity: "manufacturing_order",
    fields: ["id", "mo_number", "status", "product_sku", "routing_id"],
    filters: { id: bundle.mo_id },
  });
  const { data: operations } = await query.graph({
    entity: "routing_operation",
    fields: ["*"],
    filters: { routing_id: mos[0]?.routing_id },
    pagination: { order: { seq: "ASC" } },
  });
  res.json({
    bundle,
    manufacturing_order: mos[0] ?? null,
    current_operation:
      operations.find((o) => o.seq === bundle.current_seq) ?? null,
  });
}
