import { Module } from "@medusajs/framework/utils";

import SocialCommerceModuleService from "./service";

export const SOCIAL_COMMERCE_MODULE = "socialCommerce";

export default Module(SOCIAL_COMMERCE_MODULE, {
  service: SocialCommerceModuleService,
});
