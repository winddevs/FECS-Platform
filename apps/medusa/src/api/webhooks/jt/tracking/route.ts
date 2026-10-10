import { createHash } from "node:crypto";

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

import { getCarrierProvider } from "../../../../integrations/carrier/registry";
import { isEnabled } from "../../../../lib/feature-flags";
import { INTEGRATION_MODULE } from "../../../../modules/integration";
import type IntegrationModuleService from "../../../../modules/integration/service";

const MAX_BODY_BYTES = 256 * 1024;

/**
 * J&T tracking push (FR-FUL-006). Deliberately thin: verify the signature,
 * store durably in the inbox, ACK. Processing happens asynchronously so the
 * ACK stays well under the 500 ms p95 target and carrier retries are deduped.
 *
 * This route is unauthenticated by design (the carrier has no Medusa token);
 * the HMAC signature is the access control. Put it behind the WAF/rate limit.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!isEnabled("JT_TRACKING_CALLBACK_ENABLED")) {
    res.status(404).json({ code: "DISABLED" });
    return;
  }
  const raw = req.rawBody as Buffer | undefined;
  if (!raw || raw.length === 0) {
    res.status(400).json({ code: "EMPTY_BODY" });
    return;
  }
  if (raw.length > MAX_BODY_BYTES) {
    res.status(413).json({ code: "PAYLOAD_TOO_LARGE" });
    return;
  }

  const provider = getCarrierProvider("JT");
  const rawText = raw.toString("utf8");
  if (!provider.verifyWebhook?.(req.headers, rawText)) {
    res.status(401).json({ code: "INVALID_SIGNATURE" });
    return;
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    res.status(400).json({ code: "INVALID_JSON" });
    return;
  }

  const integration =
    req.scope.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  const result = await integration.receiveInboxEvent({
    provider: "jt",
    // J&T pushes carry no event id, so dedupe on the exact payload.
    external_event_id: createHash("sha256").update(raw).digest("hex"),
    event_type: "tracking",
    payload,
  });
  res.status(200).json({ ok: true, duplicate: result.duplicate });
}
