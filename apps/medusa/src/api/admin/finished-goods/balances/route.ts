import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("fg_balance", "balances", [
  "sku",
  "location_id",
] as const);
