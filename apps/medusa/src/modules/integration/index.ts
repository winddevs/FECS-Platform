import { Module } from "@medusajs/framework/utils";

import platformStartup from "./loaders/platform-startup";
import IntegrationModuleService from "./service";

export const INTEGRATION_MODULE = "integration";

export default Module(INTEGRATION_MODULE, {
  service: IntegrationModuleService,
  loaders: [platformStartup],
});
