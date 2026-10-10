import { Module } from "@medusajs/framework/utils";

import ManufacturingModuleService from "./service";

export const MANUFACTURING_MODULE = "manufacturing";

export default Module(MANUFACTURING_MODULE, {
  service: ManufacturingModuleService,
});
