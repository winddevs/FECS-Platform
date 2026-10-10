import { cancelTransferWorkflow } from "../../../../../../workflows/material-inventory";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(cancelTransferWorkflow, {
  extra: (req) => ({ transfer_id: req.params.id }),
});
