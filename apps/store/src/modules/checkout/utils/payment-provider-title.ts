/** Payment providers whose title is translated; others keep their brand name. */
const PROVIDER_TITLE_KEYS = {
  pp_stripe_stripe: "creditCard",
  pp_system_default: "manual",
} as const;

export type PaymentProviderTitleKey =
  (typeof PROVIDER_TITLE_KEYS)[keyof typeof PROVIDER_TITLE_KEYS];

export const getPaymentProviderTitleKey = (
  providerId: string
): PaymentProviderTitleKey | undefined =>
  PROVIDER_TITLE_KEYS[providerId as keyof typeof PROVIDER_TITLE_KEYS];
