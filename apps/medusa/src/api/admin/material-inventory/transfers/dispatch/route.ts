import { dispatchTransferWorkflow } from "../../../../../workflows/material-inventory";
import { commandRoute } from "../../../../fashion/command-route";

export const POST = commandRoute(dispatchTransferWorkflow, { status: 201 });
