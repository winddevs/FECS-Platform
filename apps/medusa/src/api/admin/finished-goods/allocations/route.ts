import { allocateFgToOrderWorkflow } from "../../../../workflows/finished-goods";
import { commandRoute } from "../../../fashion/command-route";
import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("fg_allocation", "allocations", [
  "order_id",
  "sku",
  "status",
] as const);
export const POST = commandRoute(allocateFgToOrderWorkflow, { status: 201 });
