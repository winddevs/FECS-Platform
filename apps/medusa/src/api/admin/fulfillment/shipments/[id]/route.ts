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
    entity: "carrier_shipment",
    fields: ["*"],
    filters: { id: req.params.id },
  });
  if (!data[0]) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Shipment not found",
    });
    return;
  }
  const { data: events } = await query.graph({
    entity: "tracking_event",
    fields: ["*"],
    filters: { shipment_id: req.params.id },
    pagination: { order: { occurred_at: "ASC" } },
  });
  res.json({ shipment: data[0], events });
}
