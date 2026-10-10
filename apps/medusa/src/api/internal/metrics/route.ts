import { timingSafeEqual } from "node:crypto";

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

import { renderHttpMetrics } from "../../../lib/observability/http-metrics";
import { OUTBOX_ALERT_ATTEMPTS } from "../../../lib/outbox/outbox";
import { OUTBOX_TABLES } from "../../../lib/retention";

type Knex = {
  raw: (sql: string) => Promise<{ rows: Array<Record<string, any>> }>;
};

const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const line = (
  name: string,
  labels: Record<string, string>,
  value: number
): string => {
  const rendered = Object.entries(labels)
    .map(([k, v]) => `${k}="${v.replace(/[\\"\n]/g, "")}"`)
    .join(",");
  return `${name}${rendered ? `{${rendered}}` : ""} ${value}`;
};

/**
 * Prometheus exposition for the business-level signals the runbooks alert on
 * (NFR-OBS-002/004). Requires `Authorization: Bearer $METRICS_TOKEN`; with no
 * token configured the endpoint is disabled. No PII ever appears in labels.
 */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const token = process.env.METRICS_TOKEN;
  const supplied = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token || !supplied || !safeEqual(supplied, token)) {
    res.status(token ? 401 : 404).end();
    return;
  }
  // The business gauges below scan whole tables. Prometheus scrapes every few
  // seconds from every replica, so the result is cached briefly; latency
  // histograms are in-process and always fresh.
  const now = Date.now();
  if (!cache || now - cache.at > CACHE_TTL_MS) {
    cache = { at: now, lines: await collectBusinessGauges(req) };
  }
  res.setHeader("content-type", "text/plain; version=0.0.4");
  res
    .status(200)
    .send(`${[...cache.lines, ...renderHttpMetrics()].join("\n")}\n`);
}

const CACHE_TTL_MS = 15_000;
let cache: { at: number; lines: string[] } | null = null;

const collectBusinessGauges = async (req: MedusaRequest): Promise<string[]> => {
  const db = req.scope.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const out: string[] = [];
  const rows = async (sql: string) => (await db.raw(sql)).rows;

  out.push(
    "# TYPE fashion_outbox_pending gauge",
    "# TYPE fashion_outbox_oldest_pending_seconds gauge"
  );
  for (const table of OUTBOX_TABLES) {
    const [r] = await rows(
      `SELECT count(*)::int AS n, COALESCE(EXTRACT(EPOCH FROM now() - MIN(created_at)), 0)::int AS oldest
       FROM "${table}" WHERE status = 'PENDING' AND deleted_at IS NULL`
    );
    const labels = { table };
    out.push(
      line("fashion_outbox_pending", labels, r.n),
      line("fashion_outbox_oldest_pending_seconds", labels, r.oldest)
    );
    const [f] = await rows(
      `SELECT count(*)::int AS n FROM "${table}" WHERE status = 'FAILED' AND deleted_at IS NULL`
    );
    out.push(line("fashion_outbox_failed", labels, f.n));
    // Rows that keep failing to publish (they retry forever, so this is the
    // signal that the event bus has been unavailable for a while).
    const [stuck] = await rows(
      `SELECT count(*)::int AS n FROM "${table}"
       WHERE status = 'PENDING' AND attempts >= ${OUTBOX_ALERT_ATTEMPTS} AND deleted_at IS NULL`
    );
    out.push(line("fashion_outbox_retrying_stuck", labels, stuck.n));
  }

  out.push("# TYPE fashion_inbox_events gauge");
  for (const r of await rows(
    `SELECT provider, status, count(*)::int AS n FROM "inbox_event" WHERE deleted_at IS NULL AND status <> 'PROCESSED' GROUP BY 1,2`
  )) {
    out.push(
      line(
        "fashion_inbox_events",
        { provider: r.provider, status: r.status },
        r.n
      )
    );
  }
  out.push("# TYPE fashion_shipments gauge");
  for (const r of await rows(
    `SELECT create_state, count(*)::int AS n FROM "carrier_shipment" WHERE create_state <> 'SUCCEEDED' AND deleted_at IS NULL GROUP BY 1`
  )) {
    out.push(
      line(
        "fashion_shipments_not_created",
        { create_state: r.create_state },
        r.n
      )
    );
  }
  const [stale] = await rows(
    `SELECT count(*)::int AS n FROM "carrier_shipment" WHERE create_state = 'SUCCEEDED' AND status NOT IN ('DELIVERED','RETURNED','CANCELLED') AND COALESCE(last_event_at, created_at) < now() - interval '48 hours' AND deleted_at IS NULL`
  );
  out.push(line("fashion_shipments_stale_tracking", {}, stale.n));
  for (const r of await rows(
    `SELECT status, count(*)::int AS n FROM "production_request" WHERE status IN ('WAITING_MATERIAL','FAILED') AND deleted_at IS NULL GROUP BY 1`
  )) {
    out.push(line("fashion_production_requests", { status: r.status }, r.n));
  }
  const [exceptions] = await rows(
    `SELECT count(*)::int AS n FROM "manufacturing_exception" WHERE status = 'OPEN' AND deleted_at IS NULL`
  );
  out.push(line("fashion_manufacturing_exceptions_open", {}, exceptions.n));
  // Hard invariants: any non-zero value here is a page-worthy defect.
  const [neg] = await rows(
    `SELECT count(*)::int AS n FROM "material_balance" WHERE deleted_at IS NULL AND (on_hand_qty < 0 OR reserved_qty + qc_hold_qty + damaged_qty > on_hand_qty)`
  );
  out.push(line("fashion_material_balance_invariant_violations", {}, neg.n));
  const [fgNeg] = await rows(
    `SELECT count(*)::int AS n FROM "fg_balance" WHERE deleted_at IS NULL AND (on_hand < 0 OR warehouse_hold + qc_hold + allocated > on_hand)`
  );
  out.push(line("fashion_fg_balance_invariant_violations", {}, fgNeg.n));

  return out;
};
