#!/usr/bin/env node
/**
 * API error message translation coverage (static).
 *
 * Extracts the message literal of every `domainError(type, code, message)` and
 * `new MedusaError(type, message, code)` call under src/ (string literals,
 * template literals and `"a" + "b"` concatenations; `${expr}` becomes a
 * wildcard) and asserts that each one is fully translated by the table in
 * src/lib/i18n/error-messages.ts. Also runs a few sample-translation checks.
 *
 * Run: node --experimental-strip-types --no-warnings scripts/check-error-messages.mjs [--list]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const SRC = new URL("../src/", import.meta.url).pathname;
const TABLE_FILE = join(SRC, "lib/i18n/error-messages.ts");
const WILDCARD = "\u0000";
// Concrete values substituted for `${expr}` (one distinct value per wildcard,
// so a pattern that drops or swaps a capture is noticed): a bare id and a
// "messy" value with spaces, decimals and commas.
const SAMPLE_VALUE_FACTORIES = [
  (n) => `ID${n}`,
  (n) => `${n + 1}2.5 abc, d_e${n}`,
];
const CALL_START = /\b(domainError|new\s+MedusaError)\s*\(/g;
const HAS_PLACEHOLDER = /\$\d|\$\{|\$&/;
const JSON_CALL = /\.json\s*\(/g;
const REFINE_CALL = /\.refine\s*\(/g;
const ERROR_BODY = /\btype\s*:\s*"(?:not_found|invalid_data)"/;
const SKIP_FILES = new Set(["lib/errors.ts", "lib/i18n/error-messages.ts"]);

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts") ? [full] : [];
  });

/** Index just past the closing quote of the string/template starting at i. */
const skipString = (source, start) => {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (quote === "`" && ch === "$" && source[i + 1] === "{") {
      i = skipBraces(source, i + 1);
      continue;
    }
    if (ch === quote) {
      return i + 1;
    }
    i += 1;
  }
  return i;
};

/** Index just past the `}` matching the `{` at start. */
const skipBraces = (source, start) => {
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return i;
};

const skipComment = (source, i) => {
  if (source[i] === "/" && source[i + 1] === "/") {
    const end = source.indexOf("\n", i);
    return end === -1 ? source.length : end;
  }
  if (source[i] === "/" && source[i + 1] === "*") {
    const end = source.indexOf("*/", i + 2);
    return end === -1 ? source.length : end + 2;
  }
  return i;
};

/** Top-level argument source texts of the call whose `(` is at openIdx. */
const readArgs = (source, openIdx) => {
  const args = [];
  let depth = 0;
  let argStart = openIdx + 1;
  let i = openIdx;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(source, i);
      continue;
    }
    const afterComment = skipComment(source, i);
    if (afterComment !== i) {
      i = afterComment;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const last = source.slice(argStart, i).trim();
        if (last) args.push(last);
        return args;
      }
    }
    if (ch === "," && depth === 1) {
      args.push(source.slice(argStart, i).trim());
      argStart = i + 1;
    }
    i += 1;
  }
  return args;
};

const unescapeLiteral = (text) =>
  text.replace(/\\(.)/g, (_, ch) => (ch === "n" ? "\n" : ch));

/** Index of the first top-level `char` in text (outside strings/brackets). */
const topLevelIndexOf = (text, char, from = 0) => {
  let depth = 0;
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      i = skipString(text, i);
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    const isOptionalChaining =
      ch === "?" &&
      (text[i + 1] === "." || text[i + 1] === "?" || text[i - 1] === "?");
    if (depth === 0 && ch === char && !isOptionalChaining) return i;
    i += 1;
  }
  return -1;
};

/**
 * Every literal value an argument can take: `"a" + "b"` concatenations,
 * template literals and `cond ? "a" : "b"` ternaries. null when any branch is
 * not a literal.
 */
const literalValues = (arg) => {
  const question = topLevelIndexOf(arg, "?");
  if (question !== -1) {
    const colon = topLevelIndexOf(arg, ":", question + 1);
    if (colon === -1) return null;
    const yes = literalValues(arg.slice(question + 1, colon).trim());
    const no = literalValues(arg.slice(colon + 1).trim());
    return yes && no ? [...yes, ...no] : null;
  }
  const single = literalValue(arg);
  return single === null ? null : [single];
};

/** Literal value of an argument ("a" + `b${x}`), or null when it is dynamic. */
const literalValue = (arg) => {
  let out = "";
  let i = 0;
  let expectOperand = true;
  while (i < arg.length) {
    const ch = arg[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (expectOperand) {
      if (ch !== '"' && ch !== "'" && ch !== "`") return null;
      const end = skipString(arg, i);
      const body = arg.slice(i + 1, end - 1);
      if (ch === "`") {
        let text = "";
        let j = 0;
        while (j < body.length) {
          if (body[j] === "$" && body[j + 1] === "{") {
            j = skipBraces(body, j + 1);
            text += WILDCARD;
          } else if (body[j] === "\\") {
            text += unescapeLiteral(body.slice(j, j + 2));
            j += 2;
          } else {
            text += body[j];
            j += 1;
          }
        }
        out += text;
      } else {
        out += unescapeLiteral(body);
      }
      i = end;
      expectOperand = false;
    } else {
      if (ch !== "+") return null;
      i += 1;
      expectOperand = true;
    }
  }
  return expectOperand ? null : out;
};

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

/**
 * Local helpers such as `const fail = (message: string) => { throw
 * domainError(..., message) }` pass the message through a parameter. Resolve
 * the literals handed to that helper instead.
 */
const wrapperArguments = (source, callIndex, identifier) => {
  const before = source.slice(Math.max(0, callIndex - 600), callIndex);
  const definitions = [
    ...before.matchAll(
      /(?:const|let|function)\s+(\w+)\s*(?:=\s*)?\(([^)]*)\)/g
    ),
  ];
  const definition = definitions.at(-1);
  if (!definition) return null;
  const [, name, params] = definition;
  const paramIndex = params
    .split(",")
    .findIndex((param) => param.trim().split(/[:\s=]/)[0] === identifier);
  if (paramIndex === -1) return null;
  const results = [];
  const callPattern = new RegExp(`(?<![.\\w])${name}\\s*\\(`, "g");
  for (const call of source.matchAll(callPattern)) {
    const isDefinition = /function\s+$/.test(source.slice(0, call.index));
    if (isDefinition) continue;
    const args = readArgs(source, call.index + call[0].length - 1);
    const values =
      args[paramIndex] === undefined ? null : literalValues(args[paramIndex]);
    results.push({
      index: call.index,
      values,
      text: args[paramIndex] ?? "<missing>",
    });
  }
  return results;
};

/** The `message` expression of an object literal, or "message" for shorthand. */
const jsonMessageExpression = (body) => {
  const inner = body.trim().slice(1, -1);
  const key = inner.search(/\bmessage\s*:/);
  if (key === -1) return "message";
  const rest = inner.slice(key).replace(/^message\s*:\s*/, "");
  const end = topLevelIndexOf(rest, ",");
  return (end === -1 ? rest : rest.slice(0, end)).trim();
};

const extractMessages = () => {
  const found = [];
  const dynamic = [];
  const record = (source, rel, siteIndex, messageArg) => {
    const where = `${rel}:${lineOf(source, siteIndex)}`;
    const values = messageArg === undefined ? null : literalValues(messageArg);
    if (values !== null) {
      for (const message of values) found.push({ where, message });
      return;
    }
    const isParam = messageArg !== undefined && /^\w+$/.test(messageArg);
    const calls = isParam
      ? wrapperArguments(source, siteIndex, messageArg)
      : null;
    if (calls === null || calls.length === 0) {
      dynamic.push({ where, text: messageArg ?? "<missing>" });
      return;
    }
    for (const call of calls) {
      const callWhere = `${rel}:${lineOf(source, call.index)}`;
      if (call.values === null) {
        dynamic.push({ where: callWhere, text: call.text });
      } else {
        for (const message of call.values)
          found.push({ where: callWhere, message });
      }
    }
  };
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file);
    if (SKIP_FILES.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(CALL_START)) {
      const args = readArgs(source, match.index + match[0].length - 1);
      record(
        source,
        rel,
        match.index,
        match[1] === "domainError" ? args[2] : args[1]
      );
    }
    if (!rel.startsWith("api/")) continue;
    // Responses written by routes: res.status(4xx).json({ type: "not_found" | "invalid_data", message }).
    for (const match of source.matchAll(JSON_CALL)) {
      const [body] = readArgs(source, match.index + match[0].length - 1);
      if (!(body && ERROR_BODY.test(body))) continue;
      record(source, rel, match.index, jsonMessageExpression(body));
    }
    // Custom zod messages: .refine(check, "message").
    for (const match of source.matchAll(REFINE_CALL)) {
      const args = readArgs(source, match.index + match[0].length - 1);
      if (args[1] && /^["'`]/.test(args[1]))
        record(source, rel, match.index, args[1]);
    }
  }
  return { found, dynamic };
};

const { found, dynamic } = extractMessages();
const unique = new Map();
for (const { where, message } of found) {
  const entry = unique.get(message) ?? [];
  entry.push(where);
  unique.set(message, entry);
}

if (process.argv.includes("--list")) {
  for (const [message, wheres] of [...unique].sort()) {
    console.log(
      `${JSON.stringify(message.replaceAll(WILDCARD, "${…}"))}  <- ${wheres[0]}`
    );
  }
  for (const { where, text } of dynamic) {
    console.log(`DYNAMIC ${where}: ${text.replace(/\s+/g, " ").slice(0, 120)}`);
  }
  process.exit(0);
}

const table = await import(pathToFileURL(TABLE_FILE).href);
const failures = [];
const warnings = [];
const VIETNAMESE_LETTER =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
// Codes that must survive translation untouched: snake_case / UPPER_SNAKE,
// ALL-CAPS status words, `rolls[]`, header names.
const CODE_TOKEN =
  /[A-Za-z]+(?:_[A-Za-z0-9]+)+|\b[A-Z]{4,}\b|rolls\[\]|Idempotency-Key/g;

// Messages whose wildcards need realistic values (an entity name, a scope,
// a reason fragment) for the pattern to be able to recognise them.
const SAMPLE_OVERRIDES = new Map([
  [
    "${…} ${…} not found",
    [
      ["material", "MAT-1"],
      ["supplier", "SUP-1"],
    ],
  ],
  [
    "${…} cannot be set per ${…}",
    [
      ["low_stock", "Country"],
      ["low_stock", "WAREHOUSE"],
    ],
  ],
  [
    "Material ${…}: ${…}",
    [
      ["M-1", "is inactive"],
      ["M-2", "is roll-tracked: provide rolls[]"],
    ],
  ],
]);

const instances = (message) => {
  const override = SAMPLE_OVERRIDES.get(message.replaceAll(WILDCARD, "${…}"));
  if (override) {
    return override.map((values) => {
      let index = 0;
      return {
        english: message.replaceAll(WILDCARD, () => values[index++]),
        values: [],
      };
    });
  }
  const count = message.split(WILDCARD).length - 1;
  if (count === 0) return [{ english: message, values: [] }];
  return SAMPLE_VALUE_FACTORIES.map((make) => {
    const values = Array.from({ length: count }, (_, n) => make(n));
    let index = 0;
    const english = message.replaceAll(WILDCARD, () => values[index++]);
    return { english, values };
  });
};

for (const [message, wheres] of unique) {
  for (const { english, values } of instances(message)) {
    const vi = table.tryTranslateErrorMessage(english);
    const problems = [];
    if (vi === null || vi === english) {
      problems.push("no pattern");
    } else {
      if (HAS_PLACEHOLDER.test(vi)) problems.push("unfilled placeholder");
      if (!VIETNAMESE_LETTER.test(vi)) problems.push("no Vietnamese text");
      for (const value of values) {
        if (!vi.includes(value))
          problems.push(`dropped value ${JSON.stringify(value)}`);
      }
      const codes = english.match(CODE_TOKEN) ?? [];
      for (const code of codes) {
        if (
          !values.some((value) => value.includes(code)) &&
          !vi.includes(code)
        ) {
          problems.push(`dropped code ${code}`);
        }
      }
    }
    if (problems.length > 0) {
      failures.push(
        `${wheres[0]}  ${JSON.stringify(english)}  [${problems.join(", ")}]`
      );
      break;
    }
  }
}
for (const { where, text } of dynamic) {
  failures.push(
    `${where}  non-literal message: ${text.replace(/\s+/g, " ").slice(0, 100)}`
  );
}

// Shadowing: report messages that several patterns match (first one wins).
for (const [message] of unique) {
  const english = instances(message)[0].english;
  const hits = table.ERROR_MESSAGE_PATTERNS.filter((entry) => {
    const match = entry.pattern.exec(english);
    return (
      match && (typeof entry.vi !== "function" || entry.vi(match) !== null)
    );
  });
  if (hits.length > 1) {
    warnings.push(
      `${JSON.stringify(english)} matches ${hits.length} patterns (first wins)`
    );
  }
}

// Messages composed at run time from short fragments and Medusa/zod text that
// no call site contains as one literal.
const SAMPLES = [
  {
    en: "Missing permission: roles:manage",
    contains: ["Thiếu quyền", "roles:manage"],
  },
  { en: "Unauthorized", contains: ["Chưa đăng nhập"] },
  {
    en: "Invalid request: Field 'name' is required",
    contains: ["Yêu cầu không hợp lệ", "'name'"],
  },
  {
    en: "Invalid request: Field 'a' is required; Field 'b' is required",
    contains: ["Trường 'a' là bắt buộc", "Trường 'b' là bắt buộc"],
  },
  {
    en: "Invalid request: Expected type: 'number' for field 'qty', got: 'abc'",
    contains: ["'qty'", "'abc'", "số"],
  },
  {
    en: "Invalid request: Value for field 'limit' too big, expected at most: '100'",
    contains: ["'limit'", "'100'", "quá lớn"],
  },
  {
    en: "Invalid input: expected string, received number",
    contains: ["chuỗi ký tự", "số"],
  },
  {
    en: 'Invalid input: expected string, received undefined at "name"',
    contains: ['tại "name"'],
  },
  {
    en: "Too small: expected string to have >=1 characters",
    contains: ["ít nhất 1 ký tự"],
  },
  { en: "At most 4 decimal places", contains: ["Tối đa 4"] },
  {
    en: "Product with id: prod_01 was not found",
    contains: ["sản phẩm", "prod_01"],
  },
  { en: "material mat_01 not found", contains: ["nguyên phụ liệu", "mat_01"] },
  { en: "Material M-100: is inactive", contains: ["M-100", "ngừng sử dụng"] },
  {
    en: "Material M-100: is roll-tracked: provide rolls[]",
    contains: ["M-100", "rolls[]"],
  },
  {
    en: "Cannot cancel a purchase order in status SENT",
    contains: ["hủy", "SENT"],
  },
  {
    en: "Cannot approve a purchase order in status SENT",
    contains: ["duyệt", "SENT"],
  },
  // Numbers, codes, ids and units survive.
  {
    en: "Insufficient available stock for FAB-001: short by 12.5 m",
    contains: ["FAB-001", "12.5 m", "Không đủ tồn kho khả dụng"],
  },
  {
    en: "LAY_EXCEEDS_ROLL: roll R-0007 holds 48.25 but the plan cuts 50",
    contains: ["LAY_EXCEEDS_ROLL", "R-0007", "48.25", "50"],
  },
  {
    en: "Line 3 would exceed ordered 100 (+5% tolerance)",
    contains: ["Dòng 3", "100", "+5%"],
  },
  // Several sentences and lines.
  {
    en: 'Invalid input: expected string, received number at "a"\nTo be continued. Unauthorized',
    contains: ["Dữ liệu không hợp lệ", "Chưa đăng nhập", "To be continued."],
  },
  {
    en: "Return not found. Order not found",
    contains: ["Không tìm thấy phiếu trả hàng.", "Không tìm thấy đơn hàng"],
  },
];
for (const { en, contains } of SAMPLES) {
  const vi = table.translateErrorMessage(en, "vi");
  if (!contains.every((part) => vi.includes(part))) {
    failures.push(`sample ${JSON.stringify(en)} -> ${JSON.stringify(vi)}`);
  }
  if (table.translateErrorMessage(en, "en") !== en) {
    failures.push(`sample ${JSON.stringify(en)} changed for locale en`);
  }
}
for (const untouched of [
  "Totally unknown message 42",
  "",
  "  ",
  "Cannot frobnicate the widget",
]) {
  if (table.translateErrorMessage(untouched, "vi") !== untouched) {
    failures.push(
      `unknown message must be returned unchanged: ${JSON.stringify(untouched)}`
    );
  }
}
for (const hostile of [undefined, null, 42, {}]) {
  if (table.translateErrorMessage(hostile, "vi") !== hostile) {
    failures.push(
      `non-string input must be returned unchanged: ${JSON.stringify(hostile)}`
    );
  }
}
// Performance guard: a huge message must not hang the error path.
const started = Date.now();
table.translateErrorMessage(`Missing permission: ${"x".repeat(200_000)}`, "vi");
table.translateErrorMessage(`${"Return not found. ".repeat(5000)}`, "vi");
if (Date.now() - started > 2000) {
  failures.push("translation of a very long message took more than 2s");
}

// request-locale
const { requestLocale } = await import(
  pathToFileURL(join(SRC, "lib/i18n/request-locale.ts")).href
);
const LOCALE_CASES = [
  [{ "x-locale": "vi" }, "vi"],
  [{ "x-locale": "VI-vn" }, "vi"],
  [{ "x-locale": "en", "accept-language": "vi" }, "en"],
  [{ "accept-language": "vi-VN,vi;q=0.9,en;q=0.8" }, "vi"],
  [{ "accept-language": "en-US,en;q=0.9,vi;q=0.8" }, "en"],
  [{ "accept-language": "fr, vi;q=0.5" }, "vi"],
  [{ "x-locale": "xx", "accept-language": "vi" }, "vi"],
  [{ "x-locale": ["vi", "en"] }, "vi"],
  [{}, "en"],
];
for (const [headers, expected] of LOCALE_CASES) {
  const actual = requestLocale({ headers });
  if (actual !== expected) {
    failures.push(
      `requestLocale(${JSON.stringify(headers)}) = ${actual}, expected ${expected}`
    );
  }
}
if (requestLocale({}) !== "en")
  failures.push("requestLocale default must be en");
process.env.DEFAULT_API_LOCALE = "vi";
if (requestLocale({ headers: {} }) !== "vi")
  failures.push("DEFAULT_API_LOCALE=vi not honoured");
if (requestLocale({ headers: { "x-locale": "en" } }) !== "en") {
  failures.push("x-locale must override DEFAULT_API_LOCALE");
}
process.env.DEFAULT_API_LOCALE = "garbage";
if (requestLocale({ headers: {} }) !== "en")
  failures.push("invalid DEFAULT_API_LOCALE must fall back to en");
delete process.env.DEFAULT_API_LOCALE;

console.log(
  `error messages: ${unique.size} unique messages (${found.length} call sites), ${table.ERROR_MESSAGE_PATTERNS.length} patterns, ${failures.length} failures`
);
if (process.argv.includes("--shadow")) {
  for (const warning of warnings) console.log(`  ? ${warning}`);
}
if (failures.length > 0) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
