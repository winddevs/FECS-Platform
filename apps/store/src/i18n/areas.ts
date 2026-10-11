/**
 * UI text is split by area so teams translate in parallel without touching one
 * big file. `areas/<name>.<locale>.json` holds the keys of namespace `<name>`
 * (use it as `useTranslations("<name>")`). English is the base; a locale only
 * needs the keys it translates.
 */
export const MESSAGE_AREAS = [
  "account",
  "cart",
  "checkout",
  "order",
  "layout",
  "store",
  "products",
  "common",
  "search",
  "home",
  "blocks",
  "errors",
  "shipping",
  "components",
] as const;

export type MessageArea = (typeof MESSAGE_AREAS)[number];
