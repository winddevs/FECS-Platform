import { randomUUID } from "node:crypto";

import {
  defineMiddlewares,
  validateAndTransformBody,
  authenticate,
  errorHandler,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import * as Sentry from "@sentry/node";

import { protectRoleMetadata } from "../lib/authz/protect-role-metadata";
import { requirePermission } from "../lib/authz/require-permission";
import { httpMetricsMiddleware } from "../lib/observability/http-metrics";
import { PostInvoiceConfigSchema } from "./admin/invoice-config/route";
import { fashionMiddlewares } from "./fashion/middlewares";
import { opsMiddlewares } from "./fashion/ops-middlewares";
import { SearchSchema } from "./store/products/search/route";

const originalErrorHandler = errorHandler();
// Webhooks verify an HMAC over the exact bytes the provider sent, so the raw
// body must be preserved for these routes.
const webhookMiddlewares = [
  {
    matcher: "/webhooks/jt/tracking",
    methods: ["POST" as const],
    bodyParser: { preserveRawBody: true },
  },
  {
    matcher: "/webhooks/meta",
    methods: ["POST" as const],
    bodyParser: { preserveRawBody: true },
  },
];

const CLIENT_ERROR_TYPES = new Set<string>([
  MedusaError.Types.INVALID_DATA,
  MedusaError.Types.NOT_FOUND,
  MedusaError.Types.NOT_ALLOWED,
  MedusaError.Types.UNAUTHORIZED,
  MedusaError.Types.FORBIDDEN,
  MedusaError.Types.CONFLICT,
  MedusaError.Types.DUPLICATE_ERROR,
  MedusaError.Types.INVALID_ARGUMENT,
]);

const isClientError = (error: unknown): boolean =>
  error instanceof MedusaError && CLIENT_ERROR_TYPES.has(error.type);

/**
 * Error bodies carry the request's correlation id (TDD section 40), echoed in
 * the `x-correlation-id` header too, so a customer-visible failure can be
 * found in logs and traces.
 */
const attachCorrelationId = (req: MedusaRequest, res: MedusaResponse): void => {
  const header = req.headers["x-correlation-id"];
  const supplied = Array.isArray(header) ? header[0] : header;
  const correlationId = supplied?.slice(0, 200) || `cor_${randomUUID()}`;
  res.setHeader("x-correlation-id", correlationId);
  const json = res.json.bind(res);
  res.json = ((body: unknown) =>
    json(
      body && typeof body === "object" && !Array.isArray(body)
        ? { ...body, correlation_id: correlationId }
        : body
    )) as typeof res.json;
};

const adminOnly = (
  matcher: string,
  methods: Array<"GET" | "POST">,
  permission: Parameters<typeof requirePermission>[0],
  ...rest: unknown[]
) => ({
  matcher,
  methods,
  middlewares: [
    authenticate("user", ["session", "bearer"]),
    requirePermission(permission),
    ...rest,
  ] as never,
});

/**
 * Medusa's own user and invite routes let any admin write `metadata`, where
 * the fashion roles live. Writing the role key needs `roles:manage`.
 */
const roleMetadataGuards = [
  "/admin/users",
  "/admin/users/*",
  "/admin/invites",
  "/admin/invites/*",
].map((matcher) => ({
  matcher,
  methods: ["POST" as const],
  middlewares: [protectRoleMetadata],
}));

/** Legacy commerce-admin routes: every one needs an explicit permission. */
const legacyAdminGuards = [
  adminOnly("/admin/algolia/sync", ["POST"], "commerce:admin"),
  adminOnly("/admin/payload/sync/:collection", ["POST"], "commerce:admin"),
  adminOnly("/admin/analytics", ["GET", "POST"], "commerce:admin"),
  adminOnly("/admin/custom", ["GET"], "commerce:admin"),
  adminOnly("/admin/orders/:id/invoices", ["GET"], "order:read"),
  adminOnly("/admin/invoice-config", ["GET"], "order:read"),
  adminOnly(
    "/admin/invoice-config",
    ["POST"],
    "commerce:admin",
    // `as never`: inferring the zod type here makes tsc exceed its instantiation depth.
    validateAndTransformBody(PostInvoiceConfigSchema as never)
  ),
  // The Sentry smoke test must not be an anonymous error generator.
  adminOnly("/test-sentry", ["GET"], "ops:read"),
];

export default defineMiddlewares({
  errorHandler: (
    error: MedusaError | any,
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) => {
    // Client errors (4xx) are expected traffic, not incidents.
    if (!isClientError(error)) {
      Sentry.captureException(error);
    }
    attachCorrelationId(req, res);
    return originalErrorHandler(error, req, res, next);
  },
  routes: [
    // Latency histogram for every API call (SLO alerts are computed from it).
    ...["/admin/*", "/store/*", "/webhooks/*", "/auth/*"].map((matcher) => ({
      matcher,
      middlewares: [httpMetricsMiddleware],
    })),
    ...fashionMiddlewares,
    ...opsMiddlewares,
    ...webhookMiddlewares,
    ...roleMetadataGuards,
    ...legacyAdminGuards,
    {
      matcher: "/store/products/search",
      method: ["POST"],
      // `as never`: inferring the zod type here makes tsc exceed its instantiation depth.
      middlewares: [validateAndTransformBody(SearchSchema as never)],
    },
  ],
});
