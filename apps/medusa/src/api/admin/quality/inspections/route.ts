import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("quality_inspection", "inspections", [
  "target_id",
  "reference_id",
] as const);
