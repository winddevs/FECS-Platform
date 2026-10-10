import { listHandler } from "../../../../fashion/list-handler";

export const GET = listHandler("mrp_suggestion", "suggestions", [
  "run_id",
  "status",
  "material_id",
] as const);
