import { processProductionRequest } from "../../lib/mto/process-request";
import { MANUFACTURING_MODULE } from "../../modules/manufacturing";
import type ManufacturingModuleService from "../../modules/manufacturing/service";
import { wrapStep } from "./wrap";

/** Planner/ops retry of one production request (e.g. after fixing a BOM). */
export const retryProductionRequestStep = wrapStep(
  "mto-retry-production-request",
  async (
    i: { request_id: string; actor_id: string; correlation_id?: string | null },
    c
  ) => {
    const mfg = c.resolve<ManufacturingModuleService>(MANUFACTURING_MODULE);
    const [request] = await mfg.listProductionRequests({ id: i.request_id });
    if (!request) {
      throw new Error(`Production request ${i.request_id} not found`);
    }
    await mfg.updateProductionRequest({
      id: request.id,
      status: "REQUESTED",
      retry_in_seconds: null,
      error: null,
    });
    return await processProductionRequest(
      c as never,
      {
        id: request.id,
        order_id: request.order_id,
        sku: request.sku,
        product_sku: request.product_sku,
        qty: Number(request.qty),
        status: "REQUESTED",
        payment_confirmed: true,
        mo_id: request.mo_id,
        attempts: Number(request.attempts),
      },
      { actor_id: i.actor_id, correlation_id: i.correlation_id }
    );
  }
);
