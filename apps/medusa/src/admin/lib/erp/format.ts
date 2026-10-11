import { intlLocale, tr } from "../i18n";

const MAX_FRACTION_DIGITS = 20;
const JSON_PREVIEW_LENGTH = 80;
const EMPTY = "-";

const numberFormats = new Map<string, Intl.NumberFormat>();

/** One cached formatter per locale (the language can change at runtime). */
const numberFormatFor = (locale: string): Intl.NumberFormat => {
  const cached = numberFormats.get(locale);
  if (cached) {
    return cached;
  }
  const created = new Intl.NumberFormat(locale, {
    maximumFractionDigits: MAX_FRACTION_DIGITS,
  });
  numberFormats.set(locale, created);
  return created;
};

/** Reads numbers the API returns as number, numeric string or {value}. */
export const toNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === "object" && value !== null && "value" in value) {
    return toNumber((value as { value: unknown }).value);
  }
  return undefined;
};

/** Number grouping only: the API's value is shown, never rounded or scaled. */
export const formatNumber = (value: unknown): string => {
  const parsed = toNumber(value);
  return parsed === undefined
    ? EMPTY
    : numberFormatFor(intlLocale()).format(parsed);
};

export const formatDateTime = (value: unknown): string => {
  if (typeof value !== "string" && typeof value !== "number") {
    return EMPTY;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString(intlLocale());
};

export const formatJson = (
  value: unknown,
  limit = JSON_PREVIEW_LENGTH
): string => {
  if (value === null || value === undefined) {
    return EMPTY;
  }
  const text = JSON.stringify(value);
  if (text === undefined) {
    return EMPTY;
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
};

/** Generic cell text for values without a dedicated column kind. */
export const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    return EMPTY;
  }
  if (typeof value === "boolean") {
    return value ? tr("Yes") : tr("No");
  }
  if (typeof value === "number") {
    return formatNumber(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return formatJson(value);
};

export const humanize = (key: string): string =>
  key.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());

/** Plain-text cell for CSV export and key-value lists. */
export const toCsvCell = (value: unknown): string => {
  const raw =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
};
