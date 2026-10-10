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
    entity: "bom",
    fields: ["*"],
    filters: { id: req.params.id },
  });
  if (!data[0]) {
    res
      .status(404)
      .json({ code: "NOT_FOUND", type: "not_found", message: "BOM not found" });
    return;
  }
  const { data: lines } = await query.graph({
    entity: "bom_line",
    fields: ["*"],
    filters: { bom_id: req.params.id },
  });
  res.json({ bom: data[0], lines });
}
