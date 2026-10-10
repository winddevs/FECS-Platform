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
const SEARCH = /^\s*(?:search|find|tim|tìm)\s+(.{2,80})$/i;
const BUY = /^\s*(?:buy|mua)\s+([a-z0-9-]{3,60})(?:\s+x?(\d{1,2}))?\s*$/i;

/**
 * Unicode-aware word boundary. JavaScript's `\b` only knows ASCII letters, so
 * it never matches after Vietnamese letters such as the "ý" in "đăng ký".
 */
const word = (alternatives: string): RegExp =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "u");

// Opt-out / opt-in are whole-message commands. Matching a prefix would turn
// "Hủy đơn #1234" (cancel my order) or the name "Huy" into an opt-out.
const STOP_COMMAND =
  /^(?:stop|unsubscribe|huy dang ky|hủy đăng ký|dung nhan tin|dừng nhận tin|ngung nhan tin|ngừng nhận tin)[\s.!]*$/u;
const START_COMMAND =
  /^(?:start|subscribe|dang ky|đăng ký|nhan tin|nhận tin)[\s.!]*$/u;

const HANDOFF = word(
  [
    "(?:talk|speak|chat) (?:to|with) (?:a |an |the )?(?:human|person|agent|staff|someone)",
    "human agent|live agent|real person|customer service",
    "(?:gặp|gap|nói chuyện với|noi chuyen voi|chuyển cho|chuyen cho|cần|can) (?:nhân viên|nhan vien|người thật|nguoi that|tư vấn viên|tu van vien)",
    "nhân viên tư vấn|nhan vien tu van",
  ].join("|")
);

const ORDER_WORD = word("order|đơn hàng|đơn|don hang");
const TRACKING_WORD = word(
  "track|tracking|where|shipment|delivery|vận đơn|van don|giao hàng|giao hang|ship"
);
const PRODUCTION_WORD = word(
  "production|made|sản xuất|san xuat|may xong|tiến độ|tien do"
);
// An order reference needs a keyword ("đơn 1234", "order #1234") or a "#".
const ORDER_REF = new RegExp(
  "(?:(?<![\\p{L}\\p{N}])(?:order|đơn hàng|đơn|don hang|don|vận đơn|van don|shipment|tracking|track|delivery|giao hàng|giao hang)\\s*(?:số|so)?\\s*#?\\s*|#)(\\d{3,10})(?!\\d)",
  "u"
);

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
  if (STOP_COMMAND.test(lower)) return { name: "STOP" };
  if (START_COMMAND.test(lower)) return { name: "START" };
  if (HANDOFF.test(lower)) return { name: "HANDOFF" };
  const buy = BUY.exec(text);
  if (buy) return { name: "CHECKOUT", sku: buy[1], qty: Number(buy[2] ?? 1) };
  const search = SEARCH.exec(text);
  if (search) return { name: "PRODUCT_SEARCH", query: search[1].trim() };

  const ref = ORDER_REF.exec(lower)?.[1] ?? null;
  if (TRACKING_WORD.test(lower)) {
    return { name: "TRACKING", ref };
  }
  if (PRODUCTION_WORD.test(lower)) {
    return { name: "PRODUCTION", ref };
  }
  if (ORDER_WORD.test(lower) || ref) {
    return { name: "ORDER", ref };
  }
  return { name: "HELP" };
};
