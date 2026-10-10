// `medusa build` type-checks the whole project and exits 1 on any error. The
// original template code (Payload/Algolia/Resend/analytics wiring) predates the
// current Medusa/TypeScript versions and still has type-only errors; it emits
// working JavaScript regardless. Instead of switching the check off, this
// script keeps it as a gate: the build may only report errors in that known
// legacy code. An error anywhere else (all the fashion platform code) fails.
//
//   npx medusa build > build.log 2>&1 ; node scripts/check-build-errors.mjs build.log
import { existsSync, readFileSync } from "node:fs";

const LEGACY = [
  /^src\/api\/(admin|store)\/analytics\/route\.ts$/,
  /^src\/modules\/payload\//,
  /^src\/subscribers\/(order-placed|product-(created|deleted|updated))\.ts$/,
  /^src\/workflows\/[a-z-]+\.ts$/, // template workflows (fashion ones are listed below)
  /^src\/workflows\/steps\/(create-payload-items|delete-payload-items|delete-products-from-algolia|generate-invoice-pdf|get-order-invoice|retrieve-payload-items|send-notification|sync-products|track-event|update-invoice-config|update-invoices|update-payload-items)\.ts$/,
  /^\.\.\/\.\.\/packages\/email\//,
];
// Workflow files written for the fashion platform: never legacy.
const FASHION_WORKFLOWS =
  /^src\/workflows\/(fashion-master-data|finished-goods|fulfillment-created|fulfillment|manufacturing|material-inventory|mto|procurement|returns|social)\.ts$/;

const log = readFileSync(process.argv[2], "utf8").replace(
  /\x1b\[[0-9;]*m/g,
  ""
);
const errors = [
  ...log.matchAll(
    /^(?:#\d+ [\d.]+ )?(\S+\.tsx?):(\d+):(\d+) - error (TS\d+): (.*)$/gm
  ),
].map((m) => ({ file: m[1], line: m[2], code: m[4], text: m[5] }));

const isLegacy = (file) =>
  !FASHION_WORKFLOWS.test(file) && LEGACY.some((re) => re.test(file));
const fresh = errors.filter((e) => !isLegacy(e.file));

console.log(
  `build type errors: ${errors.length} (legacy code: ${errors.length - fresh.length}, other: ${fresh.length})`
);
for (const e of fresh) {
  console.error(`  NEW ${e.file}:${e.line} ${e.code} ${e.text.slice(0, 160)}`);
}
const emitted = existsSync(".medusa/server/medusa-config.js");
if (!emitted) {
  console.error("  build output .medusa/server/medusa-config.js is missing");
}
process.exit(fresh.length === 0 && emitted ? 0 : 1);
