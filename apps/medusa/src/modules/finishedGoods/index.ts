import { Module } from "@medusajs/framework/utils";

import FinishedGoodsModuleService from "./service";

export const FINISHED_GOODS_MODULE = "finishedGoods";

export default Module(FINISHED_GOODS_MODULE, {
  service: FinishedGoodsModuleService,
});
