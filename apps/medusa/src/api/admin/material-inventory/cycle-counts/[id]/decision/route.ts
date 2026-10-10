import { decideCycleCountWorkflow } from "../../../../../../workflows/material-inventory";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(decideCycleCountWorkflow, {
  extra: (req) => ({ count_id: req.params.id }),
});
