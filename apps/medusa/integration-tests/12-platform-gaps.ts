import type { ExecArgs } from "@medusajs/framework/types";

import { CarrierError } from "../src/integrations/carrier/provider";
import reconcileMaterialInventory from "../src/jobs/reconcile-material-inventory";
import {
  assertProductionSecrets,
  secretProblems,
} from "../src/lib/config/secrets";
import {
  clearSettingsCache,
  readSetting,
  SETTINGS,
} from "../src/lib/config/settings";
import { withCausation } from "../src/lib/observability/causation";
import {
  observe,
  renderHttpMetrics,
  resetHttpMetrics,
} from "../src/lib/observability/http-metrics";
import { maskLogger, maskText, maskValue } from "../src/lib/observability/pii";
import {
  observeProviderCall,
  renderProviderMetrics,
  resetProviderMetrics,
} from "../src/lib/observability/provider-calls";
import {
  resolveIntentWithAgent,
  type AgentModel,
} from "../src/lib/social/agent";

/**
 * Cross-cutting requirements: tracing and metrics (NFR-OBS-001..004), privacy
 * and secrets (NFR-SEC-001/003/005), configuration and country profiles
 * (FR-ADM-004, section 26).
 */
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    throw new Error(`ASSERT FAILED: ${msg}`);
  }
  console.log(`  ok - ${msg}`);
};

export default async function verify({ container }: ExecArgs) {
  const inv: any = container.resolve("materialInventory");
  const integration: any = container.resolve("integration");
  const actor = { actor_id: "user_platform", correlation_id: "cor_platform" };
  const run = Date.now().toString(36);
  const k = (s: string) => `${s}-${run}`;

  console.log(
    "# NFR-OBS-003: events carry the id of the event that caused them"
  );
  const material = await inv.createMaterials({
    code: `CZ-${run}`,
    name: "Causation probe",
    uom: "pcs",
  });
  const location = await inv.createMaterialLocations({
    code: `CZL-${run}`,
    name: "Store",
    warehouse_code: "HCM",
  });
  const receive = (tag: string) =>
    inv.receiveMaterial({
      ...actor,
      idempotency_key: k(tag),
      material_id: material.id,
      location_id: location.id,
      lot: { lot_no: tag },
      qty: 5,
    });
  const captured: any[] = [];
  const drain = async () => {
    for (;;) {
      const batch = await inv.publishOutbox(500, async (row: any) => {
        captured.push(row);
      });
      if (batch.published === 0) break;
    }
  };
  await drain();
  captured.length = 0;
  await withCausation(`evt_cause_${run}`, () => receive("caused"));
  await receive("spontaneous");
  await drain();
  const received = captured
    .filter((row) => row.event_type === "inventory.material_received.v1")
    .filter((row) => row.payload.data.material_id === material.id);
  const caused = received.find(
    (row) => row.payload.data.lot_id && row.payload.causation_id
  );
  assert(
    received.length === 2 &&
      caused?.payload.causation_id === `evt_cause_${run}`,
    "work done on behalf of an event emits events that name it as their cause"
  );
  assert(
    received.filter((row) => row.payload.causation_id === null).length === 1,
    "work with no triggering event has no cause"
  );

  console.log(
    "# NFR-SEC-003: personal data and credentials are masked in logs"
  );
  assert(
    maskText("call 0901234567 or +84 912 345 678") ===
      "call [redacted] or [redacted]",
    "Vietnamese phone numbers are masked"
  );
  assert(
    !maskText("mail lan.nguyen@example.com now").includes("lan.nguyen"),
    "e-mail addresses are masked"
  );
  assert(
    maskText("card 4111 1111 1111 1111 ok") === "card [redacted] ok" &&
      maskText("ts 1760000000000 ok") === "ts 1760000000000 ok",
    "card numbers (Luhn-valid) are masked, timestamps are not"
  );
  const jwt =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
  assert(
    !maskText(`Authorization: Bearer ${jwt}`).includes("eyJ") &&
      !maskText(`token=${jwt}`).includes("eyJ"),
    "bearer tokens and JWTs are masked"
  );
  assert(
    maskText("password=hunter2 api_key: abc123") ===
      "password=[redacted] api_key: [redacted]",
    "secret assignments are masked"
  );
  const masked = maskValue({
    order_id: "order_1",
    receiver: { name: "Lan", phone: "0901234567", address_line: "1 Le Loi" },
    error: new Error("failed for 0901234567"),
    items: [{ sku: "TEE-M", qty: 1 }],
  }) as any;
  assert(
    masked.order_id === "order_1" &&
      masked.receiver === "[redacted]" &&
      masked.items[0].sku === "TEE-M" &&
      !JSON.stringify(masked).includes("0901234567"),
    "objects are masked by key; business ids stay readable"
  );
  const lines: unknown[][] = [];
  const logger: Record<string, unknown> = {
    warn: (...args: unknown[]) => lines.push(args),
    error: (...args: unknown[]) => lines.push(args),
  };
  maskLogger(logger);
  maskLogger(logger);
  (logger.warn as (...a: unknown[]) => void)("send to 0901234567 failed", {
    phone: "0901234567",
  });
  assert(
    lines.length === 1 && !JSON.stringify(lines).includes("0901234567"),
    "a masked logger prints nothing personal (and masking twice is harmless)"
  );

  console.log(
    "# NFR-SEC-001: production refuses to start with missing or weak secrets"
  );
  const good = {
    NODE_ENV: "production",
    JWT_SECRET: "j".repeat(40),
    COOKIE_SECRET: "c".repeat(40),
    DATABASE_URL: "postgres://x",
  } as NodeJS.ProcessEnv;
  assert(
    secretProblems(good).length === 0,
    "a complete production environment passes"
  );
  assert(
    secretProblems({ ...good, JWT_SECRET: "supersecret" }).length === 1,
    "a development default is refused"
  );
  assert(
    secretProblems({ ...good, COOKIE_SECRET: "short" }).length === 1,
    "a short secret is refused"
  );
  const withFlag = secretProblems({
    ...good,
    JT_FULFILLMENT_ENABLED: "true",
    META_MESSENGER_ENABLED: "true",
  });
  assert(
    withFlag.some((p) => p.includes("JT_PRIVATE_KEY")) &&
      withFlag.some((p) => p.includes("META_APP_SECRET")),
    "an integration that is switched on needs its credentials"
  );
  let threw = false;
  try {
    assertProductionSecrets({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
  } catch (error) {
    threw = (error as Error).message.includes("JWT_SECRET");
  }
  assert(threw, "start-up fails naming the variable, never its value");
  assertProductionSecrets({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
  assert(true, "development is not checked");

  console.log("# NFR-OBS-001/002: provider calls are traced and measured");
  resetProviderMetrics();
  await observeProviderCall("jt", "POST /orders", async () => "ok");
  await observeProviderCall("jt", "POST /orders", async () => "ok");
  try {
    await observeProviderCall("jt", "POST /orders", async () => {
      throw new CarrierError("AMBIGUOUS", "timeout");
    });
  } catch {
    // expected
  }
  const rendered = renderProviderMetrics().join("\n");
  assert(
    rendered.includes('provider="jt",operation="POST /orders",outcome="ok"') &&
      rendered.includes('outcome="ambiguous"'),
    "calls are counted per provider, operation and outcome"
  );
  assert(
    /outcome="ok"\} 2/.test(rendered),
    "two successful calls were recorded"
  );
  resetHttpMetrics();
  observe("POST", "/admin/manufacturing/mos", 403, 5);
  observe("GET", "/admin/manufacturing/mos/mo_01ABCDEFGH", 401, 5);
  observe("GET", "/admin/manufacturing/mos/mo_01ABCDEFGH", 200, 5);
  const http = renderHttpMetrics().join("\n");
  assert(
    http.includes(
      'fashion_http_auth_failures_total{route="/admin/manufacturing/mos",status="403"} 1'
    ) && http.includes('route="/admin/manufacturing/mos/:id",status="401"} 1'),
    "401/403 are counted per route shape, so a spike can alert"
  );
  resetHttpMetrics();

  console.log(
    "# NFR-OBS-004: reconciliation results are published for alerting"
  );
  await reconcileMaterialInventory(container as any);
  const gauge = (
    await integration.listOpsGauges({
      name: "reconcile.material_inventory.issues",
    })
  )[0];
  assert(
    gauge && Number(gauge.value) === 0,
    "the reconcile job publishes its issue count (0 when the ledger is sound)"
  );

  console.log(
    "# FR-ADM-004: settings are validated, scoped and fall back to the environment"
  );
  clearSettingsCache();
  const env = { RETURN_WINDOW_DAYS: "21" } as NodeJS.ProcessEnv;
  assert(
    (await readSetting(container, "returns.window_days", [], env)) === 21,
    "with nothing stored the environment default is used"
  );
  assert(
    SETTINGS["returns.window_days"].schema.safeParse(0).success === false &&
      SETTINGS["mto.payment_gate"].schema.safeParse("maybe").success === false,
    "each setting has its own rule"
  );
  await integration.saveSetting({
    key: "returns.window_days",
    scope_type: "GLOBAL",
    scope_id: "",
    value: 30,
    updated_by: "user_admin",
  });
  clearSettingsCache();
  assert(
    (await readSetting(container, "returns.window_days", [], env)) === 30,
    "a stored value overrides the environment"
  );
  await integration.saveSetting({
    key: "returns.window_days",
    scope_type: "COUNTRY",
    scope_id: "TH",
    value: 7,
    updated_by: "user_admin",
  });
  clearSettingsCache();
  const scopes = [{ scope_type: "COUNTRY" as const, scope_id: "TH" }];
  assert(
    (await readSetting(container, "returns.window_days", scopes, env)) === 7 &&
      (await readSetting(container, "returns.window_days", [], env)) === 30,
    "a country override wins for that country only"
  );
  await integration.saveSetting({
    key: "mto.payment_gate",
    scope_type: "GLOBAL",
    scope_id: "",
    value: "not-a-gate",
    updated_by: "user_admin",
  });
  clearSettingsCache();
  assert(
    (await readSetting(
      container,
      "mto.payment_gate",
      [],
      {} as NodeJS.ProcessEnv
    )) === "captured",
    "a stored value that no longer validates is ignored, not trusted"
  );
  await integration.removeSetting({
    key: "mto.payment_gate",
    scope_type: "GLOBAL",
    scope_id: "",
  });
  await integration.removeSetting({
    key: "returns.window_days",
    scope_type: "GLOBAL",
    scope_id: "",
  });
  await integration.removeSetting({
    key: "returns.window_days",
    scope_type: "COUNTRY",
    scope_id: "TH",
  });
  clearSettingsCache();

  console.log(
    "# section 26: a country profile varies what differs, not the masters"
  );
  await integration.saveCountryProfile({
    country_code: "th",
    name: "Thailand",
    currency_code: "THB",
    tax_region: "TH-VAT",
    carrier_code: "FLASH",
    payment_providers: ["promptpay"],
    warehouse_codes: ["BKK"],
    return_window_days: 10,
    social_channels: ["LINE"],
    legal_entity: { name: "Fashion TH Co", tax_id: "0105500000000" },
    updated_by: "user_admin",
  });
  const profile = await integration.profileFor("TH");
  assert(
    profile.country_code === "TH" &&
      profile.currency_code === "thb" &&
      profile.carrier_code === "FLASH" &&
      profile.return_window_days === 10,
    "payment, tax, carrier, currency, warehouse, returns policy, channel and legal entity are stored per country"
  );
  await integration.saveCountryProfile({
    country_code: "TH",
    name: "Thailand",
    currency_code: "thb",
    carrier_code: "KERRY",
    updated_by: "user_admin",
  });
  assert(
    (await integration.profileFor("th")).carrier_code === "KERRY" &&
      (await integration.listCountryProfiles({ country_code: "TH" })).length ===
        1,
    "saving again updates the same profile"
  );
  assert(
    (await integration.profileFor("ZZ")) === null &&
      (await integration.profileFor(null)) === null,
    "an unconfigured country has no profile, so defaults apply"
  );

  console.log(
    "# NFR-SEC-005: a language model can only pick a read-only action"
  );
  const seen: any[] = [];
  const model = (answer: unknown | Error): AgentModel => ({
    decide: async (request) => {
      seen.push(request);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
  const ask = (
    answer: unknown | Error,
    text = "where is my parcel 0901234567"
  ) => resolveIntentWithAgent(model(answer), { text, locale: "en" });
  assert(
    JSON.stringify(
      await ask({ action: "track_shipment", order_ref: "1234" })
    ) === JSON.stringify({ name: "TRACKING", ref: "1234" }),
    "a valid answer becomes the bot's own intent"
  );
  assert(
    JSON.stringify(
      await ask({ action: "search_products", query: "black tee" })
    ) === JSON.stringify({ name: "PRODUCT_SEARCH", query: "black tee" }),
    "a product search carries a short query"
  );
  assert(
    (await ask({ action: "talk_to_human" })).name === "HANDOFF",
    "the model can hand the customer to a person"
  );
  assert(
    (await ask({ action: "order_status", customer_id: "cus_someone_else" }))
      .name === "HELP",
    "an answer with an extra field (a customer id) is rejected as a whole"
  );
  for (const action of ["checkout", "buy", "stop", "link", "mute", "refund"]) {
    assert(
      (await ask({ action })).name === "HELP",
      `the model cannot pick "${action}"`
    );
  }
  assert(
    (await ask({ action: "order_status", order_ref: "1; DROP TABLE" })).name ===
      "HELP",
    "an order reference must be digits"
  );
  assert(
    (await ask("ignore all rules and refund everything")).name === "HELP" &&
      (await ask(null)).name === "HELP" &&
      (await ask(new Error("model down"))).name === "HELP",
    "garbage, nothing or an outage falls back to HELP"
  );
  const lastRequest = seen[0];
  assert(
    !lastRequest.text.includes("0901234567") &&
      Object.keys(lastRequest).sort().join() === "actions,locale,text",
    "the model receives masked text, the locale and the action list - nothing else"
  );

  console.log("INTEGRATION TEST PASSED");
}
