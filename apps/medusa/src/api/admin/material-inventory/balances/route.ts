import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("material_balance", "balances", [
  "material_id",
  "lot_id",
  "roll_id",
  "location_id",
] as const);
