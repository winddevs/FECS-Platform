import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import type { IUserModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

import { rolesFromMetadata } from "../../../../../lib/authz/permissions";
import { ROLE_METADATA_KEY } from "../../../../../lib/authz/protect-role-metadata";
import {
  MAX_STAFF,
  removesLastErpAdmin,
  toStaffMember,
} from "../../../../../lib/authz/staff-access";
import { actorOf } from "../../../../../lib/http/request-context";
import { INTEGRATION_MODULE } from "../../../../../modules/integration";
import type IntegrationModuleService from "../../../../../modules/integration/service";
import type { SetUserRolesBody } from "../../../../fashion/schemas";

/**
 * Replaces the fashion roles of one admin user. The change applies from the
 * user's next request, and is written to the audit trail.
 */
export async function PUT(
  req: AuthenticatedMedusaRequest<SetUserRolesBody>,
  res: MedusaResponse
): Promise<void> {
  const userModule = req.scope.resolve<IUserModuleService>(Modules.USER);
  const targetId = req.params.id;
  const { roles } = req.validatedBody;
  const users = await userModule.listUsers(
    {},
    { take: MAX_STAFF, order: { email: "ASC" } }
  );
  const target = users.find((user) => user.id === targetId);
  if (!target) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "No admin user with this id",
    });
    return;
  }
  if (removesLastErpAdmin(users, targetId, roles)) {
    res.status(400).json({
      code: "INVALID_STATE",
      type: "invalid_data",
      message:
        "At least one user must keep the ERP_ADMIN role. Give it to someone else first.",
    });
    return;
  }
  const before = rolesFromMetadata(target.metadata);
  const updated = await userModule.updateUsers({
    id: targetId,
    metadata: { ...target.metadata, [ROLE_METADATA_KEY]: roles },
  });
  const integration =
    req.scope.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  const actor = actorOf(req);
  await integration.recordAudit({
    actor_id: actor.actor_id,
    action: "access.roles.set",
    resource_type: "admin_user",
    resource_id: targetId,
    before: { roles: before },
    after: { roles },
    correlation_id: actor.correlation_id,
  });
  res.json({ user: toStaffMember(updated) });
}
