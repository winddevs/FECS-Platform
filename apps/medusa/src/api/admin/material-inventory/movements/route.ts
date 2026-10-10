import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("material_stock_movement", "movements", [
  "material_id",
  "balance_id",
  "roll_id",
  "movement_type",
  "reference_type",
  "reference_id",
] as const);
