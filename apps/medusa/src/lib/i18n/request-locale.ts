/**
 * Language of an API response, taken from the request.
 *
 * Order: `x-locale` header (sent by the back-office UI), then the standard
 * `Accept-Language` header, then the `DEFAULT_API_LOCALE` env var. The default
 * is English so existing API clients and tests keep getting English messages.
 */
export type RequestLocale = "vi" | "en";

type HeaderValue = string | string[] | undefined;

/** The only part of a request this module needs (keeps it framework-free). */
export type LocaleRequest = { headers?: Record<string, HeaderValue> };

const SUPPORTED_LOCALES: readonly RequestLocale[] = ["vi", "en"];
const FALLBACK_LOCALE: RequestLocale = "en";
const DEFAULT_QUALITY = 1;
const LANGUAGE_RANGE_SEPARATOR = ",";
const LANGUAGE_SUBTAG_SEPARATOR = "-";

const firstValue = (value: HeaderValue): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** "vi-VN" / "VI" / " vi " => "vi"; anything unsupported => undefined. */
const toSupportedLocale = (
  tag: string | undefined
): RequestLocale | undefined => {
  const primary = tag?.trim().toLowerCase().split(LANGUAGE_SUBTAG_SEPARATOR)[0];
  return SUPPORTED_LOCALES.find((locale) => locale === primary);
};

type LanguageRange = { tag: string; quality: number; order: number };

const parseAcceptLanguage = (header: string): LanguageRange[] =>
  header
    .split(LANGUAGE_RANGE_SEPARATOR)
    .map((part, order): LanguageRange => {
      const [tag = "", ...params] = part.split(";");
      const qualityParam = params
        .map((param) => param.trim())
        .find((param) => param.toLowerCase().startsWith("q="));
      const parsed = qualityParam
        ? Number.parseFloat(qualityParam.slice(2))
        : DEFAULT_QUALITY;
      return {
        tag,
        quality: Number.isFinite(parsed) ? parsed : 0,
        order,
      };
    })
    .filter((range) => range.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.order - b.order);

const fromAcceptLanguage = (
  header: string | undefined
): RequestLocale | undefined => {
  if (!header) {
    return undefined;
  }
  for (const range of parseAcceptLanguage(header)) {
    const locale = toSupportedLocale(range.tag);
    if (locale) {
      return locale;
    }
  }
  return undefined;
};

/** Server-wide default (`DEFAULT_API_LOCALE`), read per call so tests can set it. */
export const defaultApiLocale = (): RequestLocale =>
  toSupportedLocale(process.env.DEFAULT_API_LOCALE) ?? FALLBACK_LOCALE;

export const requestLocale = (req: LocaleRequest): RequestLocale => {
  const headers = req.headers ?? {};
  return (
    toSupportedLocale(firstValue(headers["x-locale"])) ??
    fromAcceptLanguage(firstValue(headers["accept-language"])) ??
    defaultApiLocale()
  );
};
