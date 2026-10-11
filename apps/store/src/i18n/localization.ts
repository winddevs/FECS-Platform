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
