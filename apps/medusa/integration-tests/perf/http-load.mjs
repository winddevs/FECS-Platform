// Drives the running API with concurrent clients and compares the latency
// percentiles with the SLOs of TDD section 50. The server is booted by
// run-http-perf.sh against the database seeded by perf.ts.
import { createHmac } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:9101";
const METRICS_TOKEN = process.env.METRICS_TOKEN ?? "perf-metrics-token";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 10);
const REQUESTS = Number(process.env.REQUESTS ?? 200);
const run = Date.now().toString(36);

const login = async () => {
  const res = await fetch(`${BASE}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "admin@fashion.test",
      password: "Passw0rd!test",
    }),
  });
  return (await res.json()).token;
};
const token = await login();
const api = (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
  );
};

/** Runs `total` calls with `concurrency` workers; returns latencies + errors. */
const load = async (name, total, concurrency, makeCall) => {
  const latencies = [];
  let errors = 0;
  let next = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < total) {
        const i = next++;
        const t0 = performance.now();
        try {
          const res = await makeCall(i);
          if (res.status >= 500 || res.status === 0) errors += 1;
          await res.arrayBuffer();
        } catch {
          errors += 1;
        }
        latencies.push(performance.now() - t0);
      }
    })
  );
  const seconds = (performance.now() - started) / 1000;
  return {
    name,
    n: total,
    errors,
    rps: total / seconds,
    p50: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
  };
};

const fabrics = (
  await (await api("/admin/material-inventory/materials?limit=100")).json()
).materials.filter((m) => m.code.startsWith("PF-"));
if (fabrics.length === 0) {
  throw new Error("Seed the perf database first (run-perf.sh)");
}

const metaBody = JSON.stringify({
  object: "page",
  entry: [
    {
      id: `page_${run}`,
      messaging: [
        {
          sender: { id: "psid_load" },
          timestamp: Date.now(),
          message: { mid: "mid_load", text: "hello" },
        },
      ],
    },
  ],
});
const metaSig = `sha256=${createHmac("sha256", "meta-secret").update(metaBody).digest("hex")}`;

const rows = [];
const slo = (row, targetMs) => {
  rows.push({
    ...row,
    target: targetMs,
    ok: row.p95 < targetMs && row.errors === 0,
  });
};

slo(
  await load("GET availability", REQUESTS, CONCURRENCY, (i) =>
    api(
      `/admin/material-inventory/materials/${fabrics[i % fabrics.length].id}/availability`
    )
  ),
  200
);
slo(
  await load("GET manufacturing orders (list)", REQUESTS, CONCURRENCY, () =>
    api("/admin/manufacturing/mos?limit=20")
  ),
  300
);
// Each webhook uses a fresh message id, so it is stored (not just deduped).
slo(
  await load("POST Meta webhook (ACK)", REQUESTS, CONCURRENCY, (i) => {
    const body = metaBody.replace("mid_load", `mid_${run}_${i}`);
    const sig = `sha256=${createHmac("sha256", "meta-secret").update(body).digest("hex")}`;
    return fetch(`${BASE}/webhooks/meta`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sig,
      },
      body,
    });
  }),
  500
);
void metaSig;

let reservationIds = [];
slo(
  await load(
    "POST reserve material (HTTP + workflow)",
    60,
    CONCURRENCY,
    async (i) => {
      const res = await api("/admin/material-inventory/reservations", {
        method: "POST",
        headers: { "idempotency-key": `load-res-${run}-${i}` },
        body: JSON.stringify({
          material_id: fabrics[i % fabrics.length].id,
          qty: 120,
          reference_type: "MO",
          reference_id: `mo_load_${run}_${i}`,
          planner_approved: true,
        }),
      });
      if (res.status === 201 || res.status === 200) {
        const clone = res.clone();
        const json = await clone.json().catch(() => null);
        if (json?.reservation?.id) reservationIds.push(json.reservation.id);
      }
      return res;
    }
  ),
  1000
);
for (const id of reservationIds) {
  await api(`/admin/material-inventory/reservations/${id}/release`, {
    method: "POST",
    headers: { "idempotency-key": `load-rel-${run}-${id}` },
    body: JSON.stringify({}),
  });
}

console.log(
  "\n  " +
    [
      "measurement".padEnd(40),
      "n".padStart(5),
      "err".padStart(4),
      "rps".padStart(7),
      "p50".padStart(7),
      "p95".padStart(7),
      "p99".padStart(7),
      "target".padStart(8),
    ].join(" ")
);
for (const r of rows) {
  console.log(
    "  " +
      [
        r.name.padEnd(40),
        String(r.n).padStart(5),
        String(r.errors).padStart(4),
        r.rps.toFixed(0).padStart(7),
        `${r.p50.toFixed(0)}ms`.padStart(7),
        `${r.p95.toFixed(0)}ms`.padStart(7),
        `${r.p99.toFixed(0)}ms`.padStart(7),
        `${r.target}ms`.padStart(8),
        r.ok ? "" : "  <-- MISSED",
      ].join(" ")
  );
}

const metrics = await (
  await fetch(`${BASE}/internal/metrics`, {
    headers: { authorization: `Bearer ${METRICS_TOKEN}` },
  })
).text();
const histogramLines = metrics
  .split("\n")
  .filter((l) => l.startsWith("fashion_http_request_duration_ms_count"));
console.log(`\n  latency histogram series exposed: ${histogramLines.length}`);

const missed = rows.filter((r) => !r.ok);
if (missed.length > 0 || histogramLines.length === 0) {
  throw new Error(
    `HTTP PERF FAILED: ${missed.map((m) => m.name).join("; ") || "no latency histogram exposed"}`
  );
}
console.log(`HTTP TEST PASSED (${rows.length} load checks)`);
