import { shipExchangeReplacementWorkflow } from "../../../../../workflows/returns";
import { commandRoute } from "../../../../fashion/command-route";

export const POST = commandRoute(shipExchangeReplacementWorkflow, {
  extra: (req) => ({ return_id: req.params.id }),
  withoutIdempotencyKey: true,
});
