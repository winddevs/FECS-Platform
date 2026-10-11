import { HttpTypes } from "@medusajs/types";
import { clx } from "@medusajs/ui";
import { useTranslations } from "next-intl";
import React from "react";

type OptionSelectProps = {
  option: HttpTypes.StoreProductOption;
  current: string | undefined;
  updateOption: (title: string, value: string) => void;
  title: string;
  disabled: boolean;
  "data-testid"?: string;
};

const OptionSelect: React.FC<OptionSelectProps> = ({
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
}) => {
  const t = useTranslations("products.actions");
  const filteredOptions = (option.values ?? []).map((v) => v.value);
  const label = t("selectOption", { title });

  return (
    <div className="flex flex-col gap-y-3">
      <span className="text-sm">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="flex flex-wrap gap-2"
        data-testid={dataTestId}
      >
        {filteredOptions.map((v) => {
          const isSelected = v === current;

          return (
            <button
              type="button"
              onClick={() => updateOption(option.id, v)}
              key={v}
              aria-pressed={isSelected}
              className={clx(
                // 44px minimum touch target (WCAG 2.5.5 / storefront guidelines)
                "border-ui-border-base bg-ui-bg-subtle border text-small-regular min-h-11 min-w-11 rounded-rounded px-3 py-2 flex-1 touch-manipulation",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive",
                "disabled:cursor-not-allowed disabled:opacity-60",
                {
                  "border-ui-border-interactive bg-ui-bg-base font-medium shadow-borders-interactive-with-active":
                    isSelected,
                  "hover:shadow-elevation-card-rest transition-shadow ease-in-out duration-150":
                    !isSelected,
                }
              )}
              disabled={disabled}
              data-testid="option-button"
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default OptionSelect;
