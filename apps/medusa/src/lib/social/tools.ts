import type { CustomerProductionStatus } from "../../modules/manufacturing/lib/production-status";

/**
 * Typed Tool Gateway contract (ADR-008, TDD s.27). The bot - and any future
 * LLM agent - can only reach commerce data through these read functions. They
 * receive a *customer id*, never a DB handle or provider secret, and every
 * implementation must scope its query to that customer.
 */
export type OrderSummary = {
  id: string;
  display_id: number | string;
  total: number | string;
  currency_code: string;
};

export type ShipmentSummary = {
  tracking_number: string | null;
  status: string;
};

export type ProductHit = { title: string; sku: string | null };

export interface SocialReaders {
  /** Must filter by customer_id; `ref` is a display id or null for "latest". */
  findOrder(
    customerId: string,
    ref: string | null
  ): Promise<OrderSummary | null>;
  shipmentsForOrder(orderId: string): Promise<ShipmentSummary[]>;
  productionStatusForOrder(
    orderId: string
  ): Promise<CustomerProductionStatus | null>;
  searchProducts(query: string): Promise<ProductHit[]>;
  /**
   * State-changing: creates a cart FOR the linked customer and returns a
   * short-lived secure link bound to that customer.
   */
  createCheckoutLink(
    customerId: string,
    sku: string,
    qty: number
  ): Promise<string | null>;
}
