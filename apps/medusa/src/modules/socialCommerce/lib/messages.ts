export type Locale = "vi" | "en";

const DICTIONARY = {
  help: {
    vi: "Mình có thể giúp: tra cứu đơn hàng (gõ 'đơn 1234'), theo dõi vận chuyển ('giao hàng 1234'), tiến độ sản xuất ('sản xuất 1234'), tìm sản phẩm ('tìm áo thun'), hoặc 'nhân viên' để gặp tư vấn viên.",
    en: "I can help with: order status ('order 1234'), delivery ('track 1234'), production progress ('production 1234'), product search ('search t-shirt'), or 'agent' to talk to a person.",
  },
  needLink: {
    vi: "Để xem thông tin đơn hàng, vui lòng liên kết tài khoản: đăng nhập website, lấy mã liên kết trong phần Tài khoản rồi gửi 'link MÃ' tại đây.",
    en: "To see order details please link your account: sign in on the website, get your link code under Account, then send 'link CODE' here.",
  },
  linked: {
    vi: "Đã liên kết tài khoản thành công. Bây giờ bạn có thể hỏi về đơn hàng.",
    en: "Your account is linked. You can now ask about your orders.",
  },
  linkInvalid: {
    vi: "Mã liên kết không hợp lệ hoặc đã hết hạn.",
    en: "That link code is invalid or has expired.",
  },
  linkLocked: {
    vi: "Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau.",
    en: "Too many failed attempts. Please try again later.",
  },
  orderNotFound: {
    vi: "Mình không tìm thấy đơn hàng đó trong tài khoản của bạn.",
    en: "I couldn't find that order on your account.",
  },
  askOrder: {
    vi: "Bạn muốn xem đơn nào? Hãy gửi kèm mã đơn, ví dụ 'đơn 1234'.",
    en: "Which order? Please include the order number, e.g. 'order 1234'.",
  },
  handoff: {
    vi: "Mình đã chuyển bạn tới nhân viên hỗ trợ. Vui lòng chờ trong giây lát.",
    en: "I've passed you to a support agent. Please wait a moment.",
  },
  botBack: {
    vi: "Mình là trợ lý tự động và đã quay lại hỗ trợ bạn. Gõ 'nhân viên' bất cứ lúc nào để gặp tư vấn viên.",
    en: "I'm back as your automated assistant. Say 'agent' any time to talk to a person.",
  },
  stop: {
    vi: "Bạn đã hủy nhận thông báo. Gõ 'đăng ký' để nhận lại.",
    en: "You've unsubscribed from notifications. Send 'subscribe' to resume.",
  },
  start: {
    vi: "Đã bật thông báo đơn hàng và vận chuyển cho bạn.",
    en: "Order and delivery notifications are on.",
  },
  searchEmpty: {
    vi: "Không tìm thấy sản phẩm phù hợp.",
    en: "No matching products found.",
  },
  toolsDisabled: {
    vi: "Tính năng này hiện chưa khả dụng.",
    en: "That isn't available right now.",
  },
} as const;

export type MessageKey = keyof typeof DICTIONARY;

export const t = (key: MessageKey, locale: Locale): string =>
  DICTIONARY[key][locale];

const SHIPMENT_STATUS_TEXT: Record<string, Record<Locale, string>> = {
  CREATED: { vi: "đã tạo vận đơn", en: "shipment created" },
  PICKUP_PENDING: { vi: "đang chờ lấy hàng", en: "waiting for pickup" },
  PICKED_UP: { vi: "đã được lấy hàng", en: "picked up" },
  IN_TRANSIT: { vi: "đang vận chuyển", en: "in transit" },
  ARRIVED_HUB: { vi: "đã đến trung tâm khai thác", en: "arrived at hub" },
  OUT_FOR_DELIVERY: { vi: "đang giao hàng", en: "out for delivery" },
  DELIVERED: { vi: "đã giao thành công", en: "delivered" },
  DELIVERY_FAILED: {
    vi: "giao hàng chưa thành công",
    en: "delivery attempt failed",
  },
  RETURNING: { vi: "đang hoàn hàng", en: "returning to sender" },
  RETURNED: { vi: "đã hoàn hàng", en: "returned" },
  CANCELLED: { vi: "đã hủy", en: "cancelled" },
  EXCEPTION: {
    vi: "đang có sự cố, nhân viên sẽ liên hệ",
    en: "has an exception; our team will contact you",
  },
};

const PRODUCTION_TEXT: Record<string, Record<Locale, string>> = {
  PREPARING_PRODUCTION: {
    vi: "đang chuẩn bị sản xuất",
    en: "preparing for production",
  },
  IN_PRODUCTION: { vi: "đang sản xuất", en: "in production" },
  QUALITY_CHECK: { vi: "đang kiểm tra chất lượng", en: "in quality check" },
  PREPARING_SHIPMENT: {
    vi: "đang chuẩn bị giao hàng",
    en: "preparing for shipment",
  },
  READY_TO_SHIP: { vi: "sẵn sàng giao", en: "ready to ship" },
};

export const shipmentStatusText = (status: string, locale: Locale): string =>
  SHIPMENT_STATUS_TEXT[status]?.[locale] ?? status.toLowerCase();

export const productionStatusText = (status: string, locale: Locale): string =>
  PRODUCTION_TEXT[status]?.[locale] ?? status.toLowerCase();

export const orderText = (
  order: {
    display_id: number | string;
    total: number | string;
    currency_code: string;
  },
  locale: Locale
): string =>
  locale === "vi"
    ? `Đơn #${order.display_id}, tổng ${order.total} ${order.currency_code.toUpperCase()}.`
    : `Order #${order.display_id}, total ${order.total} ${order.currency_code.toUpperCase()}.`;

export const shipmentText = (
  s: { tracking_number: string | null; status: string },
  locale: Locale
): string =>
  locale === "vi"
    ? `Vận đơn ${s.tracking_number ?? "(đang tạo)"}: ${shipmentStatusText(s.status, locale)}.`
    : `Shipment ${s.tracking_number ?? "(being created)"}: ${shipmentStatusText(s.status, locale)}.`;

export const productionText = (status: string, locale: Locale): string =>
  locale === "vi"
    ? `Tiến độ sản xuất: ${productionStatusText(status, locale)}.`
    : `Production status: ${productionStatusText(status, locale)}.`;
