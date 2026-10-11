import { VI_DICTIONARY } from "./dictionary";

/**
 * Back-office text translation.
 *
 * Screens are written in English and every user-visible string goes through
 * `tr("English text")`. The Vietnamese dictionaries are keyed by that exact
 * English text, so a missing entry degrades to English and never to a key.
 * The language follows the Medusa Admin language (Profile > Language), which
 * the dashboard keeps in the `lng` cookie / local storage.
 */
export type Lang = "vi" | "en";

const COOKIE_PATTERN = /(?:^|;\s*)lng=([^;]+)/;

const readStoredLang = (): string | null => {
  if (typeof document === "undefined") {
    return null;
  }
  const fromCookie = COOKIE_PATTERN.exec(document.cookie)?.[1];
  if (fromCookie) {
    return decodeURIComponent(fromCookie);
  }
  try {
    return (
      window.localStorage.getItem("lng") ??
      document.documentElement.lang ??
      null
    );
  } catch {
    return document.documentElement.lang || null;
  }
};

export const getLang = (): Lang =>
  readStoredLang()?.toLowerCase().startsWith("vi") ? "vi" : "en";

/** BCP 47 tag for Intl / toLocaleString. */
export const intlLocale = (): string =>
  getLang() === "vi" ? "vi-VN" : "en-US";

export type Vars = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

const fill = (text: string, vars?: Vars): string =>
  vars
    ? text.replace(PLACEHOLDER, (whole, name: string) =>
        name in vars ? String(vars[name]) : whole
      )
    : text;

/** Collected in the browser so QA can list what is still English. */
const missing = new Set<string>();
export const missingTranslations = (): string[] => [...missing].sort();

/**
 * Translate a UI string. Placeholders use `{name}`:
 * `tr("Loading {title}", { title })`.
 */
export const tr = (text: string, vars?: Vars): string => {
  if (getLang() !== "vi") {
    return fill(text, vars);
  }
  const hit = VI_DICTIONARY[text];
  if (hit === undefined) {
    missing.add(text);
    return fill(text, vars);
  }
  return fill(hit, vars);
};

const STATUS_PREFIX = "@status.";

/**
 * Statuses and other enum codes (`PARTIALLY_RECEIVED`): a Vietnamese label from
 * the `@status.CODE` dictionary entries, else the readable English form.
 */
export const trStatus = (code: string): string => {
  const readable = code.replace(/_/g, " ");
  if (getLang() !== "vi") {
    return readable;
  }
  return VI_DICTIONARY[`${STATUS_PREFIX}${code.toUpperCase()}`] ?? readable;
};
