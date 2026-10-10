import { setHandoffWorkflow } from "../../../../../../workflows/social";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(setHandoffWorkflow, {
  extra: (req) => ({ identity_id: req.params.id }),
  withoutIdempotencyKey: true,
});
