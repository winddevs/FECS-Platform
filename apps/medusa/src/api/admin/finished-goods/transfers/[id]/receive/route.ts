import { receiveFgTransferWorkflow } from "../../../../../../workflows/finished-goods";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(receiveFgTransferWorkflow, {
  extra: (req) => ({ transfer_id: req.params.id }),
});
