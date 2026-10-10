import { model } from "@medusajs/framework/utils";

/**
 * Per-module idempotency records (BR-005). Stored in the same database as the
 * domain tables so the guard and the business write share one transaction.
 */
export const defineIdempotencyRecordModel = (tableName: string) =>
  model
    .define(tableName, {
      id: model.id({ prefix: "idem" }).primaryKey(),
      scope: model.text(),
      idempotency_key: model.text(),
      request_hash: model.text(),
      response: model.json().nullable(),
    })
    .indexes([
      {
        name: `IDX_${tableName}_scope_key_unique`,
        on: ["scope", "idempotency_key"],
        unique: true,
        where: "deleted_at IS NULL",
      },
    ]);
