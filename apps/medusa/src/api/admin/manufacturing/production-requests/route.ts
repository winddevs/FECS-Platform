import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("production_request", "production_requests", [
  "order_id",
  "status",
] as const);
