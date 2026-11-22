import { getCatalogOutline } from "@lib/data/catalog-outline";
import { renderLlmsTxt } from "@lib/seo/llms";
import { SITE_NAME, absoluteUrl } from "@lib/seo/site";
import { getTranslations } from "next-intl/server";

import { DEFAULT_LOCALE } from "@/i18n/localization";

const COUNTRY_CODE = process.env.NEXT_PUBLIC_DEFAULT_REGION || "vn";
const HEADERS = {
  "Content-Type": "text/markdown; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

/**
 * Site guide for AI agents at /llms.txt. Text comes from the same translation
 * files the storefront shows, so it cannot drift from what shoppers read.
 */
export async function GET(): Promise<Response> {
  const locale = DEFAULT_LOCALE;
  const base = `/${locale}/${COUNTRY_CODE}`;
  const [tMeta, tTabs, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "metadata" }),
    getTranslations({ locale, namespace: "products.tabs" }),
    getTranslations({ locale, namespace: "layout.sideMenu" }),
  ]);

  // The guide still works without the outline when Medusa is unreachable.
  const outline = await getCatalogOutline().catch(() => ({
    categories: [],
    collections: [],
  }));

  const text = renderLlmsTxt({
    name: SITE_NAME,
    summary: tMeta("description"),
    details: [
      `Giao hàng: ${tTabs("fastDeliveryText")}`,
      `Đổi trả: ${tTabs("returnsText")}`,
      "Giá niêm yết bằng VND. Mỗi sản phẩm có trang riêng với giá, tồn kho, size, màu và dữ liệu có cấu trúc schema.org (JSON-LD). Trang có hai ngôn ngữ: tiếng Việt (/vi) và tiếng Anh (/en).",
    ],
    sections: [
      {
        heading: "Cửa hàng",
        links: [
          {
            title: tNav("home"),
            url: absoluteUrl(base),
          },
          {
            title: "Tất cả sản phẩm",
            url: absoluteUrl(`${base}/store`),
          },
          {
            title: "Sitemap",
            url: absoluteUrl("/sitemap.xml"),
            note: "mọi sản phẩm, danh mục, bộ sưu tập, bản vi và en",
          },
          {
            title: "Product feed",
            url: absoluteUrl(`/feeds/google.xml?country=${COUNTRY_CODE}`),
            note: "XML, mỗi dòng là một phân loại với giá, tồn kho, GTIN",
          },
        ],
      },
      {
        heading: "Danh mục",
        links: outline.categories.map((category) => ({
          title: category.name,
          url: absoluteUrl(`${base}/categories/${category.handle}`),
        })),
      },
      {
        heading: "Bộ sưu tập",
        links: outline.collections.map((collection) => ({
          title: collection.name,
          url: absoluteUrl(`${base}/collections/${collection.handle}`),
        })),
      },
    ],
  });

  return new Response(text, { headers: HEADERS });
}
