import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { MATERIAL_INVENTORY_MODULE } from "../../../../../../modules/materialInventory";
import type MaterialInventoryModuleService from "../../../../../../modules/materialInventory/service";

/**
 * The fabric rolls reserved for this MO, so the cutting table knows which
 * rolls a cut plan may use (FR-MFG-006).
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const inventory = req.scope.resolve<MaterialInventoryModuleService>(
    MATERIAL_INVENTORY_MODULE
  );
  const { data: requirements } = await query.graph({
    entity: "mo_material_requirement",
    fields: ["material_id"],
    filters: { mo_id: req.params.id },
  });
  const rolls: Array<{
    material_id: string;
    roll_code: string;
    assigned: number;
    roll_qty: number;
  }> = [];
  for (const requirement of requirements) {
    const assigned = await inventory.rollsAssignedTo(
      "MO",
      req.params.id,
      requirement.material_id
    );
    for (const [roll_code, value] of assigned) {
      rolls.push({
        material_id: requirement.material_id,
        roll_code,
        ...value,
      });
    }
  }
  res.json({ rolls });
}
