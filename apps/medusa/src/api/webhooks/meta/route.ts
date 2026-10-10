import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

import { getMessageChannel } from "../../../integrations/channel/registry";
import { MetaMessengerChannel } from "../../../integrations/meta/messenger";
import { isEnabled } from "../../../lib/feature-flags";
import { INTEGRATION_MODULE } from "../../../modules/integration";
import type IntegrationModuleService from "../../../modules/integration/service";

const MAX_BODY_BYTES = 512 * 1024;

/** Meta subscription handshake (GET with hub.* params). */
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!isEnabled("META_MESSENGER_ENABLED")) {
    res.status(404).json({ code: "DISABLED" });
    return;
  }
  const channel = getMessageChannel();
  const challenge =
    channel instanceof MetaMessengerChannel
      ? channel.verifySubscription(req.query as Record<string, unknown>)
      : null;
  if (challenge === null) {
    res.status(403).json({ code: "INVALID_VERIFY_TOKEN" });
    return;
  }
  res.status(200).send(challenge);
}

/**
 * Inbound messages (FR-SOC-001). Verify the HMAC, persist each message in the
 * durable inbox keyed by Meta's message id, ACK immediately. Replies are sent
 * by the inbox worker, so Meta's retries cannot cause duplicate answers.
 * Unauthenticated by design - the X-Hub-Signature-256 check is the control.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  if (!isEnabled("META_MESSENGER_ENABLED")) {
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
  const channel = getMessageChannel();
  if (!channel.verifyWebhook(req.headers, raw.toString("utf8"))) {
    res.status(401).json({ code: "INVALID_SIGNATURE" });
    return;
  }

  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ code: "INVALID_JSON" });
    return;
  }

  const integration =
    req.scope.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  let stored = 0;
  let duplicates = 0;
  for (const message of channel.parseInbound(body)) {
    const result = await integration.receiveInboxEvent({
      provider: "meta",
      external_event_id: message.message_id,
      event_type: "message",
      payload: { ...message, occurred_at: message.occurred_at.toISOString() },
    });
    if (result.duplicate) {
      duplicates += 1;
    } else {
      stored += 1;
    }
  }
  res.status(200).json({ ok: true, stored, duplicates });
}
