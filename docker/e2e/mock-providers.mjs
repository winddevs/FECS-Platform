// Stand-ins for the three outside systems the platform talks to, so the whole
// stack can be exercised on a laptop. They speak the same wire contract the
// adapters implement and add test controls under /__ (not part of any real API).
//
//   J&T          POST /orders, GET /orders/query, POST /orders/cancel, GET /tracking
//   Meta Graph   POST /v21.0/me/messages
//   Payload CMS  anything under /api/*
//
// Environment:
//   PORT                 listen port (default 7000)
//   JT_PRIVATE_KEY       key the platform signs requests with (verified here)
//   JT_WEBHOOK_SECRET    key used to sign tracking pushes back to the platform
//   PLATFORM_URL         where tracking pushes are delivered
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 7000);
const PRIVATE_KEY = process.env.JT_PRIVATE_KEY ?? "jt-private-key";
const WEBHOOK_SECRET = process.env.JT_WEBHOOK_SECRET ?? "jt-webhook-secret";
const PLATFORM_URL = process.env.PLATFORM_URL ?? "http://medusa-server:9000";

const parcels = new Map(); // billCode -> parcel
const byReference = new Map(); // txlogisticId -> billCode
const messages = []; // Graph API messages the platform sent
const log = [];
let parcelSeq = 0;
let failure = null; // { mode, remaining }

const note = (kind, data) => {
  log.push({ at: new Date().toISOString(), kind, ...data });
  if (log.length > 500) log.shift();
};
const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const validSignature = (req, body) => {
  const timestamp = req.headers["x-timestamp"];
  const supplied = req.headers["x-signature"];
  if (typeof timestamp !== "string" || typeof supplied !== "string")
    return false;
  const expected = createHmac("sha256", PRIVATE_KEY)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Pops one injected failure for the given operation, if armed. */
const takeFailure = (operation) => {
  if (failure && failure.operation === operation && failure.remaining > 0) {
    failure.remaining -= 1;
    return failure.mode;
  }
  return null;
};

const pushTracking = async (parcel, event) => {
  const body = JSON.stringify({
    billCode: parcel.billCode,
    details: [event],
  });
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  try {
    const res = await fetch(`${PLATFORM_URL}/webhooks/jt/tracking`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": signature },
      body,
    });
    note("push", { billCode: parcel.billCode, status: res.status });
    return res.status;
  } catch (error) {
    note("push-failed", { billCode: parcel.billCode, error: String(error) });
    return 0;
  }
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://mock");
  const path = url.pathname;
  const body = req.method === "GET" ? "" : await readBody(req);

  // ---- test controls ------------------------------------------------------
  if (path === "/__health") return send(res, 200, { ok: true });
  if (path === "/__state") {
    return send(res, 200, {
      parcels: [...parcels.values()],
      create_calls: parcelSeq,
      messages,
      log: log.slice(-50),
    });
  }
  if (path === "/__reset") {
    parcels.clear();
    byReference.clear();
    messages.length = 0;
    log.length = 0;
    failure = null;
    return send(res, 200, { ok: true });
  }
  if (path === "/__jt/fail" && req.method === "POST") {
    // { operation: "create", mode: "timeout_after_create" | "unavailable", remaining: 1 }
    failure = JSON.parse(body || "{}");
    return send(res, 200, { armed: failure });
  }
  if (path === "/__jt/scan" && req.method === "POST") {
    // { billCode, scanType, desc?, scanTime?, push?: true }
    const input = JSON.parse(body || "{}");
    const parcel = parcels.get(input.billCode);
    if (!parcel) return send(res, 404, { error: "unknown parcel" });
    const event = {
      scanType: input.scanType,
      desc: input.desc ?? input.scanType,
      scanTime: input.scanTime ?? new Date().toISOString(),
    };
    parcel.events.push(event);
    const pushed =
      input.push === false ? null : await pushTracking(parcel, event);
    return send(res, 200, { pushed });
  }

  // ---- J&T ---------------------------------------------------------------
  if (path.startsWith("/orders") || path === "/tracking") {
    if (!validSignature(req, body)) {
      note("bad-signature", { path });
      return send(res, 401, { success: false, message: "bad signature" });
    }
    if (path === "/orders" && req.method === "POST") {
      const payload = JSON.parse(body);
      const mode = takeFailure("create");
      if (mode === "unavailable") {
        return send(res, 503, { success: false, message: "unavailable" });
      }
      let billCode = byReference.get(payload.txlogisticId);
      if (!billCode) {
        parcelSeq += 1;
        billCode = `JT${String(parcelSeq).padStart(8, "0")}`;
        byReference.set(payload.txlogisticId, billCode);
        parcels.set(billCode, {
          billCode,
          txlogisticId: payload.txlogisticId,
          codAmount: payload.codAmount,
          weightGrams: payload.weightGrams,
          receiver: payload.receiver,
          items: payload.items,
          cancelled: false,
          events: [],
          createdAt: new Date().toISOString(),
        });
        note("create", { billCode, ref: payload.txlogisticId });
      }
      if (mode === "timeout_after_create") {
        // The parcel exists but the caller never hears about it.
        await sleep(Number(process.env.TIMEOUT_DELAY_MS ?? 6000));
      }
      return send(res, 200, {
        success: true,
        data: { billCode, orderId: `ord_${billCode}` },
      });
    }
    if (path === "/orders/query") {
      const ref = url.searchParams.get("txlogisticId");
      const billCode = ref ? byReference.get(ref) : undefined;
      if (!billCode)
        return send(res, 404, { success: false, message: "not found" });
      return send(res, 200, {
        success: true,
        data: { billCode, orderId: `ord_${billCode}` },
      });
    }
    if (path === "/orders/cancel" && req.method === "POST") {
      const { billCode } = JSON.parse(body);
      const parcel = parcels.get(billCode);
      if (!parcel)
        return send(res, 404, { success: false, message: "not found" });
      parcel.cancelled = true;
      note("cancel", { billCode });
      return send(res, 200, { success: true });
    }
    if (path === "/tracking") {
      const parcel = parcels.get(url.searchParams.get("billCode") ?? "");
      return send(res, 200, {
        success: true,
        data: { details: parcel?.events ?? [] },
      });
    }
  }

  // ---- Meta Graph API ------------------------------------------------------
  if (/^\/v[\d.]+\/me\/messages$/.test(path) && req.method === "POST") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return send(res, 401, { error: { message: "no token" } });
    const payload = JSON.parse(body);
    messages.push({
      at: new Date().toISOString(),
      recipient: payload.recipient?.id,
      text: payload.message?.text,
      messaging_type: payload.messaging_type,
    });
    return send(res, 200, {
      message_id: `m_${messages.length}`,
      recipient_id: payload.recipient?.id,
    });
  }

  // ---- Payload CMS (product sync target) ----------------------------------------
  if (path.startsWith("/api/")) {
    return send(res, 200, {
      id: "payload_mock",
      doc: { id: "payload_mock" },
      docs: [],
      totalDocs: 0,
    });
  }

  note("unhandled", { method: req.method, path });
  return send(res, 404, { error: "unhandled" });
});

server.listen(PORT, () => console.log(`mock providers listening on :${PORT}`));
