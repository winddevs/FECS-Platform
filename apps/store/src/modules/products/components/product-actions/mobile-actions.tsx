import { Dialog, Transition } from "@headlessui/react";
import useToggleState from "@lib/hooks/use-toggle-state";
import { getProductPrice } from "@lib/util/get-product-price";
import { isSimpleProduct } from "@lib/util/product";
import { HttpTypes } from "@medusajs/types";
import { clx } from "@medusajs/ui";
import ChevronDown from "@modules/common/icons/chevron-down";
import X from "@modules/common/icons/x";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import React, { Fragment, useMemo } from "react";

import OptionSelect from "./option-select";

type MobileActionsProps = {
  product: HttpTypes.StoreProduct;
  variant?: HttpTypes.StoreProductVariant;
  options: Record<string, string | undefined>;
  updateOptions: (title: string, value: string) => void;
  inStock?: boolean;
  handleAddToCart: () => void;
  isAdding?: boolean;
  show: boolean;
  optionsDisabled: boolean;
};

const MobileActions: React.FC<MobileActionsProps> = ({
  product,
  variant,
  options,
  updateOptions,
  inStock,
  handleAddToCart,
  isAdding,
  show,
  optionsDisabled,
}) => {
  const t = useTranslations("products.actions");
  const locale = useLocale();
  const { state, open, close } = useToggleState();

  const price = getProductPrice({
    product: product,
    variantId: variant?.id,
    locale,
  });

  const selectedPrice = useMemo(() => {
    if (!price) {
      return null;
    }
    const { variantPrice, cheapestPrice } = price;

    return variantPrice || cheapestPrice || null;
  }, [price]);

  const isSimple = isSimpleProduct(product);

  return (
    <>
      <div
        className={clx("lg:hidden inset-x-0 bottom-0 fixed", {
          "pointer-events-none": !show,
        })}
      >
        <Transition
          as={Fragment}
          show={show}
          enter="ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="sf-sticky-bar" data-testid="mobile-actions">
            <div className="flex items-center justify-center gap-x-2 text-sm">
              <span className="font-serif text-base" data-testid="mobile-title">
                {product.title}
              </span>
              <span>—</span>
              {selectedPrice ? (
                <div className="flex items-end gap-x-2 text-ui-fg-base">
                  {selectedPrice.price_type === "sale" && (
                    <p>
                      <span className="line-through text-small-regular">
                        {selectedPrice.original_price}
                      </span>
                    </p>
                  )}
                  <span
                    className={clx({
                      "text-ui-fg-interactive":
                        selectedPrice.price_type === "sale",
                    })}
                  >
                    {selectedPrice.calculated_price}
                  </span>
                </div>
              ) : (
                <div></div>
              )}
            </div>
            <div
              className={clx("grid grid-cols-2 w-full gap-x-4", {
                "!grid-cols-1": isSimple,
              })}
            >
              {!isSimple && (
                <button
                  type="button"
                  onClick={open}
                  className="sf-btn sf-btn-outline sf-btn-wide justify-between gap-2"
                  data-testid="mobile-actions-button"
                >
                  <span className="truncate">
                    {variant
                      ? Object.values(options).join(" / ")
                      : t("selectOptions")}
                  </span>
                  <ChevronDown />
                </button>
              )}
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!inStock || !variant || isAdding}
                aria-busy={isAdding}
                className="sf-btn sf-btn-dark sf-btn-wide gap-2"
                data-testid="mobile-cart-button"
              >
                {isAdding && (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                )}
                {!variant
                  ? t("selectVariant")
                  : !inStock
                    ? t("outOfStock")
                    : t("addToCart")}
              </button>
            </div>
          </div>
        </Transition>
      </div>
      <Transition appear show={state} as={Fragment}>
        <Dialog as="div" className="relative z-[75]" onClose={close}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-700 bg-opacity-75 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed bottom-0 inset-x-0">
            <div className="flex min-h-full h-full items-center justify-center text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <Dialog.Panel
                  className="w-full h-full transform overflow-hidden text-left flex flex-col gap-y-3"
                  data-testid="mobile-actions-modal"
                >
                  <div className="w-full flex justify-end pr-6">
                    <button
                      type="button"
                      onClick={close}
                      aria-label={t("close")}
                      className="bg-[var(--sf-paper)] size-12 rounded-full text-[var(--sf-ink)] flex justify-center items-center"
                      data-testid="close-modal-button"
                    >
                      <X />
                    </button>
                  </div>
                  <div className="bg-[var(--sf-paper)] px-6 py-12">
                    {(product.variants?.length ?? 0) > 1 && (
                      <div className="flex flex-col gap-y-6">
                        {(product.options || []).map((option) => {
                          return (
                            <div key={option.id}>
                              <OptionSelect
                                option={option}
                                current={options[option.id]}
                                updateOption={updateOptions}
                                title={option.title ?? ""}
                                disabled={optionsDisabled}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

export default MobileActions;
