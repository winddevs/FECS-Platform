/**
 * Masks personal data and credentials before text reaches the logs
 * (NFR-SEC-003, NFR-SEC-001). Free text is matched by pattern; objects are
 * masked by key name, so a logged request or address never prints a phone,
 * e-mail, street or token.
 */
const MASK = "[redacted]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Vietnamese mobile numbers (0xxxxxxxxx / +84xxxxxxxxx) and similar long runs.
const PHONE = /(?<![\d])(?:\+?84|0)[\s.-]?\d(?:[\s.-]?\d){8,9}(?![\d])/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]{10,}/gi;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
// 13-19 digits, optionally grouped: a payment card number.
const CARD = /(?<![\d])\d(?:[ -]?\d){12,18}(?![\d])/g;
const SECRET_ASSIGNMENT =
  /\b(password|secret|token|api[_-]?key|private[_-]?key|authorization)\b(\s*[:=]\s*)(["']?)[^\s"',;]+/gi;

const NON_DIGITS = /\D/g;
const MIN_CARD_DIGITS = 13;

/** Luhn check, so timestamps and ids are not mistaken for card numbers. */
const isCardNumber = (candidate: string): boolean => {
  const digits = candidate.replace(NON_DIGITS, "");
  if (digits.length < MIN_CARD_DIGITS) {
    return false;
  }
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
};

export const maskText = (text: string): string =>
  text
    .replace(BEARER, `Bearer ${MASK}`)
    .replace(JWT, MASK)
    .replace(SECRET_ASSIGNMENT, `$1$2$3${MASK}`)
    .replace(EMAIL, MASK)
    .replace(CARD, (match) => (isCardNumber(match) ? MASK : match))
    .replace(PHONE, MASK);

const SENSITIVE_KEY =
  /^(?:phone|email|first_name|last_name|full_name|address|address_1|address_2|address_line|street|receiver|recipient|token|password|secret|authorization|api_key|private_key|text|card.*|link_code)$/i;

const MAX_DEPTH = 6;

/** Deep copy with sensitive keys replaced and string values masked. */
export const maskValue = (value: unknown, depth = 0): unknown => {
  if (typeof value === "string") {
    return maskText(value);
  }
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) {
    return value;
  }
  if (value instanceof Error) {
    return maskText(`${value.name}: ${value.message}`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) && item !== null && item !== undefined
        ? MASK
        : maskValue(item, depth + 1),
    ])
  );
};

type LoggerLike = Record<string, unknown>;
const LEVELS = ["error", "warn", "info", "http", "verbose", "debug", "log"];

/** Wraps the logger's level methods in place; safe to call twice. */
export const maskLogger = (logger: LoggerLike): void => {
  if (logger.__piiMasked) {
    return;
  }
  for (const level of LEVELS) {
    const original = logger[level];
    if (typeof original !== "function") {
      continue;
    }
    logger[level] = (...args: unknown[]) =>
      (original as (...a: unknown[]) => unknown).apply(
        logger,
        args.map((arg) => maskValue(arg))
      );
  }
  logger.__piiMasked = true;
};
