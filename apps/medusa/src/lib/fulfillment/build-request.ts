import type {
  CarrierParty,
  CreateShipmentRequest,
} from "../../integrations/carrier/provider";

type AddressLike = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address_1?: string | null;
  address_2?: string | null;
  city?: string | null;
  province?: string | null;
  country_code?: string | null;
};

export type OrderLike = {
  id: string;
  display_id?: number | null;
  total?: number | string | null;
  payment_status?: string | null;
  shipping_address?: AddressLike | null;
  /** Units on the whole order; with the two fields below it splits COD. */
  units_ordered?: number | null;
  /** Units already sent in other, non-cancelled shipments of this order. */
  units_in_other_shipments?: number | null;
  /** COD already assigned to those other shipments. */
  cod_in_other_shipments?: number | null;
};

export type FulfillmentLike = {
  id: string;
  items?: Array<{
    title?: string | null;
    sku?: string | null;
    quantity?: number | null;
  }> | null;
  delivery_address?: AddressLike | null;
};

const DEFAULT_ITEM_WEIGHT_GRAMS = 300;

const toParty = (address: AddressLike | null | undefined): CarrierParty => ({
  name:
    [address?.first_name, address?.last_name].filter(Boolean).join(" ") ||
    "Customer",
  phone: address?.phone ?? "",
  address_line: [address?.address_1, address?.address_2]
    .filter(Boolean)
    .join(", "),
  district: address?.city ?? null,
  province: address?.province ?? null,
  country: (address?.country_code ?? "vn").toUpperCase(),
});

export const senderFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): CarrierParty => ({
  name: env.CARRIER_SENDER_NAME ?? "Warehouse",
  phone: env.CARRIER_SENDER_PHONE ?? "",
  address_line: env.CARRIER_SENDER_ADDRESS ?? "",
  district: env.CARRIER_SENDER_DISTRICT ?? null,
  province: env.CARRIER_SENDER_PROVINCE ?? null,
  country: env.CARRIER_SENDER_COUNTRY ?? "VN",
});

/**
 * Builds the carrier-neutral request. The merchant reference is derived from
 * the fulfillment id, so retries and reconciliation always use the same key.
 * COD is only collected for unpaid orders when CARRIER_COD_ENABLED=true.
 */
export const buildShipmentRequest = (
  order: OrderLike,
  fulfillment: FulfillmentLike,
  env: NodeJS.ProcessEnv = process.env
): CreateShipmentRequest => {
  const items = (fulfillment.items ?? []).map((item) => ({
    name: item.title ?? item.sku ?? "Item",
    qty: Number(item.quantity ?? 1),
    sku: item.sku ?? null,
  }));
  const units = items.reduce((sum, item) => sum + item.qty, 0);
  const orderTotal = Number(order.total ?? 0);
  const { value: total, last } = shareOfOrder(order, units, orderTotal);
  const unpaid =
    order.payment_status !== "captured" && order.payment_status !== "paid";
  return {
    merchant_reference: `F-${fulfillment.id}`,
    service_code: env.CARRIER_SERVICE_CODE ?? null,
    sender: senderFromEnv(env),
    receiver: toParty(fulfillment.delivery_address ?? order.shipping_address),
    parcel: {
      weight_grams:
        Math.max(1, units) *
        Number(env.ITEM_DEFAULT_WEIGHT_GRAMS ?? DEFAULT_ITEM_WEIGHT_GRAMS),
      declared_value: total,
      items,
    },
    cod_amount:
      env.CARRIER_COD_ENABLED === "true" && unpaid
        ? codShare(order, total, orderTotal, last)
        : 0,
    notes: order.display_id ? `Order #${order.display_id}` : null,
  };
};

/**
 * An order may ship in several parcels. Charging the whole order total on
 * each one would collect it more than once, so each parcel carries its share
 * by units, and the parcel that completes the order carries the remainder.
 */
const shareOfOrder = (
  order: OrderLike,
  units: number,
  orderTotal: number
): { value: number; last: boolean } => {
  const ordered = Number(order.units_ordered ?? 0);
  if (ordered <= 0) {
    return { value: orderTotal, last: true };
  }
  const already = Number(order.units_in_other_shipments ?? 0);
  const last = already + units >= ordered;
  return { value: Math.round((orderTotal * units) / ordered), last };
};

const codShare = (
  order: OrderLike,
  share: number,
  orderTotal: number,
  last: boolean
): number => {
  const assigned = Number(order.cod_in_other_shipments ?? 0);
  const remaining = Math.max(0, orderTotal - assigned);
  return last ? remaining : Math.min(share, remaining);
};
