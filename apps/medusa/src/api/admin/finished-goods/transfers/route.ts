import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("fg_transfer", "transfers", [
  "sku",
  "status",
] as const);
