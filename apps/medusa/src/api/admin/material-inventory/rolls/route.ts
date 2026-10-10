import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("material_roll", "rolls", [
  "material_id",
  "lot_id",
  "roll_code",
  "status",
] as const);
