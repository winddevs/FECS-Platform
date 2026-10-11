import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { INTEGRATION_MODULE } from "../../../modules/integration";
import type IntegrationModuleService from "../../../modules/integration/service";
import type { CountryProfileBody } from "../../fashion/schemas";

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const integration =
    req.scope.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  res.json({ country_profiles: await integration.listCountryProfiles({}) });
}

/** Creates or updates the profile of one country (upsert by country code). */
export async function POST(
  req: AuthenticatedMedusaRequest<CountryProfileBody>,
  res: MedusaResponse
): Promise<void> {
  const integration =
    req.scope.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  const profile = await integration.saveCountryProfile({
    ...req.validatedBody,
    updated_by: req.auth_context.actor_id,
  });
  await integration.recordAudit({
    actor_id: req.auth_context.actor_id,
    action: "config.country_profile.save",
    resource_type: "country_profile",
    resource_id: req.validatedBody.country_code,
    after: req.validatedBody as unknown as Record<string, unknown>,
  });
  res.status(201).json({ country_profile: profile });
}
