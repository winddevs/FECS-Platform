import { handleJtInboxEvent } from "./handlers/jt";
import { handleMetaInboxEvent } from "./handlers/meta";
import { handlePayosInboxEvent } from "./handlers/payos";
import { registerInboxHandler } from "./registry";

let registered = false;

/** Idempotent; called by the inbox processor before dispatching. */
export const registerInboxHandlers = (): void => {
  if (registered) {
    return;
  }
  registerInboxHandler("jt", handleJtInboxEvent);
  registerInboxHandler("meta", handleMetaInboxEvent);
  registerInboxHandler("payos", handlePayosInboxEvent);
  registered = true;
};
