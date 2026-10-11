import { dispatchFgTransferWorkflow } from "../../../../../workflows/finished-goods";
import { commandRoute } from "../../../../fashion/command-route";

export const POST = commandRoute(dispatchFgTransferWorkflow, { status: 201 });
