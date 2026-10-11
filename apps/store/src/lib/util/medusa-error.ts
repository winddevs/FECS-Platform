/**
 * Stable error codes. Each code has a customer-facing, localized sentence under
 * `errors.<code>` in the message files, so UI code can show
 * `t(error.code)` instead of the raw (English) message when it prefers to.
 */
export const APP_ERROR_CODES = [
  "generic",
  "network",
  "unauthorized",
  "forbidden",
  "notFound",
  "validation",
  "server",
  "regionNotFound",
  "cartNotFound",
  "invalidItem",
  "invalidRequest",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

/** Error that keeps its (English) message but also carries a stable code. */
export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(message: string, code: AppErrorCode = "generic") {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_UNPROCESSABLE = 422;
const HTTP_SERVER_ERROR = 500;

/** Maps an HTTP status returned by the Medusa API to an error code. */
export const errorCodeFromStatus = (status?: number): AppErrorCode => {
  if (status === HTTP_UNAUTHORIZED) {
    return "unauthorized";
  }
  if (status === HTTP_FORBIDDEN) {
    return "forbidden";
  }
  if (status === HTTP_NOT_FOUND) {
    return "notFound";
  }
  if (status === HTTP_BAD_REQUEST || status === HTTP_UNPROCESSABLE) {
    return "validation";
  }
  if (status !== undefined && status >= HTTP_SERVER_ERROR) {
    return "server";
  }
  return "generic";
};

type MedusaErrorLike = {
  status?: number;
  statusText?: string;
  message?: string;
  request?: unknown;
  config?: { url: string; baseURL?: string };
  response?: {
    status?: number;
    data: { message?: string } | string;
    headers?: unknown;
  };
};

const capitalizeSentence = (message: string): string =>
  `${message.charAt(0).toUpperCase()}${message.slice(1)}.`;

export default function medusaError(error: MedusaErrorLike): never {
  if (error.status) {
    // Backend messages pass through as they are.
    const message = error.message || error.statusText || "";
    throw new AppError(
      capitalizeSentence(message),
      errorCodeFromStatus(error.status)
    );
  }

  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const { config } = error;
    if (config) {
      const u = new URL(config.url, config.baseURL);
      console.error("Resource:", u.toString());
    }
    console.error("Response data:", error.response.data);
    console.error("Status code:", error.response.status);
    console.error("Headers:", error.response.headers);

    // Extracting the error message from the response data
    const { data } = error.response;
    const message =
      (typeof data === "string" ? data : data.message) ?? String(data);
    throw new AppError(
      capitalizeSentence(message),
      errorCodeFromStatus(error.response.status)
    );
  }

  if (error.request) {
    // The request was made but no response was received
    throw new AppError(`No response received: ${error.request}`, "network");
  }

  // Something happened in setting up the request that triggered an Error
  throw new AppError(
    `Error setting up the request: ${error.message}`,
    "generic"
  );
}
