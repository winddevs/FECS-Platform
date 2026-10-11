import { listProducts } from "@lib/data/products";
import { getRegion, listRegions } from "@lib/data/regions";
import { localizedAlternates } from "@lib/seo/alternates";
import { JsonLd } from "@lib/seo/json-ld";
import { createMetadata } from "@lib/seo/metadata";
import { buildProductJsonLd, toMetaDescription } from "@lib/seo/product";
import type { HttpTypes } from "@medusajs/types";
import ProductTemplate from "@modules/products/templates";
import { Metadata } from "next";
import { notFound } from "next/navigation";

import type { StoreProductWithPayload } from "@/types/global";
import { getServerSideURL } from "@/utilities/getURL";

export const instant = false;

type Props = {
  params: Promise<{ locale: string; countryCode: string; handle: string }>;
};

const productPath = (locale: string, countryCode: string, handle: string) =>
  `/${locale}/${countryCode}/products/${handle}`;

export async function generateStaticParams() {
  try {
    const countryCodes = await listRegions().then((regions) =>
      regions?.map((r) => r.countries?.map((c) => c.iso_2)).flat()
    );

    if (!countryCodes) {
      return [];
    }

    const promises = countryCodes.map(async (country) => {
      const { response } = await listProducts({
        countryCode: country,
        queryParams: { limit: 100, fields: "handle" },
      });

      return {
        country,
        products: response.products,
      };
    });

    const countryProducts = await Promise.all(promises);

    return countryProducts
      .flatMap((countryData) =>
        countryData.products.map((product) => ({
          countryCode: countryData.country,
          handle: product.handle,
        }))
      )
      .filter((param) => param.handle);
  } catch (error) {
    console.error(
      `Failed to generate static paths for product pages: ${
        error instanceof Error ? error.message : "Unknown error"
      }.`
    );
    return [];
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const { handle } = params;
  const region = await getRegion(params.countryCode);

  if (!region) {
    notFound();
  }

  const product = await listProducts({
    countryCode: params.countryCode,
    queryParams: { handle } as Partial<HttpTypes.StoreProductParams>,
  }).then(({ response }) => response.products[0]);

  if (!product) {
    notFound();
  }

  const { payload_product: payloadProduct }: StoreProductWithPayload = product;
  const title = payloadProduct?.title || product.title;
  const description = toMetaDescription(product.description, title);
  return createMetadata({
    title,
    description,
    locale: params.locale,
    image: product.thumbnail ?? undefined,
    alternates: localizedAlternates({
      locale: params.locale,
      countryCode: params.countryCode,
      path: `/products/${handle}`,
    }),
  });
}
export default async function ProductPage(props: Props) {
  const params = await props.params;
  const region = await getRegion(params.countryCode);

  if (!region) {
    notFound();
  }

  const pricedProduct = await listProducts({
    countryCode: params.countryCode,
    queryParams: {
      handle: params.handle,
    } as Partial<HttpTypes.StoreProductParams>,
  }).then(({ response }) => response.products[0]);

  if (!pricedProduct) {
    notFound();
  }

  const { payload_product: payloadProduct }: StoreProductWithPayload =
    pricedProduct;
  const title = payloadProduct?.title || pricedProduct.title;
  return (
    <>
      <JsonLd
        id="product-json-ld"
        code={buildProductJsonLd({
          product: pricedProduct,
          url: new URL(
            productPath(params.locale, params.countryCode, params.handle),
            getServerSideURL()
          ).href,
          description: toMetaDescription(pricedProduct.description, title),
        })}
      />
      <ProductTemplate
        product={pricedProduct}
        region={region}
        countryCode={params.countryCode}
      />
    </>
  );
}
