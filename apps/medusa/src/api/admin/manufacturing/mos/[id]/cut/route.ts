import { completeCutWorkflow } from "../../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(completeCutWorkflow, {
  status: 201,
  extra: (req) => ({ mo_id: req.params.id }),
});
