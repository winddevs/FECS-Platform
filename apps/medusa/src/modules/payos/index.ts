import { ModuleProvider, Modules } from "@medusajs/framework/utils";

import PayosProviderService from "./service";

export default ModuleProvider(Modules.PAYMENT, {
  services: [PayosProviderService],
});
