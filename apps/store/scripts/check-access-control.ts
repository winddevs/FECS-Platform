/**
 * Regression test for the Payload access rules that protect the CMS
 * (security findings R-01 and R-02 in Fashion_Platform_Technical_Design_Document_v2.0_as-built.md).
 *
 * It runs the real `payload.config.ts` and calls Payload's REST handlers with
 * real `Request` objects, so it exercises the same access code as `/api/*`.
 *
 * It CREATES users and products, so it only runs against a throwaway database
 * whose name ends in `_test`:
 *
 *   docker exec <postgres> psql -U <user> -d postgres -c "create database cms_test"
 *   cd apps/store
 *   DATABASE_URL=postgresql://<user>:<pass>@localhost:<port>/cms_test pnpm check:access
 *   docker exec <postgres> psql -U <user> -d postgres -c "drop database cms_test"
 *
 * In development (NODE_ENV=development in .env) Payload creates the schema in
 * the empty database by itself. Exit code is 0 when every check passes.
 */
import config from "@payload-config";
import {
  REST_DELETE,
  REST_GET,
  REST_PATCH,
  REST_POST,
} from "@payloadcms/next/routes";
import { getPayload } from "payload";

const databaseUrl = process.env.DATABASE_URL ?? "";
const databaseName = databaseUrl.split("?")[0]?.split("/").pop() ?? "";
if (!databaseName.endsWith("_test")) {
  console.error(
    `Refusing to run: DATABASE_URL must point to a throwaway database named *_test (got "${databaseName}").`
  );
  process.exit(2);
}

const ADMIN_KEY = "test-admin-api-key-0123456789";
const PUBLIC_KEY = "test-public-api-key-0123456789";
const ADMIN_EMAIL = "admin@test.local";
const PUBLIC_EMAIL = "public@test.local";
const FLAG = "?is_from_medusa=true";

const payload = await getPayload({ config });
const resolved = await config;

const ensureUser = async (
  email: string,
  roles: Array<"admin" | "public">,
  apiKey: string
) => {
  const found = await payload.find({
    collection: "users",
    limit: 1,
    where: { email: { equals: email } },
  });
  if (found.docs[0]) {
    return found.docs[0];
  }
  return await payload.create({
    collection: "users",
    data: {
      apiKey,
      email,
      enableAPIKey: true,
      password: "Test-pass-123!",
      roles,
    } as never,
  });
};

const admin = await ensureUser(ADMIN_EMAIL, ["admin"], ADMIN_KEY);
await ensureUser(PUBLIC_EMAIL, ["public"], PUBLIC_KEY);

type Handler = (
  c: typeof resolved
) => (
  request: Request,
  context: { params: Promise<{ slug: string[] }> }
) => Promise<Response>;

const call = async (
  handler: Handler,
  path: string,
  init: { method: string; key?: string; body?: unknown }
) => {
  const url = new URL(`http://localhost:8000/api/${path}`);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (init.key) {
    headers.Authorization = `users API-Key ${init.key}`;
  }
  const slug = url.pathname.replace("/api/", "").split("/").filter(Boolean);
  const response = await handler(resolved)(
    new Request(url, {
      body: init.body ? JSON.stringify(init.body) : undefined,
      headers,
      method: init.method,
    }),
    { params: Promise.resolve({ slug }) }
  );
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    json: json as Record<string, unknown> | null,
    status: response.status,
  };
};

const body = (id: string) => ({
  medusa_id: id,
  options: [],
  title: `Test ${id}`,
  variants: [],
});
const denied = (n: number) => n === 401 || n === 403;
const ok2xx = (n: number) => n >= 200 && n < 300;

// Medusa's requests carry the flag AND the admin API key; products validation
// is skipped only for those, so seed rows the same way.
const asMedusa = {
  query: { is_from_medusa: "true" },
  user: { ...admin, collection: "users" },
} as never;
const seed = async (id: string) =>
  await payload.create({
    collection: "products",
    data: {
      medusa_id: id,
      options: [],
      title: `Seed ${id}`,
      variants: [],
    } as never,
    overrideAccess: true,
    req: asMedusa,
  });

const results: Array<{ name: string; pass: boolean; detail: string }> = [];
const check = (name: string, pass: boolean, detail: string) => {
  results.push({ detail, name, pass });
};

// ---- R-01: products written only by a flagged request from an admin user ----
const toDelete = await seed("del-1");
const toPatch = await seed("patch-1");

let r = await call(REST_POST, `products${FLAG}`, {
  body: body("A"),
  method: "POST",
});
check(
  "R-01 anonymous + flag cannot create",
  denied(r.status),
  `status ${r.status}`
);
r = await call(REST_POST, "products", { body: body("B"), method: "POST" });
check(
  "R-01 anonymous without flag cannot create",
  denied(r.status),
  `status ${r.status}`
);
r = await call(REST_POST, `products${FLAG}`, {
  body: body("C"),
  key: PUBLIC_KEY,
  method: "POST",
});
check(
  "R-01 public user + flag cannot create",
  denied(r.status),
  `status ${r.status}`
);
r = await call(REST_POST, `products${FLAG}`, {
  body: body("D"),
  key: ADMIN_KEY,
  method: "POST",
});
check(
  "R-01 Medusa flow: admin API key + flag can create",
  ok2xx(r.status),
  `status ${r.status}`
);
r = await call(REST_POST, "products", {
  body: body("E"),
  key: ADMIN_KEY,
  method: "POST",
});
check(
  "R-01 admin without flag cannot create",
  denied(r.status),
  `status ${r.status}`
);

r = await call(REST_DELETE, `products/${toDelete.id}${FLAG}`, {
  method: "DELETE",
});
check(
  "R-01 anonymous + flag cannot delete",
  denied(r.status),
  `status ${r.status}`
);
r = await call(REST_DELETE, `products/${toDelete.id}${FLAG}`, {
  key: PUBLIC_KEY,
  method: "DELETE",
});
check(
  "R-01 public user + flag cannot delete",
  denied(r.status),
  `status ${r.status}`
);
r = await call(REST_DELETE, `products/${toDelete.id}${FLAG}`, {
  key: ADMIN_KEY,
  method: "DELETE",
});
check(
  "R-01 Medusa flow: admin API key + flag can delete",
  ok2xx(r.status),
  `status ${r.status}`
);
r = await call(REST_GET, "products", { method: "GET" });
check(
  "R-01 products stay publicly readable",
  ok2xx(r.status),
  `status ${r.status}`
);

const patch = async (key: string | undefined, flag: boolean) =>
  await call(REST_PATCH, `products/${toPatch.id}${flag ? FLAG : ""}`, {
    body: { medusa_id: "HACKED" },
    key,
    method: "PATCH",
  });
await patch(undefined, true);
await patch(PUBLIC_KEY, true);
await patch(ADMIN_KEY, false);
const untouched = await payload.findByID({
  collection: "products",
  id: toPatch.id,
  overrideAccess: true,
});
check(
  "R-01 medusa_id not writable without flag + admin",
  untouched.medusa_id === "patch-1",
  `medusa_id=${untouched.medusa_id}`
);
await patch(ADMIN_KEY, true);
const changed = await payload.findByID({
  collection: "products",
  id: toPatch.id,
  overrideAccess: true,
});
check(
  "R-01 Medusa flow: admin + flag can change medusa_id",
  changed.medusa_id === "HACKED",
  `medusa_id=${changed.medusa_id}`
);

// ---- R-02: only admins open the panel and list users --------------------------
const panel = async (key?: string) => {
  const res = await call(REST_GET, "access", { key, method: "GET" });
  return res.json?.canAccessAdmin === true;
};
check(
  "R-02 anonymous cannot access the admin panel",
  !(await panel()),
  "canAccessAdmin"
);
check(
  "R-02 public user cannot access the admin panel",
  !(await panel(PUBLIC_KEY)),
  "canAccessAdmin"
);
check(
  "R-02 admin can access the admin panel",
  await panel(ADMIN_KEY),
  "canAccessAdmin"
);

r = await call(REST_GET, "users", { method: "GET" });
check(
  "R-02 anonymous cannot list users",
  denied(r.status),
  `status ${r.status}`
);
r = await call(REST_GET, "users", { key: PUBLIC_KEY, method: "GET" });
const publicSees = (r.json?.docs as Array<{ email: string }> | undefined) ?? [];
check(
  "R-02 public user lists only themself",
  publicSees.length === 1 && publicSees[0]?.email === PUBLIC_EMAIL,
  `${publicSees.length} user(s)`
);
r = await call(REST_GET, `users/${admin.id}`, {
  key: PUBLIC_KEY,
  method: "GET",
});
check(
  "R-02 public user cannot read an admin record",
  r.status === 403 || r.status === 404,
  `status ${r.status}`
);
r = await call(REST_GET, "users", { key: ADMIN_KEY, method: "GET" });
const adminSees = (r.json?.docs as unknown[] | undefined) ?? [];
check(
  "R-02 admin lists every user",
  adminSees.length >= 2,
  `${adminSees.length} user(s)`
);

// ---- report ---------------------------------------------------------------
await payload.delete({
  collection: "products",
  overrideAccess: true,
  where: { id: { exists: true } },
});
let failed = 0;
for (const result of results) {
  if (!result.pass) {
    failed += 1;
  }
  console.log(
    `${result.pass ? "PASS" : "FAIL"}  ${result.name}  (${result.detail})`
  );
}
console.log(
  failed === 0
    ? `\nAll ${results.length} checks passed`
    : `\n${failed} of ${results.length} checks FAILED`
);
process.exit(failed === 0 ? 0 : 1);
