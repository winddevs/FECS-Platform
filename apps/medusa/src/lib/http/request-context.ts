import { randomUUID } from "node:crypto";

import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";

const MAX_KEY_LENGTH = 200;

export type RequestActor = {
  actor_id: string;
  correlation_id: string;
};

/** Actor + correlation id for commands (NFR-OBS-003). */
export const actorOf = (req: AuthenticatedMedusaRequest): RequestActor => {
  const header = req.headers["x-correlation-id"];
  const supplied = Array.isArray(header) ? header[0] : header;
  return {
    actor_id: req.auth_context.actor_id,
    correlation_id: supplied?.slice(0, MAX_KEY_LENGTH) || `cor_${randomUUID()}`,
  };
};

/** State-changing endpoints require an `Idempotency-Key` header (BR-005). */
export const idempotencyKeyOf = (req: AuthenticatedMedusaRequest): string => {
  const header = req.headers["idempotency-key"];
  const key = (Array.isArray(header) ? header[0] : header)?.trim();
  if (!key || key.length > MAX_KEY_LENGTH) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `An Idempotency-Key header (max ${MAX_KEY_LENGTH} chars) is required`,
      "IDEMPOTENCY_KEY_REQUIRED"
    );
  }
  return key;
};

export const commandOf = (req: AuthenticatedMedusaRequest) => ({
  ...actorOf(req),
  idempotency_key: idempotencyKeyOf(req),
});
