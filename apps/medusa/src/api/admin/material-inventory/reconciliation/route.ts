import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";

import { MATERIAL_INVENTORY_MODULE } from "../../../../modules/materialInventory";
import type MaterialInventoryModuleService from "../../../../modules/materialInventory/service";

/** Ledger vs balance vs reservations vs invariants (FR-INV-013). */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const inventory = req.scope.resolve<MaterialInventoryModuleService>(
    MATERIAL_INVENTORY_MODULE
  );
  const result = await inventory.reconcile();
  res.status(result.ok ? 200 : 409).json(result);
}
