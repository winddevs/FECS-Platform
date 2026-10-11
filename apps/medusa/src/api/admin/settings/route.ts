import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import {
  readSetting,
  SETTINGS,
  type SettingKey,
} from "../../../lib/config/settings";
import { INTEGRATION_MODULE } from "../../../modules/integration";
import type IntegrationModuleService from "../../../modules/integration/service";

/** Every setting with its rule, the effective value and the stored overrides. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const integration =
    req.scope.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  const stored = await integration.listPlatformSettings({});
  const settings = [];
  for (const key of Object.keys(SETTINGS) as SettingKey[]) {
    settings.push({
      key,
      description: SETTINGS[key].description,
      scopes: ["GLOBAL", ...SETTINGS[key].scopes],
      effective: await readSetting(req.scope, key),
      overrides: stored
        .filter((row) => row.key === key)
        .map((row) => ({
          scope_type: row.scope_type,
          scope_id: row.scope_id,
          value: row.value,
          updated_by: row.updated_by,
        })),
    });
  }
  res.json({ settings });
}
