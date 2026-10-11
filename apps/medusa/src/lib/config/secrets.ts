/**
 * Fail-fast check of the secrets a production process needs (NFR-SEC-001).
 * Secrets come from the secret manager into the environment; this makes sure
 * none is missing, left at a development default, or too short, and that an
 * integration is not switched on without its credentials.
 */
const MIN_LENGTH = 24;
const DEV_DEFAULTS = new Set([
  "supersecret",
  "secret",
  "changeme",
  "integration-test",
  "dev",
]);

const REQUIRED_ALWAYS = [
  "JWT_SECRET",
  "COOKIE_SECRET",
  "DATABASE_URL",
] as const;

/** A feature flag that is on needs these variables. */
const REQUIRED_WITH_FLAG: Record<string, readonly string[]> = {
  JT_FULFILLMENT_ENABLED: [
    "JT_API_BASE_URL",
    "JT_API_ACCOUNT",
    "JT_PRIVATE_KEY",
  ],
  JT_TRACKING_CALLBACK_ENABLED: ["JT_WEBHOOK_SECRET"],
  META_MESSENGER_ENABLED: [
    "META_APP_SECRET",
    "META_VERIFY_TOKEN",
    "META_PAGE_ACCESS_TOKEN",
    "SOCIAL_LINK_SECRET",
  ],
};

export const secretProblems = (
  env: NodeJS.ProcessEnv = process.env
): string[] => {
  const problems: string[] = [];
  for (const name of REQUIRED_ALWAYS) {
    if (!env[name]) {
      problems.push(`${name} is not set`);
    }
  }
  for (const name of ["JWT_SECRET", "COOKIE_SECRET"] as const) {
    const value = env[name];
    if (value && (DEV_DEFAULTS.has(value) || value.length < MIN_LENGTH)) {
      problems.push(
        `${name} is a development value or shorter than ${MIN_LENGTH} characters`
      );
    }
  }
  for (const [flag, names] of Object.entries(REQUIRED_WITH_FLAG)) {
    if (env[flag] !== "true") {
      continue;
    }
    for (const name of names) {
      if (!env[name]) {
        problems.push(`${flag}=true needs ${name}`);
      }
    }
  }
  if (env.METRICS_TOKEN !== undefined && env.METRICS_TOKEN.length < 16) {
    problems.push("METRICS_TOKEN is shorter than 16 characters");
  }
  return problems;
};

/** Throws, naming the variables (never their values), when production is misconfigured. */
export const assertProductionSecrets = (
  env: NodeJS.ProcessEnv = process.env
): void => {
  if (env.NODE_ENV !== "production" || env.SKIP_SECRET_CHECK === "true") {
    return;
  }
  const problems = secretProblems(env);
  if (problems.length > 0) {
    throw new Error(`Refusing to start: ${problems.join("; ")}`);
  }
};
