/**
 * Return eligibility (FR-RET-001). Pure: facts are gathered by the caller so
 * policy stays testable and independent from Medusa's data model.
 */
export type EligibilityFacts = {
  now: Date;
  window_days: number;
  /** Latest delivery time of the order's shipment(s); null = not delivered. */
  delivered_at: Date | null;
  /** Purchased quantity per order line. */
  purchased: Record<string, number>;
  /** Quantity already in other (non-rejected) returns, per order line. */
  already_returned: Record<string, number>;
  final_sale_skus: string[];
};

export type RequestedItem = { order_line_id: string; sku: string; qty: number };

export type Eligibility = { eligible: boolean; reasons: string[] };

const DAY_MS = 24 * 60 * 60 * 1000;

export const evaluateReturnEligibility = (
  facts: EligibilityFacts,
  items: RequestedItem[]
): Eligibility => {
  const reasons: string[] = [];
  if (!facts.delivered_at) {
    reasons.push("NOT_DELIVERED");
  } else if (
    facts.now.getTime() - facts.delivered_at.getTime() >
    facts.window_days * DAY_MS
  ) {
    reasons.push("OUTSIDE_RETURN_WINDOW");
  }
  for (const item of items) {
    const purchased = facts.purchased[item.order_line_id];
    if (purchased === undefined) {
      reasons.push(`UNKNOWN_ORDER_LINE:${item.order_line_id}`);
      continue;
    }
    const open = purchased - (facts.already_returned[item.order_line_id] ?? 0);
    if (item.qty > open) {
      reasons.push(`QTY_EXCEEDS_PURCHASED:${item.order_line_id}`);
    }
    if (facts.final_sale_skus.includes(item.sku)) {
      reasons.push(`FINAL_SALE:${item.sku}`);
    }
  }
  return { eligible: reasons.length === 0, reasons };
};
