import { en as payloadEn } from "@payloadcms/translations/languages/en";
import { vi as payloadVi } from "@payloadcms/translations/languages/vi";

// this is for admin panel lang (Payload CMS admin UI)
export const i18n = {
  fallbackLanguage: "vi" as const,
  supportedLanguages: { vi: payloadVi, en: payloadEn },
};

/** Vietnamese is the shop's language; English remains available. */
export const DEFAULT_LOCALE = "vi";

// this is for content
export const localization = {
  defaultLocale: DEFAULT_LOCALE,
  fallback: true,
  locales: [
    {
      code: "vi",
      label: "Tiếng Việt (Vietnamese)",
      // Content that exists only in English is shown on the Vietnamese site
      // rather than as an empty block.
      fallbackLocale: "en",
    },
    {
      code: "en",
      label: "English (English)",
    },
    {
      code: "fr",
      label: "French (Français)",
      fallbackLocale: "en",
    },
    {
      code: "ar",
      label: "Arabic (العربية)",
      rtl: true,
      fallbackLocale: "en",
    },
  ],
};

/**
 * Languages the storefront serves (routes, switcher, hreflang). For now only
 * Vietnamese and English: French and Arabic have almost no UI translations.
 *
 * `localization` above stays as it is on purpose: it is Payload's content
 * locale list, and changing it changes the CMS database schema (needs a
 * migration). To bring a language back, add its code here.
 */
export const STOREFRONT_LOCALE_CODES = ["vi", "en"] as const;

export const storefrontLocales = localization.locales.filter((locale) =>
  (STOREFRONT_LOCALE_CODES as readonly string[]).includes(locale.code)
);
