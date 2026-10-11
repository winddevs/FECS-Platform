// Shared helpers for the docker end-to-end journeys. HTTP only: the platform is
// a black box behind its public API, exactly as the storefront, the back office,
// J&T and Meta see it.
import { createHmac } from "node:crypto";

export const BASE = process.env.BASE_URL ?? "http://localhost:9100";
export const MOCK = process.env.MOCK_URL ?? "http://localhost:7070";
export const META_APP_SECRET = process.env.META_APP_SECRET ?? "meta-app-secret";
export const METRICS_TOKEN = process.env.METRICS_TOKEN ?? "e2e-metrics-token";
export const PASSWORD = "Passw0rd!local";
export const run = Date.now().toString(36);

let checks = 0;
export const checkCount = () => checks;
export const check = (cond, message) => {
  if (!cond) {
    throw new Error(`CHECK FAILED: ${message}`);
  }
  checks += 1;
  console.log(`  ok - ${message}`);
};
export const section = (title) => console.log(`\n# ${title}`);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls until `fn` returns a truthy value; throws with `what` on timeout. */
export const eventually = async (
  what,
  fn,
  { timeout = 60_000, every = 1000 } = {}
) => {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await fn();
      if (last) {
        return last;
      }
    } catch (error) {
      last = error;
    }
    await sleep(every);
  }
  throw new Error(
    `TIMEOUT waiting for ${what}${last instanceof Error ? `: ${last.message}` : ""}`
  );
};

let keySeq = 0;
const parse = async (res) => {
  const text = await res.text();
  try {
    return { status: res.status, headers: res.headers, body: JSON.parse(text) };
  } catch {
    return { status: res.status, headers: res.headers, body: text };
  }
};

/** Back-office call as a role user. */
export const api = async (token, method, path, body, key) => {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (method !== "GET")
    headers["idempotency-key"] = key ?? `${run}-${++keySeq}`;
  return parse(
    await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
};

/** Storefront call (publishable key, optional customer token). */
export const store = async (publishableKey, token, method, path, body, key) => {
  const headers = {
    "content-type": "application/json",
    "x-publishable-api-key": publishableKey,
  };
  if (token) headers.authorization = `Bearer ${token}`;
  if (method !== "GET")
    headers["idempotency-key"] = key ?? `${run}-s${++keySeq}`;
  return parse(
    await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
};

export const login = async (email, actor = "user", password = PASSWORD) => {
  const res = await fetch(`${BASE}/auth/${actor}/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!json.token)
    throw new Error(`login failed for ${email}: ${JSON.stringify(json)}`);
  return json.token;
};

export const mock = {
  state: async () => (await fetch(`${MOCK}/__state`)).json(),
  reset: async () => fetch(`${MOCK}/__reset`),
  scan: async (billCode, scanType, extra = {}) =>
    (
      await fetch(`${MOCK}/__jt/scan`, {
        method: "POST",
        body: JSON.stringify({ billCode, scanType, ...extra }),
      })
    ).json(),
  fail: async (operation, mode, remaining = 1) =>
    fetch(`${MOCK}/__jt/fail`, {
      method: "POST",
      body: JSON.stringify({ operation, mode, remaining }),
    }),
  messagesTo: async (recipient) =>
    (await mock.state()).messages.filter((m) => m.recipient === recipient),
};

/** A signed Messenger webhook, exactly as Meta delivers it. */
export const metaMessage = async (pageId, psid, text, mid) => {
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: pageId,
        messaging: [
          {
            sender: { id: psid },
            timestamp: Date.now(),
            message: { mid: mid ?? `mid_${run}_${++keySeq}`, text },
          },
        ],
      },
    ],
  });
  const signature = `sha256=${createHmac("sha256", META_APP_SECRET).update(body).digest("hex")}`;
  return parse(
    await fetch(`${BASE}/webhooks/meta`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature,
      },
      body,
    })
  );
};

/**
 * Lays for a cut plan, built from the rolls the MO actually has reserved
 * (GET /admin/manufacturing/mos/:id/rolls). Each lay cuts what is assigned
 * from its roll; the size ratio goes on the first lay.
 */
export const layPlan = async (token, moId, sizeRatio) => {
  const { body } = await api(
    token,
    "GET",
    `/admin/manufacturing/mos/${moId}/rolls`
  );
  return body.rolls.map((roll, index) => ({
    roll_code: roll.roll_code,
    planned_consumption: roll.assigned,
    size_ratio: index === 0 ? sizeRatio : {},
  }));
};

export const KAFKA_REST =
  process.env.KAFKA_REST_URL ?? "http://localhost:18082";
export const KAFKA_PREFIX = process.env.KAFKA_TOPIC_PREFIX ?? "e2e.";

const kafkaJson = "application/vnd.kafka.v2+json";

/**
 * Reads everything on the given topics from the beginning through the broker's
 * HTTP proxy, the way an analytics consumer would. Returns the records seen
 * within `seconds`.
 */
export const kafkaRead = async (topics, seconds = 8) => {
  const group = `e2e-${run}-${++keySeq}`;
  const created = await fetch(`${KAFKA_REST}/consumers/${group}`, {
    method: "POST",
    headers: { "content-type": kafkaJson },
    body: JSON.stringify({
      name: "reader",
      format: "json",
      "auto.offset.reset": "earliest",
      "auto.commit.enable": "false",
    }),
  });
  if (!created.ok) {
    throw new Error(`Kafka consumer create failed: ${created.status}`);
  }
  const { base_uri: base } = await created.json();
  try {
    await fetch(`${base}/subscription`, {
      method: "POST",
      headers: { "content-type": kafkaJson },
      body: JSON.stringify({ topics }),
    });
    const records = [];
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
      const res = await fetch(
        `${base}/records?timeout=1500&max_bytes=5000000`,
        {
          headers: { accept: "application/vnd.kafka.json.v2+json" },
        }
      );
      if (res.ok) {
        records.push(...(await res.json()));
      }
    }
    return records;
  } finally {
    await fetch(base, { method: "DELETE" }).catch(() => undefined);
  }
};

/** Scrapes /internal/metrics as the monitoring system does. */
export const scrapeMetrics = async () =>
  (
    await fetch(`${BASE}/internal/metrics`, {
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    })
  ).text();
