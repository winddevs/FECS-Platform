import { Module } from "@medusajs/framework/utils";

import FulfillmentModuleService from "./service";

export const FASHION_FULFILLMENT_MODULE = "fashionFulfillment";

export default Module(FASHION_FULFILLMENT_MODULE, {
  service: FulfillmentModuleService,
});
