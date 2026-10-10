import { onFulfillmentCreatedWorkflow } from "../../../../workflows/fulfillment-created";
import { commandRoute } from "../../../fashion/command-route";
import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("carrier_shipment", "shipments", [
  "order_id",
  "status",
  "carrier_code",
  "create_state",
] as const);

/** Manual create / retry for one Medusa fulfillment (idempotent per fulfillment). */
export const POST = commandRoute(onFulfillmentCreatedWorkflow, {
  status: 201,
  withoutIdempotencyKey: true,
  extra: (req) => ({
    order_id: (req.validatedBody as { order_id: string }).order_id,
    fulfillment_id: (req.validatedBody as { fulfillment_id: string })
      .fulfillment_id,
    ship_finished_goods: false,
    create_carrier_shipment: true,
  }),
});
