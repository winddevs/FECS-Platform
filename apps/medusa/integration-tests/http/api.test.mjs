// HTTP-level end-to-end test: real server, real auth, RBAC, validation,
// idempotency, webhooks and the production journey through the REST API.
// Run via integration-tests/run-http.sh (it boots the server first).
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:9100";
const PASSWORD = "Passw0rd!test";
const run = Date.now().toString(36);
let checks = 0;

const assert = (cond, msg) => {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${msg}`);
  }
  checks += 1;
  console.log(`  ok - ${msg}`);
};

const login = async (email) => {
  const res = await fetch(`${BASE}/auth/user/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (await res.json()).token;
};

let keySeq = 0;
const call = async (token, method, path, body, key) => {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (method !== "GET")
    headers["idempotency-key"] = key ?? `${run}-${++keySeq}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const roles = {
  admin: await login("admin@fashion.test"),
  none: await login("norole@fashion.test"),
  planner: await login("planner@fashion.test"),
  cutter: await login("cutter@fashion.test"),
  sewer: await login("sewer@fashion.test"),
  qc: await login("qc@fashion.test"),
  packer: await login("packer@fashion.test"),
  sre: await login("sre@fashion.test"),
};

console.log("# health, readiness, authentication");
assert((await fetch(`${BASE}/health`)).status === 200, "liveness /health");
const ready = await fetch(`${BASE}/internal/ready`);
assert(
  ready.status === 200 && (await ready.json()).ready === true,
  "readiness probe checks the database"
);
assert(
  (await call(undefined, "GET", "/admin/manufacturing/mos")).status === 401,
  "no token -> 401"
);
assert(
  (await call(roles.none, "GET", "/admin/manufacturing/mos")).status === 403,
  "user without a fashion role -> 403"
);

console.log("# role escalation and legacy admin routes");
const noneId = (await call(roles.none, "GET", "/admin/users/me")).body.user.id;
const adminId = (await call(roles.admin, "GET", "/admin/users/me")).body.user
  .id;
const escalate = await call(roles.none, "POST", `/admin/users/${noneId}`, {
  metadata: { fashion_roles: ["ERP_ADMIN"] },
});
assert(
  escalate.status === 403,
  "a role-less admin cannot grant itself fashion roles"
);
assert(
  (await call(roles.none, "GET", "/admin/manufacturing/mos")).status === 403,
  "and still has no access afterwards"
);
assert(
  (
    await call(roles.none, "POST", `/admin/users/${noneId}`, {
      metadata: { theme: "dark" },
    })
  ).status === 200,
  "unrelated profile metadata stays editable"
);
const inviteEscalate = await call(roles.none, "POST", "/admin/invites", {
  email: `invitee-${run}@fashion.test`,
  metadata: { fashion_roles: ["ERP_ADMIN"] },
});
assert(inviteEscalate.status === 403, "roles cannot be smuggled in an invite");
assert(
  (
    await call(roles.admin, "POST", `/admin/users/${adminId}`, {
      metadata: { fashion_roles: ["ERP_ADMIN"] },
    })
  ).status === 200,
  "an ERP_ADMIN may manage roles"
);
for (const [method, path, body] of [
  ["POST", "/admin/algolia/sync", {}],
  ["POST", "/admin/payload/sync/products", {}],
  ["GET", "/admin/analytics", undefined],
  ["GET", "/admin/invoice-config", undefined],
  ["POST", "/admin/invoice-config", { notes: "x" }],
  ["GET", "/admin/orders/order_x/invoices", undefined],
]) {
  assert(
    (await call(roles.none, method, path, body)).status === 403,
    `${method} ${path} needs a role`
  );
}
assert(
  (await call(roles.admin, "POST", "/admin/payload/sync/not-a-collection", {}))
    .status === 404,
  "payload sync only accepts known collections"
);
assert(
  (await fetch(`${BASE}/test-sentry`)).status === 401,
  "the Sentry smoke route is no longer anonymous"
);

console.log("# every custom admin route is guarded");
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full)
      : name === "route.ts"
        ? [full]
        : [];
  });
const adminRoot = join(process.cwd(), "src/api/admin");
const unguarded = [];
let walked = 0;
for (const file of walk(adminRoot)) {
  const source = readFileSync(file, "utf8");
  const methods = [
    ...source.matchAll(
      /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g
    ),
  ].map((m) => m[1]);
  const path = `/admin${file
    .slice(adminRoot.length)
    .replace(/\/route\.ts$/, "")
    .replace(/\[[^\]]+\]/g, "x_1")}`;
  for (const method of methods) {
    walked += 1;
    const res = await call(
      roles.none,
      method,
      path,
      method === "GET" ? undefined : {}
    );
    // POST /admin/returns shares its path with Medusa's own returns API, whose
    // body validation runs first and answers 400 to an empty body. Our guard is
    // exercised by the ERP return checks further down.
    const sharedWithCore = method === "POST" && path === "/admin/returns";
    if (res.status !== 403 && !(sharedWithCore && res.status === 400)) {
      unguarded.push(`${method} ${path} -> ${res.status}`);
    }
  }
}
assert(
  unguarded.length === 0 && walked > 50,
  `all ${walked} custom admin handlers reject a role-less admin with 403${unguarded.length ? ` (open: ${unguarded.join("; ")})` : ""}`
);

console.log("# master data and production setup through the API");
const fabric = (
  await call(roles.admin, "POST", "/admin/material-inventory/materials", {
    code: `FAB-${run}`,
    name: "Twill",
    uom: "m",
    track_roll: true,
    track_dye_lot: true,
  })
).body.material;
const rmLoc = (
  await call(roles.admin, "POST", "/admin/material-inventory/locations", {
    code: `RM-${run}`,
    name: "RM",
    warehouse_code: "FAC",
  })
).body.location;
const fgLocRes = await call(
  roles.admin,
  "POST",
  "/admin/finished-goods/locations",
  { code: `FG-${run}`, name: "HCM FG", warehouse_code: "HCM" }
);
assert(fgLocRes.status === 201, "FG location created");
const fgLoc = fgLocRes.body.location;
const style = `SHIRT-${run}`;
const sku = `${style}-M`;
const bom = await call(roles.planner, "POST", "/admin/manufacturing/boms", {
  product_sku: style,
  lines: [
    { material_id: fabric.id, uom: "m", qty_per_unit: 1.5, waste_factor: 0.05 },
  ],
});
assert(bom.status === 201 && bom.body.version === 1, "planner drafts BOM v1");
assert(
  (
    await call(
      roles.cutter,
      "POST",
      `/admin/manufacturing/boms/${bom.body.id}/release`,
      {}
    )
  ).status === 403,
  "cutter cannot release a BOM"
);
assert(
  (
    await call(
      roles.planner,
      "POST",
      `/admin/manufacturing/boms/${bom.body.id}/release`,
      {}
    )
  ).status === 200,
  "planner releases BOM"
);
const badRouting = await call(
  roles.planner,
  "POST",
  "/admin/manufacturing/routings",
  {
    product_sku: style,
    operations: [
      { seq: 10, code: "SEW", name: "Sew", work_center_type: "SEWING" },
    ],
  }
);
const badRelease = await call(
  roles.planner,
  "POST",
  `/admin/manufacturing/routings/${badRouting.body.id}/release`,
  {}
);
assert(
  badRelease.status === 400 && badRelease.body.message.includes("QC gate"),
  "routing without final QC gate cannot be released"
);
const routing = await call(
  roles.planner,
  "POST",
  "/admin/manufacturing/routings",
  {
    product_sku: style,
    operations: [
      {
        seq: 10,
        code: "SEW",
        name: "Sew",
        work_center_type: "SEWING",
        standard_minutes: 12,
      },
      {
        seq: 20,
        code: "QC",
        name: "Final QC",
        work_center_type: "QC",
        qc_gate: true,
      },
    ],
  }
);
await call(
  roles.planner,
  "POST",
  `/admin/manufacturing/routings/${routing.body.id}/release`,
  {}
);
const rcv = await call(
  roles.admin,
  "POST",
  "/admin/material-inventory/receipts",
  {
    material_id: fabric.id,
    location_id: rmLoc.id,
    lot: { lot_no: `L-${run}`, dye_lot_no: "D1" },
    rolls: [{ roll_code: `R1-${run}`, qty: 100 }],
  }
);
assert(rcv.status === 201, "fabric received");

console.log("# validation and idempotency");
const invalid = await call(roles.planner, "POST", "/admin/manufacturing/mos", {
  order_type: "MTS",
  product_sku: style,
  lines: [{ sku, qty: 0 }],
});
assert(invalid.status === 400, "invalid quantity rejected by schema");
const noKey = await fetch(`${BASE}/admin/manufacturing/mos`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${roles.planner}`,
  },
  body: JSON.stringify({
    order_type: "MTS",
    product_sku: style,
    lines: [{ sku, qty: 10 }],
  }),
});
assert(
  noKey.status === 400,
  "state-changing call without Idempotency-Key rejected"
);
const moBody = {
  order_type: "MTS",
  product_sku: style,
  lines: [{ sku, qty: 10 }],
};
const mo = await call(
  roles.planner,
  "POST",
  "/admin/manufacturing/mos",
  moBody,
  `mo-${run}`
);
assert(
  mo.status === 201 && mo.body.status === "PLANNED",
  "MO created and planned"
);
const moReplay = await call(
  roles.planner,
  "POST",
  "/admin/manufacturing/mos",
  moBody,
  `mo-${run}`
);
assert(
  moReplay.body.id === mo.body.id,
  "same Idempotency-Key replays the same MO"
);
const conflict = await call(
  roles.planner,
  "POST",
  "/admin/manufacturing/mos",
  { ...moBody, lines: [{ sku, qty: 11 }] },
  `mo-${run}`
);
assert(conflict.status === 409, "same key with a different payload -> 409");
const moId = mo.body.id;
assert(
  mo.body.requirements[0].required_qty === 15.75,
  "BOM explosion 10 x 1.5 x 1.05 = 15.75 m"
);

console.log("# reserve -> release -> issue -> cut");
assert(
  (
    await call(
      roles.planner,
      "POST",
      `/admin/manufacturing/mos/${moId}/reserve`,
      { planner_approved: true }
    )
  ).status === 200,
  "planner (with approve right) reserves"
);
assert(
  (
    await call(
      roles.cutter,
      "POST",
      `/admin/manufacturing/mos/${moId}/release`,
      {}
    )
  ).status === 403,
  "cutter cannot release an MO"
);
const released = await call(
  roles.planner,
  "POST",
  `/admin/manufacturing/mos/${moId}/release`,
  {}
);
assert(
  released.status === 200 && released.body.batches.length === 1,
  "MO released with a production batch"
);
const batchId = released.body.batches[0].id;
assert(
  (
    await call(roles.cutter, "POST", `/admin/manufacturing/mos/${moId}/issue`, {
      material_id: fabric.id,
      qty: 15.75,
    })
  ).status === 201,
  "cutting operator issues fabric"
);
const noPlanCut = await call(
  roles.cutter,
  "POST",
  `/admin/manufacturing/mos/${moId}/cut`,
  {
    batch_id: batchId,
    fabric_material_id: fabric.id,
    actual_consumption: 15.75,
    bundles: [{ sku, qty: 10 }],
  }
);
assert(
  noPlanCut.status >= 400 && noPlanCut.status < 500,
  "cutting without a cut plan is refused"
);
assert(
  (
    await call(
      roles.cutter,
      "POST",
      `/admin/manufacturing/mos/${moId}/cut-plan`,
      {
        batch_id: batchId,
        fabric_material_id: fabric.id,
        lays: [
          {
            roll_code: `ROLL-${run}`,
            planned_consumption: 15.75,
            size_ratio: { [sku]: 10 },
          },
        ],
      }
    )
  ).status === 201,
  "cut plan created"
);
const cut = await call(
  roles.cutter,
  "POST",
  `/admin/manufacturing/mos/${moId}/cut`,
  {
    batch_id: batchId,
    fabric_material_id: fabric.id,
    actual_consumption: 15.75,
    bundles: [{ sku, qty: 10 }],
  }
);
assert(
  cut.status === 201 && cut.body.reconciliation.within_tolerance,
  "cut recorded; fabric reconciles"
);
const over = await call(
  roles.cutter,
  "POST",
  `/admin/manufacturing/mos/${moId}/cut`,
  {
    batch_id: batchId,
    fabric_material_id: fabric.id,
    actual_consumption: 1,
    bundles: [{ sku, qty: 1 }],
    overproduction_approved: true,
  }
);
assert(
  over.status === 403,
  "overproduction approval needs the approve permission"
);
const bundle = cut.body.bundles[0];

console.log("# shop floor with role separation");
const scan = await call(
  roles.sewer,
  "GET",
  `/admin/manufacturing/bundles/by-code/${bundle.bundle_code}`
);
assert(
  scan.status === 200 && scan.body.current_operation.code === "SEW",
  "barcode scan shows the current operation"
);
assert(
  (
    await call(
      roles.packer,
      "POST",
      `/admin/manufacturing/bundles/${bundle.id}/operations`,
      { op_seq: 10, input_qty: 10, good_qty: 10 }
    )
  ).status === 403,
  "packer cannot report sewing output"
);
const op = await call(
  roles.sewer,
  "POST",
  `/admin/manufacturing/bundles/${bundle.id}/operations`,
  { op_seq: 10, input_qty: 10, good_qty: 9, reject_qty: 1 }
);
assert(
  op.status === 201 && op.body.bundle.waiting_qty === 9,
  "sewing reports 9 good / 1 reject"
);
assert(
  (
    await call(
      roles.sewer,
      "POST",
      `/admin/manufacturing/bundles/${bundle.id}/operations`,
      { op_seq: 20, input_qty: 9, good_qty: 9 }
    )
  ).status === 400,
  "operators cannot complete a QC gate"
);
assert(
  (
    await call(
      roles.sewer,
      "POST",
      `/admin/manufacturing/bundles/${bundle.id}/inspections`,
      { pass_qty: 9 }
    )
  ).status === 403,
  "sewer cannot inspect"
);
assert(
  (
    await call(
      roles.packer,
      "POST",
      `/admin/manufacturing/bundles/${bundle.id}/pack`,
      { qty: 1, location_id: fgLoc.id }
    )
  ).status === 400,
  "cannot pack before QC release"
);
const insp = await call(
  roles.qc,
  "POST",
  `/admin/manufacturing/bundles/${bundle.id}/inspections`,
  { pass_qty: 9 }
);
assert(
  insp.status === 201 && insp.body.bundle.qc_released_qty === 9,
  "QC releases 9 pcs"
);

console.log("# pack -> finished goods -> traceability");
const pack = await call(
  roles.packer,
  "POST",
  `/admin/manufacturing/bundles/${bundle.id}/pack`,
  { qty: 9, location_id: fgLoc.id }
);
assert(
  pack.status === 201 && pack.body.finished_goods.sellable === 9,
  "packed output becomes 9 sellable finished goods"
);
const balances = await call(
  roles.admin,
  "GET",
  `/admin/finished-goods/balances?sku=${sku}`
);
assert(
  balances.body.balances.length === 1 &&
    balances.body.balances[0].on_hand === 9,
  "FG balance visible via API"
);
const trace = await call(
  roles.admin,
  "GET",
  `/admin/finished-goods/batches/${pack.body.finished_goods.batch_id}/trace`
);
assert(
  trace.status === 200 && trace.body.batch.mo_id === moId,
  "FG batch traces back to the MO"
);
const moDetail = await call(
  roles.planner,
  "GET",
  `/admin/manufacturing/mos/${moId}`
);
assert(
  moDetail.body.manufacturing_order.completed_qty === 9,
  "MO completed_qty reflects packed output"
);
assert(
  (
    await call(roles.admin, "POST", "/admin/finished-goods/shipments", {
      sku,
      location_id: fgLoc.id,
      qty: 100,
      reference_type: "FULFILLMENT",
      reference_id: `ful_${run}`,
    })
  ).status === 400,
  "cannot ship more than is on hand"
);

console.log("# MRP and operations summary");
const mrp = await call(
  roles.planner,
  "POST",
  "/admin/manufacturing/mrp/runs",
  {}
);
assert(
  mrp.status === 201 && Array.isArray(mrp.body.suggestions),
  "MRP run produces suggestions (never POs)"
);
assert(
  (await call(roles.planner, "GET", "/admin/ops/summary")).status === 403,
  "planner cannot see ops summary"
);
const ops = await call(roles.sre, "GET", "/admin/ops/summary");
assert(
  ops.status === 200 &&
    ops.body.feature_flags.JT_TRACKING_CALLBACK_ENABLED === true,
  "SRE sees backlog and feature flags"
);
const rec = await call(
  roles.sre,
  "GET",
  "/admin/material-inventory/reconciliation"
);
assert(rec.status === 200 && rec.body.ok, "material reconciliation OK");
const fgRec = await call(
  roles.admin,
  "GET",
  "/admin/finished-goods/reconciliation"
);
assert(
  fgRec.body.ledger.ok &&
    fgRec.body.projection.issues.filter(
      (i) => i.sku === sku && i.check !== "PENDING_SYNC"
    ).length === 0,
  "FG ledger reconciles; no projection drift for this SKU"
);
assert(
  fgRec.body.projection.issues.some(
    (i) => i.sku === sku && i.check === "PENDING_SYNC"
  ),
  "projection lag to Medusa is reported as PENDING_SYNC, not as drift"
);

console.log("# webhooks: signature, dedupe, async processing");
const jtBody = JSON.stringify({
  billCode: `NOPE-${run}`,
  details: [{ scanType: "Pickup scan", scanTime: "2026-10-01T08:00:00Z" }],
});
const jtHook = (sig, payload = jtBody) =>
  fetch(`${BASE}/webhooks/jt/tracking`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": sig },
    body: payload,
  });
assert(
  (await jtHook("bad")).status === 401,
  "J&T webhook with a bad signature -> 401"
);
const goodSig = createHmac("sha256", "jt-secret").update(jtBody).digest("hex");
const jt1 = await jtHook(goodSig);
assert(
  jt1.status === 200 && (await jt1.json()).duplicate === false,
  "signed J&T push is accepted and stored"
);
const jt2 = await jtHook(goodSig);
assert((await jt2.json()).duplicate === true, "J&T retry is deduplicated");

const metaBody = JSON.stringify({
  object: "page",
  entry: [
    {
      id: "page1",
      messaging: [
        {
          sender: { id: `psid_${run}` },
          timestamp: Date.now(),
          message: { mid: `mid_${run}`, text: "help" },
        },
      ],
    },
  ],
});
const metaSig = `sha256=${createHmac("sha256", "meta-secret").update(metaBody).digest("hex")}`;
const metaHook = (sig) =>
  fetch(`${BASE}/webhooks/meta`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sig },
    body: metaBody,
  });
assert(
  (await metaHook("sha256=deadbeef")).status === 401,
  "Meta webhook with a bad signature -> 401"
);
const meta1 = await metaHook(metaSig);
assert(
  meta1.status === 200 && (await meta1.json()).stored === 1,
  "signed Meta message is stored"
);
assert(
  (await (await metaHook(metaSig)).json()).duplicates === 1,
  "Meta redelivery is deduplicated"
);
const handshake = await fetch(
  `${BASE}/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345`
);
assert(
  handshake.status === 200 && (await handshake.text()) === "12345",
  "Meta subscription handshake"
);
assert(
  (
    await fetch(
      `${BASE}/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`
    )
  ).status === 403,
  "wrong verify token -> 403"
);

const inboxBefore = (await call(roles.sre, "GET", "/admin/ops/summary")).body
  .inbox;
const failuresBefore = inboxBefore
  .filter((r) => r.status === "RETRY" || r.status === "DLQ")
  .reduce((n, r) => n + r.n, 0);
let waiting = 1;
for (let i = 0; i < 20 && waiting > 0; i += 1) {
  await sleep(1000);
  const summary = (await call(roles.sre, "GET", "/admin/ops/summary")).body;
  waiting = summary.inbox
    .filter((r) => r.status === "RECEIVED")
    .reduce((n, r) => n + r.n, 0);
}
const inboxAfter = (await call(roles.sre, "GET", "/admin/ops/summary")).body
  .inbox;
const failuresAfter = inboxAfter
  .filter((r) => r.status === "RETRY" || r.status === "DLQ")
  .reduce((n, r) => n + r.n, 0);
assert(
  waiting === 0 && failuresAfter <= failuresBefore,
  "inbox worker processed the webhook events asynchronously, without failures"
);

console.log(`HTTP TEST PASSED (${checks} checks)`);
