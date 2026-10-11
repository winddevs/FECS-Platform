/**
 * Locale handling and copy for transactional emails.
 *
 * Supported locales: Vietnamese (default) and English.
 *
 * Locale resolution order (see `resolveNotificationLocale`):
 *   1. `data.locale`                 explicit override on the notification data
 *   2. `data.order.locale`           Medusa core Order field (BCP 47, may be null)
 *   3. `data.order.metadata.locale`  storefront-supplied fallback
 *   4. env `EMAIL_DEFAULT_LOCALE`    (default "vi")
 * Values are normalised ("vi-VN" -> "vi"); anything other than vi/en is skipped.
 *
 * Password-reset and invite emails carry no order, so they use the env default
 * unless the caller passes `locale` in the notification data.
 */

export const EMAIL_LOCALES = ["vi", "en"] as const;

export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export const FALLBACK_EMAIL_LOCALE: EmailLocale = "vi";

export const DEFAULT_SUPPORT_ADDRESS = "support@fecs.vn";

const LOCALE_SEPARATOR = /[-_]/;

/** Intl tags used for money and date formatting. */
export const INTL_LOCALE_TAGS: Record<EmailLocale, string> = {
  vi: "vi-VN",
  en: "en-US",
};

/** Normalises "vi-VN", "EN_us", "vi" ... to a supported locale, else null. */
export const normalizeEmailLocale = (value: unknown): EmailLocale | null => {
  if (typeof value !== "string") {
    return null;
  }
  const [language] = value.trim().toLowerCase().split(LOCALE_SEPARATOR);
  return EMAIL_LOCALES.find((locale) => locale === language) ?? null;
};

/** Env default (`EMAIL_DEFAULT_LOCALE`), falling back to Vietnamese. */
export const getDefaultEmailLocale = (): EmailLocale =>
  normalizeEmailLocale(process.env.EMAIL_DEFAULT_LOCALE) ??
  FALLBACK_EMAIL_LOCALE;

/** First supported candidate wins; otherwise the env default. */
export const resolveEmailLocale = (...candidates: unknown[]): EmailLocale => {
  for (const candidate of candidates) {
    const locale = normalizeEmailLocale(candidate);
    if (locale) {
      return locale;
    }
  }
  return getDefaultEmailLocale();
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Locale of an order-like object: `order.locale`, then `order.metadata.locale`. */
export const resolveOrderLocale = (order: unknown): EmailLocale => {
  if (!isRecord(order)) {
    return getDefaultEmailLocale();
  }
  const metadata = isRecord(order.metadata) ? order.metadata : undefined;
  return resolveEmailLocale(order.locale, metadata?.locale);
};

/** Resolves the locale from raw notification data (see file header). */
export const resolveNotificationLocale = (data: unknown): EmailLocale => {
  if (!isRecord(data)) {
    return getDefaultEmailLocale();
  }
  const order = isRecord(data.order) ? data.order : undefined;
  const metadata = isRecord(order?.metadata) ? order.metadata : undefined;
  return resolveEmailLocale(data.locale, order?.locale, metadata?.locale);
};

/** Support contact: `EMAIL_SUPPORT_ADDRESS`, else `support@fecs.vn`. */
export const getSupportAddress = (): string => {
  const configured = process.env.EMAIL_SUPPORT_ADDRESS?.trim();
  return configured ? configured : DEFAULT_SUPPORT_ADDRESS;
};

/** Storefront URL for the "view shop" button, if configured. */
export const getShopUrl = (): string | undefined => {
  const configured = process.env.STOREFRONT_URL?.trim();
  return configured ? configured : undefined;
};

export type EmailTemplate = "order-placed" | "password-reset" | "user-invited";

export type EmailCopy = {
  common: {
    brand: string;
    footerRights: (year: number) => string;
    greeting: (email?: string) => string;
    copyUrlHint: string;
  };
  subjects: Record<EmailTemplate, string>;
  orderPlaced: {
    preview: string;
    badge: string;
    heading: (firstName?: string | null) => string;
    intro: string;
    bannerCta: string;
    orderDate: (date: string) => string;
    itemsHeading: string;
    orderId: (displayId: string | number) => string;
    quantity: (quantity: string | number) => string;
    unitPrice: (price: string) => string;
    summaryHeading: string;
    subtotal: string;
    discount: string;
    shipping: string;
    shippingNamed: (methodName: string) => string;
    tax: string;
    total: string;
    shippingAddressHeading: string;
    viewShop: string;
    support: (address: string) => string;
    reference: (orderId: string) => string;
  };
  passwordReset: {
    preview: string;
    badge: string;
    heading: string;
    intro: string;
    expiryNotice: string;
    button: string;
    notRequestedTitle: string;
    notRequestedBody: string;
    securityNote: string;
  };
  userInvited: {
    preview: string;
    badge: string;
    heading: string;
    intro: string;
    button: string;
    ignoreNotice: string;
  };
};

export const emailCopy: Record<EmailLocale, EmailCopy> = {
  vi: {
    common: {
      brand: "bibaestudios",
      footerRights: (year) => `© ${year} bibaestudios. Bảo lưu mọi quyền.`,
      greeting: (email) => (email ? `Xin chào ${email},` : "Xin chào,"),
      copyUrlHint:
        "Hoặc sao chép và dán đường dẫn này vào trình duyệt của bạn:",
    },
    subjects: {
      "order-placed": "Xác nhận đơn hàng của bạn",
      "password-reset": "Đặt lại mật khẩu của bạn",
      "user-invited": "Bạn được mời tham gia bibaestudios",
    },
    orderPlaced: {
      preview: "Cảm ơn bạn đã đặt hàng tại bibaestudios",
      badge: "Đã xác nhận đơn hàng",
      heading: (firstName) =>
        firstName
          ? `Cảm ơn bạn đã đặt hàng, ${firstName}`
          : "Cảm ơn bạn đã đặt hàng",
      intro:
        "Chúng tôi đang xử lý đơn hàng của bạn và sẽ thông báo ngay khi đơn hàng được giao đi.",
      bannerCta: "Mua ngay",
      orderDate: (date) => `Ngày đặt hàng: ${date}`,
      itemsHeading: "Sản phẩm của bạn",
      orderId: (displayId) => `Mã đơn hàng: #${displayId}`,
      quantity: (quantity) => `Số lượng: ${quantity}`,
      unitPrice: (price) => `Đơn giá: ${price}`,
      summaryHeading: "Tóm tắt đơn hàng",
      subtotal: "Tạm tính",
      discount: "Giảm giá",
      shipping: "Phí vận chuyển",
      shippingNamed: (methodName) => `Phí vận chuyển (${methodName})`,
      tax: "Thuế",
      total: "Tổng cộng",
      shippingAddressHeading: "Địa chỉ giao hàng",
      viewShop: "Xem cửa hàng",
      support: (address) =>
        `Nếu bạn có bất kỳ câu hỏi nào, hãy trả lời email này hoặc liên hệ đội ngũ hỗ trợ của chúng tôi tại ${address}.`,
      reference: (orderId) => `Mã tham chiếu đơn hàng: ${orderId}`,
    },
    passwordReset: {
      preview: "Đặt lại mật khẩu của bạn",
      badge: "Đặt lại mật khẩu",
      heading: "Đặt lại mật khẩu của bạn",
      intro:
        "Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Nhấn vào nút bên dưới để tạo mật khẩu mới.",
      expiryNotice:
        "Liên kết đặt lại mật khẩu này sẽ sớm hết hạn vì lý do bảo mật.",
      button: "Đặt lại mật khẩu",
      notRequestedTitle: "Bạn không yêu cầu đặt lại mật khẩu?",
      notRequestedBody:
        "Bạn có thể bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.",
      securityNote:
        "Vì lý do bảo mật, đừng chia sẻ liên kết này với bất kỳ ai. Nếu nút ở trên không hoạt động, hãy sao chép và dán đường dẫn vào trình duyệt web của bạn.",
    },
    userInvited: {
      preview: "Bạn được mời tham gia nền tảng của bibaestudios",
      badge: "Lời mời",
      heading: "Bạn được mời tham gia",
      intro:
        "Bạn đã được mời tham gia nền tảng của chúng tôi. Nhấn vào nút bên dưới để chấp nhận lời mời và thiết lập tài khoản của bạn.",
      button: "Chấp nhận lời mời",
      ignoreNotice:
        "Nếu bạn không mong đợi lời mời này, bạn có thể bỏ qua email này.",
    },
  },
  en: {
    common: {
      brand: "bibaestudios",
      footerRights: (year) => `© ${year} bibaestudios. All rights reserved.`,
      greeting: (email) => (email ? `Hello ${email},` : "Hello,"),
      copyUrlHint: "Or copy and paste this URL into your browser:",
    },
    subjects: {
      "order-placed": "Order Confirmation",
      "password-reset": "Reset Your Password",
      "user-invited": "You're Invited!",
    },
    orderPlaced: {
      preview: "Thank you for your order from bibaestudios",
      badge: "Order Confirmed",
      heading: (firstName) =>
        firstName
          ? `Thank you for your order, ${firstName}`
          : "Thank you for your order",
      intro: "We're processing your order and will notify you when it ships.",
      bannerCta: "Shop Now",
      orderDate: (date) => `Order date: ${date}`,
      itemsHeading: "Your Items",
      orderId: (displayId) => `Order ID: #${displayId}`,
      quantity: (quantity) => `Quantity: ${quantity}`,
      unitPrice: (price) => `Unit price: ${price}`,
      summaryHeading: "Order Summary",
      subtotal: "Subtotal",
      discount: "Discount",
      shipping: "Shipping",
      shippingNamed: (methodName) => `Shipping (${methodName})`,
      tax: "Tax",
      total: "Total",
      shippingAddressHeading: "Shipping Address",
      viewShop: "View Shop",
      support: (address) =>
        `If you have any questions, reply to this email or contact our support team at ${address}.`,
      reference: (orderId) => `Order Token: ${orderId}`,
    },
    passwordReset: {
      preview: "Reset your password",
      badge: "Password Reset",
      heading: "Reset Your Password",
      intro:
        "We received a request to reset your password. Click the button below to create a new password for your account.",
      expiryNotice:
        "This password reset link will expire soon for security reasons.",
      button: "Reset Password",
      notRequestedTitle: "Didn't request a password reset?",
      notRequestedBody:
        "You can safely ignore this email. Your password will remain unchanged.",
      securityNote:
        "For security reasons, never share this reset link with anyone. If you're having trouble with the button above, copy and paste the URL into your web browser.",
    },
    userInvited: {
      preview: "You've been invited to join our platform",
      badge: "Invitation",
      heading: "You're Invited!",
      intro:
        "You've been invited to join our platform. Click the button below to accept your invitation and set up your account.",
      button: "Accept Invitation",
      ignoreNotice:
        "If you weren't expecting this invitation, you can ignore this email.",
    },
  },
};

/** Subjects per locale: `emailSubjects[locale][template]`. */
export const emailSubjects: Record<
  EmailLocale,
  Record<EmailTemplate, string>
> = {
  vi: emailCopy.vi.subjects,
  en: emailCopy.en.subjects,
};

/** Formats a date for the given locale (vi-VN: 31/12/2025, en-US: 12/31/2025). */
export const formatEmailDate = (
  value: string | number | Date | null | undefined,
  locale: EmailLocale
): string => {
  if (value === null || value === undefined) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(INTL_LOCALE_TAGS[locale]);
};
