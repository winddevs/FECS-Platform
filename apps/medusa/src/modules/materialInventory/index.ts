import { Module } from "@medusajs/framework/utils";

import MaterialInventoryModuleService from "./service";

export const MATERIAL_INVENTORY_MODULE = "materialInventory";

export default Module(MATERIAL_INVENTORY_MODULE, {
  service: MaterialInventoryModuleService,
});
