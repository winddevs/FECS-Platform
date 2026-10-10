import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { api, check, section } from "./lib.mjs";

/**
 * Every back-office read endpoint, called once as an admin with placeholder
 * ids. A 404 or an empty list is fine; a 5xx means the endpoint itself is
 * broken (for example a query against an entity the module does not expose).
 */
export const smoke = async (ctx) => {
  section("every back-office read endpoint answers without a server error");
  const root = process.env.API_SRC ?? "/src-api";
  const adminRoot = join(root, "admin");
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory()
        ? walk(full)
        : name === "route.ts"
          ? [full]
          : [];
    });
  const broken = [];
  let called = 0;
  for (const file of walk(adminRoot)) {
    if (
      !/export\s+(?:async\s+function|const)\s+GET\b/.test(
        readFileSync(file, "utf8")
      )
    )
      continue;
    const path = `/admin${file
      .slice(adminRoot.length)
      .replace(/\/route\.ts$/, "")
      .replace(/\[[^\]]+\]/g, "x_1")}`;
    // Legacy/commerce endpoints that call external SaaS are covered elsewhere.
    if (/^\/admin\/(custom|analytics|invoice-config|orders\/)/.test(path))
      continue;
    const res = await api(ctx.t.admin, "GET", path);
    called += 1;
    if (res.status >= 500) {
      broken.push(
        `${path} -> ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`
      );
    }
  }
  check(called > 30, `${called} read endpoints called`);
  check(
    broken.length === 0,
    `no read endpoint fails with a 5xx${broken.length ? ` (${broken.join("; ")})` : ""}`
  );
  return ctx;
};
