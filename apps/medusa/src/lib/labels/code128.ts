/**
 * Code 128 barcode (code set B) rendered as SVG, so rolls, locations and
 * bundles can be printed as scannable labels without an extra dependency
 * (FR-INV-012). The module patterns are the standard Code 128 symbol set,
 * written as bars (1) and spaces (0), 11 modules per symbol.
 */
const PATTERNS = [
  "11011001100",
  "11001101100",
  "11001100110",
  "10010011000",
  "10010001100",
  "10001001100",
  "10011001000",
  "10011000100",
  "10001100100",
  "11001001000",
  "11001000100",
  "11000100100",
  "10110011100",
  "10011011100",
  "10011001110",
  "10111001100",
  "10011101100",
  "10011100110",
  "11001110010",
  "11001011100",
  "11001001110",
  "11011100100",
  "11001110100",
  "11101101110",
  "11101001100",
  "11100101100",
  "11100100110",
  "11101100100",
  "11100110100",
  "11100110010",
  "11011011000",
  "11011000110",
  "11000110110",
  "10100011000",
  "10001011000",
  "10001000110",
  "10110001000",
  "10001101000",
  "10001100010",
  "11010001000",
  "11000101000",
  "11000100010",
  "10110111000",
  "10110001110",
  "10001101110",
  "10111011000",
  "10111000110",
  "10001110110",
  "11101110110",
  "11010001110",
  "11000101110",
  "11011101000",
  "11011100010",
  "11011101110",
  "11101011000",
  "11101000110",
  "11100010110",
  "11101101000",
  "11101100010",
  "11100011010",
  "11101111010",
  "11001000010",
  "11110001010",
  "10100110000",
  "10100001100",
  "10010110000",
  "10010000110",
  "10000101100",
  "10000100110",
  "10110010000",
  "10110000100",
  "10011010000",
  "10011000010",
  "10000110100",
  "10000110010",
  "11000010010",
  "11001010000",
  "11110111010",
  "11000010100",
  "10001111010",
  "10100111100",
  "10010111100",
  "10010011110",
  "10111100100",
  "10011110100",
  "10011110010",
  "11110100100",
  "11110010100",
  "11110010010",
  "11011011110",
  "11011110110",
  "11110110110",
  "10101111000",
  "10100011110",
  "10001011110",
  "10111101000",
  "10111100010",
  "11110101000",
  "11110100010",
  "10111011110",
  "10111101110",
  "11101011110",
  "11110101110",
  "11010000100",
  "11010010000",
  "11010011100",
  "1100011101011",
] as const;

const START_B = 104;
const STOP = 106;
const MODULO = 103;
const FIRST_PRINTABLE = 32;
const LAST_PRINTABLE = 126;
const QUIET_MODULES = 10;

/** Symbol values for `text`: start B, data, checksum, stop. */
export const encodeCode128B = (text: string): number[] => {
  if (text.length === 0) {
    throw new Error("Cannot encode an empty barcode value");
  }
  const values: number[] = [START_B];
  for (const char of text) {
    const code = char.codePointAt(0) ?? -1;
    if (code < FIRST_PRINTABLE || code > LAST_PRINTABLE) {
      throw new Error(`Character ${JSON.stringify(char)} cannot be encoded`);
    }
    values.push(code - FIRST_PRINTABLE);
  }
  const checksum =
    values.reduce(
      (sum, value, index) => sum + value * (index === 0 ? 1 : index),
      0
    ) % MODULO;
  values.push(checksum, STOP);
  return values;
};

/** The bars and spaces of the symbol as a string of 1 and 0 modules. */
export const code128Modules = (text: string): string =>
  encodeCode128B(text)
    .map((value) => PATTERNS[value])
    .join("");

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

export type LabelOptions = {
  /** Text printed under the bars; defaults to the barcode value. */
  caption?: string;
  /** Extra lines (material name, lot, location) above the barcode. */
  headline?: string[];
  moduleWidth?: number;
  barHeight?: number;
};

/** A printable label: headline text, the barcode and its human-readable value. */
export const renderLabelSvg = (
  value: string,
  options: LabelOptions = {}
): string => {
  const moduleWidth = options.moduleWidth ?? 2;
  const barHeight = options.barHeight ?? 70;
  const modules = code128Modules(value);
  const headline = options.headline ?? [];
  const lineHeight = 18;
  const width = (modules.length + QUIET_MODULES * 2) * moduleWidth;
  const top = headline.length * lineHeight + 8;
  const height = top + barHeight + 28;
  const bars: string[] = [];
  let run = 0;
  for (let index = 0; index <= modules.length; index += 1) {
    if (modules[index] === "1") {
      run += 1;
      continue;
    }
    if (run > 0) {
      const x = (index - run + QUIET_MODULES) * moduleWidth;
      bars.push(
        `<rect x="${x}" y="${top}" width="${run * moduleWidth}" height="${barHeight}"/>`
      );
      run = 0;
    }
  }
  const lines = headline
    .map(
      (line, index) =>
        `<text x="${width / 2}" y="${16 + index * lineHeight}" text-anchor="middle" font-family="monospace" font-size="14">${escapeXml(line)}</text>`
    )
    .join("");
  const caption = escapeXml(options.caption ?? value);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Barcode ${caption}">` +
    `<rect width="100%" height="100%" fill="#fff"/>${lines}<g fill="#000">${bars.join("")}</g>` +
    `<text x="${width / 2}" y="${top + barHeight + 20}" text-anchor="middle" font-family="monospace" font-size="16">${caption}</text></svg>`
  );
};
