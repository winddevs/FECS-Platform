import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { MATERIAL_INVENTORY_MODULE } from "../../../../../../modules/materialInventory";
import type MaterialInventoryModuleService from "../../../../../../modules/materialInventory/service";

/** Per-location on-hand / reserved / QC hold / damaged / available. */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const inventory = req.scope.resolve<MaterialInventoryModuleService>(
    MATERIAL_INVENTORY_MODULE
  );
  const availability = await inventory.getAvailability(req.params.id);
  res.json({ material_id: req.params.id, availability });
}
