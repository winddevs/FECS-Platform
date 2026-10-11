import { createServer } from "node:http";

import type { ExecArgs } from "@medusajs/framework/types";

import publishKafkaRelayJob from "../src/jobs/publish-kafka-relay";
import { ANALYTICS_MARTS } from "../src/lib/analytics/marts";
import {
  createKafkaRestBatchPublisher,
  kafkaRestConfigFromEnv,
} from "../src/lib/outbox/kafka-rest";
import { createEventBusPublisher } from "../src/lib/outbox/publisher";
import analyticsMartsLoader from "../src/modules/integration/loaders/analytics-marts";

/**
 * Kafka as the integration backbone (NFR-AVL-003) and the read-only analytics
 * marts (requirement section 27).
 */
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${msg}`);
  }
  console.log(`  ok - ${msg}`);
};

type Received = { topic: string; key: string; value: any };

export default async function verify({ container }: ExecArgs) {
  const inv: any = container.resolve("materialInventory");
  const integration: any = container.resolve("integration");
  const pg = container.resolve("__pg_connection__") as any;
  const actor = { actor_id: "user_kafka", correlation_id: "cor_kafka" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;

  console.log("# section 27: the marts exist, are readable and cannot write");
  // The loader runs at server start; a script boots without it, so call it here.
  await analyticsMartsLoader(container as any);
  await analyticsMartsLoader(container as any);
  const views = (
    await pg.raw(
      `SELECT table_name FROM information_schema.views WHERE table_schema = 'analytics'`
    )
  ).rows.map((r: any) => r.table_name);
  assert(
    ANALYTICS_MARTS.length === 14 &&
      ANALYTICS_MARTS.every((name) => views.includes(name)) &&
      views.length === ANALYTICS_MARTS.length,
    "all 14 marts (the 13 KPIs and the SKU margin inputs) exist as views"
  );
  for (const name of ANALYTICS_MARTS) {
    const result = await pg.raw(`SELECT * FROM analytics.${name} LIMIT 5`);
    assert(Array.isArray(result.rows), `mart ${name} is readable`);
  }
  let blocked = false;
  try {
    await pg.raw(
      `INSERT INTO analytics.carrier_performance (carrier_code) VALUES ('X')`
    );
  } catch {
    blocked = true;
  }
  assert(blocked, "a mart cannot be written to");
  let readOnlyBlocked = false;
  try {
    await pg.transaction(async (trx: any) => {
      await trx.raw("SET TRANSACTION READ ONLY");
      await trx.raw(`UPDATE material SET name = name WHERE false`);
      await trx.raw(
        `INSERT INTO ops_gauge (id, name, value) VALUES ('x', 'x', 1)`
      );
    });
  } catch {
    readOnlyBlocked = true;
  }
  assert(
    readOnlyBlocked,
    "the read API's read-only transaction refuses writes"
  );
  const fpy = (
    await pg.raw(
      `SELECT first_pass_yield_pct FROM analytics.first_pass_yield_daily`
    )
  ).rows;
  assert(
    fpy.every(
      (r: any) =>
        r.first_pass_yield_pct === null ||
        (Number(r.first_pass_yield_pct) >= 0 &&
          Number(r.first_pass_yield_pct) <= 100)
    ),
    "first pass yield is a percentage"
  );
  const variance = (
    await pg.raw(
      `SELECT planned_consumption, actual_consumption, variance FROM analytics.fabric_variance LIMIT 20`
    )
  ).rows;
  assert(
    variance.every(
      (r: any) =>
        Math.abs(
          Number(r.actual_consumption) -
            Number(r.planned_consumption) -
            Number(r.variance)
        ) < 1e-6
    ),
    "fabric variance is actual minus planned"
  );
  const carriers = (
    await pg.raw(`SELECT delivered_pct FROM analytics.carrier_performance`)
  ).rows;
  assert(
    carriers.every(
      (r: any) =>
        r.delivered_pct === null ||
        (Number(r.delivered_pct) >= 0 && Number(r.delivered_pct) <= 100)
    ),
    "carrier delivery rate is a percentage"
  );
  const margin = (
    await pg.raw(
      `SELECT product_sku, material_cost_per_unit FROM analytics.sku_margin_inputs LIMIT 20`
    )
  ).rows;
  assert(
    margin.every((r: any) => Number(r.material_cost_per_unit) >= 0),
    "SKU margin inputs give a material cost per unit"
  );

  console.log("# NFR-AVL-003: Kafka relay through a REST proxy");
  const received: Received[] = [];
  let mode: "ok" | "down" | "reject" = "ok";
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (mode === "down") {
        res.writeHead(503).end();
        return;
      }
      const topic = decodeURIComponent((req.url ?? "").replace("/topics/", ""));
      const records = JSON.parse(body).records as Array<{
        key: string;
        value: any;
      }>;
      if (mode === "reject") {
        res
          .writeHead(200, { "content-type": "application/vnd.kafka.v2+json" })
          .end(
            JSON.stringify({
              offsets: [{ error_code: 50003, error: "unknown topic" }],
            })
          );
        return;
      }
      for (const record of records) {
        received.push({ topic, key: record.key, value: record.value });
      }
      res
        .writeHead(200, { "content-type": "application/vnd.kafka.v2+json" })
        .end(
          JSON.stringify({
            offsets: records.map(() => ({ partition: 0, offset: 1 })),
          })
        );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  process.env.KAFKA_REST_URL = `http://127.0.0.1:${port}`;
  process.env.KAFKA_TOPIC_PREFIX = "test.";
  const config = kafkaRestConfigFromEnv();
  assert(
    config?.topicPrefix === "test.",
    "the proxy is configured from the environment"
  );
  const publisher = createKafkaRestBatchPublisher(config!);

  // Real domain events.
  const material = await inv.createMaterials({
    code: `KF-${run}`,
    name: "Kafka probe",
    uom: "pcs",
  });
  const location = await inv.createMaterialLocations({
    code: `KFL-${run}`,
    name: "Store",
    warehouse_code: "HCM",
  });
  const drainDomain = async (relay: boolean) => {
    const sent: any[] = [];
    for (;;) {
      const batch = await inv.publishOutbox(500, async (row: any) => {
        sent.push(row);
        if (relay) {
          await integration.enqueueKafkaRelay(row);
        }
      });
      if (batch.published === 0) break;
    }
    return sent;
  };
  await drainDomain(false);
  for (const tag of ["first", "second", "third"]) {
    await inv.receiveMaterial({
      ...actor,
      idempotency_key: k(tag),
      material_id: material.id,
      location_id: location.id,
      lot: { lot_no: tag },
      qty: 1,
    });
  }
  const eventBus = {
    emit: async () => undefined,
  } as any;
  const viaBus = createEventBusPublisher(eventBus, integration);
  const domainRows: any[] = [];
  for (;;) {
    const batch = await inv.publishOutbox(500, async (row: any) => {
      domainRows.push(row);
      await viaBus(row);
    });
    if (batch.published === 0) break;
  }
  const mine = domainRows.filter(
    (row) => row.payload.data.material_id === material.id
  );
  assert(
    mine.length === 3,
    "three domain events were delivered to the bus and queued for Kafka in the same step"
  );
  await integration.enqueueKafkaRelay(mine[0]);
  const queued = await integration.listKafkaRelayEvents({
    event_id: mine.map((row) => row.event_id),
  });
  assert(
    queued.length === 3 && queued.every((row: any) => row.status === "PENDING"),
    "queuing the same event twice keeps one copy"
  );

  mode = "down";
  const failing = await integration.publishKafkaRelay(500, publisher);
  assert(
    failing.failed > 0 &&
      (
        await integration.listKafkaRelayEvents({
          event_id: mine.map((row) => row.event_id),
        })
      ).every(
        (row: any) => row.status === "PENDING" && Number(row.attempts) >= 0
      ),
    "during a Kafka outage the events stay queued (the business flow is unaffected)"
  );
  mode = "reject";
  await pg.raw(
    `UPDATE kafka_relay_event SET available_at = now() WHERE status = 'PENDING'`
  );
  const rejected = await integration.publishKafkaRelay(500, publisher);
  assert(
    rejected.failed > 0,
    "a record the broker rejects counts as a failure even though HTTP says 200"
  );

  mode = "ok";
  await pg.raw(
    `UPDATE kafka_relay_event SET available_at = now() WHERE status = 'PENDING'`
  );
  for (let round = 0; round < 10; round += 1) {
    const result = await integration.publishKafkaRelay(500, publisher);
    if (result.published === 0) break;
  }
  const mineSent = received.filter(
    (r) => r.value.data.material_id === material.id
  );
  assert(
    mineSent.length === 3 &&
      new Set(mineSent.map((r) => r.value.event_id)).size === 3,
    "after recovery each event reaches Kafka exactly once"
  );
  assert(
    mineSent.every(
      (r) =>
        r.topic === "test.fashion.inventory.events.v1" && r.key === material.id
    ),
    "events go to the domain topic, keyed by aggregate id"
  );
  assert(
    JSON.stringify(mineSent.map((r) => r.value.data.lot_id !== undefined)) ===
      "[true,true,true]" &&
      mineSent.map((r) => r.value.occurred_at).join() ===
        mineSent.map((r) => r.value.occurred_at).sort().join(),
    "events of one aggregate keep their order"
  );
  assert(
    (
      await integration.listKafkaRelayEvents({
        event_id: mine.map((row) => row.event_id),
      })
    ).every((row: any) => row.status === "PUBLISHED"),
    "delivered rows are marked PUBLISHED"
  );

  console.log("# the relay job only runs when switched on");
  const before = received.length;
  await inv.receiveMaterial({
    ...actor,
    idempotency_key: k("fourth"),
    material_id: material.id,
    location_id: location.id,
    lot: { lot_no: "fourth" },
    qty: 1,
  });
  for (;;) {
    const batch = await inv.publishOutbox(500, async (row: any) => {
      await viaBus(row);
    });
    if (batch.published === 0) break;
  }
  delete process.env.KAFKA_RELAY_ENABLED;
  await publishKafkaRelayJob(container as any);
  assert(received.length === before, "with the flag off nothing is sent");
  process.env.KAFKA_RELAY_ENABLED = "true";
  for (let round = 0; round < 10; round += 1) {
    await publishKafkaRelayJob(container as any);
    if (
      received.some(
        (r) =>
          r.value.data.material_id === material.id &&
          r.value.data.lot_id &&
          received.length > before
      )
    )
      break;
  }
  assert(
    received.length > before,
    "with the flag on the job delivers the queue"
  );
  delete process.env.KAFKA_RELAY_ENABLED;
  server.close();

  console.log("INTEGRATION TEST PASSED");
}
