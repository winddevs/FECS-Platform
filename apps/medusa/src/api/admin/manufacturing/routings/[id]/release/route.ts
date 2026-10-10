import { releaseRoutingWorkflow } from "../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(releaseRoutingWorkflow, {
  extra: (req) => ({ id: req.params.id }),
  withoutIdempotencyKey: true,
});
