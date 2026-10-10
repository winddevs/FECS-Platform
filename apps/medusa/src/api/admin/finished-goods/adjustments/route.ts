import { adjustFinishedGoodsWorkflow } from "../../../../workflows/finished-goods";
import { commandRoute } from "../../../fashion/command-route";

export const POST = commandRoute(adjustFinishedGoodsWorkflow, { status: 201 });
