import { ExecArgs } from "@medusajs/framework/types";

/**
 * Performance check against the SLOs of TDD section 50. It seeds a database at
 * a realistic volume (hundreds of thousands of ledger rows, tens of thousands
 * of reservations, a large outbox) and measures the hot paths, then looks at
 * the query plans of the statements that must never scan a big table.
 *
 *   SCALE=1 (default)  ~320k movements, 20k reservations, 65k outbox rows
 *   SCALE=3            about three times that
 *
 * Exits non-zero when a target is missed, so CI can gate on it.
 */
const SCALE = Math.max(1, Number(process.env.SCALE ?? 1));
const run = Date.now().toString(36);

type Sample = number[];
const percentile = (values: Sample, p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  );
};
const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
  const start = performance.now();
  const result = await fn();
  return [result, performance.now() - start];
};

const results: Array<{
  name: string;
  n: number;
  p50: number;
  p95: number;
  max: number;
  target: number | null;
  ok: boolean;
}> = [];
const record = (name: string, samples: Sample, targetMs: number | null) => {
  const p95 = percentile(samples, 0.95);
  results.push({
    name,
    n: samples.length,
    p50: percentile(samples, 0.5),
    p95,
    max: Math.max(...samples),
    target: targetMs,
    ok: targetMs === null || p95 < targetMs,
  });
};

export default async function perf({ container }: ExecArgs) {
  const inv: any = container.resolve("materialInventory");
  const social: any = container.resolve("socialCommerce");
  const db = container.resolve("__pg_connection__") as any;
  const actor = { actor_id: "perf", correlation_id: `cor_perf_${run}` };
  const k = (s: string) => `${s}-${run}`;

  console.log(`# seeding (SCALE=${SCALE})`);
  const seedStart = performance.now();
  const loc = await inv.createMaterialLocations({
    code: `PERF-${run}`,
    name: "Perf",
    warehouse_code: "HCM",
  });
  const fabricCount = 20 * SCALE;
  const rollsPerFabric = 150;
  const fabrics: any[] = [];
  for (let i = 0; i < fabricCount; i += 1) {
    const material = await inv.createMaterials({
      code: `PF-${run}-${i}`,
      name: `Perf fabric ${i}`,
      uom: "m",
      track_roll: true,
      track_dye_lot: true,
    });
    fabrics.push(material);
    await inv.receiveMaterial({
      ...actor,
      idempotency_key: k(`rcv-f${i}`),
      material_id: material.id,
      location_id: loc.id,
      lot: { lot_no: `L${i}`, dye_lot_no: `D${i % 7}` },
      rolls: Array.from({ length: rollsPerFabric }, (_, r) => ({
        roll_code: `R-${run}-${i}-${r}`,
        qty: 100,
      })),
    });
  }
  const trims: any[] = [];
  for (let i = 0; i < 200 * SCALE; i += 1) {
    const material = await inv.createMaterials({
      code: `PT-${run}-${i}`,
      name: `Perf trim ${i}`,
      uom: "pcs",
    });
    trims.push(material);
  }
  await inv.receiveMaterialBatch(
    trims.map((m, i) => ({
      ...actor,
      idempotency_key: k(`rcv-t${i}`),
      material_id: m.id,
      location_id: loc.id,
      lot: { lot_no: "T1" },
      qty: 10000,
    }))
  );

  // History: every balance gets 100 neutral adjustment movements, so the ledger
  // is big but still reconciles with the balances.
  const history = 50 * SCALE;
  await db.raw(
    `INSERT INTO material_stock_movement
       (id, movement_type, material_id, lot_id, roll_id, location_id, balance_id, qty,
        on_hand_delta, reference_type, reference_id, actor_id, occurred_at, raw_qty, raw_on_hand_delta)
     SELECT 'msm_perf_' || md5(b.id || s.i::text || d.dir::text || ?),
            CASE WHEN d.dir = 1 THEN 'ADJUSTMENT_PLUS' ELSE 'ADJUSTMENT_MINUS' END,
            b.material_id, b.lot_id, b.roll_id, b.location_id, b.id, 1, d.dir,
            'MO', 'mo_perf_' || (s.i % 2000), 'perf',
            now() - (s.i || ' minutes')::interval,
            '{"value":"1","precision":20}'::jsonb,
            CASE WHEN d.dir = 1 THEN '{"value":"1","precision":20}'::jsonb
                 ELSE '{"value":"-1","precision":20}'::jsonb END
     FROM material_balance b
     CROSS JOIN generate_series(1, ?) AS s(i)
     CROSS JOIN (VALUES (1), (-1)) AS d(dir)
     WHERE b.location_id = ?`,
    [run, history, loc.id]
  );
  const reservationRows = 10000 * SCALE;
  await db.raw(
    `INSERT INTO material_reservation
       (id, reservation_no, material_id, reference_type, reference_id, requested_qty,
        issued_qty, released_qty, status, created_by, raw_requested_qty, raw_issued_qty)
     SELECT 'rsv_perf_' || md5(? || s.i::text), 'RSV-PERF-' || ? || '-' || s.i,
            ?, 'MO', 'mo_perf_' || (s.i % 2000), 10, 10, 0, 'ISSUED', 'perf',
            '{"value":"10","precision":20}'::jsonb, '{"value":"10","precision":20}'::jsonb
     FROM generate_series(1, ?) AS s(i)`,
    [run, run, fabrics[0].id, reservationRows]
  );
  const outboxPublished = 60000 * SCALE;
  const outboxPending = 5000 * SCALE;
  await db.raw(
    `INSERT INTO social_outbox_event
       (id, event_id, event_type, aggregate_type, aggregate_id, topic, partition_key,
        payload, status, attempts, available_at, created_at)
     SELECT 'obx_perf_' || md5(? || s.i::text), 'evt_perf_' || md5(? || s.i::text),
            'perf.event.v1', 'perf', 'agg_perf_' || (s.i % 4000), 'perf', 'agg_perf_' || (s.i % 4000),
            jsonb_build_object('aggregate_id', 'agg_perf_' || (s.i % 4000), 'seq', s.i),
            CASE WHEN s.i <= ? THEN 'PUBLISHED' ELSE 'PENDING' END, 0, now(),
            now() - ((? - s.i) || ' seconds')::interval
     FROM generate_series(1, ?) AS s(i)`,
    [
      run,
      run,
      outboxPublished,
      outboxPublished + outboxPending,
      outboxPublished + outboxPending,
    ]
  );
  await db.raw("ANALYZE");
  const counts = (
    await db.raw(
      `SELECT (SELECT count(*) FROM material_stock_movement) AS movements,
              (SELECT count(*) FROM material_balance) AS balances,
              (SELECT count(*) FROM material_reservation) AS reservations,
              (SELECT count(*) FROM social_outbox_event) AS outbox`
    )
  ).rows[0];
  console.log(
    `  seeded in ${((performance.now() - seedStart) / 1000).toFixed(1)}s:`,
    JSON.stringify(counts)
  );

  console.log("# availability query (target p95 < 200 ms)");
  const avail: Sample = [];
  for (let i = 0; i < 60; i += 1) {
    const [, ms] = await timed(() =>
      inv.getAvailability(fabrics[i % fabrics.length].id)
    );
    avail.push(ms);
  }
  record("availability per material", avail, 200);
  const mrp: Sample = [];
  for (let i = 0; i < 20; i += 1) {
    const [, ms] = await timed(() =>
      inv.getUsableAvailability(
        [...fabrics, ...trims].slice(0, 100).map((m: any) => m.id)
      )
    );
    mrp.push(ms);
  }
  record("usable availability, 100 materials (MRP)", mrp, 200);

  console.log("# reserve material (target p95 < 1 s)");
  const reserveSeq: Sample = [];
  for (let i = 0; i < 40; i += 1) {
    const material = fabrics[i % fabrics.length];
    const [res, ms] = await timed(() =>
      inv.reserveMaterial({
        ...actor,
        idempotency_key: k(`res-seq-${i}`),
        material_id: material.id,
        qty: 250,
        reference_type: "MO",
        reference_id: `mo_perfres_${run}_${i}`,
        planner_approved: true,
      })
    );
    reserveSeq.push(ms);
    await inv.releaseReservation({
      ...actor,
      idempotency_key: k(`rel-seq-${i}`),
      reservation_id: res.reservation.id,
    });
  }
  record("reserve 250 m, sequential", reserveSeq, 1000);

  const reserveParallel: Sample = [];
  await Promise.all(
    fabrics.slice(0, 20).map(async (material, i) => {
      const [res, ms] = await timed(() =>
        inv.reserveMaterial({
          ...actor,
          idempotency_key: k(`res-par-${i}`),
          material_id: material.id,
          qty: 250,
          reference_type: "MO",
          reference_id: `mo_perfpar_${run}_${i}`,
          planner_approved: true,
        })
      );
      reserveParallel.push(ms);
      await inv.releaseReservation({
        ...actor,
        idempotency_key: k(`rel-par-${i}`),
        reservation_id: res.reservation.id,
      });
    })
  );
  record("reserve, 20 materials in parallel", reserveParallel, 1000);

  // Worst case: many reservations of the SAME material at once. They queue
  // behind one advisory lock, so this is the latency a hot SKU would see.
  const hot: Sample = [];
  const hotResults = await Promise.allSettled(
    Array.from({ length: 20 }, async (_, i) => {
      const [res, ms] = await timed(() =>
        inv.reserveMaterial({
          ...actor,
          idempotency_key: k(`res-hot-${i}`),
          material_id: fabrics[0].id,
          qty: 100,
          reference_type: "MO",
          reference_id: `mo_perfhot_${run}_${i}`,
          planner_approved: true,
        })
      );
      hot.push(ms);
      return res;
    })
  );
  record("reserve, 20 on ONE hot material", hot, 1000);
  for (const r of hotResults) {
    if (r.status === "fulfilled") {
      await inv.releaseReservation({
        ...actor,
        idempotency_key: k(`rel-hot-${r.value.reservation.id}`),
        reservation_id: r.value.reservation.id,
      });
    }
  }

  // A fabric with thousands of rolls: every candidate row is considered (and
  // locked) per reservation, so this is where the cost of that design shows.
  console.log("# reserve from a material with 3000 rolls");
  const big = await inv.createMaterials({
    code: `PBIG-${run}`,
    name: "Perf big fabric",
    uom: "m",
    track_roll: true,
    track_dye_lot: true,
  });
  for (let part = 0; part < 6; part += 1) {
    await inv.receiveMaterial({
      ...actor,
      idempotency_key: k(`rcv-big-${part}`),
      material_id: big.id,
      location_id: loc.id,
      lot: { lot_no: `BIG${part}`, dye_lot_no: `BD${part}` },
      rolls: Array.from({ length: 500 }, (_, r) => ({
        roll_code: `RB-${run}-${part}-${r}`,
        qty: 100,
      })),
    });
  }
  const bigSamples: Sample = [];
  for (let i = 0; i < 15; i += 1) {
    const [res, ms] = await timed(() =>
      inv.reserveMaterial({
        ...actor,
        idempotency_key: k(`res-big-${i}`),
        material_id: big.id,
        qty: 250,
        reference_type: "MO",
        reference_id: `mo_perfbig_${run}_${i}`,
        planner_approved: true,
      })
    );
    bigSamples.push(ms);
    await inv.releaseReservation({
      ...actor,
      idempotency_key: k(`rel-big-${i}`),
      reservation_id: res.reservation.id,
    });
  }
  record("reserve 250 m from 3000 rolls", bigSamples, 1000);
  // While reservations of the big material run, issuing/returning other
  // material must not wait for them.
  const bystander = fabrics[1];
  const bystanderTimes: Sample = [];
  await Promise.all([
    ...Array.from({ length: 8 }, async (_, i) => {
      const res = await inv.reserveMaterial({
        ...actor,
        idempotency_key: k(`res-big-par-${i}`),
        material_id: big.id,
        qty: 250,
        reference_type: "MO",
        reference_id: `mo_perfbigpar_${run}_${i}`,
        planner_approved: true,
      });
      await inv.releaseReservation({
        ...actor,
        idempotency_key: k(`rel-big-par-${i}`),
        reservation_id: res.reservation.id,
      });
    }),
    (async () => {
      for (let i = 0; i < 10; i += 1) {
        const [, ms] = await timed(() => inv.getAvailability(bystander.id));
        bystanderTimes.push(ms);
      }
    })(),
  ]);
  record("availability of another material meanwhile", bystanderTimes, 200);

  console.log("# ledger lookups by reference");
  const settle: Sample = [];
  for (let i = 0; i < 40; i += 1) {
    const [, ms] = await timed(() =>
      inv.summarizeReference("MO", `mo_perf_${i % 2000}`)
    );
    settle.push(ms);
  }
  record("summarizeReference (MO settlement)", settle, 300);
  const issuedKey: Sample = [];
  for (let i = 0; i < 40; i += 1) {
    const [, ms] = await timed(() =>
      inv.issuedUnderKeyPrefix(
        "MO",
        `mo_perf_${i % 2000}`,
        `iss-${i}:inventory:`
      )
    );
    issuedKey.push(ms);
  }
  record("issued quantity of one request (replay check)", issuedKey, 300);

  console.log("# outbox publish (target p95 < 5 s event age)");
  const published: number[] = [];
  const noop = async (row: any) => {
    published.push(row.payload?.seq);
  };
  const drainTimes: Sample = [];
  const drainStart = performance.now();
  for (let i = 0; i < 12; i += 1) {
    const [r, ms] = await timed(() => social.publishOutbox(500, noop));
    drainTimes.push(ms);
    if (r.published === 0) break;
  }
  const drainSeconds = (performance.now() - drainStart) / 1000;
  record("outbox drain, batch of 500 (ordered claim)", drainTimes, 5000);
  console.log(
    `  drained ${published.length} events in ${drainSeconds.toFixed(1)}s ` +
      `(${(published.length / drainSeconds).toFixed(0)} events/s)`
  );

  console.log("# reconciliation and metrics (informational, full tables)");
  const [rec, recMs] = await timed(() => inv.reconcile());
  console.log(`  material reconcile: ${recMs.toFixed(0)} ms, ok=${rec.ok}`);
  const metricQueries = [
    `SELECT count(*) FROM material_balance WHERE deleted_at IS NULL AND (on_hand_qty < 0 OR reserved_qty + qc_hold_qty + damaged_qty > on_hand_qty)`,
    `SELECT count(*), COALESCE(EXTRACT(EPOCH FROM now() - MIN(created_at)), 0) FROM social_outbox_event WHERE status = 'PENDING' AND deleted_at IS NULL`,
    `SELECT count(*) FROM social_outbox_event WHERE status = 'PENDING' AND attempts >= 10 AND deleted_at IS NULL`,
  ];
  for (const sql of metricQueries) {
    const [, ms] = await timed(() => db.raw(sql));
    console.log(`  ${ms.toFixed(0).padStart(5)} ms  ${sql.slice(0, 80)}`);
  }

  console.log("# query plans (a Seq Scan on a big table is a defect)");
  const plans: Array<[string, string, unknown[]]> = [
    [
      "ledger by reference",
      `SELECT material_id, SUM(qty) FROM material_stock_movement WHERE reference_type = ? AND reference_id = ? AND deleted_at IS NULL GROUP BY 1`,
      ["MO", "mo_perf_7"],
    ],
    [
      "ledger by balance",
      `SELECT SUM(on_hand_delta) FROM material_stock_movement WHERE balance_id = (SELECT id FROM material_balance LIMIT 1) AND deleted_at IS NULL`,
      [],
    ],
    [
      "balance candidates by material",
      `SELECT b.id FROM material_balance b WHERE b.material_id = ? AND b.deleted_at IS NULL`,
      [fabrics[0].id],
    ],
    [
      "reservations by reference",
      `SELECT id FROM material_reservation WHERE reference_type = ? AND reference_id = ? AND deleted_at IS NULL`,
      ["MO", "mo_perf_7"],
    ],
    [
      "outbox ordered claim",
      `SELECT t.id FROM social_outbox_event t
       WHERE t.status = 'PENDING' AND t.available_at <= now() AND t.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM social_outbox_event e
                         WHERE e.aggregate_id = t.aggregate_id AND e.status = 'PENDING' AND e.deleted_at IS NULL
                           AND (e.created_at, e.id) < (t.created_at, t.id))
       ORDER BY t.created_at, t.id LIMIT 500`,
      [],
    ],
  ];
  const planFindings: string[] = [];
  for (const [name, sql, params] of plans) {
    const plan = (await db.raw(`EXPLAIN ${sql}`, params)).rows
      .map((r: any) => r["QUERY PLAN"])
      .join("\n");
    const seq = [...plan.matchAll(/Seq Scan on (\w+)/g)].map((m) => m[1]);
    const bad = seq.filter((t) =>
      [
        "material_stock_movement",
        "social_outbox_event",
        "material_reservation",
      ].includes(t)
    );
    console.log(
      `  ${bad.length ? "SLOW" : "ok  "} ${name}${bad.length ? `  (Seq Scan on ${bad.join(", ")})` : ""}`
    );
    if (bad.length) planFindings.push(name);
  }

  console.log("\n# results");
  console.log(
    "  " +
      [
        "measurement".padEnd(52),
        "n".padStart(4),
        "p50".padStart(8),
        "p95".padStart(8),
        "max".padStart(8),
        "target".padStart(8),
      ].join(" ")
  );
  for (const r of results) {
    console.log(
      "  " +
        [
          r.name.padEnd(52),
          String(r.n).padStart(4),
          `${r.p50.toFixed(0)}ms`.padStart(8),
          `${r.p95.toFixed(0)}ms`.padStart(8),
          `${r.max.toFixed(0)}ms`.padStart(8),
          r.target === null ? "-".padStart(8) : `${r.target}ms`.padStart(8),
          r.ok ? "" : "  <-- MISSED",
        ].join(" ")
    );
  }
  const missed = results.filter((r) => !r.ok);
  if (missed.length > 0 || planFindings.length > 0) {
    throw new Error(
      `PERF FAILED: missed ${missed.map((m) => m.name).join("; ") || "none"}; slow plans ${planFindings.join("; ") || "none"}`
    );
  }
  console.log("INTEGRATION TEST PASSED");
}
