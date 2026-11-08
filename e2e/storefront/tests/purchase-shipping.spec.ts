import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Purchase journey on the demo store (docker/e2e, seed-fashion-demo.ts):
 * product page -> add to cart -> cart -> address -> delivery (shipping fee)
 * -> payment -> order confirmation, then the order is read back from the
 * Medusa admin API to prove the fee that was shown is the fee that was charged.
 *
 * The same journey runs in desktop Chrome, Pixel 7 (Chrome) and iPhone 14
 * (WebKit); see playwright.config.ts.
 */

const LOCALE = "vi";
const COUNTRY = "vn";
const MEDUSA_URL = process.env.E2E_MEDUSA_URL ?? "http://localhost:9100";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@fashion.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Passw0rd!local";

// Seed data: "Áo thun Basic (đen)", size M, and the single flat J&T option.
const PRODUCT_PATH = `/${LOCALE}/${COUNTRY}/products/basic-tee-black`;
const PRODUCT_TITLE = "Áo thun Basic (đen)";
const SIZE = "M";
const UNIT_PRICE = 250_000;
const SHIPPING_OPTION_NAME = "Giao hàng tiêu chuẩn (J&T)";
const SHIPPING_FEE = 30_000;

const ORDER_URL = /\/order\/(order_[A-Za-z0-9]+)\/confirmed/;
const STEP_ADDRESS = /[?&]step=address/;
const STEP_DELIVERY = /[?&]step=delivery/;
const STEP_PAYMENT = /[?&]step=payment/;
const STEP_REVIEW = /[?&]step=review/;

const ADDRESS = {
  firstName: "Minh",
  lastName: "Nguyen",
  address: "12 Nguyen Hue",
  postalCode: "700000",
  city: "Ho Chi Minh",
  province: "Ho Chi Minh",
  phone: "0901234567",
  email: `e2e+${Date.now()}@example.com`,
} as const;

/** Reads the numeric `data-value` the totals components expose. */
const amountOf = async (locator: Locator): Promise<number> => {
  const raw = await locator.first().getAttribute("data-value");
  return Number(raw ?? Number.NaN);
};

// The checkout page renders a second, hidden copy of the summary (mobile
// layout), so read only the one the customer can actually see.
const visible = (page: Page, testId: string) =>
  page.locator(`[data-testid="${testId}"]:visible`).first();

const totalsOf = async (page: Page) => ({
  subtotal: await amountOf(visible(page, "cart-subtotal")),
  shipping: await amountOf(visible(page, "cart-shipping")),
  taxes: await amountOf(visible(page, "cart-taxes")),
  total: await amountOf(visible(page, "cart-total")),
});

/** Vietnamese "30.000 ₫" -> 30000. */
const digitsOf = (text: string): number =>
  Number(text.replaceAll(/\D/g, "") || Number.NaN);

/**
 * The page must never scroll sideways on a phone. Soft, so one layout
 * problem does not hide the functional result of the rest of the journey.
 */
const expectNoHorizontalOverflow = async (page: Page, where: string) => {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect
    .soft(overflow, `horizontal overflow on ${where} (px)`)
    .toBeLessThanOrEqual(1);
};

/** Waits until React has hydrated, so the first tap is not lost. */
const settle = async (page: Page) => {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle");
};

const fillStable = async (field: Locator, value: string) => {
  await expect(async () => {
    await field.fill(value);
    await expect(field).toHaveValue(value);
  }).toPass();
};

const chooseSize = async (page: Page, size: string, scope?: Locator) => {
  const option = (scope ?? page)
    .getByTestId("option-button")
    .filter({ hasText: new RegExp(`^${size}$`) })
    .first();
  await expect(async () => {
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
  }).toPass();
};

// The in-page status (the sticky mobile bar has its own copy).
const addedStatus = (page: Page) =>
  page.getByTestId("add-to-cart-status").first();

const cartCount = (page: Page) =>
  page.getByTestId("nav-cart-link").first().locator(".sf-cart-count");

const adminToken = async (page: Page): Promise<string> => {
  const res = await page.request.post(`${MEDUSA_URL}/auth/user/emailpass`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  expect(res.ok(), "admin login").toBeTruthy();
  const body = (await res.json()) as { token: string };
  return body.token;
};

test.describe("purchase with shipping fee", () => {
  test("add to cart, choose delivery, pay and place the order", async ({
    page,
  }, testInfo) => {
    const isMobile = Boolean(testInfo.project.use.isMobile);

    // 1. Product page ------------------------------------------------------
    await page.goto(PRODUCT_PATH);
    await expect(
      page.getByRole("heading", { name: PRODUCT_TITLE })
    ).toBeVisible();
    await settle(page);
    await expectNoHorizontalOverflow(page, "product page");

    const addButton = page.getByTestId("add-product-button");
    // Nothing can be bought before a size is chosen.
    await expect(addButton).toBeDisabled();

    await chooseSize(page, SIZE);
    await expect(addButton).toBeEnabled();

    // 2. Add to cart -------------------------------------------------------
    await addButton.click();
    await expect(cartCount(page)).toHaveText("1");
    // Visible confirmation, which phones need most (the mini cart is hidden).
    await expect(addedStatus(page)).toHaveAttribute("data-status", "added");
    await expect(
      page.getByTestId("add-to-cart-view-cart").first()
    ).toBeVisible();
    if (isMobile) {
      // storefront.css hides the mini cart on small screens: the badge on the
      // cart icon is the only confirmation, and the icon leads to /cart.
      await expectNoHorizontalOverflow(page, "product page after add");
      // The header slides away while scrolling down; scrolling up brings it back.
      await page.evaluate(() => window.scrollTo(0, 0));
      const cartIcon = page.getByTestId("nav-cart-link").first();
      await expect(cartIcon).toBeInViewport();
      await cartIcon.tap();
    } else {
      await expect(page.getByTestId("nav-cart-dropdown")).toBeVisible();
      await expect(
        page.getByTestId("nav-cart-dropdown").getByTestId("cart-item")
      ).toHaveCount(1);
      await expectNoHorizontalOverflow(page, "product page with cart panel");
      await page.getByTestId("go-to-cart-button").click();
    }

    // 3. Cart page ---------------------------------------------------------
    await expect(page).toHaveURL(new RegExp(`/${LOCALE}/${COUNTRY}/cart`));
    await expect(page.getByTestId("cart-container")).toBeVisible();
    await expect(page.getByTestId("product-row")).toHaveCount(1);
    await expect(
      page.getByTestId("product-row").getByTestId("product-title")
    ).toHaveText(PRODUCT_TITLE);
    await settle(page);
    await expectNoHorizontalOverflow(page, "cart page");

    const cartTotals = await totalsOf(page);
    expect(cartTotals.subtotal).toBe(UNIT_PRICE);
    // No delivery chosen yet, so no shipping is charged.
    expect(cartTotals.shipping).toBe(0);

    await page.getByTestId("checkout-button").click();
    await expect(page).toHaveURL(STEP_ADDRESS);

    // 4. Address -----------------------------------------------------------
    await settle(page);
    await expectNoHorizontalOverflow(page, "checkout address step");
    await fillStable(
      page.getByTestId("shipping-first-name-input"),
      ADDRESS.firstName
    );
    await fillStable(
      page.getByTestId("shipping-last-name-input"),
      ADDRESS.lastName
    );
    await fillStable(
      page.getByTestId("shipping-address-input"),
      ADDRESS.address
    );
    await fillStable(
      page.getByTestId("shipping-postal-code-input"),
      ADDRESS.postalCode
    );
    await fillStable(page.getByTestId("shipping-city-input"), ADDRESS.city);
    await page.getByTestId("shipping-country-select").selectOption(COUNTRY);
    await fillStable(
      page.getByTestId("shipping-province-input"),
      ADDRESS.province
    );
    await fillStable(page.getByTestId("shipping-email-input"), ADDRESS.email);
    await fillStable(page.getByTestId("shipping-phone-input"), ADDRESS.phone);

    await page.getByTestId("submit-address-button").click();
    await expect(page).toHaveURL(STEP_DELIVERY);

    // 5. Delivery: the shipping fee ---------------------------------------
    const options = page.getByTestId("delivery-option-radio");
    await expect(options).toHaveCount(1);
    const option = options.first();
    await expect(option).toContainText(SHIPPING_OPTION_NAME);
    // The fee is shown on the option before it is selected.
    expect(digitsOf(await option.innerText())).toBe(SHIPPING_FEE);
    await expectNoHorizontalOverflow(page, "checkout delivery step");

    const continueToPayment = page.getByTestId("submit-delivery-option-button");
    await expect(continueToPayment).toBeDisabled();

    await option.click();
    await expect(option).toHaveAttribute("aria-checked", "true");
    await expect(continueToPayment).toBeEnabled();

    // The summary charges the fee and the total follows.
    await expect
      .poll(async () => (await totalsOf(page)).shipping)
      .toBe(SHIPPING_FEE);
    const withShipping = await totalsOf(page);
    expect(withShipping.subtotal).toBe(UNIT_PRICE);
    expect(withShipping.total).toBe(
      withShipping.subtotal + withShipping.shipping + withShipping.taxes
    );

    await continueToPayment.click();
    await expect(page).toHaveURL(STEP_PAYMENT);

    // The closed delivery step summarises the chosen method and its fee.
    const deliverySummary = page.getByText(SHIPPING_OPTION_NAME).first();
    await expect(deliverySummary).toBeVisible();
    expect(digitsOf(await deliverySummary.innerText())).toBe(SHIPPING_FEE);

    // 6. Payment -----------------------------------------------------------
    await settle(page);
    await expectNoHorizontalOverflow(page, "checkout payment step");
    const paymentMethod = page.getByRole("radio").first();
    await expect(async () => {
      await paymentMethod.click();
      await expect(paymentMethod).toHaveAttribute("aria-checked", "true");
    }).toPass();
    await page.getByTestId("submit-payment-button").click();
    await expect(page).toHaveURL(STEP_REVIEW);

    // 7. Review and place the order ---------------------------------------
    await expectNoHorizontalOverflow(page, "checkout review step");
    const placeOrder = page.getByTestId("submit-order-button");
    await expect(placeOrder).toBeEnabled();
    if (isMobile) {
      // The primary action must be reachable by thumb without hunting for it.
      await placeOrder.scrollIntoViewIfNeeded();
      await expect(placeOrder).toBeInViewport();
    }
    await placeOrder.click();

    // 8. Confirmation ------------------------------------------------------
    await expect(page).toHaveURL(ORDER_URL);
    await expect(page.getByTestId("order-complete-container")).toBeVisible();
    await expectNoHorizontalOverflow(page, "order confirmation");

    const orderId = ORDER_URL.exec(page.url())?.[1] ?? "";
    expect(orderId).not.toBe("");

    const confirmed = await totalsOf(page);
    expect(confirmed.subtotal).toBe(UNIT_PRICE);
    expect(confirmed.shipping).toBe(SHIPPING_FEE);
    expect(confirmed.total).toBe(withShipping.total);
    await expect(page.getByTestId("shipping-method-summary")).toContainText(
      SHIPPING_OPTION_NAME
    );

    // The cart is gone after the order.
    await page.goto(`/${LOCALE}/${COUNTRY}`);
    await expect(cartCount(page)).toHaveText("0");

    // 9. Back end agrees with what the customer saw -----------------------
    const token = await adminToken(page);
    const res = await page.request.get(
      `${MEDUSA_URL}/admin/orders/${orderId}?fields=id,email,total,subtotal,item_subtotal,shipping_total,shipping_subtotal,tax_total,*items,*shipping_methods`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    expect(res.ok(), "read the order from the admin API").toBeTruthy();
    const { order } = (await res.json()) as {
      order: {
        email: string;
        total: number;
        shipping_total: number;
        shipping_subtotal: number;
        items: { quantity: number; title: string }[];
        shipping_methods: { name: string; amount: number }[];
      };
    };
    expect(order.email).toBe(ADDRESS.email);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(1);
    expect(order.shipping_methods).toHaveLength(1);
    expect(order.shipping_methods[0].name).toBe(SHIPPING_OPTION_NAME);
    expect(Number(order.shipping_methods[0].amount)).toBe(SHIPPING_FEE);
    expect(Number(order.shipping_subtotal)).toBe(SHIPPING_FEE);
    expect(Number(order.total)).toBe(confirmed.total);
  });

  test("mobile: add to cart from the sticky bar", async ({
    page,
  }, testInfo) => {
    test.skip(
      !testInfo.project.use.isMobile,
      "The sticky add-to-cart bar only exists below the lg breakpoint"
    );

    await page.goto(PRODUCT_PATH);
    await expect(
      page.getByRole("heading", { name: PRODUCT_TITLE })
    ).toBeVisible();
    await settle(page);

    // Scroll until the in-page button leaves the viewport: the bar appears.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bar = page.getByTestId("mobile-actions");
    await expect(bar).toBeVisible();
    await expect(bar).toBeInViewport();

    // Nothing selected yet, so the bar must not allow adding.
    const barAdd = page.getByTestId("mobile-cart-button");
    await expect(barAdd).toBeDisabled();

    // Pick the size in the options sheet.
    await page.getByTestId("mobile-actions-button").click();
    const sheet = page.getByTestId("mobile-actions-modal");
    await expect(sheet).toBeVisible();
    await chooseSize(page, SIZE, sheet);
    await page.getByTestId("close-modal-button").click();
    await expect(sheet).toBeHidden();

    await expect(barAdd).toBeEnabled();
    await barAdd.click();
    await expect(cartCount(page)).toHaveText("1");
    // The in-page button is out of view here, so the bar must confirm it.
    const barStatus = bar.getByTestId("add-to-cart-status");
    await expect(barStatus).toHaveAttribute("data-status", "added");
    await expect(barStatus).toBeVisible();
    await expectNoHorizontalOverflow(page, "product page after sticky add");
  });
});
