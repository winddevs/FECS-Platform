import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import {
  DEFAULT_CARRIER,
  getCarrierProvider,
} from "../../integrations/carrier/registry";
import {
  buildShipmentRequest,
  type FulfillmentLike,
  type OrderLike,
} from "../../lib/fulfillment/build-request";
import { createCarrierShipment } from "../../lib/fulfillment/create-shipment";
import { lineQuantity, toNumber } from "../../lib/medusa-number";
import { FINISHED_GOODS_MODULE } from "../../modules/finishedGoods";
import type FinishedGoodsModuleService from "../../modules/finishedGoods/service";
import { FASHION_FULFILLMENT_MODULE } from "../../modules/fulfillment";
import type FulfillmentModuleService from "../../modules/fulfillment/service";
import { INTEGRATION_MODULE } from "../../modules/integration";
import type IntegrationModuleService from "../../modules/integration/service";
import { wrapStep, type Resolver } from "./wrap";

type QueryGraph = {
  graph: (
    q: Record<string, unknown>
  ) => Promise<{ data: Array<Record<string, any>> }>;
};

export type FulfillmentCreatedInput = {
  order_id: string;
  fulfillment_id: string;
  actor_id: string;
  correlation_id?: string | null;
};

/** Reads the order + fulfillment the way Medusa stores them. */
const loadFulfillmentContext = async (
  c: Resolver,
  input: FulfillmentCreatedInput
) => {
  const query = c.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "version",
      "display_id",
      "total",
      "shipping_address.*",
      "payment_collections.status",
      "fulfillments.id",
      "fulfillments.location_id",
      "fulfillments.items.*",
      "fulfillments.delivery_address.*",
      "items.id",
      "items.detail.quantity",
    ],
    filters: { id: input.order_id },
  });
  const order = orders[0];
  const fulfillment = order?.fulfillments?.find(
    (f: { id: string }) => f.id === input.fulfillment_id
  );
  if (!order || !fulfillment) {
    return null;
  }
  const collections: Array<{ status: string }> =
    order.payment_collections ?? [];
  // An authorized card payment will be captured later: collecting it again as
  // COD would charge the customer twice.
  const paid =
    collections.length > 0 &&
    collections.every((p) => ["completed", "authorized"].includes(p.status));
  const others = await c
    .resolve<FulfillmentModuleService>(FASHION_FULFILLMENT_MODULE)
    .listCarrierShipments({ order_id: input.order_id });
  const active = others.filter(
    (s) =>
      s.status !== "CANCELLED" &&
      s.medusa_fulfillment_id !== input.fulfillment_id &&
      !s.return_id
  );
  const orderLike: OrderLike = {
    id: order.id,
    display_id: order.display_id,
    total: order.total,
    payment_status: paid ? "paid" : "not_paid",
    shipping_address: order.shipping_address,
    units_ordered: (order.items ?? []).reduce(
      (sum: number, item: Parameters<typeof lineQuantity>[0]) =>
        sum + lineQuantity(item),
      0
    ),
    units_in_other_shipments: active.reduce(
      (sum, s) =>
        sum +
        (
          ((s.request as { parcel?: { items?: Array<{ qty?: number }> } })
            ?.parcel?.items ?? []) as Array<{ qty?: number }>
        ).reduce((n, i) => n + Number(i.qty ?? 0), 0),
      0
    ),
    cod_in_other_shipments: active.reduce(
      (sum, s) =>
        sum + Number((s.request as { cod_amount?: number })?.cod_amount ?? 0),
      0
    ),
  };
  return {
    order: orderLike,
    fulfillment: fulfillment as FulfillmentLike & {
      location_id?: string | null;
    },
  };
};

/**
 * Creates the carrier shipment for a Medusa fulfillment. Carrier problems are
 * returned as state (PENDING/RETRYABLE/UNKNOWN) rather than thrown, so the
 * order/fulfillment itself is never rolled back by a carrier outage.
 */
export const createShipmentForFulfillmentStep = wrapStep(
  "fulfillment-created-create-shipment",
  async (input: FulfillmentCreatedInput, c) => {
    const context = await loadFulfillmentContext(c, input);
    if (!context) {
      return { skipped: true as const, reason: "FULFILLMENT_NOT_FOUND" };
    }
    // The carrier of the delivery country (section 26), else the default one.
    const profile = await c
      .resolve<IntegrationModuleService>(INTEGRATION_MODULE)
      .profileFor(context.order.shipping_address?.country_code);
    const provider = getCarrierProvider(
      profile?.carrier_code ?? DEFAULT_CARRIER
    );
    const shipment = await createCarrierShipment(
      c.resolve<FulfillmentModuleService>(FASHION_FULFILLMENT_MODULE),
      provider,
      {
        actor_id: input.actor_id,
        correlation_id: input.correlation_id,
        order_id: input.order_id,
        medusa_fulfillment_id: input.fulfillment_id,
        request: buildShipmentRequest(context.order, context.fulfillment),
      }
    );
    return { skipped: false as const, shipment };
  }
);

/**
 * Mirrors the physical hand-off into the FG ledger so FG stock and Medusa
 * stock decrease together (see FG docs on projection timing). Per-item
 * failures are reported, never thrown: shipping must not be blocked by a
 * stock discrepancy that finance/warehouse reconcile separately.
 */
export const shipFinishedGoodsForFulfillmentStep = wrapStep(
  "fulfillment-created-ship-fg",
  async (input: FulfillmentCreatedInput, c) => {
    const context = await loadFulfillmentContext(c, input);
    if (!context) {
      return {
        shipped: [],
        failed: [] as Array<{ sku: string; error: string }>,
      };
    }
    const fg = c.resolve<FinishedGoodsModuleService>(FINISHED_GOODS_MODULE);
    const stockLocationId = context.fulfillment.location_id ?? null;
    const [location] = stockLocationId
      ? await fg.listFgLocations({ medusa_stock_location_id: stockLocationId })
      : [];
    const shipped: string[] = [];
    const failed: Array<{ sku: string; error: string }> = [];
    if (!location) {
      failed.push({
        sku: "*",
        error: `no FG location mapped to stock location ${stockLocationId}`,
      });
    }
    for (const item of location ? (context.fulfillment.items ?? []) : []) {
      if (!item.sku || !item.quantity) {
        continue;
      }
      try {
        await fg.shipFinishedGoods({
          actor_id: input.actor_id,
          correlation_id: input.correlation_id,
          idempotency_key: `ful:${input.fulfillment_id}:${item.sku}`,
          sku: item.sku,
          location_id: (location as { id: string }).id,
          qty: toNumber(item.quantity),
          reference_type: "FULFILLMENT",
          reference_id: input.fulfillment_id,
          order_id: input.order_id,
        });
        shipped.push(item.sku);
      } catch (error) {
        failed.push({
          sku: item.sku,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (failed.length > 0) {
      // Shipping must not be blocked by a stock discrepancy, but it must never
      // be silent either: warehouse and finance reconcile from this line.
      c.resolve<{ error: (message: string) => void }>("logger").error(
        `[fulfillment] FG ship-out incomplete for fulfillment ${input.fulfillment_id}: ${failed
          .map((f) => `${f.sku}: ${f.error}`)
          .join("; ")}`
      );
    }
    return { shipped, failed };
  }
);
