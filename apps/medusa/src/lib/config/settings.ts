import { z } from "zod";

import { INTEGRATION_MODULE } from "../../modules/integration";
import type { SettingScope } from "../../modules/integration/models/config";
import type IntegrationModuleService from "../../modules/integration/service";

/**
 * Every operator-editable setting, with its validation and the default used
 * when nothing is stored (FR-ADM-004). Environment variables stay the
 * deployment default; a stored value overrides them without a deploy.
 */
type Definition<T> = {
  description: string;
  schema: z.ZodType<T>;
  fallback: (env: NodeJS.ProcessEnv) => T;
  /** Scopes below GLOBAL that make sense for this setting. */
  scopes: readonly SettingScope[];
};

const define = <T>(definition: Definition<T>): Definition<T> => definition;

export const SETTINGS = {
  "returns.window_days": define({
    description: "Days after delivery in which a return is eligible",
    schema: z.number().int().min(1).max(365),
    fallback: (env) => Number(env.RETURN_WINDOW_DAYS ?? 14),
    scopes: ["COUNTRY"],
  }),
  "mto.payment_gate": define({
    description: "When a made-to-order order may start production",
    schema: z.enum(["captured", "authorized", "none"]),
    fallback: (env) =>
      (["captured", "authorized", "none"].includes(env.MTO_PAYMENT_GATE ?? "")
        ? env.MTO_PAYMENT_GATE
        : "captured") as "captured" | "authorized" | "none",
    scopes: [],
  }),
  "mrp.demand_warehouse": define({
    description:
      "Warehouse that consumes raw material (enables TRANSFER suggestions)",
    schema: z.string().min(1).max(50).nullable(),
    fallback: (env) => env.MRP_DEMAND_WAREHOUSE ?? null,
    scopes: [],
  }),
  "manufacturing.fabric_tolerance_pct": define({
    description:
      "Allowed fabric variance when reconciling a cut batch, in percent",
    schema: z.number().min(0).max(20),
    fallback: () => 2,
    scopes: [],
  }),
  "social.notifications_per_hour": define({
    description: "Most proactive messages one customer receives per hour",
    schema: z.number().int().min(1).max(60),
    fallback: () => 5,
    scopes: [],
  }),
  "procurement.default_over_receipt_pct": define({
    description:
      "Over-receipt tolerance of a PO line that does not set its own",
    schema: z.number().min(0).max(100),
    fallback: () => 5,
    scopes: [],
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<
  (typeof SETTINGS)[K]["schema"]
>;

export const isSettingKey = (key: string): key is SettingKey =>
  Object.prototype.hasOwnProperty.call(SETTINGS, key);

type Scope = { scope_type: SettingScope; scope_id: string };
type Resolver = { resolve: (key: string) => unknown };

const CACHE_TTL_MS = 20_000;
const cache = new Map<string, { at: number; value: unknown }>();

/** Drops cached values (called after a write, and by tests). */
export const clearSettingsCache = (): void => cache.clear();

/**
 * Effective value: the most specific stored value, else the environment
 * default. A stored value that no longer validates is ignored, so a bad row
 * can never take the platform down.
 */
export const readSetting = async <K extends SettingKey>(
  container: Resolver,
  key: K,
  scopes: Scope[] = [],
  env: NodeJS.ProcessEnv = process.env
): Promise<SettingValue<K>> => {
  const definition = SETTINGS[key];
  const cacheKey = `${key}|${scopes.map((s) => `${s.scope_type}:${s.scope_id}`).join(",")}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.value as SettingValue<K>;
  }
  let value: unknown;
  try {
    const stored = await (
      container.resolve(INTEGRATION_MODULE) as IntegrationModuleService
    ).storedSetting(key, scopes);
    const parsed =
      stored === undefined ? null : definition.schema.safeParse(stored);
    value = parsed?.success ? parsed.data : undefined;
  } catch {
    value = undefined;
  }
  const effective = (value ?? definition.fallback(env)) as SettingValue<K>;
  cache.set(cacheKey, { at: Date.now(), value: effective });
  return effective;
};
