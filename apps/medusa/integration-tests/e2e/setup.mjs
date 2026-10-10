import {
  BASE,
  METRICS_TOKEN,
  PASSWORD,
  api,
  check,
  login,
  run,
  section,
  store,
} from "./lib.mjs";

const ROLES = [
  "admin",
  "procurement",
  "warehouse",
  "planner",
  "cutter",
  "sewer",
  "supervisor",
  "qc",
  "packer",
  "support",
  "finance",
  "sre",
  "norole",
];

/** Logs in every role user and discovers the demo store (region, key, SKUs). */
export const setup = async () => {
  section("platform is up and secured");
  check((await fetch(`${BASE}/health`)).status === 200, "liveness /health");
  const ready = await (await fetch(`${BASE}/internal/ready`)).json();
  check(ready.ready === true, "readiness checks the database");

  const t = {};
  for (const role of ROLES) {
    t[role] = await login(`${role}@fashion.local`);
  }
  check(
    Object.keys(t).length === ROLES.length,
    "all 13 role users can sign in"
  );
  check(
    (await api(undefined, "GET", "/admin/manufacturing/mos")).status === 401,
    "no token -> 401"
  );
  check(
    (await api(t.norole, "GET", "/admin/manufacturing/mos")).status === 403,
    "admin without a role -> 403"
  );
  check(
    (await api(t.sewer, "GET", "/admin/finished-goods/balances")).status ===
      403,
    "a sewing operator cannot see finished goods"
  );

  const keys = await api(t.admin, "GET", "/admin/api-keys?type=publishable");
  const publishableKey = keys.body.api_keys.find(
    (k) => k.title === "Fashion webshop"
  )?.token;
  check(Boolean(publishableKey), "demo store has a publishable key");
  const regions = await store(
    publishableKey,
    undefined,
    "GET",
    "/store/regions"
  );
  const region = regions.body.regions.find((r) => r.currency_code === "vnd");
  check(Boolean(region), "Vietnam region (VND) exists");
  const locations = await api(t.admin, "GET", "/admin/stock-locations");
  const stockLocation = locations.body.stock_locations.find(
    (l) => l.name === "HCM Warehouse"
  );
  check(Boolean(stockLocation), "HCM stock location exists");

  const products = await store(
    publishableKey,
    undefined,
    "GET",
    `/store/products?region_id=${region.id}&fields=id,handle,*variants,+variants.sku`
  );
  const variants = {};
  for (const product of products.body.products) {
    for (const variant of product.variants) {
      variants[variant.sku] = variant;
    }
  }
  check(
    ["TEE-BLK-S", "TEE-BLK-M", "TEE-BLK-L", "BLZ-NVY-M", "BLZ-NVY-L"].every(
      (s) => variants[s]
    ),
    "catalogue has the T-shirt (make-to-stock) and blazer (make-to-order)"
  );

  const metrics = await fetch(`${BASE}/internal/metrics`, {
    headers: { authorization: `Bearer ${METRICS_TOKEN}` },
  });
  const text = await metrics.text();
  check(
    metrics.status === 200 && text.includes("fashion_outbox_pending"),
    "metrics endpoint exposes the business gauges"
  );
  check(
    (await fetch(`${BASE}/internal/metrics`)).status === 401,
    "metrics endpoint refuses anonymous scrapes"
  );

  return {
    t,
    publishableKey,
    region,
    stockLocation,
    variants,
    sku: (name) => variants[name].id,
    password: PASSWORD,
    run,
  };
};

/** A registered storefront customer with a bearer token. */
export const newCustomer = async (ctx, label) => {
  const email = `${label}-${run}@example.com`;
  const reg = await fetch(`${BASE}/auth/customer/emailpass/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const { token: registrationToken } = await reg.json();
  const created = await store(
    ctx.publishableKey,
    registrationToken,
    "POST",
    "/store/customers",
    {
      email,
      first_name: label,
      last_name: "Tester",
      phone: "0901234567",
    }
  );
  check(created.status === 200, `customer ${label} registered`);
  const token = await login(email, "customer");
  return { email, token, id: created.body.customer.id };
};

export const address = (name) => ({
  first_name: name,
  last_name: "Tester",
  address_1: "12 Nguyen Hue",
  city: "Quan 1",
  province: "Ho Chi Minh",
  country_code: "vn",
  postal_code: "700000",
  phone: "0901234567",
});

/** Cart -> shipping -> payment -> order, the way the storefront does it. */
export const placeOrder = async (ctx, customer, lines) => {
  const cart = await store(
    ctx.publishableKey,
    customer.token,
    "POST",
    "/store/carts",
    {
      region_id: ctx.region.id,
      email: customer.email,
    }
  );
  check(cart.status === 200, "cart created");
  const cartId = cart.body.cart.id;
  for (const [sku, quantity] of lines) {
    const added = await store(
      ctx.publishableKey,
      customer.token,
      "POST",
      `/store/carts/${cartId}/line-items`,
      {
        variant_id: ctx.sku(sku),
        quantity,
      }
    );
    if (added.status !== 200) {
      return { error: added };
    }
  }
  const addr = address(customer.email.split("-")[0]);
  await store(
    ctx.publishableKey,
    customer.token,
    "POST",
    `/store/carts/${cartId}`,
    {
      shipping_address: addr,
      billing_address: addr,
    }
  );
  const options = await store(
    ctx.publishableKey,
    customer.token,
    "GET",
    `/store/shipping-options?cart_id=${cartId}`
  );
  await store(
    ctx.publishableKey,
    customer.token,
    "POST",
    `/store/carts/${cartId}/shipping-methods`,
    {
      option_id: options.body.shipping_options[0].id,
    }
  );
  const collection = await store(
    ctx.publishableKey,
    customer.token,
    "POST",
    "/store/payment-collections",
    {
      cart_id: cartId,
    }
  );
  await store(
    ctx.publishableKey,
    customer.token,
    "POST",
    `/store/payment-collections/${collection.body.payment_collection.id}/payment-sessions`,
    { provider_id: "pp_system_default" }
  );
  const done = await store(
    ctx.publishableKey,
    customer.token,
    "POST",
    `/store/carts/${cartId}/complete`,
    {}
  );
  if (done.body.type !== "order") {
    return { error: done };
  }
  return { order: done.body.order };
};

/** Admin view of an order with the ids needed for fulfilment/payment. */
export const orderDetail = async (ctx, orderId) =>
  (
    await api(
      ctx.t.admin,
      "GET",
      `/admin/orders/${orderId}?fields=id,display_id,status,customer_id,*items,*payment_collections,*payment_collections.payments`
    )
  ).body.order;
