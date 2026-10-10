import { createRoutingWorkflow } from "../../../../workflows/manufacturing";
import { commandRoute } from "../../../fashion/command-route";
import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("routing", "routings", [
  "product_sku",
  "status",
] as const);
export const POST = commandRoute(createRoutingWorkflow, { status: 201 });
