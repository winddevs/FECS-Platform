import type { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createInventoryLevelsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * Demo store for a Vietnamese fashion brand (VND, one warehouse in Ho Chi Minh
 * City, J&T style flat shipping), for the local docker stack and demos.
 *
 *   npx medusa exec ./src/scripts/seed-fashion-demo.ts
 *
 * Catalogue:
 *   TEE-BLK-S/M/L    make-to-stock T-shirt, starts with NO stock (it appears
 *                    when production packs it - that is the point of the demo)
 *   BLZ-NVY-M/L      make-to-order blazer: no stock tracking, a production
 *                    request is raised for every order line
 *
 * Idempotent: running it twice leaves the first result in place.
 */
const COUNTRY = "vn";
const CURRENCY = "vnd";

export default async function seedFashionDemo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillment = container.resolve(Modules.FULFILLMENT);
  const salesChannels = container.resolve(Modules.SALES_CHANNEL);
  const stores = container.resolve(Modules.STORE);
  const apiKeys = container.resolve(Modules.API_KEY);

  const existing = await apiKeys.listApiKeys({ title: "Fashion webshop" });
  if (existing.length > 0) {
    logger.info("Fashion demo store already seeded; nothing to do.");
    return;
  }

  logger.info("Seeding the fashion demo store...");
  const [store] = await stores.listStores();
  let [channel] = await salesChannels.listSalesChannels({ name: "Webshop" });
  if (!channel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: "Webshop" }] },
    });
    channel = result[0];
  }
  await updateStoresWorkflow(container).run({
    input: {
      selector: { id: store.id },
      update: {
        name: "FECS Fashion",
        supported_currencies: [{ currency_code: CURRENCY, is_default: true }],
        default_sales_channel_id: channel.id,
      },
    },
  });

  const { result: regions } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Vietnam",
          currency_code: CURRENCY,
          countries: [COUNTRY],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  });
  const region = regions[0];
  await createTaxRegionsWorkflow(container).run({
    input: [{ country_code: COUNTRY, provider_id: "tp_system" }],
  });

  const { result: locations } = await createStockLocationsWorkflow(
    container
  ).run({
    input: {
      locations: [
        {
          name: "HCM Warehouse",
          address: {
            city: "Ho Chi Minh City",
            country_code: "VN",
            address_1: "1 Le Loi",
          },
        },
      ],
    },
  });
  const stockLocation = locations[0];
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
  });

  let [profile] = await fulfillment.listShippingProfiles({ type: "default" });
  if (!profile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    });
    profile = result[0];
  }
  const fulfillmentSet = await fulfillment.createFulfillmentSets({
    name: "HCM Warehouse delivery",
    type: "shipping",
    service_zones: [
      {
        name: "Vietnam",
        geo_zones: [{ country_code: COUNTRY, type: "country" as const }],
      },
    ],
  });
  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: stockLocation.id },
    [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
  });
  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Giao hàng tiêu chuẩn (J&T)",
        price_type: "flat",
        provider_id: "manual_manual",
        service_zone_id: fulfillmentSet.service_zones[0].id,
        shipping_profile_id: profile.id,
        type: {
          label: "Standard",
          description: "Giao trong 2-3 ngày",
          code: "standard",
        },
        prices: [
          { currency_code: CURRENCY, amount: 30000 },
          { region_id: region.id, amount: 30000 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  });
  await linkSalesChannelsToStockLocationWorkflow(container).run({
    input: { id: stockLocation.id, add: [channel.id] },
  });

  const { result: keys } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        { title: "Fashion webshop", type: "publishable", created_by: "" },
      ],
    },
  });
  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: { id: keys[0].id, add: [channel.id] },
  });

  const sizes = ["S", "M", "L"];
  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Áo thun Basic (đen)",
          handle: "basic-tee-black",
          description: "Áo thun cotton 100%, sản xuất sẵn theo kế hoạch.",
          weight: 300,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: profile.id,
          metadata: { style_sku: "TEE-BLK", fulfillment_mode: "MTS" },
          options: [{ title: "Size", values: sizes }],
          variants: sizes.map((size) => ({
            title: size,
            sku: `TEE-BLK-${size}`,
            manage_inventory: true,
            options: { Size: size },
            prices: [{ amount: 250000, currency_code: CURRENCY }],
          })),
          sales_channels: [{ id: channel.id }],
        },
        {
          title: "Áo blazer đặt may (xanh navy)",
          handle: "made-to-order-blazer-navy",
          description: "Blazer may đo theo đơn, sản xuất sau khi thanh toán.",
          weight: 900,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: profile.id,
          metadata: { style_sku: "BLZ-NVY", fulfillment_mode: "MTO" },
          options: [{ title: "Size", values: ["M", "L"] }],
          variants: ["M", "L"].map((size) => ({
            title: size,
            sku: `BLZ-NVY-${size}`,
            // Made to order: nothing is on a shelf, so Medusa must not block
            // the sale on stock; production is triggered by the order.
            manage_inventory: false,
            options: { Size: size },
            metadata: { fulfillment_mode: "MTO", style_sku: "BLZ-NVY" },
            prices: [{ amount: 1800000, currency_code: CURRENCY }],
          })),
          sales_channels: [{ id: channel.id }],
        },
      ],
    },
  });

  // Level 0 at the warehouse: the T-shirt exists in the catalogue but is not
  // sellable until finished goods are projected from production.
  const { data: items } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
  });
  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: items.map((item) => ({
        location_id: stockLocation.id,
        inventory_item_id: item.id,
        stocked_quantity: 0,
      })),
    },
  });
  logger.info(
    `Seeded: region ${region.id}, sales channel ${channel.id}, stock location ${stockLocation.id}`
  );
}
