import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaResponse,
} from "@medusajs/framework/http";

import { requirePermission } from "./require-permission";

/** Metadata key that carries a user's fashion roles. */
export const ROLE_METADATA_KEY = "fashion_roles";

/**
 * True when a request body tries to write the role key into `metadata`.
 * Any value counts, including null (which would remove the roles).
 */
export const touchesRoleMetadata = (body: unknown): boolean => {
  const metadata = (body as { metadata?: unknown } | null | undefined)
    ?.metadata;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    Object.prototype.hasOwnProperty.call(metadata, ROLE_METADATA_KEY)
  );
};

/**
 * Roles live in `user.metadata`, which Medusa's own user and invite routes let
 * any admin write. Without this guard a role-less admin could grant themselves
 * ERP_ADMIN. Writing the role key therefore needs `roles:manage`.
 */
export const protectRoleMetadata = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> => {
  if (!touchesRoleMetadata(req.body)) {
    next();
    return;
  }
  await requirePermission("roles:manage")(req, res, next);
};
