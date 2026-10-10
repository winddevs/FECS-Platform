import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("fg_batch", "batches", [
  "sku",
  "mo_id",
  "source",
] as const);
