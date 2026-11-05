import { listCategories } from "@lib/data/categories";
import CartButton from "@modules/layout/components/cart-button";
import type { Header as MedusaHeader } from "@payload-types";
import { getTranslations } from "next-intl/server";
import type { TypedLocale } from "payload";
import { Suspense } from "react";

import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import LocaleSwitcher from "@/components/ui/locale-switcher";
import { getCachedGlobal } from "@/utilities/getGlobals";

import { HeaderClient, type HeaderCategory } from "./Component.client";
import { HeaderShell } from "./HeaderShell";

export async function Header({ locale }: { locale: TypedLocale }) {
  const t = await getTranslations({ locale, namespace: "components.header" });
  const tLayout = await getTranslations({ locale, namespace: "layout" });
  const headerData: MedusaHeader = await getCachedGlobal("header", 1, locale);
  const categories = await listCategories({ limit: 100 });

  const headerCategories: HeaderCategory[] = categories
    .filter((category) => !category.parent_category)
    .map((category) => ({
      id: category.id,
      name: category.name,
      handle: category.handle,
      children: (category.category_children ?? []).map((child) => ({
        id: child.id,
        name: child.name,
        handle: child.handle,
      })),
    }));

  const announcements = [
    tLayout("announcement.one"),
    tLayout("announcement.two"),
    tLayout("announcement.three"),
  ];

  return (
    <>
      <AnnouncementBar
        label={tLayout("announcement.label")}
        messages={announcements}
      />
      <HeaderShell>
        <HeaderClient
          data={headerData}
          categories={headerCategories}
          localeSlot={<LocaleSwitcher />}
          cartSlot={
            <Suspense
              fallback={
                <span
                  className="sf-icon-btn"
                  aria-label={t("cart", { count: 0 })}
                />
              }
            >
              <CartButton />
            </Suspense>
          }
        />
      </HeaderShell>
    </>
  );
}
