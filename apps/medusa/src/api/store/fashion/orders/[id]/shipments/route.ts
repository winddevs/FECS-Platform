import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { FASHION_FULFILLMENT_MODULE } from "../../../../../../modules/fulfillment";
import type FulfillmentModuleService from "../../../../../../modules/fulfillment/service";

/** Local synchronised shipment state (never calls the carrier). */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: ["id"],
    filters: { id: req.params.id, customer_id: req.auth_context.actor_id },
  });
  if (!data[0]) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Order not found",
    });
    return;
  }
  const shipments = await req.scope
    .resolve<FulfillmentModuleService>(FASHION_FULFILLMENT_MODULE)
    .shipmentsForOrder(req.params.id);
  res.json({
    shipments: shipments
      .filter((s) => !s.return_id)
      .map((s) => ({
        tracking_number: s.tracking_number,
        carrier_code: s.carrier_code,
        status: s.status,
        last_event_at: s.last_event_at,
        delivered_at: s.delivered_at,
      })),
  });
}
