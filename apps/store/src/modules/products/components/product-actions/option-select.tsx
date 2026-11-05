import { HttpTypes } from "@medusajs/types";
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
    <div>
      <p className="sf-pdp-label">{title}</p>
      <div
        role="group"
        aria-label={label}
        className="sf-size-row"
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
              className="sf-size touch-manipulation"
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
