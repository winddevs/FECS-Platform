import { getProductPrice } from "@lib/util/get-product-price";
import { HttpTypes } from "@medusajs/types";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { getLocale } from "next-intl/server";

import { PayloadImage } from "@/components/PayloadImage";

import {
  getProductImages,
  getProductThumbnail,
} from "../../../../lib/util/payload-images";
import { StoreProductWithPayload } from "../../../../types/global";
import PreviewPrice from "./price";

const CARD_IMAGE_SIZES =
  "(max-width: 640px) 46vw, (max-width: 1180px) 30vw, 320px";

export default async function ProductPreview({
  product,
  isFeatured,
  label,
}: {
  product: StoreProductWithPayload;
  isFeatured?: boolean;
  /** Small caps line above the title, e.g. the collection name. */
  label?: string;
  region?: HttpTypes.StoreRegion;
}) {
  const locale = await getLocale();
  const { cheapestPrice } = getProductPrice({ locale, product });

  const title = product.payload_product?.title || product.title;
  const thumbnailData = getProductThumbnail(product);
  const primaryUrl = thumbnailData?.url || product.thumbnail || null;
  const hoverUrl =
    getProductImages(product).find((image) => image.url !== primaryUrl)?.url ??
    null;
  const isSale = cheapestPrice?.price_type === "sale";
  const cardLabel = label ?? product.collection?.title;

  return (
    <LocalizedClientLink
      href={`/products/${product.handle}`}
      className="sf-card"
      data-testid="product-wrapper"
    >
      <div className="sf-card-media">
        {primaryUrl ? (
          <PayloadImage
            src={primaryUrl}
            alt={title}
            fill
            sizes={CARD_IMAGE_SIZES}
            quality={60}
            draggable={false}
            priority={isFeatured}
          />
        ) : (
          <span className="sf-card-placeholder" aria-hidden="true">
            {title.charAt(0)}
          </span>
        )}
        {primaryUrl && hoverUrl && (
          <PayloadImage
            className="sf-card-img-hover"
            src={hoverUrl}
            alt=""
            fill
            sizes={CARD_IMAGE_SIZES}
            quality={60}
            draggable={false}
          />
        )}
        {isSale && cheapestPrice && (
          <span className="sf-card-badge">
            -{cheapestPrice.percentage_diff}%
          </span>
        )}
      </div>
      <div className="sf-card-info">
        {cardLabel && <p className="sf-card-cat">{cardLabel}</p>}
        <h3 className="sf-card-title" data-testid="product-title">
          {title}
        </h3>
        {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
      </div>
    </LocalizedClientLink>
  );
}
