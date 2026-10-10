/**
 * Medusa returns money and quantities as plain numbers in some queries and as
 * BigNumber objects in others (it depends on how the entity was loaded), and
 * `Number(bigNumber)` is NaN. Everything that reads order numbers goes through
 * this, so a NaN can never reach SQL or a carrier request.
 */
export const toNumber = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (typeof value === "object") {
    const big = value as { numeric?: unknown; value?: unknown };
    if (typeof big.numeric === "number") {
      return big.numeric;
    }
    if (big.value !== undefined) {
      return toNumber(big.value, fallback);
    }
    return toNumber(String(value), fallback);
  }
  return fallback;
};

/**
 * Quantity of an order line. With a `filters` clause the order query only
 * fills `items.detail.quantity`; `items.quantity` is left undefined (it is only
 * present on unfiltered/`items.*` loads). Always request `items.detail.quantity`.
 */
export const lineQuantity = (item: {
  quantity?: unknown;
  detail?: { quantity?: unknown } | null;
}): number => toNumber(item.detail?.quantity ?? item.quantity);
