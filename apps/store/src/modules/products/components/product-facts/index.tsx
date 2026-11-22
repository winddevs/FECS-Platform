import { isVariantPurchasable } from "@lib/seo/product";
import { useTranslations } from "next-intl";

import type { StoreProductWithPayload } from "../../../../types/global";

type ProductFactsProps = {
  product: StoreProductWithPayload;
};

type Fact = { label: string; value: string };

const LIST_SEPARATOR = ", ";

/**
 * Plain-text summary of what a shopper (or an AI agent reading the page)
 * asks first: is it in stock, which options exist, what is it made of, how
 * long does delivery take. It is rendered on the server and always visible,
 * unlike the accordion below it whose closed panels are not in the HTML.
 */
export default function ProductFacts({ product }: ProductFactsProps) {
  const t = useTranslations("products.facts");
  const tTabs = useTranslations("products.tabs");

  const variants = product.variants ?? [];
  const purchasable = variants.filter(isVariantPurchasable);
  const soldOut = variants.filter((variant) => !isVariantPurchasable(variant));
  const titlesOf = (list: typeof variants) =>
    list
      .map((variant) => variant.title)
      .filter(Boolean)
      .join(LIST_SEPARATOR);

  const facts: Fact[] = [];

  if (variants.length > 0) {
    const status = purchasable.length > 0 ? t("inStock") : t("outOfStock");
    const detail =
      purchasable.length > 0 && soldOut.length > 0
        ? ` (${t("soldOutVariants", { list: titlesOf(soldOut) })})`
        : "";
    facts.push({ label: t("availability"), value: `${status}${detail}` });
  }

  for (const option of product.options ?? []) {
    const values = (option.values ?? [])
      .map((value) => value.value)
      .filter(Boolean)
      .join(LIST_SEPARATOR);
    if (option.title && values) {
      facts.push({ label: option.title, value: values });
    }
  }

  if (product.material) {
    facts.push({ label: tTabs("material"), value: product.material });
  }
  if (product.origin_country) {
    facts.push({ label: tTabs("origin"), value: product.origin_country });
  }
  if (product.type?.value) {
    facts.push({ label: tTabs("type"), value: product.type.value });
  }

  facts.push(
    { label: t("delivery"), value: tTabs("fastDeliveryText") },
    { label: t("returns"), value: tTabs("returnsText") }
  );

  return (
    <section className="sf-pdp-facts" aria-labelledby="product-facts-title">
      <h2 id="product-facts-title">{t("title")}</h2>
      <dl>
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
