import { receiveTransferWorkflow } from "../../../../../../workflows/material-inventory";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(receiveTransferWorkflow, {
  extra: (req) => ({ transfer_id: req.params.id }),
});
