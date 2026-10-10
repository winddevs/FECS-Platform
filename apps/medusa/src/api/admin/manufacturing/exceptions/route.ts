import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("manufacturing_exception", "exceptions", [
  "mo_id",
  "type",
  "status",
] as const);
