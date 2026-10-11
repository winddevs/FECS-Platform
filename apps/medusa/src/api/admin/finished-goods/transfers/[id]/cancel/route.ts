import { cancelFgTransferWorkflow } from "../../../../../../workflows/finished-goods";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(cancelFgTransferWorkflow, {
  extra: (req) => ({ transfer_id: req.params.id }),
});
