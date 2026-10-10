import type { Command } from "../../lib/tx";
import type { Disposition } from "./models/returns";

export type RequestReturnInput = Command & {
  order_id: string;
  customer_id?: string | null;
  type: "RETURN" | "EXCHANGE";
  reason: string;
  exchange_sku?: string | null;
  items: Array<{ order_line_id: string; sku: string; qty: number }>;
  eligibility: { eligible: boolean; reasons: string[] };
};

export type InspectItemInput = Command & {
  return_item_id: string;
  disposition: Exclude<Disposition, "PENDING">;
  destination_location_id?: string | null;
  /** Whether the destination FG location feeds commerce stock. */
  destination_is_commerce?: boolean;
  notes?: string | null;
};
