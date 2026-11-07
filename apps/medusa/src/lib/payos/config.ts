import { PayOS } from "@payos/node";

/** Medusa id of the payOS payment provider: `pp_<identifier>_<id>`. */
export const PAYOS_PROVIDER_ID = "pp_payos_payos";

/** payOS only settles Vietnamese dong through Napas 247 / VietQR. */
export const PAYOS_CURRENCY = "vnd";

const DEFAULT_LINK_TTL_MINUTES = 30;
const MAX_LINK_TTL_MINUTES = 24 * 60;

export type PayosConfig = {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  partnerCode?: string;
  /** Override of the payOS API host; for tests against a stand-in server. */
  baseUrl?: string;
  /** Public base URL of the storefront, without a trailing slash. */
  storefrontUrl: string;
  linkTtlMinutes: number;
};

const trimmed = (value: string | undefined): string => value?.trim() ?? "";

export const parseLinkTtlMinutes = (value: string | number | undefined) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LINK_TTL_MINUTES;
  }
  return Math.min(parsed, MAX_LINK_TTL_MINUTES);
};

/**
 * payOS settings from the environment, or null when payOS is not configured
 * (all three credentials and the storefront URL are required).
 */
export const payosConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): PayosConfig | null => {
  const clientId = trimmed(env.PAYOS_CLIENT_ID);
  const apiKey = trimmed(env.PAYOS_API_KEY);
  const checksumKey = trimmed(env.PAYOS_CHECKSUM_KEY);
  const storefrontUrl = trimmed(env.STOREFRONT_URL).replace(/\/+$/, "");
  if (!(clientId && apiKey && checksumKey && storefrontUrl)) {
    return null;
  }
  return {
    clientId,
    apiKey,
    checksumKey,
    partnerCode: trimmed(env.PAYOS_PARTNER_CODE) || undefined,
    baseUrl: trimmed(env.PAYOS_BASE_URL) || undefined,
    storefrontUrl,
    linkTtlMinutes: parseLinkTtlMinutes(env.PAYOS_LINK_TTL_MINUTES),
  };
};

export const createPayosClient = (
  config: Pick<
    PayosConfig,
    "clientId" | "apiKey" | "checksumKey" | "partnerCode" | "baseUrl"
  >
): PayOS =>
  new PayOS({
    clientId: config.clientId,
    apiKey: config.apiKey,
    checksumKey: config.checksumKey,
    partnerCode: config.partnerCode,
    baseURL: config.baseUrl,
  });
