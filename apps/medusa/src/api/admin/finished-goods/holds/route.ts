import { changeFgHoldWorkflow } from "../../../../workflows/finished-goods";
import { commandRoute } from "../../../fashion/command-route";

export const POST = commandRoute(changeFgHoldWorkflow, { status: 201 });
