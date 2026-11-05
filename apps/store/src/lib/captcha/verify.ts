/**
 * Server-side check of an FCaptcha token (https://github.com/WebDecoy/FCaptcha).
 *
 * The browser widget only produces a token. Nothing is protected until the
 * server asks the FCaptcha server whether that token is valid, so every form
 * handler must call `verifyCaptcha` before it does any work.
 *
 * No `server-only` import on purpose: this also runs inside Payload hooks,
 * which are loaded outside Next.js by the Payload CLI.
 */

/** Same contract as Cloudflare Turnstile, served by FCaptcha. */
const SITEVERIFY_PATH = "/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;
const MAX_TOKEN_LENGTH = 8192;

export type CaptchaFailure = "missing" | "rejected" | "unavailable";

export type CaptchaResult =
  | { ok: true }
  | { ok: false; reason: CaptchaFailure };

type SiteverifyResponse = {
  "error-codes"?: string[];
  success: boolean;
  hostname?: string;
  action?: string;
};

const isSiteverifyResponse = (value: unknown): value is SiteverifyResponse =>
  typeof value === "object" &&
  value !== null &&
  "success" in value &&
  typeof value.success === "boolean";

/** The hostname FCaptcha signs into a token: the host of this storefront. */
const expectedHostname = (): string | null => {
  try {
    return new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "").hostname;
  } catch {
    return null;
  }
};

/**
 * True when the verify secret and the browser site key are both set. In
 * development an unconfigured captcha is skipped so the stack runs without
 * the FCaptcha container. In production it is never skipped.
 */
const isConfigured = (): boolean =>
  Boolean(
    process.env.FCAPTCHA_VERIFY_SECRET &&
    process.env.FCAPTCHA_ORIGIN &&
    process.env.NEXT_PUBLIC_FCAPTCHA_SITE_KEY
  );

export const verifyCaptcha = async (token: unknown): Promise<CaptchaResult> => {
  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      // Fail closed: a missing setting must not silently switch protection off.
      console.error(
        "FCaptcha is not configured (FCAPTCHA_VERIFY_SECRET, FCAPTCHA_ORIGIN, NEXT_PUBLIC_FCAPTCHA_SITE_KEY). Rejecting the request."
      );
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true };
  }

  if (
    typeof token !== "string" ||
    token.trim() === "" ||
    token.length > MAX_TOKEN_LENGTH
  ) {
    return { ok: false, reason: "missing" };
  }

  const hostname = expectedHostname();
  if (!hostname) {
    console.error("NEXT_PUBLIC_BASE_URL is not a valid URL.");
    return { ok: false, reason: "unavailable" };
  }

  let result: unknown;
  try {
    const response = await fetch(
      new URL(SITEVERIFY_PATH, process.env.FCAPTCHA_ORIGIN),
      {
        body: new URLSearchParams({
          response: token,
          secret: process.env.FCAPTCHA_VERIFY_SECRET ?? "",
        }),
        cache: "no-store",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      throw new Error(`FCaptcha answered ${response.status}`);
    }
    result = await response.json();
  } catch (error) {
    console.error("FCaptcha verification is unavailable.", error);
    return { ok: false, reason: "unavailable" };
  }

  if (!isSiteverifyResponse(result)) {
    console.error("FCaptcha returned an unexpected response.");
    return { ok: false, reason: "unavailable" };
  }

  // A rejected secret is our configuration problem, not the visitor's.
  if (result["error-codes"]?.includes("invalid-input-secret")) {
    console.error("FCaptcha rejected FCAPTCHA_VERIFY_SECRET.");
    return { ok: false, reason: "unavailable" };
  }

  // The checkbox widget issues tokens with an empty action. A token minted
  // for another hostname or for a named (invisible) action is not ours.
  const accepted =
    result.success && result.hostname === hostname && !result.action;

  return accepted ? { ok: true } : { ok: false, reason: "rejected" };
};
