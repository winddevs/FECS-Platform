import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { retentionRules } from "../lib/retention";

type Knex = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rowCount?: number }>;
};

const BATCH = 5000;

/**
 * Daily pruning of delivery-plumbing tables in bounded batches, so a large
 * backlog never produces a long lock or a huge transaction.
 */
export default async function pruneOperationalTables(
  container: MedusaContainer
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const db = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);

  for (const rule of retentionRules()) {
    let total = 0;
    try {
      for (;;) {
        // table/condition come from the constant rule list above, never from input.
        const result = await db.raw(
          `DELETE FROM "${rule.table}" WHERE id IN (
             SELECT id FROM "${rule.table}"
             WHERE ${rule.condition} AND created_at < now() - (? || ' days')::interval
             LIMIT ${BATCH})`,
          [String(rule.days)]
        );
        const deleted = result.rowCount ?? 0;
        total += deleted;
        if (deleted < BATCH) break;
      }
      if (total > 0) {
        logger.info(
          `[retention] ${rule.table}: pruned ${total} rows older than ${rule.days}d`
        );
      }
    } catch (error) {
      logger.error(
        `[retention] ${rule.table}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const config = {
  name: "prune-operational-tables",
  schedule: "30 3 * * *",
};
