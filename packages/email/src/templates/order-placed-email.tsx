import type {
  BigNumberValue,
  CustomerDTO,
  OrderDTO,
} from "@medusajs/framework/types";
import type { ReactElement } from "react";
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";

import {
  type EmailLocale,
  INTL_LOCALE_TAGS,
  emailCopy,
  formatEmailDate,
  getShopUrl,
  getSupportAddress,
  resolveOrderLocale,
} from "../i18n";

const emailTheme = {
  presets: [pixelBasedPreset],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        border: "#e5e7eb",
        foreground: "#1a1a1a",
        muted: { DEFAULT: "#f7f7f7", foreground: "#737373" },
        primary: { DEFAULT: "#27272a", foreground: "#fbfbfb" },
      },
      fontFamily: {
        sans: ["Inter", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
} as const;

type OrderPlacedEmailProps = {
  order: OrderDTO & {
    customer: CustomerDTO;
  };
  /** Overrides the locale resolved from `order.locale` / `order.metadata.locale`. */
  locale?: EmailLocale;
  /** Support contact shown in the footer. Defaults to env `EMAIL_SUPPORT_ADDRESS`. */
  support_email?: string;
  /** Target of the "view shop" button. Defaults to env `STOREFRONT_URL`. */
  shop_url?: string;
  email_banner?: {
    body: string;
    title: string;
    url: string;
  };
};

function OrderPlacedEmailComponent({
  order,
  email_banner,
  locale: localeOverride,
  support_email,
  shop_url,
}: OrderPlacedEmailProps): ReactElement {
  const shouldDisplayBanner = email_banner && "title" in email_banner;
  const locale = localeOverride ?? resolveOrderLocale(order);
  const copy = emailCopy[locale].orderPlaced;
  const { brand, footerRights } = emailCopy[locale].common;
  const supportAddress = support_email ?? getSupportAddress();
  const shopUrl = shop_url ?? getShopUrl();
  const orderDate = formatEmailDate(order.created_at, locale);
  const firstName =
    order.customer?.first_name || order.shipping_address?.first_name;
  const shippingAddress = order.shipping_address;
  const addressLines = [
    // Vietnamese names are written family name first.
    (locale === "vi"
      ? [shippingAddress?.last_name, shippingAddress?.first_name]
      : [shippingAddress?.first_name, shippingAddress?.last_name]
    )
      .filter(Boolean)
      .join(" "),
    shippingAddress?.address_1,
    shippingAddress?.address_2,
    [shippingAddress?.city, shippingAddress?.province]
      .filter(Boolean)
      .join(", "),
    shippingAddress?.phone,
  ].filter(Boolean);

  // Medusa v2 amounts are major units (250000 VND, 19.99 USD): no scaling.
  const formatter = new Intl.NumberFormat(INTL_LOCALE_TAGS[locale], {
    style: "currency",
    currencyDisplay: "narrowSymbol",
    currency: order.currency_code,
  });

  const formatPrice = (price: BigNumberValue): string => {
    if (typeof price === "number") {
      return formatter.format(price);
    }

    if (typeof price === "string") {
      return formatter.format(parseFloat(price));
    }

    return price?.toString() || "";
  };

  return (
    <Tailwind config={emailTheme}>
      <Html lang={locale}>
        <Head />
        <Preview>{copy.preview}</Preview>
        <Body className="bg-muted font-sans py-10">
          <Container className="bg-background border border-border rounded-[19px] mx-auto max-w-[520px] overflow-hidden">
            {/* Header */}
            <Section className="bg-primary px-10 py-6">
              <Text className="text-primary-foreground text-base font-bold tracking-tight m-0">
                {brand}
              </Text>
            </Section>

            {/* Thank You Message */}
            <Section className="px-10 pt-10 pb-8">
              <Text className="inline-block bg-muted border border-border rounded-full text-muted-foreground text-[11px] font-semibold uppercase tracking-widest px-3 py-1 m-0 mb-6">
                {copy.badge}
              </Text>

              <Heading
                as="h1"
                className="text-foreground text-2xl font-bold tracking-tight leading-snug m-0 mb-3"
              >
                {copy.heading(firstName)}
              </Heading>

              <Text className="text-muted-foreground text-sm leading-6 m-0 mb-6">
                {copy.intro}
              </Text>
            </Section>

            {/* Promotional Banner */}
            {shouldDisplayBanner && (
              <Section className="mx-10 mb-8">
                <Section
                  className="rounded-xl p-7"
                  style={{
                    background: "linear-gradient(to right, #3b82f6, #4f46e5)",
                  }}
                >
                  <Row>
                    <Column align="left">
                      <Heading className="text-white text-xl font-semibold m-0">
                        {email_banner.title}
                      </Heading>
                      <Text className="text-white mt-2 m-0">
                        {email_banner.body}
                      </Text>
                    </Column>
                    <Column align="right">
                      <Link
                        href={email_banner.url}
                        className="font-semibold px-2 text-white underline"
                      >
                        {copy.bannerCta}
                      </Link>
                    </Column>
                  </Row>
                </Section>
              </Section>
            )}

            {/* Order Items */}
            <Section className="px-10">
              <Heading className="text-foreground text-lg font-semibold m-0 mb-4">
                {copy.itemsHeading}
              </Heading>
              <Text className="text-muted-foreground text-sm m-0 mb-1">
                {copy.orderId(order.display_id)}
              </Text>
              {orderDate ? (
                <Text className="text-muted-foreground text-sm m-0 mb-4">
                  {copy.orderDate(orderDate)}
                </Text>
              ) : null}
              {order.items?.map((item) => (
                <Section key={item.id} className="border-b border-border py-4">
                  <Row>
                    <Column className="w-1/3">
                      <Img
                        src={item.thumbnail ?? ""}
                        alt={item.product_title ?? ""}
                        className="rounded-lg"
                        width="100%"
                      />
                    </Column>
                    <Column className="w-2/3 pl-4">
                      <Text className="text-foreground text-base font-semibold m-0">
                        {item.product_title}
                      </Text>
                      <Text className="text-muted-foreground text-sm m-0">
                        {item.variant_title}
                      </Text>
                      <Text className="text-muted-foreground text-sm m-0">
                        {copy.quantity(item.quantity)}
                        {" · "}
                        {copy.unitPrice(formatPrice(item.unit_price))}
                      </Text>
                      <Text className="text-foreground text-base font-bold mt-2 m-0">
                        {formatPrice(item.total)}
                      </Text>
                    </Column>
                  </Row>
                </Section>
              ))}

              {/* Order Summary */}
              <Section className="mt-8 mb-8">
                <Heading className="text-foreground text-lg font-semibold m-0 mb-4">
                  {copy.summaryHeading}
                </Heading>
                <Row className="text-muted-foreground">
                  <Column className="w-1/2">
                    <Text className="m-0 text-sm">{copy.subtotal}</Text>
                  </Column>
                  <Column className="w-1/2 text-right">
                    <Text className="m-0 text-sm">
                      {formatPrice(order.item_total)}
                    </Text>
                  </Column>
                </Row>
                {Number(order.discount_total) > 0 && (
                  <Row className="text-muted-foreground">
                    <Column className="w-1/2">
                      <Text className="m-0 text-sm">{copy.discount}</Text>
                    </Column>
                    <Column className="w-1/2 text-right">
                      <Text className="m-0 text-sm">
                        -{formatPrice(order.discount_total)}
                      </Text>
                    </Column>
                  </Row>
                )}
                {order.shipping_methods?.map((method) => (
                  <Row className="text-muted-foreground" key={method.id}>
                    <Column className="w-1/2">
                      <Text className="m-0 text-sm">
                        {method.name
                          ? copy.shippingNamed(method.name)
                          : copy.shipping}
                      </Text>
                    </Column>
                    <Column className="w-1/2 text-right">
                      <Text className="m-0 text-sm">
                        {formatPrice(method.total)}
                      </Text>
                    </Column>
                  </Row>
                ))}
                <Row className="text-muted-foreground">
                  <Column className="w-1/2">
                    <Text className="m-0 text-sm">{copy.tax}</Text>
                  </Column>
                  <Column className="w-1/2 text-right">
                    <Text className="m-0 text-sm">
                      {formatPrice(order.tax_total || 0)}
                    </Text>
                  </Column>
                </Row>
                <Row className="border-t border-border mt-4 text-foreground">
                  <Column className="w-1/2">
                    <Text className="text-sm font-bold m-0">{copy.total}</Text>
                  </Column>
                  <Column className="w-1/2 text-right">
                    <Text className="text-sm font-bold m-0">
                      {formatPrice(order.total)}
                    </Text>
                  </Column>
                </Row>
              </Section>

              {/* Shipping Address */}
              {addressLines.length > 0 && (
                <Section className="mb-8">
                  <Heading className="text-foreground text-lg font-semibold m-0 mb-2">
                    {copy.shippingAddressHeading}
                  </Heading>
                  {addressLines.map((line) => (
                    <Text
                      className="text-muted-foreground text-sm leading-5 m-0"
                      key={line}
                    >
                      {line}
                    </Text>
                  ))}
                </Section>
              )}

              {/* Shop button */}
              {shopUrl && (
                <Section className="mb-8 text-center">
                  <Link
                    href={shopUrl}
                    className="bg-primary text-primary-foreground text-sm font-semibold rounded-[15px] px-7 py-3.5 no-underline inline-block"
                  >
                    {copy.viewShop}
                  </Link>
                </Section>
              )}
            </Section>

            <Section className="border-t border-border mx-10" />

            {/* Footer */}
            <Section className="px-10 py-6">
              <Text className="text-muted-foreground text-xs leading-5 m-0 mb-1">
                {copy.support(supportAddress)}
              </Text>
              <Text className="text-muted-foreground text-xs leading-5 m-0">
                {copy.reference(order.id)}
              </Text>
              <Text className="text-muted-foreground text-xs leading-5 m-0 mt-4">
                {footerRights(new Date().getFullYear())}
              </Text>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

export const OrderPlacedEmail = (props: OrderPlacedEmailProps) => (
  <OrderPlacedEmailComponent {...props} />
);
