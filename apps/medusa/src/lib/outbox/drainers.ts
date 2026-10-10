import type { OutboxPublishFn, DrainResult } from "./outbox";

/**
 * Every bounded context that writes an outbox (ADR-006). Adding a module with
 * its own outbox = adding one line here; the publisher job needs no change.
 */
export const OUTBOX_MODULES = [
  "materialInventory",
  "procurement",
  "manufacturing",
  "quality",
  "finishedGoods",
  "fashionFulfillment",
  "socialCommerce",
  "returns",
] as const;

export type OutboxModuleService = {
  publishOutbox: (
    limit: number,
    publish: OutboxPublishFn
  ) => Promise<DrainResult>;
};
