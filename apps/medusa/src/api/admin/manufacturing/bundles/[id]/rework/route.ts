import { returnReworkWorkflow } from "../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(returnReworkWorkflow, {
  status: 201,
  extra: (req) => ({ bundle_id: req.params.id }),
});
