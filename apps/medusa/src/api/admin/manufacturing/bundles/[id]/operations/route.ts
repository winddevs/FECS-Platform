import { executeOperationWorkflow } from "../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(executeOperationWorkflow, {
  status: 201,
  extra: (req) => ({ bundle_id: req.params.id }),
});
