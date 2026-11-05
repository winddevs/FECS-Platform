import { getProductPrice } from "@lib/util/get-product-price";
import { HttpTypes } from "@medusajs/types";
import { useLocale, useTranslations } from "next-intl";

export default function ProductPrice({
  product,
  variant,
}: {
  product: HttpTypes.StoreProduct;
  variant?: HttpTypes.StoreProductVariant;
}) {
  const t = useTranslations("products.price");
  const locale = useLocale();
  const { cheapestPrice, variantPrice } = getProductPrice({
    locale,
    product,
    variantId: variant?.id,
  });

  const selectedPrice = variant ? variantPrice : cheapestPrice;

  if (!selectedPrice) {
    return <div className="sf-skeleton block h-7 w-32" />;
  }

  return (
    <p className="sf-pdp-price">
      <span className={selectedPrice.price_type === "sale" ? "is-sale" : ""}>
        {!variant && `${t("from")} `}
        <span
          data-testid="product-price"
          data-value={selectedPrice.calculated_price_number}
        >
          {selectedPrice.calculated_price}
        </span>
      </span>
      {selectedPrice.price_type === "sale" && (
        <>
          <span className="was">
            <span className="sf-visually-hidden">{t("original")} </span>
            <span
              data-testid="original-product-price"
              data-value={selectedPrice.original_price_number}
            >
              {selectedPrice.original_price}
            </span>
          </span>
          <span className="save">-{selectedPrice.percentage_diff}%</span>
        </>
      )}
    </p>
  );
}
