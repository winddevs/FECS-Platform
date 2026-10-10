import { createManufacturingOrderWorkflow } from "../../../../workflows/manufacturing";
import { commandRoute } from "../../../fashion/command-route";
import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("manufacturing_order", "manufacturing_orders", [
  "status",
  "order_type",
  "product_sku",
  "customer_order_id",
] as const);
export const POST = commandRoute(createManufacturingOrderWorkflow, {
  status: 201,
});
