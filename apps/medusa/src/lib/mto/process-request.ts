import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { MANUFACTURING_MODULE } from "../../modules/manufacturing";
import type ManufacturingModuleService from "../../modules/manufacturing/service";
import {
  createManufacturingOrderWorkflow,
  releaseManufacturingOrderWorkflow,
  reserveMoMaterialsWorkflow,
} from "../../workflows/manufacturing";

type QueryGraph = {
  graph: (
    q: Record<string, unknown>
  ) => Promise<{ data: Array<Record<string, any>> }>;
};

export type ClaimedRequest = {
  id: string;
  order_id: string;
  sku: string;
  product_sku: string;
  qty: number;
  status: string;
  payment_confirmed: boolean;
  mo_id: string | null;
  attempts: number;
};

const WAIT_CODES = new Set([
  "INSUFFICIENT_STOCK",
  "DYE_LOT_POLICY_VIOLATION",
  "RESERVATION_CONTENTION",
]);
const MAX_ATTEMPTS = 8;
const RETRY_SECONDS = 300;
const PAYMENT_RETRY_SECONDS = 120;

export type PaymentGate = "captured" | "authorized" | "none";

export const paymentGate = (
  env: NodeJS.ProcessEnv = process.env
): PaymentGate => {
  const v = env.MTO_PAYMENT_GATE;
  return v === "authorized" || v === "none" ? v : "captured";
};

/** Reads Medusa payment collections; the gate decides how "paid" MTO must be. */
export const isPaymentConfirmed = async (
  container: MedusaContainer,
  orderId: string,
  gate: PaymentGate
): Promise<boolean> => {
  if (gate === "none") {
    return true;
  }
  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "payment_collections.status"],
    filters: { id: orderId },
  });
  const collections: Array<{ status: string }> =
    data[0]?.payment_collections ?? [];
  if (collections.length === 0) {
    return false;
  }
  const accepted =
    gate === "captured" ? ["completed"] : ["completed", "authorized"];
  return collections.every((c) => accepted.includes(c.status));
};

/**
 * Drives one MTO request: create MO -> reserve material -> release. Missing
 * material parks the request as WAITING_MATERIAL and retries later (this is
 * the "wait state"; swap in Temporal here if SLA escalation is needed - the
 * MO/inventory remain the source of truth either way).
 */
export const processProductionRequest = async (
  container: MedusaContainer,
  request: ClaimedRequest,
  actor: { actor_id: string; correlation_id?: string | null } = {
    actor_id: "system:mto",
  }
): Promise<{
  outcome: "RELEASED" | "WAITING_MATERIAL" | "FAILED";
  mo_id?: string;
  error?: string;
}> => {
  const mfg =
    container.resolve<ManufacturingModuleService>(MANUFACTURING_MODULE);
  let moId = request.mo_id;

  try {
    if (!moId) {
      const { result } = await createManufacturingOrderWorkflow(container).run({
        input: {
          ...actor,
          idempotency_key: `mto:${request.id}`,
          order_type: "MTO",
          product_sku: request.product_sku,
          lines: [{ sku: request.sku, qty: request.qty }],
          customer_order_id: request.order_id,
        },
      });
      moId = result.id;
      await mfg.updateProductionRequest({ id: request.id, mo_id: moId });
    }

    const [mo] = await mfg.listManufacturingOrders({ id: moId });
    if (mo.status === "PLANNED" || mo.status === "MATERIAL_CHECK") {
      await reserveMoMaterialsWorkflow(container).run({
        input: { mo_id: moId, ...actor },
      });
    }
    const [reserved] = await mfg.listManufacturingOrders({ id: moId });
    if (reserved.status === "MATERIAL_RESERVED") {
      await releaseManufacturingOrderWorkflow(container).run({
        input: { mo_id: moId, ...actor },
      });
    }
    await mfg.updateProductionRequest({
      id: request.id,
      status: "MO_CREATED",
      mo_id: moId,
      error: null,
      retry_in_seconds: null,
    });
    return { outcome: "RELEASED", mo_id: moId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string }).code ?? "";
    const attempts = request.attempts + 1;
    if (WAIT_CODES.has(code) && attempts < MAX_ATTEMPTS) {
      await mfg.updateProductionRequest({
        id: request.id,
        status: "WAITING_MATERIAL",
        mo_id: moId,
        error: message,
        retry_in_seconds: RETRY_SECONDS,
        increment_attempts: true,
      });
      return {
        outcome: "WAITING_MATERIAL",
        mo_id: moId ?? undefined,
        error: message,
      };
    }
    await mfg.updateProductionRequest({
      id: request.id,
      status: "FAILED",
      mo_id: moId,
      error: message,
      retry_in_seconds: null,
      increment_attempts: true,
    });
    return { outcome: "FAILED", mo_id: moId ?? undefined, error: message };
  }
};

export { PAYMENT_RETRY_SECONDS };
