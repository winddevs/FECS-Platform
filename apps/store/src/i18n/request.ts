import { getRequestConfig } from "next-intl/server";

import { MESSAGE_AREAS } from "./areas";
import type { AppMessages } from "./intl-types";
import { routing } from "./routing";

type Json = { [key: string]: Json | string };

declare global {
  // Use type safe message env with `next-intl`
  interface IntlMessages extends AppMessages {}
}

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null;

/** Overlay `source` on `base`; keys missing in `source` keep the base text. */
const merge = (base: Json, source: Json): Json => {
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(source)) {
    const current = out[key];
    out[key] =
      isObject(current) && isObject(value) ? merge(current, value) : value;
  }
  return out;
};

/** Locales that have area files; the others show English for those areas. */
const AREA_LOCALES = ["en", "vi"];

const load = async (locale: string): Promise<Json> => {
  const core = (await import(`./messages/${locale}.json`)).default as Json;
  if (!AREA_LOCALES.includes(locale)) {
    return core;
  }
  const areas = await Promise.all(
    MESSAGE_AREAS.map(
      async (area) =>
        [
          area,
          (await import(`./messages/areas/${area}.${locale}.json`))
            .default as Json,
        ] as const
    )
  );
  return { ...core, ...Object.fromEntries(areas) };
};

/** English is the base so a missing translation shows English, never a key. */
export const loadMessages = async (locale: string): Promise<AppMessages> => {
  const base = await load("en");
  const merged = locale === "en" ? base : merge(base, await load(locale));
  return merged as unknown as AppMessages;
};

const validLocale = (locale: string | undefined): string =>
  locale && routing.locales.includes(locale) ? locale : routing.defaultLocale;

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = validLocale(await requestLocale);
  return { locale, messages: await loadMessages(locale) };
});

export async function getLocalizedMessages(requested: string) {
  const locale = validLocale(requested);
  return { locale, messages: await loadMessages(locale) };
}
