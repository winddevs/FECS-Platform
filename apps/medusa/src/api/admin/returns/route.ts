import { requestReturnWorkflow } from "../../../workflows/returns";
import { commandRoute } from "../../fashion/command-route";
import { listHandler } from "../../fashion/list-handler";

export const GET = listHandler("return_authorization", "returns", [
  "order_id",
  "status",
] as const);
export const POST = commandRoute(requestReturnWorkflow, { status: 201 });
