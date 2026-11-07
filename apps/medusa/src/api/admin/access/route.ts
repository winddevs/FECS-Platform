import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type { IUserModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

import {
  FASHION_ROLES,
  ROLE_PERMISSIONS,
} from "../../../lib/authz/permissions";
import { MAX_STAFF, toStaffMember } from "../../../lib/authz/staff-access";

/** Every role with its permissions, and every admin user with their roles. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const userModule = req.scope.resolve<IUserModuleService>(Modules.USER);
  const users = await userModule.listUsers(
    {},
    { take: MAX_STAFF, order: { email: "ASC" } }
  );
  res.json({
    roles: FASHION_ROLES.map((role) => ({
      role,
      permissions: ROLE_PERMISSIONS[role],
    })),
    users: users.map(toStaffMember),
  });
}
