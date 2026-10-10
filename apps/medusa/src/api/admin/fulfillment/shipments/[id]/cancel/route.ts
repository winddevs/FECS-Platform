import { cancelCarrierShipmentWorkflow } from "../../../../../../workflows/fulfillment";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(cancelCarrierShipmentWorkflow, {
  extra: (req) => ({ shipment_id: req.params.id }),
  withoutIdempotencyKey: true,
});
