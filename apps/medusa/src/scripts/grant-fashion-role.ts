import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

import {
  FASHION_ROLES,
  rolesFromMetadata,
  type FashionRole,
} from "../lib/authz/permissions";

/**
 * Grants fashion-platform roles to an admin user.
 *
 *   npx medusa exec ./src/scripts/grant-fashion-role.ts <email> <ROLE> [ROLE...]
 *
 * Users without a role cannot call the fashion ERP endpoints.
 */
export default async function grantFashionRole({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const [email, ...requested] = args ?? [];

  const invalid = requested.filter(
    (r) => !(FASHION_ROLES as readonly string[]).includes(r)
  );
  if (!email || requested.length === 0 || invalid.length > 0) {
    logger.error(
      `Usage: grant-fashion-role <email> <ROLE...>. Valid roles: ${FASHION_ROLES.join(", ")}` +
        (invalid.length > 0 ? ` (invalid: ${invalid.join(", ")})` : "")
    );
    return;
  }

  const userModule = container.resolve(Modules.USER);
  const [user] = await userModule.listUsers({ email });
  if (!user) {
    logger.error(`No admin user with email ${email}`);
    return;
  }

  const roles = [
    ...new Set([
      ...rolesFromMetadata(user.metadata),
      ...(requested as FashionRole[]),
    ]),
  ];
  await userModule.updateUsers({
    id: user.id,
    metadata: { ...user.metadata, fashion_roles: roles },
  });
  logger.info(`User ${email} now has roles: ${roles.join(", ")}`);
}
