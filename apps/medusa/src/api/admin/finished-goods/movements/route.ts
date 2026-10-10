import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("fg_movement", "movements", [
  "sku",
  "location_id",
  "reference_id",
] as const);
