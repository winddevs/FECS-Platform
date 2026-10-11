import { toast } from "@medusajs/ui";

import { getLang, tr } from "../i18n";
import { sdk } from "../sdk";
import { newId } from "./id";

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;
export type WriteMethod = "POST" | "PUT" | "DELETE";

const HTTP_FORBIDDEN = 403;
const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_SERVER_ERROR_MIN = 500;

/** Error raised by every ERP API call. Carries what the toast needs. */
export class ErpApiError extends Error {
  readonly status: number | undefined;
  readonly correlationId: string;

  constructor(
    message: string,
    status: number | undefined,
    correlationId: string
  ) {
    super(message);
    this.name = "ErpApiError";
    this.status = status;
    this.correlationId = correlationId;
  }

  get isForbidden(): boolean {
    return this.status === HTTP_FORBIDDEN;
  }
}

const buildPath = (path: string, query?: QueryParams): string => {
  if (!query) {
    return path;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
};

const readStatus = (error: unknown): number | undefined => {
  if (typeof error === "object" && error !== null && "status" in error) {
    const { status } = error as { status: unknown };
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
};

const toApiError = (error: unknown, correlationId: string): ErpApiError => {
  if (error instanceof ErpApiError) {
    return error;
  }
  const message =
    error instanceof Error && error.message
      ? error.message
      : tr("The request failed");
  return new ErpApiError(message, readStatus(error), correlationId);
};

const request = async <T>(
  path: string,
  init: {
    method: "GET" | WriteMethod;
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<T> => {
  const correlationId = `cor_${newId()}`;
  try {
    return await sdk.client.fetch<T>(path, {
      method: init.method,
      body: init.body as Record<string, unknown> | undefined,
      headers: {
        "x-correlation-id": correlationId,
        "x-locale": getLang(),
        ...init.headers,
      },
    });
  } catch (error) {
    throw toApiError(error, correlationId);
  }
};

/**
 * One Idempotency-Key per logical command. Re-sending the identical command
 * after a network/5xx failure reuses the key (so a double apply is
 * impossible); a definitive 4xx or a success forgets it, because the next
 * attempt is a new decision.
 */
const pendingKeys = new Map<string, string>();

const keyFor = (signature: string): string => {
  const existing = pendingKeys.get(signature);
  if (existing) {
    return existing;
  }
  const key = newId();
  pendingKeys.set(signature, key);
  return key;
};

const sendCommand = async <T>(
  method: WriteMethod,
  path: string,
  body?: unknown
): Promise<T> => {
  const signature = `${method} ${path} ${JSON.stringify(body ?? null)}`;
  try {
    const result = await request<T>(path, {
      method,
      body: method === "DELETE" ? undefined : (body ?? {}),
      headers: { "Idempotency-Key": keyFor(signature) },
    });
    pendingKeys.delete(signature);
    return result;
  } catch (error) {
    const status = error instanceof ErpApiError ? error.status : undefined;
    const definitive =
      status !== undefined &&
      status >= HTTP_CLIENT_ERROR_MIN &&
      status < HTTP_SERVER_ERROR_MIN;
    if (definitive) {
      pendingKeys.delete(signature);
    }
    throw error;
  }
};

const backendOrigin = (): string =>
  (typeof process !== "undefined" && process.env?.BACKEND_URL) || "";

export const erp = {
  get: <T>(path: string, query?: QueryParams): Promise<T> =>
    request<T>(buildPath(path, query), { method: "GET" }),

  /** Command endpoints: POST with an Idempotency-Key header. */
  post: <T>(path: string, body?: unknown): Promise<T> =>
    sendCommand<T>("POST", path, body),
  put: <T>(path: string, body?: unknown): Promise<T> =>
    sendCommand<T>("PUT", path, body),
  del: <T>(path: string): Promise<T> => sendCommand<T>("DELETE", path),

  /** Non-JSON bodies (SVG labels). The SDK adds the admin auth for us. */
  text: async (path: string): Promise<string> => {
    const response = await request<Response>(path, {
      method: "GET",
      headers: { accept: "image/svg+xml" },
    });
    return response.text();
  },

  /**
   * GET that treats some non-2xx statuses as data. The SDK throws away the
   * body of a 409, but a failed reconciliation puts its findings there.
   */
  getAllowing: async <T>(
    path: string,
    allowedStatuses: readonly number[]
  ): Promise<T> => {
    const correlationId = `cor_${newId()}`;
    const token = await sdk.client.getToken();
    const response = await fetch(`${backendOrigin()}${path}`, {
      credentials: "include",
      headers: {
        accept: "application/json",
        "x-correlation-id": correlationId,
        "x-locale": getLang(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!(response.ok || allowedStatuses.includes(response.status))) {
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new ErpApiError(
        payload.message ?? response.statusText,
        response.status,
        correlationId
      );
    }
    return (await response.json()) as T;
  },
};

const FORBIDDEN_HINT =
  "You do not have permission to do this. Ask an administrator to grant the required role.";

/** Message shown to the operator; 403 gets an explicit permission message. */
export const describeError = (error: unknown): string => {
  if (error instanceof ErpApiError) {
    if (error.isForbidden) {
      return `${tr(FORBIDDEN_HINT)} (${error.message})`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : tr("The request failed");
};

/** Toast for a failed command or load. Never assumes the user was allowed. */
export const reportError = (error: unknown): void => {
  const reference =
    error instanceof ErpApiError
      ? tr("Reference: {id}", { id: error.correlationId })
      : undefined;
  toast.error(
    error instanceof ErpApiError && error.isForbidden
      ? tr("Permission denied")
      : tr("Request failed"),
    {
      description: [describeError(error), reference].filter(Boolean).join("\n"),
    }
  );
};
