"use client";

import LocalizedClientLink from "@modules/common/components/localized-client-link";
import type { Header } from "@payload-types";
import { ChevronDown, Menu, Search, User, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type React from "react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { CMSLink } from "@/components/Link";
import { PayloadImage } from "@/components/PayloadImage";
import SearchModal from "@/modules/search/components/modal";
import { useHeaderTheme } from "@/providers/HeaderTheme";

const MENU_CLOSE_DELAY_MS = 200;

export type HeaderCategory = {
  id: string;
  name: string;
  handle: string;
  children: { id: string; name: string; handle: string }[];
};

type NavItem = NonNullable<Header["navItems"]>[number];
type CmsLink = NonNullable<NonNullable<NavItem["linkFields"]>["link"]>;
type GroupFields = NonNullable<NavItem["groupFields"]>;

type MegaColumn = {
  key: string;
  title?: string | null;
  image?: { url: string; alt: string };
  description?: string | null;
  links: {
    key: string;
    description?: string | null;
    cms?: CmsLink;
    href?: string;
    label?: string;
  }[];
};

type MenuEntry =
  | { kind: "link"; key: string; link: CmsLink }
  | { kind: "mega"; key: string; label: string; columns: MegaColumn[] };

interface HeaderClientProps {
  data: Header;
  categories: HeaderCategory[];
  cartSlot: ReactNode;
  localeSlot: ReactNode;
}

const toColumns = (groups: GroupFields["groups"], key: string): MegaColumn[] =>
  (groups ?? []).map((group, groupIndex) => ({
    key: `${key}-${group.id ?? groupIndex}`,
    title: group.title,
    description: group.description,
    image:
      group.image && typeof group.image === "object" && "url" in group.image
        ? {
            url: group.image.url as string,
            alt: group.image.alt || group.title || "",
          }
        : undefined,
    links: (group.links ?? []).map((item, linkIndex) => ({
      key: `${key}-${groupIndex}-${linkIndex}`,
      cms: item.link,
      description: item.description,
    })),
  }));

const buildMenus = (
  data: Header,
  categories: HeaderCategory[],
  categoriesLabel: string
): MenuEntry[] => {
  const entries: MenuEntry[] = [];

  for (const [index, item] of (data?.navItems ?? []).entries()) {
    const key = `nav-${item.id ?? index}`;
    if (item.type === "link" && item.linkFields?.link) {
      entries.push({ kind: "link", key, link: item.linkFields.link });
    }
    if (item.type === "group" && item.groupFields) {
      entries.push({
        kind: "mega",
        key,
        label: item.groupFields.label,
        columns: toColumns(item.groupFields.groups, key),
      });
    }
  }

  if (categories.length > 0) {
    entries.push({
      kind: "mega",
      key: "categories",
      label: categoriesLabel,
      columns: categories.map((category) => ({
        key: `cat-${category.id}`,
        title: category.name,
        links:
          category.children.length === 0
            ? [
                {
                  key: `cat-${category.id}-self`,
                  href: `/categories/${category.handle}`,
                  label: category.name,
                },
              ]
            : category.children.map((child) => ({
                key: `cat-${child.id}`,
                href: `/categories/${child.handle}`,
                label: child.name,
              })),
      })),
    });
  }

  return entries;
};

export const HeaderClient: React.FC<HeaderClientProps> = ({
  data,
  categories,
  cartSlot,
  localeSlot,
}) => {
  const t = useTranslations("layout.header");
  const tSearch = useTranslations("search");
  const tHeader = useTranslations("components.header");
  const { setHeaderTheme } = useHeaderTheme();
  const pathname = usePathname();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  const menus = useMemo(
    () => buildMenus(data, categories, tHeader("categories")),
    [data, categories, tHeader]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pages that tint the header via context start from a clean slate.
  useEffect(() => {
    setHeaderTheme(null);
    setOpenMenu(null);
    setDrawerOpen(false);
  }, [pathname, setHeaderTheme]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(
      () => setOpenMenu(null),
      MENU_CLOSE_DELAY_MS
    );
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  const openMenuNow = (key: string) => {
    cancelClose();
    setOpenMenu(key);
  };

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    burgerRef.current?.focus();
  }, []);

  // Drawer: Escape closes, body scroll is locked, focus moves inside.
  useEffect(() => {
    if (!drawerOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen, closeDrawer]);

  const onZoneKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && openMenu) {
      setOpenMenu(null);
    }
  };

  const onZoneBlur = (event: React.FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpenMenu(null);
    }
  };

  return (
    <>
      <div className="sf-header-inner">
        <div
          role="presentation"
          className="sf-header-left"
          onKeyDown={onZoneKeyDown}
          onBlur={onZoneBlur}
        >
          <button
            ref={burgerRef}
            type="button"
            className="sf-icon-btn sf-burger"
            aria-label={t("openMenu")}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu aria-hidden="true" />
          </button>

          <nav className="sf-nav" aria-label={t("mainNav")}>
            {menus.map((menu) => {
              if (menu.kind === "link") {
                return (
                  <div key={menu.key} className="sf-nav-item">
                    <CMSLink
                      {...menu.link}
                      appearance="inline"
                      className="sf-nav-link"
                    />
                  </div>
                );
              }
              const isOpen = openMenu === menu.key;
              return (
                <div
                  key={menu.key}
                  className="sf-nav-item"
                  onMouseEnter={() => openMenuNow(menu.key)}
                  onMouseLeave={scheduleClose}
                >
                  <button
                    type="button"
                    className="sf-nav-link"
                    aria-expanded={isOpen}
                    aria-controls={`mega-${menu.key}`}
                    onClick={() =>
                      isOpen ? setOpenMenu(null) : openMenuNow(menu.key)
                    }
                  >
                    {menu.label}
                  </button>
                  <div
                    id={`mega-${menu.key}`}
                    className={`sf-mega${openMenu === menu.key ? " is-open" : ""}`}
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                  >
                    <div className="sf-mega-inner">
                      {menu.columns.map((column) => (
                        <div key={column.key} className="sf-mega-col">
                          {column.title && (
                            <p className="sf-mega-heading">{column.title}</p>
                          )}
                          {column.image?.url && (
                            <div className="sf-mega-img">
                              <PayloadImage
                                loading="lazy"
                                width={400}
                                height={225}
                                src={column.image.url}
                                alt={column.image.alt || tHeader("groupImage")}
                              />
                            </div>
                          )}
                          {column.description && (
                            <p className="sf-mega-desc">{column.description}</p>
                          )}
                          {column.links.map((item) => (
                            <div key={item.key}>
                              {item.cms ? (
                                <CMSLink
                                  {...item.cms}
                                  appearance="inline"
                                  className=""
                                />
                              ) : (
                                <LocalizedClientLink
                                  href={item.href ?? "/"}
                                  onClick={() => setOpenMenu(null)}
                                >
                                  {item.label}
                                </LocalizedClientLink>
                              )}
                              {item.description && (
                                <p className="sf-mega-link-desc">
                                  {item.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        <LocalizedClientLink
          href="/"
          className="sf-logo"
          data-testid="nav-store-link"
        >
          bibaestudios
        </LocalizedClientLink>

        <div className="sf-actions">
          <button
            type="button"
            className="sf-icon-btn"
            aria-label={tSearch("title")}
            onClick={() => setSearchOpen(true)}
          >
            <Search aria-hidden="true" />
          </button>
          <div className="sf-actions-desktop flex items-center">
            {localeSlot}
          </div>
          <LocalizedClientLink
            href="/account"
            className="sf-icon-btn sf-account-link"
            aria-label={t("accountLabel")}
            data-testid="nav-account-link"
          >
            <User aria-hidden="true" />
          </LocalizedClientLink>
          {cartSlot}
        </div>
      </div>

      <SearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Portaled: the frosted header (backdrop-filter) would otherwise
          become the containing block of these fixed-position layers. */}
      {mounted &&
        createPortal(
          <>
            <div
              className={`sf-overlay${drawerOpen ? " is-open" : ""}`}
              onClick={closeDrawer}
              aria-hidden="true"
            />
            <div
              className={`sf-drawer${drawerOpen ? " is-open" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={t("mobileNav")}
            >
              <div className="sf-drawer-head">
                <span className="sf-drawer-title">bibaestudios</span>
                <button
                  ref={drawerCloseRef}
                  type="button"
                  className="sf-icon-btn"
                  aria-label={t("closeMenu")}
                  onClick={closeDrawer}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <nav className="sf-drawer-nav" aria-label={t("mobileNav")}>
                <LocalizedClientLink href="/store" onClick={closeDrawer}>
                  {t("allProducts")}
                </LocalizedClientLink>
                {menus.map((menu) => {
                  if (menu.kind === "link") {
                    return (
                      <CMSLink
                        key={menu.key}
                        {...menu.link}
                        appearance="inline"
                      />
                    );
                  }
                  const expanded = openSection === menu.key;
                  return (
                    <div key={menu.key}>
                      <button
                        type="button"
                        className="sf-drawer-accordion w-full"
                        aria-expanded={expanded}
                        aria-label={t("openSection", { label: menu.label })}
                        onClick={() =>
                          setOpenSection(expanded ? null : menu.key)
                        }
                      >
                        <span>{menu.label}</span>
                        <ChevronDown aria-hidden="true" />
                      </button>
                      <div className="sf-drawer-sub">
                        {menu.columns.flatMap((column) =>
                          column.links.map((item) =>
                            item.cms ? (
                              <CMSLink
                                key={item.key}
                                {...item.cms}
                                appearance="inline"
                              />
                            ) : (
                              <LocalizedClientLink
                                key={item.key}
                                href={item.href ?? "/"}
                                onClick={closeDrawer}
                              >
                                {item.label}
                              </LocalizedClientLink>
                            )
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </nav>
              <div className="sf-drawer-foot">
                <LocalizedClientLink
                  href="/account"
                  className="sf-link"
                  onClick={closeDrawer}
                >
                  {t("accountLabel")}
                </LocalizedClientLink>
                {localeSlot}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
};
