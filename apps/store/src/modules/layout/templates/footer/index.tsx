import { listCategories } from "@lib/data/categories";
import { listCollections } from "@lib/data/collections";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import MedusaCTA from "@modules/layout/components/medusa-cta";
import { getTranslations } from "next-intl/server";

import { ThemeSelector } from "@/providers/Theme/ThemeSelector";

const FOOTER_LIST_LIMIT = 6;

export default async function Footer() {
  const t = await getTranslations("layout.footer");
  const { collections } = await listCollections({
    fields: "*products",
  });
  const productCategories = await listCategories();
  const topCategories = (productCategories ?? [])
    .filter((category) => !category.parent_category)
    .slice(0, FOOTER_LIST_LIMIT);

  return (
    <footer className="sf-footer">
      <div className="sf-footer-grid">
        <div>
          <LocalizedClientLink href="/" className="sf-footer-brand">
            bibaestudios
          </LocalizedClientLink>
          <p className="sf-footer-about">{t("about")}</p>
          <div className="sf-footer-theme">
            <p className="sf-footer-heading">{t("theme")}</p>
            <ThemeSelector />
          </div>
        </div>

        <nav className="sf-footer-col" aria-label={t("shop")}>
          <p className="sf-footer-heading">{t("shop")}</p>
          <LocalizedClientLink href="/store">
            {t("allProducts")}
          </LocalizedClientLink>
          {topCategories.length > 0 && (
            <div data-testid="footer-categories">
              {topCategories.map((category) => (
                <div key={category.id}>
                  <LocalizedClientLink
                    href={`/categories/${category.handle}`}
                    data-testid="category-link"
                  >
                    {category.name}
                  </LocalizedClientLink>
                  {category.category_children?.map((child) => (
                    <LocalizedClientLink
                      key={child.id}
                      className="sf-footer-sub"
                      href={`/categories/${child.handle}`}
                      data-testid="category-link"
                    >
                      {child.name}
                    </LocalizedClientLink>
                  ))}
                </div>
              ))}
            </div>
          )}
        </nav>

        {collections && collections.length > 0 && (
          <nav className="sf-footer-col" aria-label={t("collections")}>
            <p className="sf-footer-heading">{t("collections")}</p>
            {collections.slice(0, FOOTER_LIST_LIMIT).map((collection) => (
              <LocalizedClientLink
                key={collection.id}
                href={`/collections/${collection.handle}`}
              >
                {collection.title}
              </LocalizedClientLink>
            ))}
          </nav>
        )}

        <div className="sf-footer-col">
          <p className="sf-footer-heading">{t("links")}</p>
          <LocalizedClientLink href="/posts">{t("blog")}</LocalizedClientLink>
        </div>
      </div>

      <div className="sf-footer-bottom">
        <p>{t("copyright")}</p>
        <MedusaCTA />
      </div>
    </footer>
  );
}
