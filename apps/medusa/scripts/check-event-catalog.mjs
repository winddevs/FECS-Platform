#!/usr/bin/env node
// Event contract guard (TDD section 55: "event schema compatibility").
//
// Every domain event the code can emit must be listed in docs/events/catalog.json
// and carry an explicit version suffix (".v<N>"). Removing or renaming an event
// - a breaking change for consumers - shows up as a diff that needs review.
//
//   node scripts/check-event-catalog.mjs --write   regenerate the catalog
//   node scripts/check-event-catalog.mjs --check   fail if code and catalog differ (CI)
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const catalogPath = join(root, "../../docs/events/catalog.json");

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "node_modules" || name === "migrations") return [];
    return statSync(full).isDirectory()
      ? walk(full)
      : full.endsWith(".ts")
        ? [full]
        : [];
  });

// Events with a computed name: expand them explicitly so they are still cataloged.
const PO_STATES = ["approved", "sent", "closed", "cancelled"];
const RETURN_STATES = [
  "authorized",
  "rejected",
  "in_transit",
  "received",
  "inspected",
  "closed",
  "cancelled",
  "requested",
];
const DYNAMIC = [
  ...PO_STATES.map((s) => [
    "procurement",
    `procurement.purchase_order_${s}.v1`,
  ]),
  ...RETURN_STATES.map((s) => ["returns", `returns.return_${s}.v1`]),
];

const literal = /["'`]([a-z-]+\.[a-z_]+\.v\d+)["'`]/g;
const found = new Map();
for (const file of walk(join(root, "src"))) {
  const text = readFileSync(file, "utf8");
  const producer = relative(join(root, "src"), file).split("/")[1] ?? "";
  // Subscribers (and tests) consume events; everything else that names an
  // event is a producer.
  if (producer === "subscribers") continue;
  for (const [, name] of text.matchAll(literal)) {
    if (!found.has(name)) found.set(name, producer);
  }
}
for (const [producer, name] of DYNAMIC)
  found.set(name, found.get(name) ?? producer);

const catalog = Object.fromEntries(
  [...found.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, producer]) => [
      name,
      {
        version: Number(name.match(/\.v(\d+)$/)[1]),
        producer_module: producer,
      },
    ])
);
const rendered = `${JSON.stringify({ envelope: "see src/lib/events/envelope.ts", events: catalog }, null, 2)}\n`;

if (process.argv.includes("--write")) {
  writeFileSync(catalogPath, rendered);
  console.log(
    `wrote ${Object.keys(catalog).length} events to docs/events/catalog.json`
  );
} else {
  let current = "";
  try {
    current = readFileSync(catalogPath, "utf8");
  } catch {
    /* missing */
  }
  if (current !== rendered) {
    const before = new Set(
      Object.keys(JSON.parse(current || '{"events":{}}').events)
    );
    const after = new Set(Object.keys(catalog));
    const removed = [...before].filter((e) => !after.has(e));
    const added = [...after].filter((e) => !before.has(e));
    console.error("Event catalog is out of date.");
    if (added.length)
      console.error(
        `  new events (run --write and review): ${added.join(", ")}`
      );
    if (removed.length)
      console.error(
        `  REMOVED/RENAMED events (breaking for consumers!): ${removed.join(", ")}`
      );
    process.exit(1);
  }
  console.log(`event catalog OK (${Object.keys(catalog).length} events)`);
}
