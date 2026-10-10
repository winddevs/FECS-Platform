import { Module } from "@medusajs/framework/utils";

import QualityModuleService from "./service";

export const QUALITY_MODULE = "quality";

export default Module(QUALITY_MODULE, {
  service: QualityModuleService,
});
