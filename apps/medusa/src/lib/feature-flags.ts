/**
 * Independent feature flags for risky integrations and automation
 * (FR-ADM-002, TDD section 58). Every flag defaults to OFF; set
 * `<FLAG>=true` in the environment to enable it.
 */
export const FEATURE_FLAGS = [
  "MANUFACTURING_ENABLED",
  "MTO_ENABLED",
  "FG_SYNC_TO_MEDUSA_ENABLED",
  "META_MESSENGER_ENABLED",
  "META_SHIPMENT_NOTIFICATION_ENABLED",
  "JT_FULFILLMENT_ENABLED",
  "JT_AUTO_CREATE_SHIPMENT",
  "JT_TRACKING_CALLBACK_ENABLED",
  "JT_RECONCILIATION_ENABLED",
  "AGENT_READ_TOOLS_ENABLED",
  "AGENT_STATE_CHANGE_ENABLED",
  "AGENT_LLM_ENABLED",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const isEnabled = (
  flag: FeatureFlag,
  env: NodeJS.ProcessEnv = process.env
): boolean => env[flag] === "true";

export const flagSnapshot = (
  env: NodeJS.ProcessEnv = process.env
): Record<FeatureFlag, boolean> =>
  Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag, isEnabled(flag, env)])
  ) as Record<FeatureFlag, boolean>;
