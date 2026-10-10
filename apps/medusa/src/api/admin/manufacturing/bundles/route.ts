import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("bundle", "bundles", [
  "mo_id",
  "batch_id",
  "sku",
] as const);
