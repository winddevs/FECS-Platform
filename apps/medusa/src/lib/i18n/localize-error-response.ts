import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { translateErrorMessage } from "./error-messages";
import { requestLocale } from "./request-locale";

const HTTP_ERROR_MIN = 400;
const NESTED_MESSAGE_KEYS = ["errors", "issues"] as const;

type JsonObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Vietnamese copy of a message-like value; anything else is returned as is. */
const translateText = (value: unknown): unknown =>
  typeof value === "string" ? translateErrorMessage(value, "vi") : value;

const translateNested = (value: unknown): unknown => {
  if (typeof value === "string") {
    return translateText(value);
  }
  if (isPlainObject(value)) {
    return { ...value, message: translateText(value.message) };
  }
  return value;
};

/**
 * Copy of an error body (`{ type, code, message }`, optionally with a nested
 * `errors`/`issues` list) whose messages are in Vietnamese. `type`, `code`,
 * ids and every other field are left untouched. The input is never mutated,
 * and this never throws: on any problem the original body comes back.
 */
export const localizeErrorBody = (body: unknown): unknown => {
  try {
    if (!isPlainObject(body)) {
      return body;
    }
    const localized: JsonObject = { ...body };
    if ("message" in localized) {
      localized.message = translateText(localized.message);
    }
    for (const key of NESTED_MESSAGE_KEYS) {
      const nested = localized[key];
      if (Array.isArray(nested)) {
        localized[key] = nested.map(translateNested);
      }
    }
    return localized;
  } catch {
    return body;
  }
};

// One wrapper per response, even when both the middleware and the error
// handler ask for it.
const localizedResponses = new WeakSet<object>();

/**
 * When the request asks for Vietnamese, translate the body of every error
 * response (status >= 400) on its way out. Translating the outgoing body, not
 * the thrown error, keeps logs and Sentry in English and also covers messages
 * that Medusa's handler builds itself (validation lists, conflict text) and
 * routes that answer with `res.status(404).json({ message })`.
 */
export const localizeErrorResponse = (
  req: MedusaRequest,
  res: MedusaResponse
): void => {
  try {
    if (requestLocale(req) !== "vi" || localizedResponses.has(res)) {
      return;
    }
    localizedResponses.add(res);
    const json = res.json.bind(res);
    res.json = ((body: unknown) =>
      json(
        res.statusCode >= HTTP_ERROR_MIN ? localizeErrorBody(body) : body
      )) as typeof res.json;
  } catch {
    // Translation is best-effort: never let it mask the original response.
  }
};

/** Middleware form of `localizeErrorResponse` for route-level error bodies. */
export const localizeErrorResponses = (
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): void => {
  localizeErrorResponse(req, res);
  next();
};
