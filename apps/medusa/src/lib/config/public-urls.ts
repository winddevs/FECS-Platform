/**
 * Public addresses that end up inside emails (staff invites, password resets).
 *
 * A wrong value here is invisible until a person clicks the link, so production
 * never falls back to a localhost address: it throws and names the variable.
 * Local development (`NODE_ENV` other than production) and the local e2e stack
 * (`LOCAL_STACK=true`) keep their localhost defaults.
 */
const LOCAL_BACKEND_URL = "http://localhost:9000";
const LOCAL_STOREFRONT_URL = "http://localhost:8000";

/** `localhost`, `127.0.0.1` or `[::1]` as the host of a URL. */
const LOCAL_HOST_PATTERN =
  /^[a-z][a-z0-9+.-]*:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i;
const TRAILING_SLASHES = /\/+$/;
/** Medusa's `admin.backendUrl` default: same origin as the dashboard, not an address. */
const SAME_ORIGIN = "/";

export const isLocalUrl = (value: string): boolean =>
  LOCAL_HOST_PATTERN.test(value);

const isProduction = (env: NodeJS.ProcessEnv): boolean =>
  env.NODE_ENV === "production" && env.LOCAL_STACK !== "true";

const firstUrl = (
  ...candidates: (string | undefined)[]
): string | undefined => {
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && value !== SAME_ORIGIN) {
      return value.replace(TRAILING_SLASHES, "");
    }
  }
  return undefined;
};

const resolve = (
  name: string,
  example: string,
  found: string | undefined,
  localDefault: string,
  env: NodeJS.ProcessEnv
): string => {
  if (!isProduction(env)) {
    return found ?? localDefault;
  }
  if (!found) {
    throw new Error(
      `${name} is not set. Production emails need the public address, for example ${example}.`
    );
  }
  if (isLocalUrl(found)) {
    throw new Error(
      `${name} points at ${found}, a local address. Check that this is the production .env.`
    );
  }
  return found;
};

/**
 * Public address of the Medusa backend, without a trailing slash.
 * Order: `admin.backendUrl` from the config, `MEDUSA_BACKEND_URL`, `BACKEND_URL`.
 */
export const resolveBackendUrl = (
  configBackendUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string =>
  resolve(
    "BACKEND_URL",
    "https://ecom.bibaestudios.com",
    firstUrl(configBackendUrl, env.MEDUSA_BACKEND_URL, env.BACKEND_URL),
    LOCAL_BACKEND_URL,
    env
  );

/**
 * Public address of the storefront, without a trailing slash.
 * Order: `admin.storefrontUrl` from the config, `STOREFRONT_URL`.
 */
export const resolveStorefrontUrl = (
  configStorefrontUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): string =>
  resolve(
    "STOREFRONT_URL",
    "https://bibaestudios.com",
    firstUrl(configStorefrontUrl, env.STOREFRONT_URL),
    LOCAL_STOREFRONT_URL,
    env
  );
