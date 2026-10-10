import { listHandler } from "../../../fashion/list-handler";

export const GET = listHandler("customer_channel_identity", "identities", [
  "customer_id",
  "handoff_state",
] as const);
