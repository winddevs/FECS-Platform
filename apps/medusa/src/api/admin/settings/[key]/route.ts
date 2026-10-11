import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import {
  clearSettingsCache,
  isSettingKey,
  SETTINGS,
} from "../../../../lib/config/settings";
import { INTEGRATION_MODULE } from "../../../../modules/integration";
import type IntegrationModuleService from "../../../../modules/integration/service";
import type { SettingValueBody } from "../../../fashion/schemas";

const invalid = (res: MedusaResponse, message: string) =>
  res
    .status(400)
    .json({ code: "INVALID_STATE", type: "invalid_data", message });

/**
 * Sets (PUT) or clears (DELETE) a setting. The value is checked against the
 * rule of that key first, and every change is written to the audit trail.
 */
export async function PUT(
  req: AuthenticatedMedusaRequest<SettingValueBody>,
  res: MedusaResponse
): Promise<void> {
  const key = req.params.key;
  if (!isSettingKey(key)) {
    res
      .status(404)
      .json({
        code: "NOT_FOUND",
        type: "not_found",
        message: "Unknown setting",
      });
    return;
  }
  const { value, scope_type, scope_id } = req.validatedBody;
  const definition = SETTINGS[key];
  if (
    scope_type !== "GLOBAL" &&
    !(definition.scopes as readonly string[]).includes(scope_type)
  ) {
    invalid(res, `${key} cannot be set per ${scope_type.toLowerCase()}`);
    return;
  }
  if (scope_type !== "GLOBAL" && !scope_id) {
    invalid(res, "scope_id is required for a country or warehouse override");
    return;
  }
  const parsed = definition.schema.safeParse(value);
  if (!parsed.success) {
    invalid(
      res,
      `Invalid value for ${key}: ${parsed.error.issues[0]?.message}`
    );
    return;
  }
  const integration =
    req.scope.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  const before = await integration.storedSetting(
    key,
    scope_type === "GLOBAL" ? [] : [{ scope_type, scope_id }]
  );
  await integration.saveSetting({
    key,
    scope_type,
    scope_id: scope_type === "GLOBAL" ? "" : scope_id,
    value: parsed.data,
    updated_by: req.auth_context.actor_id,
  });
  await integration.recordAudit({
    actor_id: req.auth_context.actor_id,
    action: "config.setting.set",
    resource_type: "platform_setting",
    resource_id: `${key}|${scope_type}|${scope_id}`,
    before: { value: before ?? null },
    after: { value: parsed.data },
  });
  clearSettingsCache();
  res.json({ key, scope_type, scope_id, value: parsed.data });
}

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const key = req.params.key;
  if (!isSettingKey(key)) {
    res
      .status(404)
      .json({
        code: "NOT_FOUND",
        type: "not_found",
        message: "Unknown setting",
      });
    return;
  }
  const scopeType = String(req.query.scope_type ?? "GLOBAL");
  const scopeId = String(req.query.scope_id ?? "");
  if (!["GLOBAL", "COUNTRY", "WAREHOUSE"].includes(scopeType)) {
    invalid(res, "scope_type must be GLOBAL, COUNTRY or WAREHOUSE");
    return;
  }
  const integration =
    req.scope.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  const result = await integration.removeSetting({
    key,
    scope_type: scopeType as "GLOBAL" | "COUNTRY" | "WAREHOUSE",
    scope_id: scopeType === "GLOBAL" ? "" : scopeId,
  });
  await integration.recordAudit({
    actor_id: req.auth_context.actor_id,
    action: "config.setting.clear",
    resource_type: "platform_setting",
    resource_id: `${key}|${scopeType}|${scopeId}`,
  });
  clearSettingsCache();
  res.json({ key, ...result });
}
