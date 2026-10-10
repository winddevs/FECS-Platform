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

export default defineMiddlewares({
  errorHandler: (
    error: MedusaError | any,
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ) => {
    Sentry.captureException(error);
    return originalErrorHandler(error, req, res, next);
  },
  routes: [
    ...fashionMiddlewares,
    ...opsMiddlewares,
    ...webhookMiddlewares,
    {
      matcher: "/store/products/search",
      method: ["POST"],
      // `as never`: inferring the zod type here makes tsc exceed its instantiation depth.
      middlewares: [validateAndTransformBody(SearchSchema as never)],
    },
    {
      matcher: "/admin/algolia/sync",
      method: ["POST"],
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: "/admin/invoice-config",
      methods: ["POST"],
      middlewares: [validateAndTransformBody(PostInvoiceConfigSchema as never)],
    },
  ],
});
