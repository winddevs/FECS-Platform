import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("material_lot", "lots", [
  "material_id",
  "source_type",
  "source_id",
  "lot_no",
  "dye_lot_no",
] as const);
