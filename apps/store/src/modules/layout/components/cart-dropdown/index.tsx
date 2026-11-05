"use client";

import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from "@headlessui/react";
import { convertToLocale } from "@lib/util/money";
import { HttpTypes } from "@medusajs/types";
import DeleteButton from "@modules/common/components/delete-button";
import LineItemOptions from "@modules/common/components/line-item-options";
import LineItemPrice from "@modules/common/components/line-item-price";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { ShoppingBag } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

const CartDropdown = ({
  cart: cartState,
}: {
  cart?: HttpTypes.StoreCart | null;
}) => {
  const t = useTranslations("layout.cartDropdown");
  const tNav = useTranslations("layout.nav");
  const locale = useLocale();
  const [activeTimer, setActiveTimer] = useState<NodeJS.Timer | undefined>(
    undefined
  );
  const [cartDropdownOpen, setCartDropdownOpen] = useState(false);

  const open = () => setCartDropdownOpen(true);
  const close = () => setCartDropdownOpen(false);

  const totalItems =
    cartState?.items?.reduce((acc, item) => {
      return acc + item.quantity;
    }, 0) || 0;

  const subtotal = cartState?.subtotal ?? 0;
  const itemRef = useRef<number>(totalItems || 0);

  const timedOpen = () => {
    open();

    const timer = setTimeout(close, 5000);

    setActiveTimer(timer);
  };

  const openAndCancel = () => {
    if (activeTimer) {
      clearTimeout(activeTimer);
    }

    open();
  };

  // Clean up the timer when the component unmounts
  useEffect(() => {
    return () => {
      if (activeTimer) {
        clearTimeout(activeTimer);
      }
    };
  }, [activeTimer]);

  const pathname = usePathname();

  // open cart dropdown when modifying the cart items, but only if we're not on the cart page
  useEffect(() => {
    if (itemRef.current !== totalItems && !pathname.includes("/cart")) {
      timedOpen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalItems, itemRef.current]);

  return (
    <div
      className="sf-cart-anchor z-50"
      onMouseEnter={openAndCancel}
      onMouseLeave={close}
    >
      <Popover className="relative flex h-full items-center">
        <PopoverButton as={Fragment}>
          <LocalizedClientLink
            className="sf-icon-btn"
            href="/cart"
            data-testid="nav-cart-link"
          >
            <ShoppingBag aria-hidden="true" />
            <span
              className={`sf-cart-count${totalItems > 0 ? " has-items" : ""}`}
              aria-hidden="true"
            >
              {totalItems}
            </span>
            <span
              className="sf-visually-hidden"
              aria-live="polite"
              aria-atomic="true"
            >
              {tNav("cart", { count: totalItems })}
            </span>
          </LocalizedClientLink>
        </PopoverButton>
        <Transition
          show={cartDropdownOpen}
          as={Fragment}
          enter="transition ease-out duration-200"
          enterFrom="opacity-0 translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-150"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-1"
        >
          <PopoverPanel
            static
            className="sf-cart-panel"
            data-testid="nav-cart-dropdown"
          >
            <h3 className="sf-cart-panel-title">{t("title")}</h3>
            {cartState && cartState.items?.length ? (
              <>
                <div className="overflow-y-scroll max-h-[402px] px-4 grid grid-cols-1 gap-y-8 no-scrollbar p-px">
                  {cartState.items
                    .sort((a, b) => {
                      return (a.created_at ?? "") > (b.created_at ?? "")
                        ? -1
                        : 1;
                    })
                    .map((item) => (
                      <div
                        className="sf-cart-line"
                        key={item.id}
                        data-testid="cart-item"
                      >
                        <LocalizedClientLink
                          href={`/products/${item.product_handle}`}
                          className="block"
                        >
                          <div className="sf-card-media">
                            {item.thumbnail ? (
                              <Image
                                src={item.thumbnail}
                                alt={item.title}
                                fill
                                sizes="74px"
                                quality={50}
                              />
                            ) : (
                              <span
                                className="sf-card-placeholder !text-2xl"
                                aria-hidden="true"
                              >
                                {item.title.charAt(0)}
                              </span>
                            )}
                          </div>
                        </LocalizedClientLink>
                        <div className="flex flex-col justify-between flex-1">
                          <div className="flex flex-col flex-1">
                            <div className="flex items-start justify-between">
                              <div className="flex flex-col overflow-ellipsis whitespace-nowrap mr-4 w-[180px]">
                                <h3 className="sf-cart-line-title overflow-hidden text-ellipsis">
                                  <LocalizedClientLink
                                    href={`/products/${item.product_handle}`}
                                    data-testid="product-link"
                                  >
                                    {item.title}
                                  </LocalizedClientLink>
                                </h3>
                                <LineItemOptions
                                  variant={item.variant}
                                  data-testid="cart-item-variant"
                                  data-value={item.variant}
                                />
                                <span
                                  data-testid="cart-item-quantity"
                                  data-value={item.quantity}
                                >
                                  {t("quantity", { count: item.quantity })}
                                </span>
                              </div>
                              <div className="flex justify-end">
                                <LineItemPrice
                                  item={item}
                                  style="tight"
                                  currencyCode={cartState.currency_code}
                                />
                              </div>
                            </div>
                          </div>
                          <DeleteButton
                            id={item.id}
                            className="mt-1"
                            data-testid="cart-item-remove-button"
                          >
                            {t("remove")}
                          </DeleteButton>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="p-4 flex flex-col gap-y-4 border-t border-[var(--sf-line)]">
                  <div className="sf-cart-subtotal">
                    <span>
                      {t("subtotal")}{" "}
                      <span className="text-[var(--sf-muted)]">
                        {t("excludingTaxes")}
                      </span>
                    </span>
                    <span
                      className="text-base"
                      data-testid="cart-subtotal"
                      data-value={subtotal}
                    >
                      {convertToLocale({
                        amount: subtotal,
                        currency_code: cartState.currency_code,
                        locale,
                      })}
                    </span>
                  </div>
                  <LocalizedClientLink
                    href="/cart"
                    className="sf-btn sf-btn-dark sf-btn-wide"
                    data-testid="go-to-cart-button"
                  >
                    {t("goToCart")}
                  </LocalizedClientLink>
                </div>
              </>
            ) : (
              <div className="sf-cart-empty">
                <span>{t("empty")}</span>
                <LocalizedClientLink
                  href="/store"
                  className="sf-btn sf-btn-dark sf-btn-sm"
                  onClick={close}
                >
                  <span className="sr-only">{t("allProductsLink")}</span>
                  <span aria-hidden="true">{t("explore")}</span>
                </LocalizedClientLink>
              </div>
            )}
          </PopoverPanel>
        </Transition>
      </Popover>
    </div>
  );
};

export default CartDropdown;
