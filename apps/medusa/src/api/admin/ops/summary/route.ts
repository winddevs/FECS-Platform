import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { flagSnapshot } from "../../../../lib/feature-flags";

const OUTBOX_TABLES = [
  "material_inventory_outbox_event",
  "procurement_outbox_event",
  "manufacturing_outbox_event",
  "quality_outbox_event",
  "finished_goods_outbox_event",
  "fulfillment_outbox_event",
  "social_outbox_event",
  "returns_outbox_event",
] as const;

type Knex = {
  raw: (
    sql: string,
    bindings?: unknown[]
  ) => Promise<{ rows: Array<Record<string, any>> }>;
};

/**
 * One-glance operational health for SRE/on-call: outbox/inbox backlog, stuck
 * shipments and requests, and which risky integrations are switched on.
 * Read-only; the numbers drive the alerts in docs/runbooks.
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const db = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const outbox: Record<string, unknown> = {};
  for (const table of OUTBOX_TABLES) {
    const { rows } = await db.raw(
      `SELECT status, count(*)::int AS n,
              COALESCE(EXTRACT(EPOCH FROM now() - MIN(created_at)), 0)::int AS oldest_seconds
       FROM "${table}" WHERE status <> 'PUBLISHED' AND deleted_at IS NULL GROUP BY status`
    );
    outbox[table] = rows;
  }
  const single = async (sql: string) => (await db.raw(sql)).rows;
  res.json({
    generated_at: new Date().toISOString(),
    feature_flags: flagSnapshot(),
    outbox,
    inbox: await single(
      `SELECT provider, status, count(*)::int AS n FROM "inbox_event" WHERE deleted_at IS NULL AND status <> 'PROCESSED' GROUP BY provider, status`
    ),
    shipments_needing_attention: await single(
      `SELECT create_state, count(*)::int AS n FROM "carrier_shipment" WHERE create_state <> 'SUCCEEDED' AND deleted_at IS NULL GROUP BY create_state`
    ),
    stale_tracking: await single(
      `SELECT count(*)::int AS n FROM "carrier_shipment" WHERE create_state = 'SUCCEEDED' AND status NOT IN ('DELIVERED','RETURNED','CANCELLED') AND COALESCE(last_event_at, created_at) < now() - interval '48 hours' AND deleted_at IS NULL`
    ),
    production_requests: await single(
      `SELECT status, count(*)::int AS n FROM "production_request" WHERE status IN ('WAITING_MATERIAL','FAILED') AND deleted_at IS NULL GROUP BY status`
    ),
    open_manufacturing_exceptions: await single(
      `SELECT type, count(*)::int AS n FROM "manufacturing_exception" WHERE status = 'OPEN' AND deleted_at IS NULL GROUP BY type`
    ),
  });
}
