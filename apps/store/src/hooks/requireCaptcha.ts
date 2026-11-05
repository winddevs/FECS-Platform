import type { CollectionBeforeOperationHook } from "payload";
import { APIError } from "payload";

import { CAPTCHA_ERROR_CODE, CAPTCHA_HEADER } from "@/lib/captcha/constants";
import { verifyCaptcha } from "@/lib/captcha/verify";

const HTTP_FORBIDDEN = 403;
const HTTP_UNAVAILABLE = 503;

/**
 * Blocks anonymous form submissions (REST and GraphQL) that carry no valid
 * FCaptcha token. The browser sends the token in the `x-fcaptcha-token`
 * header, so it is never stored with the submission.
 *
 * Skipped for the Local API (seed scripts, server code) and for signed-in
 * admin users.
 */
export const requireCaptcha: CollectionBeforeOperationHook = async ({
  args,
  operation,
  req,
}) => {
  if (operation !== "create" || req.payloadAPI === "local" || req.user) {
    return args;
  }

  const result = await verifyCaptcha(req.headers.get(CAPTCHA_HEADER));
  if (result.ok) {
    return args;
  }

  const isUnavailable = result.reason === "unavailable";
  throw new APIError(
    isUnavailable
      ? "Captcha verification is unavailable."
      : "Captcha verification failed.",
    isUnavailable ? HTTP_UNAVAILABLE : HTTP_FORBIDDEN,
    { code: CAPTCHA_ERROR_CODE, reason: result.reason },
    true
  );
};
