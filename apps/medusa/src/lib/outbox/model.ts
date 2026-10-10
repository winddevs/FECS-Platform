import { model } from "@medusajs/framework/utils";

export const OUTBOX_STATUSES = ["PENDING", "PUBLISHED", "FAILED"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/**
 * Each domain module owns its own outbox table so that the domain write and
 * the event intent commit in one local PostgreSQL transaction (ADR-006).
 * A publisher drains every module's outbox independently.
 */
export const defineOutboxEventModel = (tableName: string) =>
  model
    .define(tableName, {
      id: model.id({ prefix: "obx" }).primaryKey(),
      event_id: model.text(),
      event_type: model.text(),
      event_version: model.number().default(1),
      aggregate_type: model.text(),
      aggregate_id: model.text(),
      topic: model.text(),
      partition_key: model.text(),
      payload: model.json(),
      status: model.enum([...OUTBOX_STATUSES]).default("PENDING"),
      attempts: model.number().default(0),
      available_at: model.dateTime(),
      published_at: model.dateTime().nullable(),
      last_error: model.text().nullable(),
    })
    .indexes([
      {
        name: `IDX_${tableName}_event_id_unique`,
        on: ["event_id"],
        unique: true,
        where: "deleted_at IS NULL",
      },
      {
        name: `IDX_${tableName}_pending`,
        on: ["status", "available_at"],
        where: "deleted_at IS NULL",
      },
    ]);
