import { closeReturnWorkflow } from "../../../../../workflows/returns";
import { commandRoute } from "../../../../fashion/command-route";

export const POST = commandRoute(closeReturnWorkflow, {
  extra: (req) => ({ return_id: req.params.id }),
  withoutIdempotencyKey: true,
});
