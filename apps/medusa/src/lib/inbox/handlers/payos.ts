import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  PaymentActions,
} from "@medusajs/framework/utils";
import { processPaymentWorkflow } from "@medusajs/medusa/core-flows";

import { PAYOS_PROVIDER_ID } from "../../payos/config";
import type { InboxHandler } from "../registry";

type Knex = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: unknown[] }>;
};

type SessionRow = {
  id: string;
  amount: string | number;
  payment_id: string | null;
  captured_at: Date | string | null;
};

/**
 * The payment session behind a payOS order code. payOS cannot carry our
 * session id, so the provider keeps the order code in the session's data.
 */
const findSession = async (
  container: MedusaContainer,
  orderCode: number
): Promise<SessionRow | undefined> => {
  const db = container.resolve<Knex>(ContainerRegistrationKeys.PG_CONNECTION);
  const { rows } = await db.raw(
    `SELECT ps.id, ps.amount, p.id AS payment_id, p.captured_at
       FROM payment_session ps
       LEFT JOIN payment p ON p.payment_session_id = ps.id AND p.deleted_at IS NULL
      WHERE ps.provider_id = ?
        AND ps.data ->> 'order_code' = ?
        AND ps.deleted_at IS NULL
      LIMIT 1`,
    [PAYOS_PROVIDER_ID, String(orderCode)]
  );
  return (rows as SessionRow[])[0];
};

/**
 * Completes the payment of a transfer payOS confirmed: authorizes and captures
 * the session, and completes the cart when the customer never came back.
 * Safe to repeat: a session that is already captured is left alone.
 *
 * A transfer with no session is not dropped silently. It means money arrived
 * that no order can claim (for example the customer started a second checkout
 * and the first link was replaced), so the event fails, retries, and ends in
 * the DLQ where an operator sees it.
 */
export const handlePayosInboxEvent: InboxHandler = async (container, event) => {
  const orderCode = Number(event.payload.orderCode);
  const paidAmount = Number(event.payload.amount);
  if (!(Number.isSafeInteger(orderCode) && Number.isFinite(paidAmount))) {
    throw new Error("payOS event has no valid orderCode or amount");
  }

  const session = await findSession(container, orderCode);
  if (!session) {
    throw new Error(
      `payOS transfer ${String(orderCode)} (${String(paidAmount)} VND, ref ${String(event.payload.reference)}) has no payment session`
    );
  }
  if (session.captured_at) {
    return;
  }

  const expected = Number(session.amount);
  if (paidAmount < expected) {
    throw new Error(
      `payOS transfer ${String(orderCode)} is short: paid ${String(paidAmount)}, expected ${String(expected)}`
    );
  }

  await processPaymentWorkflow(container).run({
    input: {
      action: PaymentActions.SUCCESSFUL,
      data: { session_id: session.id, amount: expected },
    },
  });
};
