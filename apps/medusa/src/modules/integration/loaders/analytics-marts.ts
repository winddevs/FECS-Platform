import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { MART_DEFINITIONS } from "../../../lib/analytics/marts";

type Knex = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: any[] }>;
};

/** Marts read tables of several modules, so they exist only once all migrations ran. */
const REQUIRED_TABLES = [
  "material_stock_movement",
  "cut_plan",
  "packing_record",
  "quality_inspection",
  "operation_execution",
  "work_center",
  "material_balance",
  "material_lot",
  "fg_batch",
  "fg_movement",
  "carrier_shipment",
  "return_authorization",
  "rma_item",
  "purchase_order_line",
  "bom",
  "routing",
  "cart",
  "order",
];
const LOCK_KEY = "fashion:analytics-marts";

/**
 * Creates the read-only analytics views (requirement section 27) at start-up.
 * It is a loader and not a migration because the views read tables of many
 * modules, and modules migrate in no fixed order. `CREATE OR REPLACE` makes it
 * idempotent; an advisory lock keeps several starting processes from racing;
 * a failure is logged and never stops the platform from starting.
 */
export default async function analyticsMarts(
  container: MedusaContainer
): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const db = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  try {
    const present = await db.raw(
      `SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY(?)`,
      [REQUIRED_TABLES]
    );
    if (present.rows[0].n < REQUIRED_TABLES.length) {
      return; // first start, before db:migrate: nothing to build on yet
    }
    const lock = await db.raw(
      `SELECT pg_try_advisory_lock(hashtext(?)) AS ok`,
      [LOCK_KEY]
    );
    if (!lock.rows[0].ok) {
      return; // another process is creating them right now
    }
    try {
      await db.raw(`CREATE SCHEMA IF NOT EXISTS analytics`);
      for (const [name, select] of MART_DEFINITIONS) {
        await db.raw(`CREATE OR REPLACE VIEW analytics.${name} AS ${select}`);
      }
    } finally {
      await db.raw(`SELECT pg_advisory_unlock(hashtext(?))`, [LOCK_KEY]);
    }
  } catch (error) {
    logger.warn(
      `[analytics] could not create the marts: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
