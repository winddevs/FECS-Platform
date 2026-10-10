import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";

import {
  hasPermission,
  rolesFromMetadata,
  type Permission,
} from "./permissions";

/**
 * RBAC gate for admin routes (FR-ADM-001). Runs after Medusa's admin
 * authentication, so `auth_context` is already populated.
 * Users without any fashion role are denied (least privilege).
 */
export const requirePermission =
  (permission: Permission) =>
  async (
    req: AuthenticatedMedusaRequest,
    _res: MedusaResponse,
    next: MedusaNextFunction
  ): Promise<void> => {
    const actorId = req.auth_context?.actor_id;
    if (!actorId || req.auth_context.actor_type !== "user") {
      throw new MedusaError(
        MedusaError.Types.UNAUTHORIZED,
        "An authenticated admin user is required",
        "FORBIDDEN"
      );
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const { data } = await query.graph({
      entity: "user",
      fields: ["id", "metadata"],
      filters: { id: actorId },
    });
    const roles = rolesFromMetadata(data[0]?.metadata);

    if (!hasPermission(roles, permission)) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        `Missing permission: ${permission}`,
        "FORBIDDEN"
      );
    }
    next();
  };

/**
 * Extra permission that only applies when the request asks for a privileged
 * option (e.g. `planner_approved`, `overproduction_approved`). Run it AFTER
 * body validation so `req.validatedBody` is populated.
 */
export const requirePermissionIf =
  (
    permission: Permission,
    applies: (body: Record<string, unknown>) => boolean
  ) =>
  async (
    req: AuthenticatedMedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction
  ): Promise<void> => {
    const body = (req.validatedBody ?? {}) as Record<string, unknown>;
    if (!applies(body)) {
      next();
      return;
    }
    await requirePermission(permission)(req, res, next);
  };
