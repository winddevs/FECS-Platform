import { shipFinishedGoodsWorkflow } from "../../../../workflows/finished-goods";
import { commandRoute } from "../../../fashion/command-route";

export const POST = commandRoute(shipFinishedGoodsWorkflow, { status: 201 });
