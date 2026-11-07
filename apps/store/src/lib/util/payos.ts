const PAYOS_HOST = "payos.vn";

/**
 * The payment link comes from our own backend, but it is stored in session
 * data that the public store API can write to. Before sending the customer
 * away, check that it really is an https page on payos.vn.
 */
export const isPayosCheckoutUrl = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === PAYOS_HOST || url.hostname.endsWith(`.${PAYOS_HOST}`))
    );
  } catch {
    return false;
  }
};
