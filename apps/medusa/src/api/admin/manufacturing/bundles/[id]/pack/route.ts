import { packAndReceiveFinishedGoodsWorkflow } from "../../../../../../workflows/finished-goods";
import { commandRoute } from "../../../../../fashion/command-route";

export const POST = commandRoute(packAndReceiveFinishedGoodsWorkflow, {
  status: 201,
  extra: (req) => ({ bundle_id: req.params.id }),
});
