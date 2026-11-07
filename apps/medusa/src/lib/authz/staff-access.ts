import { rolesFromMetadata, type FashionRole } from "./permissions";

/** Most staff accounts one screen lists. */
export const MAX_STAFF = 500;

type UserRow = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type StaffMember = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  roles: FashionRole[];
};

export const toStaffMember = (user: UserRow): StaffMember => ({
  id: user.id,
  email: user.email,
  first_name: user.first_name ?? null,
  last_name: user.last_name ?? null,
  roles: rolesFromMetadata(user.metadata),
});

/**
 * True when saving `nextRoles` for `targetId` would leave nobody with
 * ERP_ADMIN. Without an ERP_ADMIN no one can grant roles from the screen
 * again; the CLI script would be the only way back in.
 */
export const removesLastErpAdmin = (
  users: readonly UserRow[],
  targetId: string,
  nextRoles: readonly FashionRole[]
): boolean => {
  if (nextRoles.includes("ERP_ADMIN")) {
    return false;
  }
  return !users.some(
    (user) =>
      user.id !== targetId &&
      rolesFromMetadata(user.metadata).includes("ERP_ADMIN")
  );
};
