import { resolveShipmentExceptionWorkflow } from "../../../../../../workflows/fulfillment";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(resolveShipmentExceptionWorkflow, {
  extra: (req) => ({ exception_id: req.params.id }),
  withoutIdempotencyKey: true,
});
