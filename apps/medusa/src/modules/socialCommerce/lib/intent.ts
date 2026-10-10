export type Intent =
  | { name: "LINK"; code: string }
  | { name: "ORDER"; ref: string | null }
  | { name: "TRACKING"; ref: string | null }
  | { name: "PRODUCTION"; ref: string | null }
  | { name: "PRODUCT_SEARCH"; query: string }
  | { name: "CHECKOUT"; sku: string; qty: number }
  | { name: "HANDOFF" }
  | { name: "STOP" }
  | { name: "START" }
  | { name: "HELP" };

const LINK = /^\s*link\s+([a-z0-9]{8})\s*$/i;
const ORDER_REF = /#?\b(\d{3,10})\b/;
const SEARCH = /^\s*(?:search|find|tim|tìm)\s+(.{2,80})$/i;
const BUY = /^\s*(?:buy|mua)\s+([a-z0-9-]{3,60})(?:\s+x?(\d{1,2}))?\s*$/i;

/**
 * Deterministic intent parsing (English + Vietnamese keywords). It only
 * selects a typed tool; it never executes anything itself, so it is safe to
 * replace or augment with an LLM later behind the same Tool Gateway.
 */
export const parseIntent = (rawText: string): Intent => {
  const text = rawText.normalize("NFC").trim();
  const lower = text.toLowerCase();

  const link = LINK.exec(text);
  if (link) return { name: "LINK", code: link[1].toUpperCase() };
  if (/^(stop|unsubscribe|huy|hủy)\b/.test(lower)) return { name: "STOP" };
  if (/^(start|subscribe|dang ky|đăng ký)\b/.test(lower))
    return { name: "START" };
  if (
    /(human|agent|staff|support|nhân viên|nhan vien|tư vấn viên|gặp người)/.test(
      lower
    )
  ) {
    return { name: "HANDOFF" };
  }
  const buy = BUY.exec(text);
  if (buy) return { name: "CHECKOUT", sku: buy[1], qty: Number(buy[2] ?? 1) };
  const search = SEARCH.exec(text);
  if (search) return { name: "PRODUCT_SEARCH", query: search[1].trim() };

  const ref = ORDER_REF.exec(text)?.[1] ?? null;
  if (
    /(track|where|shipment|delivery|vận đơn|van don|giao hàng|giao hang|ship)/.test(
      lower
    )
  ) {
    return { name: "TRACKING", ref };
  }
  if (
    /(production|made|sản xuất|san xuat|may xong|tiến độ|tien do)/.test(lower)
  ) {
    return { name: "PRODUCTION", ref };
  }
  if (/(order|đơn|don hang|đơn hàng)/.test(lower) || ref) {
    return { name: "ORDER", ref };
  }
  return { name: "HELP" };
};
