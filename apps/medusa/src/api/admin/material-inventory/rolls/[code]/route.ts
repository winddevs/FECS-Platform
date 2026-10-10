import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

/** Barcode/QR lookup: roll + lot + current balances (FR-INV-012). */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: rolls } = await query.graph({
    entity: "material_roll",
    fields: ["*"],
    filters: { roll_code: req.params.code },
  });
  const roll = rolls[0];
  if (!roll) {
    res.status(404).json({
      code: "NOT_FOUND",
      type: "not_found",
      message: "Roll not found",
    });
    return;
  }
  const [{ data: lots }, { data: balances }] = await Promise.all([
    query.graph({
      entity: "material_lot",
      fields: ["*"],
      filters: { id: roll.lot_id },
    }),
    query.graph({
      entity: "material_balance",
      fields: ["*"],
      filters: { roll_id: roll.id },
    }),
  ]);
  res.json({ roll, lot: lots[0] ?? null, balances });
}
