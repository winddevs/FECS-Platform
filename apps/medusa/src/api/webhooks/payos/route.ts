import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { PayOS, type Webhook } from "@payos/node";

import {
  createPayosClient,
  payosConfigFromEnv,
} from "../../../lib/payos/config";
import { INTEGRATION_MODULE } from "../../../modules/integration";
import type IntegrationModuleService from "../../../modules/integration/service";

/** payOS reports a successful payment with this code. */
const SUCCESS_CODE = "00";

let cachedClient: PayOS | null = null;

const clientOrNull = (): PayOS | null => {
  if (cachedClient) {
    return cachedClient;
  }
  const config = payosConfigFromEnv();
  if (!config) {
    return null;
  }
  cachedClient = createPayosClient(config);
  return cachedClient;
};

const isWebhookBody = (body: unknown): body is Webhook => {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.signature === "string" &&
    typeof candidate.data === "object" &&
    candidate.data !== null
  );
};

/**
 * payOS payment notification. Deliberately thin, like the other webhooks:
 * check the signature, store the event in the durable inbox, ACK. The inbox
 * worker completes the payment, so payOS retries cannot complete it twice.
 *
 * Unauthenticated by design (payOS has no Medusa token); the signature made
 * with the channel's checksum key is the access control.
 */
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const client = clientOrNull();
  if (!client) {
    res.status(404).json({ code: "DISABLED" });
    return;
  }
  if (!isWebhookBody(req.body)) {
    res.status(400).json({ code: "INVALID_BODY" });
    return;
  }
  let data: Awaited<ReturnType<PayOS["webhooks"]["verify"]>>;
  try {
    data = await client.webhooks.verify(req.body);
  } catch {
    res.status(401).json({ code: "INVALID_SIGNATURE" });
    return;
  }
  // Only a settled transfer matters; anything else is acknowledged and dropped.
  if (req.body.success !== true || data.code !== SUCCESS_CODE) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }
  const integration =
    req.scope.resolve<IntegrationModuleService>(INTEGRATION_MODULE);
  const result = await integration.receiveInboxEvent({
    provider: "payos",
    // The bank reference is unique per transfer, so a retried webhook dedupes.
    external_event_id: `${String(data.orderCode)}:${data.reference}`,
    event_type: "payment",
    payload: {
      orderCode: data.orderCode,
      amount: data.amount,
      reference: data.reference,
      paymentLinkId: data.paymentLinkId,
      transactionDateTime: data.transactionDateTime,
    },
  });
  res.status(200).json({ ok: true, duplicate: result.duplicate });
}
