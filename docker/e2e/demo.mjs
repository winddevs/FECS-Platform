#!/usr/bin/env node
/**
 * Demo helpers for the local stack. They play the parts that are outside the
 * platform: the customer on Messenger, the J&T courier, and the storefront
 * settings. Run through `bash docker/e2e/run.sh demo <command>`.
 *
 *   parcels                     parcels J&T (mock) has received
 *   scan <bill> "<text>"        a courier scan, pushed to the platform webhook
 *   messenger "<text>" [psid]   a customer message on Messenger, then the replies
 *   messages [psid]             everything the platform sent on Messenger
 *   link-code <email> <pw>      a customer's one-time code to link Messenger
 *   my-orders <email> <pw>      a customer's orders with live parcel status
 *   storefront-env              write or refresh apps/store/.env for this stack
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  api,
  login,
  metaMessage,
  mock,
  sleep,
  store,
} from "../../apps/medusa/integration-tests/e2e/lib.mjs";

const STORE_ENV = fileURLToPath(
  new URL("../../apps/store/.env", import.meta.url)
);
const PAGE_ID = process.env.META_PAGE_ID ?? "page_local";
const DEFAULT_PSID = "demo-customer";

const show = (value) => console.log(JSON.stringify(value, null, 2));

const parcels = async () => {
  const state = await mock.state();
  show(
    state.parcels.map((p) => ({
      bill_code: p.billCode,
      reference: p.txlogisticId,
      last_scan: p.events.at(-1)?.desc ?? null,
    }))
  );
};

const scan = async (bill, text) => {
  if (!(bill && text)) {
    throw new Error('usage: scan <bill_code> "<scan text>"');
  }
  show(await mock.scan(bill, text));
};

const messages = async (psid = DEFAULT_PSID) => {
  show((await mock.messagesTo(psid)).map((m) => m.text ?? m.message ?? m));
};

const messenger = async (text, psid = DEFAULT_PSID) => {
  if (!text) {
    throw new Error('usage: messenger "<text>" [psid]');
  }
  const before = (await mock.messagesTo(psid)).length;
  const res = await metaMessage(PAGE_ID, psid, text);
  console.log(`webhook accepted: ${res.status}`);
  // The reply is produced by a worker from the durable inbox, so give it a moment.
  for (let i = 0; i < 20; i += 1) {
    await sleep(500);
    if ((await mock.messagesTo(psid)).length > before) {
      break;
    }
  }
  const replies = (await mock.messagesTo(psid)).slice(before);
  show(replies.map((m) => m.text ?? m.message ?? m));
};

/** The storefront has no screens yet for these customer calls, so play them here. */
const asCustomer = async (email, password) => {
  if (!(email && password)) {
    throw new Error("usage: <command> <customer_email> <customer_password>");
  }
  const token = await login(email, "customer", password);
  const admin = await login("admin@fashion.local");
  const keys = await api(admin, "GET", "/admin/api-keys?type=publishable");
  const key = keys.body.api_keys.find(
    (k) => k.title === "Fashion webshop"
  )?.token;
  return { token, key };
};

const linkCode = async (email, password) => {
  const { token, key } = await asCustomer(email, password);
  const res = await store(
    key,
    token,
    "POST",
    "/store/fashion/social/link-code",
    {}
  );
  show(res.body);
  console.log(
    `Now send:  bash docker/e2e/run.sh demo messenger "link ${res.body.code ?? "<code>"}"`
  );
};

const myOrders = async (email, password) => {
  const { token, key } = await asCustomer(email, password);
  const orders = await store(
    key,
    token,
    "GET",
    "/store/orders?fields=id,display_id,status,total,created_at"
  );
  const out = [];
  for (const order of orders.body.orders ?? []) {
    const shipments = await store(
      key,
      token,
      "GET",
      `/store/fashion/orders/${order.id}/shipments`
    );
    out.push({
      order: order.display_id,
      id: order.id,
      total: order.total,
      shipments: (shipments.body.shipments ?? []).map((s) => ({
        waybill: s.tracking_number,
        status: s.status,
      })),
    });
  }
  show(out);
};

const upsertEnv = (path, values) => {
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  const remaining = new Map(Object.entries(values));
  const next = lines.map((line) => {
    const key = line.split("=")[0];
    if (remaining.has(key)) {
      const value = remaining.get(key);
      remaining.delete(key);
      return `${key}=${value}`;
    }
    return line;
  });
  for (const [key, value] of remaining) {
    next.push(`${key}=${value}`);
  }
  writeFileSync(path, `${next.join("\n").replace(/\n+$/, "")}\n`);
};

const storefrontEnv = async () => {
  const token = await login("admin@fashion.local");
  const keys = await api(token, "GET", "/admin/api-keys?type=publishable");
  const key = keys.body.api_keys.find(
    (k) => k.title === "Fashion webshop"
  )?.token;
  if (!key) {
    throw new Error("The demo store has no 'Fashion webshop' publishable key");
  }
  upsertEnv(STORE_ENV, {
    NODE_ENV: "development",
    MEDUSA_BACKEND_URL: "http://localhost:9100",
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: key,
    MEDUSA_PUBLISHABLE_KEY: key,
    MEDUSA_ADMIN_EMAIL: "admin@fashion.local",
    MEDUSA_ADMIN_PASSWORD: "Passw0rd!local",
    NEXT_PUBLIC_BASE_URL: "http://localhost:8000",
    NEXT_PUBLIC_SERVER_URL: "http://localhost:8000",
    NEXT_PUBLIC_DEFAULT_REGION: "vn",
    PAYLOAD_SECRET: "local-demo-payload-secret-0123456789",
    DATABASE_URL: "postgresql://fashion:fashion@localhost:5544/ecommerce_cms",
    PAYLOAD_SERVER_URL: "http://localhost:8000",
    PREVIEW_SECRET: "local-demo-preview",
    REVALIDATE_SECRET: "local-demo-revalidate",
  });
  // The storefront must reach the store API with this key.
  const probe = await store(key, undefined, "GET", "/store/regions");
  console.log(
    `apps/store/.env written (publishable key ok: ${probe.status === 200})`
  );
};

const [command, ...args] = process.argv.slice(2);
const commands = {
  parcels,
  scan,
  messages,
  messenger,
  "link-code": linkCode,
  "my-orders": myOrders,
  "storefront-env": storefrontEnv,
};
if (!(command && commands[command])) {
  console.error(`commands: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
try {
  await commands[command](...args);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
