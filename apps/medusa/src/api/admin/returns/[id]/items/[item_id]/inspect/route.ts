import { inspectReturnItemWorkflow } from "../../../../../../../workflows/returns";
import { commandRoute } from "../../../../../../fashion/command-route";

export const POST = commandRoute(inspectReturnItemWorkflow, {
  status: 201,
  extra: (req) => ({ return_item_id: req.params.item_id }),
});
