import type { MedusaContainer } from "@medusajs/framework/types";

export type InboxEventRow = {
  id: string;
  provider: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export type InboxHandler = (
  container: MedusaContainer,
  event: InboxEventRow
) => Promise<void>;

/**
 * Providers register a handler here; the inbox processor dispatches durable
 * inbox rows to them. Adding a channel/carrier means adding one handler, not
 * touching the processor (open/closed).
 */
const handlers = new Map<string, InboxHandler>();

export const registerInboxHandler = (
  provider: string,
  handler: InboxHandler
): void => {
  handlers.set(provider, handler);
};

export const inboxHandlerFor = (provider: string): InboxHandler | undefined =>
  handlers.get(provider);
