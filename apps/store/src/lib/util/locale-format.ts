/** Maps the URL locale (`vi`) to the BCP 47 tag `Intl` expects (`vi-VN`). */
const INTL_TAGS: Record<string, string> = {
  vi: "vi-VN",
  en: "en-US",
  fr: "fr-FR",
  ar: "ar",
};

export const DEFAULT_APP_LOCALE = "vi";

export const intlTag = (locale?: string): string =>
  INTL_TAGS[(locale ?? DEFAULT_APP_LOCALE).toLowerCase()] ??
  INTL_TAGS[DEFAULT_APP_LOCALE];

/** 12/10/2026 for vi, 10/12/2026 for en: always the customer's own format. */
export const formatDate = (
  value: string | number | Date,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string =>
  new Intl.DateTimeFormat(intlTag(locale), options).format(new Date(value));

export const formatDateTime = (
  value: string | number | Date,
  locale?: string
): string =>
  formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
