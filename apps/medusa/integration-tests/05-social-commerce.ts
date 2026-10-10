import { createHmac } from "node:crypto";

import type { ExecArgs } from "@medusajs/framework/types";

import { ChannelError } from "../src/integrations/channel/channel";
import { registerMessageChannel } from "../src/integrations/channel/registry";
import { SandboxChannel } from "../src/integrations/channel/sandbox";
import { MetaMessengerChannel } from "../src/integrations/meta/messenger";
import { handleMetaInboxEvent } from "../src/lib/inbox/handlers/meta";
import {
  signCheckoutToken,
  verifyCheckoutToken,
} from "../src/lib/social/checkout-link";
import {
  handleInboundMessage,
  type SocialDeps,
} from "../src/lib/social/handle-inbound";
import { notifyCustomer } from "../src/lib/social/notify";
import type { SocialReaders } from "../src/lib/social/tools";
import { parseIntent } from "../src/modules/socialCommerce/lib/intent";
import {
  evaluateOutbound,
  MAX_NOTIFICATIONS_PER_HOUR,
} from "../src/modules/socialCommerce/lib/policy";

const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ok - ${msg}`);
};

export default async function test({ container }: ExecArgs) {
  const service: any = container.resolve("socialCommerce");
  const run = Date.now().toString(36);
  const page = `page_${run}`;
  const channel = new SandboxChannel("MESSENGER");
  registerMessageChannel(channel);

  // Orders belong to customers; the fake reader enforces ownership like the real one.
  const orders = [
    {
      id: "o1",
      customer_id: `cus_a_${run}`,
      display_id: 1001,
      total: 450000,
      currency_code: "vnd",
    },
    {
      id: "o2",
      customer_id: `cus_b_${run}`,
      display_id: 2002,
      total: 990000,
      currency_code: "vnd",
    },
  ];
  const readers: SocialReaders = {
    findOrder: async (customerId, ref) =>
      orders.find(
        (o) =>
          o.customer_id === customerId && (!ref || String(o.display_id) === ref)
      ) ?? null,
    shipmentsForOrder: async () => [
      { tracking_number: "JT123", status: "OUT_FOR_DELIVERY" },
    ],
    productionStatusForOrder: async (id) =>
      id === "o1" ? "IN_PRODUCTION" : null,
    searchProducts: async (q) =>
      q.includes("tee") ? [{ title: "Basic Tee", sku: "TEE-M" }] : [],
    createCheckoutLink: async (sku, qty) =>
      `https://shop.example/checkout/social?sku=${sku}&qty=${qty}`,
  };
  const deps = (
    over: Partial<SocialDeps["flags"]> = {},
    locale: "vi" | "en" = "en"
  ): SocialDeps => ({
    service,
    channel,
    readers,
    locale,
    flags: { readTools: true, stateChange: false, ...over },
  });
  let seq = 0;
  const msg = (psid: string, text: string, account = page) => ({
    channel: "MESSENGER",
    account_id: account,
    external_user_id: psid,
    message_id: `mid_${run}_${++seq}`,
    text,
    occurred_at: new Date(),
  });
  const lastReply = () => channel.sent[channel.sent.length - 1]?.text ?? "";

  console.log("# intent parsing");
  assert(parseIntent("link ABCD2345").name === "LINK", "link code");
  assert(
    parseIntent("đơn hàng 1234 giao đến đâu rồi").name === "TRACKING" ||
      parseIntent("đơn hàng 1234 giao đến đâu rồi").name === "ORDER",
    "Vietnamese order phrase"
  );
  assert(
    parseIntent("where is my shipment 1234").name === "TRACKING",
    "tracking"
  );
  assert(
    parseIntent("production status of order 1234").name === "PRODUCTION",
    "production"
  );
  assert(
    parseIntent("tìm áo thun").name === "PRODUCT_SEARCH",
    "Vietnamese product search"
  );
  assert(parseIntent("buy TEE-M x2").name === "CHECKOUT", "checkout intent");
  assert(
    parseIntent("I want to talk to a human").name === "HANDOFF",
    "handoff"
  );
  assert(parseIntent("STOP").name === "STOP", "opt-out");
  assert(parseIntent("hello???").name === "HELP", "unknown -> help");

  console.log("# outbound policy matrix");
  const now = new Date();
  const fresh = {
    consent_status: "OPTED_IN",
    handoff_state: "BOT",
    last_inbound_at: now,
  } as const;
  assert(
    evaluateOutbound({
      identity: fresh,
      kind: "NOTIFICATION",
      now,
      notificationsLastHour: 0,
    }).allow,
    "opted-in inside window: allowed"
  );
  assert(
    !evaluateOutbound({
      identity: { ...fresh, consent_status: "UNKNOWN" },
      kind: "NOTIFICATION",
      now,
      notificationsLastHour: 0,
    }).allow,
    "no consent: blocked"
  );
  assert(
    !evaluateOutbound({
      identity: { ...fresh, consent_status: "OPTED_OUT" },
      kind: "REPLY",
      now,
      notificationsLastHour: 0,
    }).allow,
    "opted out: even replies blocked"
  );
  assert(
    !evaluateOutbound({
      identity: {
        ...fresh,
        last_inbound_at: new Date(now.getTime() - 25 * 3600 * 1000),
      },
      kind: "NOTIFICATION",
      now,
      notificationsLastHour: 0,
    }).allow,
    "outside 24h window: blocked"
  );
  assert(
    !evaluateOutbound({
      identity: { ...fresh, handoff_state: "HUMAN" },
      kind: "REPLY",
      now,
      notificationsLastHour: 0,
    }).allow,
    "bot silent during human handoff"
  );
  assert(
    !evaluateOutbound({
      identity: fresh,
      kind: "NOTIFICATION",
      now,
      notificationsLastHour: MAX_NOTIFICATIONS_PER_HOUR,
    }).allow,
    "rate limit"
  );

  console.log("# secure checkout token");
  const token = signCheckoutToken("cart_1", "s3cret");
  assert(
    verifyCheckoutToken(token, "s3cret")?.cart_id === "cart_1",
    "valid token verifies"
  );
  assert(verifyCheckoutToken(token, "other") === null, "wrong secret rejected");
  assert(
    verifyCheckoutToken(`${token}x`, "s3cret") === null,
    "tampered token rejected"
  );
  assert(
    verifyCheckoutToken(
      signCheckoutToken("c", "s3cret", 60, Date.now() - 120_000),
      "s3cret"
    ) === null,
    "expired token rejected"
  );

  console.log("# Meta adapter");
  const meta = new MetaMessengerChannel({
    appSecret: "app-secret",
    verifyToken: "vt",
    graphVersion: "v21.0",
    pageTokens: { [page]: "tok" },
    timeoutMs: 100,
  });
  const body = JSON.stringify({
    object: "page",
    entry: [
      {
        id: page,
        messaging: [
          {
            sender: { id: "psid1" },
            timestamp: 1,
            message: { mid: "m1", text: "hi" },
          },
          {
            sender: { id: page },
            timestamp: 2,
            message: { mid: "m2", text: "echo", is_echo: true },
          },
          { sender: { id: "psid1" }, timestamp: 3, delivery: { mids: ["m1"] } },
        ],
      },
    ],
  });
  const sig = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;
  assert(
    meta.verifyWebhook({ "x-hub-signature-256": sig }, body),
    "valid X-Hub-Signature-256 accepted"
  );
  assert(
    !meta.verifyWebhook({ "x-hub-signature-256": sig }, `${body} `),
    "tampered body rejected"
  );
  assert(!meta.verifyWebhook({}, body), "missing signature rejected");
  const parsed = meta.parseInbound(JSON.parse(body));
  assert(
    parsed.length === 1 && parsed[0].external_user_id === "psid1",
    "echoes and delivery receipts ignored"
  );
  assert(
    meta.verifySubscription({
      "hub.mode": "subscribe",
      "hub.verify_token": "vt",
      "hub.challenge": "42",
    }) === "42",
    "subscription handshake"
  );
  assert(
    meta.verifySubscription({
      "hub.mode": "subscribe",
      "hub.verify_token": "bad",
      "hub.challenge": "42",
    }) === null,
    "bad verify token rejected"
  );

  console.log("# conversation: linking and authorization");
  const psidA = `psidA_${run}`;
  const unlinked = await handleInboundMessage(deps(), msg(psidA, "order 1001"));
  assert(
    unlinked.status === "REPLIED" && lastReply().includes("link your account"),
    "unlinked user must link first (no order data leaked)"
  );
  const { code } = await service.createLinkCode(`cus_a_${run}`);
  assert(code.length === 8, "link code generated");
  await handleInboundMessage(deps(), msg(psidA, "link ZZZZZZZZ"));
  assert(lastReply().includes("invalid"), "wrong code rejected");
  const linked = await handleInboundMessage(deps(), msg(psidA, `link ${code}`));
  assert(
    linked.status === "REPLIED" && lastReply().includes("linked"),
    "valid code links the account"
  );
  await handleInboundMessage(deps(), msg(psidA, `link ${code}`));
  assert(lastReply().includes("invalid"), "link codes are single use");
  await handleInboundMessage(deps(), msg(psidA, "order 1001"));
  assert(
    lastReply().includes("1001") && lastReply().includes("450000"),
    "linked user sees their own order"
  );
  await handleInboundMessage(deps(), msg(psidA, "order 2002"));
  assert(
    lastReply().includes("couldn't find"),
    "another customer's order is invisible (ownership enforced)"
  );
  await handleInboundMessage(deps(), msg(psidA, "track 1001"));
  assert(
    lastReply().includes("JT123") && lastReply().includes("out for delivery"),
    "shipment status from local state"
  );
  await handleInboundMessage(deps(), msg(psidA, "production 1001"));
  assert(
    lastReply().includes("in production"),
    "simplified production status only"
  );
  await handleInboundMessage(deps(), msg(psidA, "search tee"));
  assert(lastReply().includes("Basic Tee"), "product search");
  await handleInboundMessage(
    deps({ readTools: false }),
    msg(psidA, "order 1001")
  );
  assert(
    lastReply().includes("isn't available"),
    "read tools can be disabled by flag"
  );
  await handleInboundMessage(deps(), msg(psidA, "buy TEE-M x2"));
  assert(
    lastReply().includes("isn't available"),
    "state-changing tools are off by default"
  );
  await handleInboundMessage(
    deps({ stateChange: true }),
    msg(psidA, "buy TEE-M x2")
  );
  assert(
    lastReply().includes("checkout/social"),
    "checkout link returned when enabled"
  );

  console.log("# brute-force protection on link codes");
  const psidB = `psidB_${run}`;
  for (let i = 0; i < 5; i++)
    await handleInboundMessage(deps(), msg(psidB, `link BAD0000${i}`));
  const real = await service.createLinkCode(`cus_b_${run}`);
  await handleInboundMessage(deps(), msg(psidB, `link ${real.code}`));
  assert(
    lastReply().includes("Too many"),
    "identity is locked after repeated failures (even with a valid code)"
  );

  console.log("# idempotency and retries");
  const dupe = msg(psidA, "help");
  const sentBefore = channel.sent.length;
  await handleInboundMessage(deps(), dupe);
  const second = await handleInboundMessage(deps(), dupe);
  assert(
    second.status === "DUPLICATE" && channel.sent.length === sentBefore + 1,
    "Meta redelivery answered exactly once"
  );
  const flaky = msg(psidA, "order 1001");
  channel.failNext = "RETRYABLE";
  let threw = false;
  try {
    await handleInboundMessage(deps(), flaky);
  } catch (e) {
    threw = e instanceof ChannelError;
  }
  assert(threw, "retryable send failure bubbles up so the inbox retries");
  const retried = await handleInboundMessage(deps(), flaky);
  assert(
    retried.status === "REPLIED",
    "redelivery after a failed send still produces the reply"
  );
  const dupAfter = await handleInboundMessage(deps(), flaky);
  assert(dupAfter.status === "DUPLICATE", "and only once");

  console.log("# identity scoping (PSID is page-scoped)");
  const sentA = channel.sent.length;
  await handleInboundMessage(deps(), msg(psidA, "order 1001", `other_${page}`));
  assert(
    lastReply().includes("link your account") &&
      channel.sent.length === sentA + 1,
    "same PSID on another page is a different, unlinked identity"
  );

  console.log("# consent, handoff, notifications");
  const customerA = `cus_a_${run}`;
  const notify = (key: string, text = "update") =>
    notifyCustomer(
      { service, channel },
      { customer_id: customerA, dedupe_key: key, event_type: "test", text }
    );
  const n1 = await notify("shipment:1:PICKED_UP");
  assert(n1.sent === 1, "linked + opted-in customer gets a notification");
  const n2 = await notify("shipment:1:PICKED_UP");
  assert(
    n2.sent === 0 && n2.skipped[0].reason === "DUPLICATE",
    "at-least-once event delivery is deduplicated"
  );
  await handleInboundMessage(deps(), msg(psidA, "STOP"));
  const n3 = await notify("shipment:1:DELIVERED");
  assert(
    n3.sent === 0 && n3.skipped[0].reason === "OPTED_OUT",
    "opted-out customer receives nothing"
  );
  await handleInboundMessage(deps(), msg(psidA, "subscribe"));
  let delivered = 0;
  for (let i = 0; i < 8; i++)
    delivered += (await notify(`shipment:rate:${i}`)).sent;
  assert(
    delivered <= MAX_NOTIFICATIONS_PER_HOUR,
    `notification rate limit holds (${delivered} sent)`
  );
  const before = channel.sent.length;
  await handleInboundMessage(deps(), msg(psidA, "talk to a human please"));
  const afterHandoff = channel.sent.length;
  await handleInboundMessage(deps(), msg(psidA, "order 1001"));
  assert(
    afterHandoff === before + 1 && channel.sent.length === afterHandoff,
    "bot acknowledges the handoff, then stays silent"
  );
  const [identity] = await service.listCustomerChannelIdentities({
    external_user_id: psidA,
    account_id: page,
  });
  await service.setHandoff({
    identity_id: identity.id,
    state: "BOT",
    actor_id: "agent_1",
  });
  await handleInboundMessage(deps(), msg(psidA, "order 1001"));
  assert(
    lastReply().includes("1001"),
    "bot resumes after the agent hands back"
  );

  console.log("# durable inbox -> handler (flag-gated)");
  process.env.META_MESSENGER_ENABLED = "true";
  const sentInbox = channel.sent.length;
  const inboxMsg = msg(`psidC_${run}`, "help");
  await handleMetaInboxEvent(container, {
    id: "inbx_test",
    provider: "meta",
    event_type: "message",
    attempts: 0,
    payload: { ...inboxMsg, occurred_at: inboxMsg.occurred_at.toISOString() },
  });
  assert(
    channel.sent.length === sentInbox + 1,
    "inbox handler replies through the registered channel"
  );
  process.env.META_MESSENGER_ENABLED = "false";
  const inboxMsg2 = msg(`psidD_${run}`, "help");
  await handleMetaInboxEvent(container, {
    id: "inbx_test2",
    provider: "meta",
    event_type: "message",
    attempts: 0,
    payload: { ...inboxMsg2, occurred_at: inboxMsg2.occurred_at.toISOString() },
  });
  assert(
    channel.sent.length === sentInbox + 1,
    "feature flag off: nothing is sent"
  );

  const drained = await service.publishOutbox(100, async () => {});
  assert(drained.failed === 0, "social outbox drains");
  console.log("INTEGRATION TEST PASSED");
}
