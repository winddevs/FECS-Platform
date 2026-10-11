import { z } from "zod";

import type { Intent } from "../../modules/socialCommerce/lib/intent";
import { maskText } from "../observability/pii";

/**
 * AI assistant boundary (NFR-SEC-005, ADR-008). A language model may only
 * *choose one of a few read-only actions* for what the customer wrote:
 *
 *  - it sees the customer's text (with phone numbers, e-mails and card
 *    numbers masked) and the list of actions, nothing else;
 *  - it never receives a customer id, a database handle or a secret;
 *  - its answer is checked against a strict schema, so extra fields (a
 *    customer id it was talked into inventing, a tool that does not exist)
 *    make the whole answer invalid;
 *  - the chosen action is then executed by the normal bot flow, which scopes
 *    every query to the linked customer and honours the feature flags.
 *
 * State-changing and consent actions (buy, link, stop/start, mute) are not
 * on the list: they stay rule-based.
 */
export interface AgentModel {
  /** Returns the raw answer; it is untrusted and validated by the caller. */
  decide(input: AgentRequest): Promise<unknown>;
}

export type AgentRequest = {
  text: string;
  locale: string;
  actions: readonly AgentAction[];
};

export const AGENT_ACTIONS = [
  {
    name: "order_status",
    description: "Customer asks about an order (optional order number)",
  },
  {
    name: "track_shipment",
    description: "Customer asks where the parcel is (optional order number)",
  },
  {
    name: "production_status",
    description:
      "Customer asks how far the made-to-order item is (optional order number)",
  },
  {
    name: "search_products",
    description: "Customer looks for a product; provide a short search query",
  },
  {
    name: "talk_to_human",
    description:
      "Customer wants a person, or is upset or the request is outside these actions",
  },
  { name: "help", description: "None of the above applies" },
] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

const ORDER_REF = /^\d{1,10}$/;
const MAX_QUERY = 80;
const MAX_TEXT = 500;

const answerSchema = z
  .object({
    action: z.enum(AGENT_ACTIONS.map((a) => a.name) as [string, ...string[]]),
    order_ref: z.string().regex(ORDER_REF).nullish(),
    query: z.string().trim().min(2).max(MAX_QUERY).nullish(),
  })
  .strict();

/** Maps a validated answer onto the bot's own intent type. */
const toIntent = (answer: z.infer<typeof answerSchema>): Intent => {
  const ref = answer.order_ref ?? null;
  switch (answer.action) {
    case "order_status":
      return { name: "ORDER", ref };
    case "track_shipment":
      return { name: "TRACKING", ref };
    case "production_status":
      return { name: "PRODUCTION", ref };
    case "search_products":
      return answer.query
        ? { name: "PRODUCT_SEARCH", query: answer.query }
        : { name: "HELP" };
    case "talk_to_human":
      return { name: "HANDOFF" };
    default:
      return { name: "HELP" };
  }
};

/**
 * Asks the model what the customer wants. Anything unexpected (an error, a
 * timeout, an invalid or over-reaching answer) falls back to HELP: the model
 * can make the bot less helpful, never more powerful.
 */
export const resolveIntentWithAgent = async (
  model: AgentModel,
  input: { text: string; locale: string }
): Promise<Intent> => {
  try {
    const raw = await model.decide({
      text: maskText(input.text).slice(0, MAX_TEXT),
      locale: input.locale,
      actions: AGENT_ACTIONS,
    });
    const parsed = answerSchema.safeParse(raw);
    return parsed.success ? toIntent(parsed.data) : { name: "HELP" };
  } catch {
    return { name: "HELP" };
  }
};
