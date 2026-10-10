/**
 * Messaging channel abstraction (ADR-005). Meta Messenger is the first
 * implementation; WhatsApp/Zalo/LINE implement the same interface later.
 * Core domain code never sees PSIDs, page tokens or Graph API shapes.
 */
export type InboundMessage = {
  channel: string;
  /** Page / business account id (Page ID for Messenger). */
  account_id: string;
  /** Channel-scoped user id (PSID for Messenger) - never a global customer id. */
  external_user_id: string;
  message_id: string;
  text: string;
  occurred_at: Date;
};

export type OutboundMessage = {
  account_id: string;
  recipient_id: string;
  text: string;
  /** RESPONSE = reply inside the 24h window; UPDATE = proactive notification. */
  kind: "RESPONSE" | "UPDATE";
};

export type ChannelErrorKind = "RETRYABLE" | "FINAL";

export class ChannelError extends Error {
  constructor(
    public readonly kind: ChannelErrorKind,
    message: string
  ) {
    super(message);
    this.name = "ChannelError";
  }
}

export interface MessageChannel {
  readonly code: string;
  send(message: OutboundMessage): Promise<{ message_id: string | null }>;
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string
  ): boolean;
  parseInbound(body: unknown): InboundMessage[];
}
