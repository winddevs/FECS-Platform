import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * One scan endpoint for the warehouse floor: send whatever the scanner read
 * and get back what it is (roll, location) with its current stock
 * (FR-INV-012). Bundles are scanned at /admin/manufacturing/bundles/by-code.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { code } = req.params;

  const { data: rolls } = await query.graph({
    entity: "material_roll",
    fields: ["*"],
    filters: { roll_code: code },
  });
  if (rolls[0]) {
    const { data: balances } = await query.graph({
      entity: "material_balance",
      fields: ["*"],
      filters: { roll_id: rolls[0].id },
    });
    res.json({ type: "ROLL", roll: rolls[0], balances });
    return;
  }

  const { data: locations } = await query.graph({
    entity: "material_location",
    fields: ["*"],
    filters: { code },
  });
  if (locations[0]) {
    const { data: balances } = await query.graph({
      entity: "material_balance",
      fields: ["*"],
      filters: { location_id: locations[0].id },
      pagination: { take: 200 },
    });
    res.json({ type: "LOCATION", location: locations[0], balances });
    return;
  }

  res.status(404).json({
    code: "NOT_FOUND",
    type: "not_found",
    message: "Nothing is registered under that code",
  });
}
