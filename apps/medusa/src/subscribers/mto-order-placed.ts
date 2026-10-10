import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { isEnabled } from "../lib/feature-flags";
import { lineQuantity } from "../lib/medusa-number";
import { MANUFACTURING_MODULE } from "../modules/manufacturing";
import type ManufacturingModuleService from "../modules/manufacturing/service";

type Meta = Record<string, unknown> | null | undefined;
const pick = (key: string, ...sources: Meta[]): string | undefined => {
  for (const source of sources) {
    const value = source?.[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
};

/**
 * `order.placed` -> production requests for made-to-order lines. A variant (or
 * its product) is MTO when metadata.fulfillment_mode = "MTO"; metadata.style_sku
 * names the BOM/routing style. Replays are harmless (unique per order line).
 */
export default async function mtoOrderPlaced({
  event,
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  if (!isEnabled("MTO_ENABLED") || !isEnabled("MANUFACTURING_ENABLED")) {
    return;
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "items.id",
      "items.detail.quantity",
      "items.variant_sku",
      "items.variant.metadata",
      "items.variant.product.metadata",
    ],
    filters: { id: event.data.id },
  });
  const lines = (data[0]?.items ?? [])
    .map((item: any) => {
      const variantMeta = item.variant?.metadata as Meta;
      const productMeta = item.variant?.product?.metadata as Meta;
      const mode = pick("fulfillment_mode", variantMeta, productMeta);
      const style = pick("style_sku", variantMeta, productMeta);
      return mode === "MTO" && style && item.variant_sku
        ? {
            order_line_id: item.id as string,
            sku: item.variant_sku as string,
            product_sku: style,
            qty: lineQuantity(item),
          }
        : null;
    })
    .filter(
      (
        line: unknown
      ): line is {
        order_line_id: string;
        sku: string;
        product_sku: string;
        qty: number;
      } => line !== null
    );
  if (lines.length === 0) {
    return;
  }
  await container
    .resolve<ManufacturingModuleService>(MANUFACTURING_MODULE)
    .enqueueProductionRequests({
      order_id: event.data.id,
      actor_id: "system:order-placed",
      correlation_id: `order_${event.data.id}`,
      payment_confirmed: false, // the worker confirms against Medusa payments
      lines,
    });
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
