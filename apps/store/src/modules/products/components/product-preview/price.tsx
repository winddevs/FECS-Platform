import { VariantPrice } from "types/global";

export default function PreviewPrice({ price }: { price: VariantPrice }) {
  if (!price) {
    return null;
  }

  const isSale = price.price_type === "sale";

  return (
    <p className="sf-card-price">
      <span className={isSale ? "now is-sale" : "now"} data-testid="price">
        {price.calculated_price}
      </span>
      {isSale && (
        <span className="was" data-testid="original-price">
          {price.original_price}
        </span>
      )}
    </p>
  );
}
