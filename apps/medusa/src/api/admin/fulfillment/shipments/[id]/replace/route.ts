import { replaceCarrierShipmentWorkflow } from "../../../../../../workflows/fulfillment";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(replaceCarrierShipmentWorkflow, {
  extra: (req) => ({ shipment_id: req.params.id }),
  withoutIdempotencyKey: true,
  status: 201,
});
