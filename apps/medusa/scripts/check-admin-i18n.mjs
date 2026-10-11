#!/usr/bin/env node
/**
 * Back-office translation coverage (heuristic, static).
 *
 * Finds user-visible English strings in src/admin and reports the ones that
 * have no Vietnamese entry in src/admin/i18n/vi/*.ts:
 *   - tr("...") / tr(`...`) calls
 *   - object properties such as label / title / description / help /
 *     placeholder / emptyMessage / prompt / successMessage
 *   - JSX attributes (label, title, description, placeholder, aria-label ...)
 *   - JSX text nodes
 * Run: node --experimental-strip-types scripts/check-admin-i18n.mjs [--list]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("../src/admin/", import.meta.url).pathname;
const SCAN_DIRS = ["lib/erp", "screens", "routes", "widgets"];
const DICTIONARY_DIR = join(ROOT, "i18n/vi");

const PROP_NAMES =
  "label|title|description|help|placeholder|emptyMessage|prompt|successMessage|confirmLabel|reasonLabel|submitLabel|legend|text|heading|subtitle|message|hint|tooltip|name";
const PROP = new RegExp(
  `\\b(?:${PROP_NAMES}):\\s*(?:"((?:[^"\\\\]|\\\\.)+)"|'((?:[^'\\\\]|\\\\.)+)')`,
  "g"
);
const JSX_ATTR =
  /\b(?:label|title|description|placeholder|aria-label|prompt|help|successMessage|emptyMessage|alt|submitLabel|confirmLabel)="([^"]+)"/g;
const TR_CALL =
  /\btr\(\s*(?:"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)'|`([^`$]+)`)/g;
const JSX_TEXT = />\s*([A-Z][^<>{}=;]{2,}?)\s*</g;

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return /\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts") ? [full] : [];
  });

const humanVisible = (text) => {
  const value = text.trim();
  if (value.length < 2 || !/[A-Za-z]/.test(value)) return false;
  if (/^[A-Z0-9_]+$/.test(value)) return false; // enum code
  if (/^[a-z0-9_.\-/:{}[\]#@?=&]+$/.test(value)) return false; // identifier/path
  if (/^[a-z]+[A-Z]/.test(value) && !value.includes(" ")) return false; // camelCase id
  if (/^(https?:|\/|\.\.?\/)/.test(value)) return false;
  if (/^[a-z-]+:[^ ]/.test(value)) return false;
  if (
    /^(?:flex|grid|text-|bg-|px-|py-|rounded|border|shadow|w-|h-|gap-)/.test(
      value
    )
  )
    return false; // tailwind
  return value.includes(" ") || /^[A-Z][a-z]/.test(value);
};

const unescape = (s) => s.replace(/\\(["'`\\])/g, "$1");

const dictionary = {};
for (const file of readdirSync(DICTIONARY_DIR).filter((f) =>
  f.endsWith(".ts")
)) {
  const mod = await import(pathToFileURL(join(DICTIONARY_DIR, file)).href);
  Object.assign(dictionary, mod.default);
}

const missing = new Map();
const used = new Set();
const note = (text, file) => {
  const value = unescape(text).trim();
  used.add(value);
  if (!humanVisible(value) || dictionary[value] !== undefined) return;
  const where = missing.get(value) ?? new Set();
  where.add(relative(ROOT, file));
  missing.set(value, where);
};

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    if (file.endsWith("icons.tsx")) continue;
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(PROP)) note(m[1] ?? m[2], file);
    for (const m of source.matchAll(JSX_ATTR)) note(m[1], file);
    for (const m of source.matchAll(TR_CALL)) note(m[1] ?? m[2] ?? m[3], file);
    for (const m of source.matchAll(JSX_TEXT)) note(m[1], file);
  }
}

const list = process.argv.includes("--list");
const unused = Object.keys(dictionary).filter(
  (key) => !(key.startsWith("@status.") || used.has(key))
);
if (list) {
  for (const [text, files] of [...missing].sort()) {
    console.log(`${JSON.stringify(text)}  <- ${[...files].join(", ")}`);
  }
}
console.log(
  `admin i18n: ${Object.keys(dictionary).length} entries, ${missing.size} untranslated, ${unused.length} not referenced literally`
);
process.exit(missing.size > 0 ? 1 : 0);
