import { createHash, createHmac, randomInt } from "node:crypto";

import type { Context, DAL } from "@medusajs/framework/types";
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils";

import { TOPICS } from "../../lib/events/envelope";
import {
  drainOutbox,
  type DrainResult,
  type OutboxPublishFn,
} from "../../lib/outbox/outbox";
import { executorOf, flushOf, outboxRowFor } from "../../lib/tx";
import {
  ChannelLinkCode,
  ConversationMessage,
  CustomerChannelIdentity,
  NotificationLog,
  SOCIAL_OUTBOX_TABLE,
  SocialIdempotencyRecord,
  SocialOutboxEvent,
} from "./models/social";

const PRODUCER = "social-commerce";
const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_FAILED_LINK_ATTEMPTS = 5;
const LINK_LOCK_MS = 15 * 60 * 1000;
const MAX_STORED_TEXT = 1000;
/** Unambiguous alphabet (no 0/O/1/I). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export type IdentityKey = {
  channel: string;
  account_id: string;
  external_user_id: string;
};

export type IdentityView = IdentityKey & {
  id: string;
  customer_id: string | null;
  consent_status: "UNKNOWN" | "OPTED_IN" | "OPTED_OUT";
  handoff_state: "BOT" | "HUMAN";
  last_inbound_at: Date | null;
};

/**
 * Link codes are short-lived but low entropy, so a leaked table must not allow
 * an offline search: hash them with a server-side secret (HMAC) when one is
 * configured.
 */
const hashCode = (code: string): string => {
  const pepper = process.env.SOCIAL_LINK_SECRET;
  const normalized = code.toUpperCase();
  return pepper
    ? createHmac("sha256", pepper).update(normalized).digest("hex")
    : createHash("sha256").update(normalized).digest("hex");
};

const newCode = (): string =>
  Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  ).join("");

class SocialCommerceModuleService extends MedusaService({
  CustomerChannelIdentity,
  ChannelLinkCode,
  ConversationMessage,
  NotificationLog,
  SocialOutboxEvent,
  SocialIdempotencyRecord,
}) {
  protected baseRepository_: DAL.RepositoryService;

  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(...(arguments as unknown as []));
    this.baseRepository_ = container.baseRepository;
  }

  // -------------------------------------------------------------------
  // Identity (FR-SOC-002)
  // -------------------------------------------------------------------

  /** Find-or-create (race-safe) and bump the 24h window timestamp. */
  @InjectTransactionManager()
  async touchIdentity(
    input: IdentityKey & { at: Date },
    @MedusaContext() ctx: Context = {}
  ): Promise<IdentityView> {
    const ex = executorOf(ctx);
    await ex.execute(`SELECT pg_advisory_xact_lock(hashtext(?))`, [
      `chid:${input.channel}|${input.account_id}|${input.external_user_id}`,
    ]);
    const [existing] = await ex.execute<IdentityView>(
      `SELECT id, channel, account_id, external_user_id, customer_id, consent_status,
              handoff_state, last_inbound_at
       FROM "customer_channel_identity"
       WHERE channel = ? AND account_id = ? AND external_user_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.channel, input.account_id, input.external_user_id]
    );
    if (existing) {
      const last = existing.last_inbound_at
        ? new Date(existing.last_inbound_at)
        : null;
      if (!last || input.at > last) {
        await this.updateCustomerChannelIdentities(
          { id: existing.id, last_inbound_at: input.at },
          ctx
        );
      }
      return {
        ...existing,
        last_inbound_at: !last || input.at > last ? input.at : last,
      };
    }
    const created = await this.createCustomerChannelIdentities(
      {
        channel: input.channel,
        account_id: input.account_id,
        external_user_id: input.external_user_id,
        last_inbound_at: input.at,
      },
      ctx
    );
    return {
      id: created.id,
      channel: input.channel,
      account_id: input.account_id,
      external_user_id: input.external_user_id,
      customer_id: null,
      consent_status: "UNKNOWN",
      handoff_state: "BOT",
      last_inbound_at: input.at,
    };
  }

  /**
   * Dedupes inbound deliveries by Meta message id. A redelivery of a message
   * that was already fully processed is reported so the caller can stop; one
   * that failed half-way (RECEIVED) is processed again.
   */
  @InjectTransactionManager()
  async recordInbound(
    input: {
      identity_id: string;
      message_id: string;
      text: string;
      intent: string;
    },
    @MedusaContext() ctx: Context = {}
  ): Promise<{ duplicate: boolean; already_processed: boolean }> {
    const ex = executorOf(ctx);
    const rows = await ex.execute<{ id: string }>(
      `INSERT INTO "conversation_message"
         (id, identity_id, direction, external_message_id, text, intent, status, created_at, updated_at)
       VALUES (?, ?, 'IN', ?, ?, ?, 'RECEIVED', now(), now())
       ON CONFLICT (identity_id, direction, external_message_id)
         WHERE deleted_at IS NULL AND external_message_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        `msg_${createHash("sha1").update(`${input.identity_id}:${input.message_id}`).digest("hex").slice(0, 24)}`,
        input.identity_id,
        input.message_id,
        input.text.slice(0, MAX_STORED_TEXT),
        input.intent,
      ]
    );
    if (rows.length > 0) {
      return { duplicate: false, already_processed: false };
    }
    const [existing] = await ex.execute<{ status: string }>(
      `SELECT status FROM "conversation_message"
       WHERE identity_id = ? AND direction = 'IN' AND external_message_id = ? AND deleted_at IS NULL`,
      [input.identity_id, input.message_id]
    );
    return {
      duplicate: true,
      already_processed: existing?.status === "PROCESSED",
    };
  }

  /** Inbound messages from one identity in the last N seconds (flood control). */
  @InjectTransactionManager()
  async inboundCountSince(
    identityId: string,
    seconds: number,
    @MedusaContext() ctx: Context = {}
  ): Promise<number> {
    const [row] = await executorOf(ctx).execute<{ n: string }>(
      `SELECT count(*) AS n FROM "conversation_message"
       WHERE identity_id = ? AND direction = 'IN' AND deleted_at IS NULL
         AND created_at > now() - (? || ' seconds')::interval`,
      [identityId, String(seconds)]
    );
    return Number(row?.n ?? 0);
  }

  @InjectTransactionManager()
  async getIdentity(
    identityId: string,
    @MedusaContext() ctx: Context = {}
  ): Promise<IdentityView | null> {
    const [row] = await executorOf(ctx).execute<IdentityView>(
      `SELECT id, channel, account_id, external_user_id, customer_id, consent_status,
              handoff_state, last_inbound_at
       FROM "customer_channel_identity" WHERE id = ? AND deleted_at IS NULL`,
      [identityId]
    );
    return row ?? null;
  }

  @InjectTransactionManager()
  async markInboundProcessed(
    input: { identity_id: string; message_id: string },
    @MedusaContext() ctx: Context = {}
  ): Promise<void> {
    await executorOf(ctx).execute(
      `UPDATE "conversation_message" SET status = 'PROCESSED', updated_at = now()
       WHERE identity_id = ? AND direction = 'IN' AND external_message_id = ?`,
      [input.identity_id, input.message_id]
    );
  }

  @InjectTransactionManager()
  async recordOutbound(
    input: {
      identity_id: string;
      text: string;
      status: "SENT" | "FAILED" | "SKIPPED";
      error?: string | null;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    return await this.createConversationMessages(
      {
        identity_id: input.identity_id,
        direction: "OUT",
        text: input.text.slice(0, MAX_STORED_TEXT),
        status: input.status,
        error: input.error ?? null,
      },
      ctx
    );
  }

  @InjectTransactionManager()
  async setHandoff(
    input: { identity_id: string; state: "BOT" | "HUMAN"; actor_id: string },
    @MedusaContext() ctx: Context = {}
  ) {
    // Repeating the same state must not re-announce it (the event feeds the
    // support queue).
    const [current] = await executorOf(ctx).execute<{ handoff_state: string }>(
      `SELECT handoff_state FROM "customer_channel_identity" WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.identity_id]
    );
    if (current?.handoff_state === input.state) {
      return { identity_id: input.identity_id, handoff_state: input.state };
    }
    await this.updateCustomerChannelIdentities(
      { id: input.identity_id, handoff_state: input.state },
      ctx
    );
    await flushOf(ctx);
    await this.createSocialOutboxEvents(
      [
        outboxRowFor({
          eventType:
            input.state === "HUMAN"
              ? "social.handoff_requested.v1"
              : "social.handoff_ended.v1",
          aggregateType: "customer_channel_identity",
          aggregateId: input.identity_id,
          producer: PRODUCER,
          topic: TOPICS.notification,
          actor: { actor_id: input.actor_id },
          data: { identity_id: input.identity_id },
        }),
      ],
      ctx
    );
    return { identity_id: input.identity_id, handoff_state: input.state };
  }

  @InjectTransactionManager()
  async setConsent(
    input: { identity_id: string; status: "OPTED_IN" | "OPTED_OUT" },
    @MedusaContext() ctx: Context = {}
  ) {
    await this.updateCustomerChannelIdentities(
      { id: input.identity_id, consent_status: input.status },
      ctx
    );
    return { identity_id: input.identity_id, consent_status: input.status };
  }

  // -------------------------------------------------------------------
  // Account linking (one-time code, brute-force protected)
  // -------------------------------------------------------------------

  /** The plaintext code is returned once; only its hash is stored. */
  @InjectTransactionManager()
  async createLinkCode(customerId: string, @MedusaContext() ctx: Context = {}) {
    const code = newCode();
    const expires = new Date(Date.now() + LINK_CODE_TTL_MS);
    await this.createChannelLinkCodes(
      {
        code_hash: hashCode(code),
        customer_id: customerId,
        expires_at: expires,
      },
      ctx
    );
    return { code, expires_at: expires.toISOString() };
  }

  @InjectTransactionManager()
  async consumeLinkCode(
    input: { identity_id: string; code: string },
    @MedusaContext() ctx: Context = {}
  ): Promise<{
    status: "LINKED" | "INVALID" | "LOCKED";
    customer_id?: string;
  }> {
    const ex = executorOf(ctx);
    const [identity] = await ex.execute<{
      id: string;
      failed_link_attempts: number;
      link_locked_until: Date | null;
    }>(
      `SELECT id, failed_link_attempts, link_locked_until FROM "customer_channel_identity"
       WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
      [input.identity_id]
    );
    if (
      identity?.link_locked_until &&
      new Date(identity.link_locked_until) > new Date()
    ) {
      return { status: "LOCKED" };
    }
    const [row] = await ex.execute<{ id: string; customer_id: string }>(
      `SELECT id, customer_id FROM "channel_link_code"
       WHERE code_hash = ? AND used_at IS NULL AND expires_at > now() AND deleted_at IS NULL FOR UPDATE`,
      [hashCode(input.code)]
    );
    if (!row) {
      const attempts = Number(identity?.failed_link_attempts ?? 0) + 1;
      const lock = attempts >= MAX_FAILED_LINK_ATTEMPTS;
      await this.updateCustomerChannelIdentities(
        {
          id: input.identity_id,
          failed_link_attempts: lock ? 0 : attempts,
          link_locked_until: lock ? new Date(Date.now() + LINK_LOCK_MS) : null,
        },
        ctx
      );
      return { status: lock ? "LOCKED" : "INVALID" };
    }
    await this.updateChannelLinkCodes({ id: row.id, used_at: new Date() }, ctx);
    await this.updateCustomerChannelIdentities(
      {
        id: input.identity_id,
        customer_id: row.customer_id,
        failed_link_attempts: 0,
        link_locked_until: null,
      },
      ctx
    );
    return { status: "LINKED", customer_id: row.customer_id };
  }

  // -------------------------------------------------------------------
  // Notifications (FR-NOT-002)
  // -------------------------------------------------------------------

  /** Returns false when this notification was already handled (dedupe). */
  @InjectTransactionManager()
  async claimNotification(
    input: { identity_id: string; dedupe_key: string; event_type: string },
    @MedusaContext() ctx: Context = {}
  ): Promise<boolean> {
    const rows = await executorOf(ctx).execute<{ id: string }>(
      `INSERT INTO "notification_log" (id, identity_id, dedupe_key, event_type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'PENDING', now(), now())
       ON CONFLICT (identity_id, dedupe_key) WHERE deleted_at IS NULL DO NOTHING
       RETURNING id`,
      [
        `ntf_${createHash("sha1").update(`${input.identity_id}:${input.dedupe_key}`).digest("hex").slice(0, 24)}`,
        input.identity_id,
        input.dedupe_key,
        input.event_type,
      ]
    );
    return rows.length > 0;
  }

  @InjectTransactionManager()
  async finishNotification(
    input: {
      identity_id: string;
      dedupe_key: string;
      status: "SENT" | "SKIPPED" | "FAILED" | "DEFERRED";
      reason?: string | null;
      /** Kept only while DEFERRED, so the message can be sent later. */
      text?: string | null;
    },
    @MedusaContext() ctx: Context = {}
  ) {
    await executorOf(ctx).execute(
      `UPDATE "notification_log"
       SET status = ?, reason = ?, text = CASE WHEN ? = 'DEFERRED' THEN ? ELSE NULL END,
           updated_at = now()
       WHERE identity_id = ? AND dedupe_key = ?`,
      [
        input.status,
        input.reason ?? null,
        input.status,
        input.text ?? null,
        input.identity_id,
        input.dedupe_key,
      ]
    );
  }

  /** Notifications waiting for the messaging window or a channel recovery. */
  @InjectTransactionManager()
  async listDeferred(
    identityId: string,
    limit: number,
    @MedusaContext() ctx: Context = {}
  ): Promise<
    Array<{
      dedupe_key: string;
      event_type: string;
      text: string;
      created_at: Date;
    }>
  > {
    return await executorOf(ctx).execute(
      `SELECT dedupe_key, event_type, text, created_at FROM "notification_log"
       WHERE identity_id = ? AND status = 'DEFERRED' AND text IS NOT NULL AND deleted_at IS NULL
       ORDER BY created_at LIMIT ?`,
      [identityId, limit]
    );
  }

  /** Identities that have deferred notifications (for the retry sweeper). */
  @InjectTransactionManager()
  async identitiesWithDeferred(
    limit: number,
    @MedusaContext() ctx: Context = {}
  ): Promise<IdentityView[]> {
    return await executorOf(ctx).execute<IdentityView>(
      `SELECT DISTINCT i.id, i.channel, i.account_id, i.external_user_id, i.customer_id,
              i.consent_status, i.handoff_state, i.last_inbound_at
       FROM "customer_channel_identity" i
       JOIN "notification_log" n ON n.identity_id = i.id
       WHERE n.status = 'DEFERRED' AND n.deleted_at IS NULL AND i.deleted_at IS NULL
       LIMIT ?`,
      [limit]
    );
  }

  @InjectTransactionManager()
  async notificationsInLastHour(
    identityId: string,
    @MedusaContext() ctx: Context = {}
  ): Promise<number> {
    const [row] = await executorOf(ctx).execute<{ n: string }>(
      `SELECT count(*) AS n FROM "notification_log"
       WHERE identity_id = ? AND status = 'SENT' AND created_at > now() - interval '1 hour'`,
      [identityId]
    );
    return Number(row?.n ?? 0);
  }

  @InjectTransactionManager()
  async identitiesForCustomer(
    customerId: string,
    @MedusaContext() ctx: Context = {}
  ): Promise<IdentityView[]> {
    return await executorOf(ctx).execute<IdentityView>(
      `SELECT id, channel, account_id, external_user_id, customer_id, consent_status,
              handoff_state, last_inbound_at
       FROM "customer_channel_identity" WHERE customer_id = ? AND deleted_at IS NULL`,
      [customerId]
    );
  }

  @InjectTransactionManager()
  async publishOutbox(
    limit: number,
    publish: OutboxPublishFn,
    @MedusaContext() ctx: Context = {}
  ): Promise<DrainResult> {
    return await drainOutbox(
      executorOf(ctx),
      SOCIAL_OUTBOX_TABLE,
      limit,
      publish
    );
  }
}

export default SocialCommerceModuleService;
