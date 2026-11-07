import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";

import { adminSegments, resolveCoreAccess } from "./core-admin-policy";
import { requirePermission } from "./require-permission";

/**
 * RBAC gate for Medusa's own admin routes (orders, products, customers,
 * store setup). Registered once on `/admin/*`; the fashion ERP routes keep
 * their per-route guards and are skipped here (see `core-admin-policy.ts`).
 *
 * Runs after Medusa's admin authentication, so `auth_context` is populated.
 * Secret API keys have no fashion roles and are refused on the routes that
 * need a permission.
 */
export const coreAdminGuard = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  // CORS preflight carries no credentials.
  if (req.method === "OPTIONS") {
    next();
    return;
  }
  const access = resolveCoreAccess(
    req.method,
    adminSegments(req.originalUrl),
    req.auth_context?.actor_id ?? ""
  );
  if (access.kind === "skip") {
    next();
    return;
  }
  if (access.kind === "permission") {
    await requirePermission(access.permission)(req, res, next);
    return;
  }
  if (req.auth_context?.actor_type !== "user" || !req.auth_context.actor_id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "An authenticated admin user is required",
      "FORBIDDEN"
    );
  }
  next();
};
