import { verifySandboxSignature } from "../sandbox-signature";
import {
  ChannelError,
  type InboundMessage,
  type MessageChannel,
  type OutboundMessage,
} from "./channel";

/** In-process channel for dev/CI: records what would have been sent. */
export class SandboxChannel implements MessageChannel {
  readonly code: string;
  readonly sent: OutboundMessage[] = [];
  failNext: "NONE" | "RETRYABLE" | "FINAL" = "NONE";

  constructor(code = "MESSENGER") {
    this.code = code;
  }

  async send(message: OutboundMessage): Promise<{ message_id: string | null }> {
    const failure = this.failNext;
    this.failNext = "NONE";
    if (failure !== "NONE") {
      throw new ChannelError(failure, `sandbox ${failure}`);
    }
    this.sent.push(message);
    return { message_id: `sbx_${this.sent.length}` };
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string
  ): boolean {
    return verifySandboxSignature(headers, rawBody, "x-hub-signature-256");
  }

  parseInbound(body: unknown): InboundMessage[] {
    const m = body as InboundMessage;
    return [{ ...m, occurred_at: new Date(m.occurred_at) }];
  }
}
