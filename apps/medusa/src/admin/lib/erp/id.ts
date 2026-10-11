const HEX_RADIX = 16;
const UUID_BYTES = 16;
const UUID_VERSION_MASK = 0x0f;
const UUID_VERSION_4 = 0x40;
const UUID_VARIANT_MASK = 0x3f;
const UUID_VARIANT_RFC = 0x80;
const BYTE_PAD = 2;

/** crypto.randomUUID needs a secure context; fall back for plain-http hosts. */
export const newId = (): string => {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(UUID_BYTES));
  bytes[6] = (bytes[6] & UUID_VERSION_MASK) | UUID_VERSION_4;
  bytes[8] = (bytes[8] & UUID_VARIANT_MASK) | UUID_VARIANT_RFC;
  const hex = Array.from(bytes, (b) =>
    b.toString(HEX_RADIX).padStart(BYTE_PAD, "0")
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
