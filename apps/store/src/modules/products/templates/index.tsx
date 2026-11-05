import { HttpTypes } from "@medusajs/types";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import ImageGallery from "@modules/products/components/image-gallery";
import ProductActions from "@modules/products/components/product-actions";
import ProductOnboardingCta from "@modules/products/components/product-onboarding-cta";
import ProductTabs from "@modules/products/components/product-tabs";
import RelatedProducts from "@modules/products/components/related-products";
import ProductInfo, {
  ProductDescription,
} from "@modules/products/templates/product-info";
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products";
import { useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import React, { Suspense } from "react";

import { getProductImages } from "../../../lib/util/payload-images";
import { StoreProductWithPayload } from "../../../types/global";
import ProductActionsWrapper from "./product-actions-wrapper";

type ProductTemplateProps = {
  product: StoreProductWithPayload;
  region: HttpTypes.StoreRegion;
  countryCode: string;
};

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
}) => {
  const tHeader = useTranslations("layout.header");
  const tNav = useTranslations("layout.sideMenu");

  if (!product || !product.id) {
    return notFound();
  }

  const productImages = getProductImages(product);
  const title = product.payload_product?.title || product.title;

  return (
    <>
      <div className="sf-pdp" data-testid="product-container">
        <nav className="sf-breadcrumb" aria-label={tHeader("breadcrumb")}>
          <LocalizedClientLink href="/">{tNav("home")}</LocalizedClientLink>
          {product.collection && (
            <>
              <span aria-hidden="true">/</span>
              <LocalizedClientLink
                href={`/collections/${product.collection.handle}`}
              >
                {product.collection.title}
              </LocalizedClientLink>
            </>
          )}
          <span aria-hidden="true">/</span>
          <span aria-current="page">{title}</span>
        </nav>

        <div className="sf-pdp-grid">
          <ImageGallery images={productImages} title={title} />

          <div className="sf-pdp-info">
            <ProductOnboardingCta />
            <ProductInfo product={product} />
            <Suspense
              fallback={
                <ProductActions
                  disabled={true}
                  product={product}
                  region={region}
                />
              }
            >
              <ProductActionsWrapper id={product.id} region={region} />
            </Suspense>
            <ProductDescription product={product} />
            <div className="mt-8">
              <ProductTabs product={product} />
            </div>
          </div>
        </div>
      </div>

      <div className="sf-section" data-testid="related-products-container">
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  );
};

export default ProductTemplate;
