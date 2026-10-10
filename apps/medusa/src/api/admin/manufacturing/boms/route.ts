import { createBomWorkflow } from "../../../../workflows/manufacturing";
import { commandRoute } from "../../../fashion/command-route";
import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("bom", "boms", [
  "product_sku",
  "status",
] as const);
export const POST = commandRoute(createBomWorkflow, { status: 201 });
