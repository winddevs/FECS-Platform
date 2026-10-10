import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { createCartWorkflow } from "@medusajs/medusa/core-flows";

import { FINISHED_GOODS_MODULE } from "../../modules/finishedGoods";
import type FinishedGoodsModuleService from "../../modules/finishedGoods/service";
import { FASHION_FULFILLMENT_MODULE } from "../../modules/fulfillment";
import type FulfillmentModuleService from "../../modules/fulfillment/service";
import { MANUFACTURING_MODULE } from "../../modules/manufacturing";
import type ManufacturingModuleService from "../../modules/manufacturing/service";
import { toNumber } from "../medusa-number";
import { productionStatusForOrder } from "../mto/production-status";
import { signCheckoutToken } from "./checkout-link";
import type { SocialReaders } from "./tools";

type QueryGraph = {
  graph: (
    q: Record<string, unknown>
  ) => Promise<{ data: Array<Record<string, any>> }>;
};

const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Production readers. Every order query is filtered by customer_id inside the
 * query itself, so a customer can never read someone else's order even if an
 * order number is guessed.
 */
export const createMedusaReaders = (
  container: MedusaContainer,
  env: NodeJS.ProcessEnv = process.env
): SocialReaders => {
  const query = container.resolve<QueryGraph>(ContainerRegistrationKeys.QUERY);
  return {
    async findOrder(customerId, ref) {
      const { data } = await query.graph({
        entity: "order",
        // `version` is required for Medusa to compute `total` on filtered queries.
        fields: [
          "id",
          "version",
          "display_id",
          "total",
          "currency_code",
          "created_at",
        ],
        filters: {
          customer_id: customerId,
          ...(ref ? { display_id: Number(ref) } : {}),
        },
        pagination: { take: 1, order: { created_at: "DESC" } },
      });
      const order = data[0];
      return order
        ? {
            id: order.id,
            display_id: order.display_id,
            total: toNumber(order.total),
            currency_code: order.currency_code,
          }
        : null;
    },
    async shipmentsForOrder(orderId) {
      const rows = await container
        .resolve<FulfillmentModuleService>(FASHION_FULFILLMENT_MODULE)
        .shipmentsForOrder(orderId);
      return rows.map((r) => ({
        tracking_number: r.tracking_number,
        status: r.status,
      }));
    },
    async productionStatusForOrder(orderId) {
      const result = await productionStatusForOrder(
        {
          mfg: container.resolve<ManufacturingModuleService>(
            MANUFACTURING_MODULE
          ),
          fg: container.resolve<FinishedGoodsModuleService>(
            FINISHED_GOODS_MODULE
          ),
        },
        orderId
      );
      return result?.status ?? null;
    },
    async searchProducts(text) {
      const { data } = await query.graph({
        entity: "product",
        fields: ["title", "variants.sku"],
        filters: {
          status: "published",
          title: { $ilike: `%${escapeLike(text)}%` },
        },
        pagination: { take: 5 },
      });
      return data.map((p) => ({
        title: p.title,
        sku: p.variants?.[0]?.sku ?? null,
      }));
    },
    async createCheckoutLink(customerId, sku, qty) {
      const secret = env.SOCIAL_LINK_SECRET;
      const storefront = env.STOREFRONT_URL;
      if (!secret || !storefront) {
        return null;
      }
      // Region and sales channel default to the store's own when not pinned.
      const regionId =
        env.SOCIAL_REGION_ID ??
        (
          await query.graph({
            entity: "region",
            fields: ["id"],
            pagination: { take: 1 },
          })
        ).data[0]?.id;
      const salesChannelId =
        env.SOCIAL_SALES_CHANNEL_ID ??
        (
          await query.graph({
            entity: "store",
            fields: ["default_sales_channel_id"],
          })
        ).data[0]?.default_sales_channel_id;
      if (!regionId || !salesChannelId) {
        return null;
      }
      // Only published products can be bought, exactly like product search.
      const { data } = await query.graph({
        entity: "product_variant",
        fields: ["id", "product.status"],
        filters: { sku },
      });
      const variant = data.find(
        (v: { product?: { status?: string } }) =>
          v.product?.status === "published"
      );
      if (!variant) {
        return null;
      }
      const { result } = await createCartWorkflow(container).run({
        input: {
          region_id: regionId,
          sales_channel_id: salesChannelId,
          customer_id: customerId,
          items: [
            {
              variant_id: variant.id,
              quantity: Math.min(Math.max(qty, 1), 20),
            },
          ],
          metadata: { source: "messenger" },
        },
      });
      return `${storefront.replace(/\/$/, "")}/checkout/social?token=${signCheckoutToken(result.id, customerId, secret)}`;
    },
  };
};
