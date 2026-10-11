import { Label } from "@ecommerce/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ecommerce/ui/components/select";
import { intlTag } from "@lib/util/locale-format";
import type { CountryField } from "@payloadcms/plugin-form-builder/types";
import { useLocale, useTranslations } from "next-intl";
import React, { useMemo } from "react";
import type { Control, FieldErrorsImpl } from "react-hook-form";
import { Controller } from "react-hook-form";

import { Error } from "../Error";
import { Width } from "../Width";
import { countryOptions } from "./options";

/** Country names in the customer's language, sorted for that language. */
const getLocalizedCountryOptions = (locale: string) => {
  const tag = intlTag(locale);
  const names = new Intl.DisplayNames(tag, { type: "region" });
  const localize = ({ label, value }: (typeof countryOptions)[number]) => {
    try {
      return { label: names.of(value) ?? label, value };
    } catch {
      return { label, value };
    }
  };
  return countryOptions
    .map(localize)
    .sort((a, b) => a.label.localeCompare(b.label, tag));
};

export const Country: React.FC<
  CountryField & {
    control: Control;
    errors: Partial<FieldErrorsImpl>;
  }
> = ({ name, control, errors, label, required, width }) => {
  const t = useTranslations("blocks.form");
  const locale = useLocale();
  const options = useMemo(() => getLocalizedCountryOptions(locale), [locale]);
  return (
    <Width width={width}>
      <Label className="" htmlFor={name}>
        {label}

        {required && (
          <span className="required">
            * <span className="sr-only">{t("required")}</span>
          </span>
        )}
      </Label>
      <Controller
        control={control}
        defaultValue=""
        name={name}
        render={({ field: { onChange, value } }) => {
          const controlledValue = options.find(
            (option) => option.value === value
          );

          return (
            <Select
              items={options}
              onValueChange={(val) => onChange(val)}
              value={controlledValue?.value}
            >
              <SelectTrigger className="w-full" id={name}>
                <SelectValue placeholder={label} />
              </SelectTrigger>
              <SelectContent>
                {options.map(({ label, value }) => {
                  return (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          );
        }}
        rules={{ required }}
      />
      {errors[name] && <Error name={name} />}
    </Width>
  );
};
