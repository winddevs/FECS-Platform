import LocalizedClientLink from "@modules/common/components/localized-client-link";
// @ts-ignore
import { RichText } from "@payloadcms/richtext-lexical/react";

import { StoreProductWithPayload } from "../../../../types/global";

type ProductInfoProps = {
  product: StoreProductWithPayload;
};

/** Collection link and title, shown above the price and options. */
const ProductInfo = ({ product }: ProductInfoProps) => {
  return (
    <div id="product-info">
      {product.collection && (
        <LocalizedClientLink
          href={`/collections/${product.collection.handle}`}
          className="sf-pdp-collection"
        >
          {product.collection.title}
        </LocalizedClientLink>
      )}
      <h1 className="sf-pdp-title" data-testid="product-title">
        {product?.payload_product?.title || product.title}
      </h1>
    </div>
  );
};

/** Long description, rendered from the CMS rich text when present. */
export const ProductDescription = ({ product }: ProductInfoProps) => {
  const richDescription = product?.payload_product?.description;

  if (richDescription !== undefined) {
    return (
      <div className="sf-pdp-desc">
        <RichText data={richDescription} />
      </div>
    );
  }

  if (!product.description) {
    return null;
  }

  return (
    <p
      className="sf-pdp-desc whitespace-pre-line"
      data-testid="product-description"
    >
      {product.description}
    </p>
  );
};

export default ProductInfo;
