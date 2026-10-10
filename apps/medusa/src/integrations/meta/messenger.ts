import { createHmac, timingSafeEqual } from "node:crypto";

import {
  ChannelError,
  type InboundMessage,
  type MessageChannel,
  type OutboundMessage,
} from "../channel/channel";

export type MetaConfig = {
  appSecret: string;
  verifyToken: string;
  graphVersion: string;
  /** Page ID -> Page access token. Tokens never leave this process. */
  pageTokens: Record<string, string>;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 8000;
const GRAPH_HOST = "https://graph.facebook.com";

/**
 * Meta Messenger adapter. Secrets (app secret, page tokens) are read from
 * the environment / secret manager here only and are never logged or exposed
 * to agents (NFR-SEC-001/005).
 */
export class MetaMessengerChannel implements MessageChannel {
  readonly code = "MESSENGER";

  constructor(private readonly config: MetaConfig) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): MetaMessengerChannel {
    if (!env.META_APP_SECRET || !env.META_VERIFY_TOKEN) {
      throw new Error(
        "Missing Meta configuration: META_APP_SECRET, META_VERIFY_TOKEN"
      );
    }
    // META_PAGES='{"<page_id>":"<page_access_token>"}' supports several pages;
    // META_PAGE_ID/META_PAGE_ACCESS_TOKEN is the single-page shortcut.
    const pageTokens: Record<string, string> = env.META_PAGES
      ? (JSON.parse(env.META_PAGES) as Record<string, string>)
      : env.META_PAGE_ID && env.META_PAGE_ACCESS_TOKEN
        ? { [env.META_PAGE_ID]: env.META_PAGE_ACCESS_TOKEN }
        : {};
    return new MetaMessengerChannel({
      appSecret: env.META_APP_SECRET,
      verifyToken: env.META_VERIFY_TOKEN,
      graphVersion: env.META_GRAPH_VERSION ?? "v21.0",
      pageTokens,
      timeoutMs: Number(env.META_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    });
  }

  /** GET webhook subscription handshake. */
  verifySubscription(query: Record<string, unknown>): string | null {
    return query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] === this.config.verifyToken
      ? String(query["hub.challenge"] ?? "")
      : null;
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string
  ): boolean {
    const header = headers["x-hub-signature-256"];
    const supplied = Array.isArray(header) ? header[0] : header;
    if (!supplied?.startsWith("sha256=")) {
      return false;
    }
    const expected = createHmac("sha256", this.config.appSecret)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(supplied.slice("sha256=".length));
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseInbound(body: unknown): InboundMessage[] {
    const payload = body as {
      object?: string;
      entry?: Array<{
        id: string;
        messaging?: Array<{
          sender?: { id: string };
          timestamp?: number;
          message?: { mid?: string; text?: string; is_echo?: boolean };
        }>;
      }>;
    };
    if (payload?.object !== "page") {
      return [];
    }
    const out: InboundMessage[] = [];
    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        const message = event.message;
        // Ignore echoes of our own messages and non-text events (read, delivery).
        if (!message?.mid || message.is_echo || !event.sender?.id) {
          continue;
        }
        out.push({
          channel: this.code,
          account_id: entry.id,
          external_user_id: event.sender.id,
          message_id: message.mid,
          text: message.text ?? "",
          occurred_at: new Date(event.timestamp ?? Date.now()),
        });
      }
    }
    return out;
  }

  async send(message: OutboundMessage): Promise<{ message_id: string | null }> {
    const token = this.config.pageTokens[message.account_id];
    if (!token) {
      throw new ChannelError(
        "FINAL",
        `No page token configured for account ${message.account_id}`
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: Response;
    try {
      response = await fetch(
        `${GRAPH_HOST}/${this.config.graphVersion}/me/messages`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Token in a header, never in the URL, so it cannot leak via logs.
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            recipient: { id: message.recipient_id },
            messaging_type: message.kind,
            message: { text: message.text },
          }),
          signal: controller.signal,
        }
      );
    } catch (error) {
      throw new ChannelError(
        "RETRYABLE",
        `Meta request failed: ${(error as Error).name}`
      );
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 429 || response.status >= 500) {
      throw new ChannelError("RETRYABLE", `Meta responded ${response.status}`);
    }
    const json = (await response.json().catch(() => ({}))) as {
      message_id?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new ChannelError(
        "FINAL",
        `Meta rejected message: ${json.error?.message ?? response.status}`
      );
    }
    return { message_id: json.message_id ?? null };
  }
}
