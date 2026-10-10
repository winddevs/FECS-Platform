import { authorizeReturnWorkflow } from "../../../../../workflows/returns";
import { commandRoute } from "../../../../fashion/command-route";

export const POST = commandRoute(authorizeReturnWorkflow, {
  extra: (req) => ({ return_id: req.params.id }),
});
