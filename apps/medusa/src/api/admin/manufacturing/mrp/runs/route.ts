import { runMrpWorkflow } from "../../../../../workflows/manufacturing";
import { commandRoute } from "../../../../fashion/command-route";
import { listHandler } from "../../../../fashion/list-handler";

export const GET = listHandler("mrp_run", "mrp_runs", [] as const);
export const POST = commandRoute(runMrpWorkflow, { status: 201 });
