import { releaseBomWorkflow } from "../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(releaseBomWorkflow, {
  extra: (req) => ({ id: req.params.id }),
  withoutIdempotencyKey: true,
});
