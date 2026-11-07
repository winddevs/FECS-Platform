import type { Permission } from "./permissions";

/**
 * Which permission Medusa's own admin routes (orders, products, customers,
 * regions, ...) need. The fashion ERP routes carry explicit guards in
 * `api/fashion`; everything else under `/admin` is resolved here.
 *
 * Fail closed: a route that is not listed needs `config:manage` (ERP_ADMIN),
 * so a route added by a Medusa upgrade is never open to every staff member.
 */

/** Result of resolving one request. */
export type CoreAccess =
  /** Guarded elsewhere (fashion ERP routes) or not an authenticated route. */
  | { kind: "skip" }
  /** Any signed-in admin user: what the dashboard shell needs to load. */
  | { kind: "signed-in" }
  | { kind: "permission"; permission: Permission };

const SKIP: CoreAccess = { kind: "skip" };
const SIGNED_IN: CoreAccess = { kind: "signed-in" };
const need = (permission: Permission): CoreAccess => ({
  kind: "permission",
  permission,
});

/**
 * First path segment of routes that have their own per-route guards:
 * the fashion ERP (`api/fashion`) and the legacy commerce routes
 * (`legacyAdminGuards` in `api/middlewares.ts`).
 * `orders` and `returns` are not here: they share their prefix with Medusa.
 */
export const SELF_GUARDED_SEGMENTS: ReadonlySet<string> = new Set([
  "access",
  "analytics",
  "analytics-marts",
  "country-profiles",
  "custom",
  "finished-goods",
  "fulfillment",
  "invoice-config",
  "manufacturing",
  "material-inventory",
  "meilisearch",
  "ops",
  "payload",
  "procurement",
  "quality",
  "settings",
  "social",
]);

type Pair = { read: Permission; write: Permission };

const ORDERS: Pair = { read: "order:read", write: "order:manage" };
const CATALOG: Pair = { read: "catalog:read", write: "catalog:write" };
const PRICING: Pair = { read: "catalog:read", write: "pricing:manage" };
const CUSTOMERS: Pair = { read: "customer:read", write: "customer:write" };
const STOCK: Pair = { read: "fg:read", write: "fg:adjust" };
const STORE: Pair = { read: "store:read", write: "store:manage" };
const PAYMENTS: Pair = { read: "order:read", write: "payment:manage" };
const SYSTEM: Pair = { read: "config:manage", write: "config:manage" };

/** Medusa admin routes by first path segment: read (GET) and write (the rest). */
const CORE_SEGMENTS: Readonly<Record<string, Pair>> = {
  // Orders and what hangs off them.
  orders: ORDERS,
  "draft-orders": ORDERS,
  claims: ORDERS,
  exchanges: ORDERS,
  "order-edits": ORDERS,
  "order-changes": ORDERS,
  returns: ORDERS,
  notifications: ORDERS,
  // Money.
  payments: PAYMENTS,
  "payment-collections": PAYMENTS,
  // Catalog and pricing.
  products: CATALOG,
  "product-variants": CATALOG,
  "product-categories": CATALOG,
  "product-options": CATALOG,
  "product-tags": CATALOG,
  "product-types": CATALOG,
  collections: CATALOG,
  "property-labels": CATALOG,
  uploads: CATALOG,
  "price-lists": PRICING,
  "price-preferences": PRICING,
  promotions: PRICING,
  campaigns: PRICING,
  // Customers.
  customers: CUSTOMERS,
  "customer-groups": CUSTOMERS,
  // Sellable stock levels.
  "inventory-items": STOCK,
  reservations: STOCK,
  // Store setup.
  stores: STORE,
  regions: STORE,
  "sales-channels": STORE,
  currencies: STORE,
  "tax-regions": STORE,
  "tax-rates": STORE,
  "tax-providers": STORE,
  "shipping-options": STORE,
  "shipping-profiles": STORE,
  "shipping-option-types": STORE,
  "fulfillment-sets": STORE,
  "fulfillment-providers": STORE,
  "stock-locations": STORE,
  "return-reasons": STORE,
  "refund-reasons": STORE,
  translations: STORE,
  plugins: STORE,
  layouts: STORE,
  // Staff, keys and engine internals.
  users: { read: "roles:manage", write: "roles:manage" },
  invites: { read: "roles:manage", write: "roles:manage" },
  "api-keys": SYSTEM,
  rbac: SYSTEM,
  index: SYSTEM,
  "workflows-executions": { read: "ops:read", write: "config:manage" },
};

/**
 * Open to every signed-in admin user because the dashboard shell breaks
 * without them: the header reads the store and the current user, the profile
 * page reads the locales. Saved table layouts (`views`) are UI preferences
 * and open to every signed-in user for reads and writes.
 */
const SHELL_READ_SEGMENTS: ReadonlySet<string> = new Set(["stores", "locales"]);

const isShellRead = (segments: readonly string[]): boolean => {
  const [head, second] = segments;
  if (head === "users") {
    return second === "me" && segments.length === 2;
  }
  return head !== undefined && SHELL_READ_SEGMENTS.has(head);
};

const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/**
 * `POST /admin/returns...` routes the fashion ERP already guards. Any other
 * return route is Medusa's own return flow and falls through to the table.
 */
const FASHION_RETURN_ACTIONS: ReadonlySet<string> = new Set([
  "authorize",
  "reject",
  "receive",
  "close",
  "refund",
  "ship-replacement",
]);

const isFashionReturnRoute = (
  method: string,
  segments: readonly string[]
): boolean => {
  const reading = READ_METHODS.has(method);
  if (segments.length === 1) {
    return reading || method === "POST";
  }
  if (segments.length === 2) {
    return reading;
  }
  if (method !== "POST") {
    return false;
  }
  if (segments.length === 3) {
    return FASHION_RETURN_ACTIONS.has(segments[2] ?? "");
  }
  return (
    segments.length === 5 &&
    segments[2] === "items" &&
    segments[4] === "inspect"
  );
};

/** Routes whose permission differs from the rest of their segment. */
const overrideFor = (
  method: string,
  segments: readonly string[]
): Permission | undefined => {
  const [head, second, third] = segments;
  const reading = READ_METHODS.has(method);
  if (head === "orders") {
    // The export is a POST that only reads.
    if (second === "export") {
      return "order:read";
    }
    // Shipping and delivery belong to the warehouse, not to order editing.
    if (third === "fulfillments") {
      return reading ? "order:read" : "fulfillment:manage";
    }
    if (third === "credit-lines" || third === "payment-sessions") {
      return "payment:manage";
    }
  }
  if (head === "fulfillments") {
    return "fulfillment:manage";
  }
  if (head === "products" && second === "export") {
    return "catalog:read";
  }
  return undefined;
};

/**
 * Resolves what a request to Medusa's admin needs.
 *
 * @param method HTTP method, upper case.
 * @param segments Path segments after `/admin`.
 * @param actorId The signed-in user, so a user can read and edit their own
 * profile.
 */
export const resolveCoreAccess = (
  method: string,
  segments: readonly string[],
  actorId: string
): CoreAccess => {
  const [head, second] = segments;
  if (!head) {
    return SKIP;
  }
  if (SELF_GUARDED_SEGMENTS.has(head)) {
    return SKIP;
  }
  // Medusa serves these two without authentication: the invite link is
  // opened before the person has an account, and the dashboard reads the
  // feature flags before sign-in. There is no user to check.
  if (head === "feature-flags" || (head === "invites" && second === "accept")) {
    return SKIP;
  }
  if (head === "returns" && isFashionReturnRoute(method, segments)) {
    return SKIP;
  }
  const reading = READ_METHODS.has(method);
  if ((reading && isShellRead(segments)) || head === "views") {
    return SIGNED_IN;
  }
  // Own profile: the dashboard's "Edit profile" posts to /admin/users/:id.
  // Writing the role key into metadata is blocked separately.
  if (head === "users" && second === actorId && segments.length === 2) {
    return reading || method === "POST" ? SIGNED_IN : need("roles:manage");
  }
  const override = overrideFor(method, segments);
  if (override) {
    return need(override);
  }
  const pair = CORE_SEGMENTS[head];
  if (!pair) {
    return need("config:manage");
  }
  return need(reading ? pair.read : pair.write);
};

/** `/admin/products/prod_1?x=1` -> `["products", "prod_1"]`. */
export const adminSegments = (originalUrl: string): string[] => {
  const path = originalUrl.split("?")[0] ?? "";
  const start = path.indexOf("/admin/");
  if (start === -1) {
    return [];
  }
  return path
    .slice(start + "/admin/".length)
    .split("/")
    .filter(Boolean);
};
