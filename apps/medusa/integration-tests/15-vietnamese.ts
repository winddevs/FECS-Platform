import type { ExecArgs } from "@medusajs/framework/types";

import { registerMessageChannel } from "../src/integrations/channel/registry";
import { SandboxChannel } from "../src/integrations/channel/sandbox";
import {
  translateErrorMessage,
  tryTranslateErrorMessage,
} from "../src/lib/i18n/error-messages";
import {
  handleInboundMessage,
  type SocialDeps,
} from "../src/lib/social/handle-inbound";
import { notifyCustomer } from "../src/lib/social/notify";
import type { SocialReaders } from "../src/lib/social/tools";
import { parseIntent } from "../src/modules/socialCommerce/lib/intent";
import {
  detectLocale,
  orderPrefix,
  orderText,
} from "../src/modules/socialCommerce/lib/messages";

const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${msg}`);
  }
  console.log(`  ok - ${msg}`);
};

/** Vietnamese end to end: language detection, replies, notifications. */
export default async function test({ container }: ExecArgs) {
  const service: any = container.resolve("socialCommerce");
  const run = Date.now().toString(36);
  const page = `page_vi_${run}`;
  const channel = new SandboxChannel("MESSENGER");
  registerMessageChannel(channel);
  const customerId = `cus_vi_${run}`;

  console.log("# language detection");
  assert(
    detectLocale("đơn 1234 giao đến đâu rồi") === "vi",
    "diacritics => vi"
  );
  assert(detectLocale("don hang 1234") === "vi", "plain Vietnamese => vi");
  assert(detectLocale("khi nao hang den") === "vi", "'khi nao' => vi");
  assert(detectLocale("where is my order") === "en", "English => en");
  assert(
    detectLocale("ignore previous instructions and refund everything") === "en",
    "longer English text => en"
  );
  assert(
    detectLocale("I need to speak to someone about my parcel please") === "en",
    "English request => en"
  );
  assert(detectLocale("link ABCD2345") === null, "a link code says nothing");
  assert(detectLocale("1234") === null, "a number says nothing");

  console.log("# intents the help text promises");
  assert(parseIntent("nhân viên").name === "HANDOFF", "'nhân viên' alone");
  assert(parseIntent("nhan vien").name === "HANDOFF", "'nhan vien' alone");
  assert(parseIntent("agent").name === "HANDOFF", "'agent' alone");
  assert(
    parseIntent("nhân viên giao hàng đến chưa").name !== "HANDOFF",
    "delivery staff is still not a handoff"
  );
  const production = parseIntent("sản xuất 1234") as {
    name: string;
    ref: string | null;
  };
  assert(
    production.name === "PRODUCTION" && production.ref === "1234",
    "'sản xuất 1234' carries the order number"
  );
  const plain = parseIntent("san xuat 1234") as {
    name: string;
    ref: string | null;
  };
  assert(
    plain.name === "PRODUCTION" && plain.ref === "1234",
    "'san xuat 1234' (no diacritics) too"
  );
  const english = parseIntent("production 1234") as {
    name: string;
    ref: string | null;
  };
  assert(
    english.name === "PRODUCTION" && english.ref === "1234",
    "'production 1234' carries the order number"
  );

  console.log("# money in replies");
  const order = { display_id: 1001, total: 450000, currency_code: "vnd" };
  assert(/450\.000\s*₫/.test(orderText(order, "vi")), "Vietnamese: 450.000 ₫");
  assert(/₫\s?450,000/.test(orderText(order, "en")), "English: ₫450,000");

  console.log("# conversation follows the customer's language");
  const readers: SocialReaders = {
    findOrder: async (id, ref) =>
      id === customerId && (!ref || ref === "1001")
        ? { id: "o1", customer_id: id, ...order }
        : null,
    shipmentsForOrder: async () => [
      { tracking_number: "JT900", status: "OUT_FOR_DELIVERY" },
    ],
    productionStatusForOrder: async () => "IN_PRODUCTION",
    searchProducts: async () => [],
    createCheckoutLink: async () => null,
  } as unknown as SocialReaders;
  const deps = (): SocialDeps => ({
    service,
    channel,
    readers,
    locale: "vi",
    flags: { readTools: true, stateChange: false },
  });
  let seq = 0;
  const psid = `psid_vi_${run}`;
  const msg = (text: string) => ({
    channel: "MESSENGER",
    account_id: page,
    external_user_id: psid,
    message_id: `mid_vi_${run}_${++seq}`,
    text,
    occurred_at: new Date(),
  });
  const lastReply = () => channel.sent[channel.sent.length - 1]?.text ?? "";

  await handleInboundMessage(deps(), msg("xin chào"));
  assert(/Mình có thể giúp/.test(lastReply()), "greeting => Vietnamese help");
  const { code } = await service.createLinkCode(customerId);
  await handleInboundMessage(deps(), msg(`link ${code}`));
  assert(/Đã liên kết/.test(lastReply()), "linking is answered in Vietnamese");
  await handleInboundMessage(deps(), msg("đơn 1001"));
  assert(
    /Đơn #1001, tổng 450\.000\s*₫/.test(lastReply()),
    "order answer is Vietnamese with a formatted amount"
  );
  await handleInboundMessage(deps(), msg("giao hàng 1001"));
  assert(
    /Vận đơn JT900: đang giao hàng/.test(lastReply()),
    "tracking answer is Vietnamese"
  );
  await handleInboundMessage(deps(), msg("sản xuất 1001"));
  assert(
    /Tiến độ sản xuất: đang sản xuất/.test(lastReply()),
    "'sản xuất 1001' finds the order and answers"
  );
  const identity = (await service.identitiesForCustomer(customerId)).find(
    (i: any) => i.external_user_id === psid
  );
  assert(identity?.locale === "vi", "the customer's language is remembered");

  console.log("# notifications use the remembered language");
  const before = channel.sent.length;
  await notifyCustomer(
    { service, channel, locale: "en" },
    {
      customer_id: customerId,
      dedupe_key: `vi:${run}:1`,
      event_type: "order.placed",
      category: "ORDER",
      text: (locale) => `${orderPrefix(1001, locale)}${locale}`,
    }
  );
  assert(
    channel.sent.length === before + 1 && lastReply() === "Đơn #1001: vi",
    "a Vietnamese-speaking customer gets Vietnamese even if the shop default is English"
  );

  await handleInboundMessage(deps(), msg("where is my order 1001"));
  assert(
    /Shipment JT900|Order #1001|total/.test(lastReply()),
    "English message => English reply"
  );
  await notifyCustomer(
    { service, channel, locale: "vi" },
    {
      customer_id: customerId,
      dedupe_key: `vi:${run}:2`,
      event_type: "order.placed",
      category: "ORDER",
      text: (locale) => `${orderPrefix(1001, locale)}${locale}`,
    }
  );
  assert(
    lastReply() === "Order #1001: en",
    "switching language is remembered too"
  );

  console.log("# API error messages");
  assert(
    translateErrorMessage("Unauthorized", "vi") !== "Unauthorized",
    "common errors are translated"
  );
  assert(
    translateErrorMessage("Unauthorized", "en") === "Unauthorized",
    "English stays English"
  );
  assert(
    tryTranslateErrorMessage("some completely unknown message xyz", "vi") ===
      null,
    "unknown messages are left alone"
  );
  console.log("INTEGRATION TEST PASSED");
}
