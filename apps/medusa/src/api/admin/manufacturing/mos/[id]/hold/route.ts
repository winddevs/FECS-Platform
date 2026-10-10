import { holdManufacturingOrderWorkflow } from "../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(holdManufacturingOrderWorkflow, {
  extra: (req) => ({ mo_id: req.params.id }),
  withoutIdempotencyKey: true,
});
