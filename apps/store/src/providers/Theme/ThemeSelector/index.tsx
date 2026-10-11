"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ecommerce/ui/components/select";
import { useTranslations } from "next-intl";
import React, { useState } from "react";

import { useTheme } from "..";
import type { Theme } from "./types";
import { themeLocalStorageKey } from "./types";

export const ThemeSelector: React.FC = () => {
  const { setTheme } = useTheme();
  const t = useTranslations("components.theme");
  const [value, setValue] = useState("");

  const onThemeChange = (themeToSet: Theme | "auto") => {
    if (themeToSet === "auto") {
      setTheme(null);
      setValue("auto");
    } else {
      setTheme(themeToSet);
      setValue(themeToSet);
    }
  };

  React.useEffect(() => {
    const preference = window.localStorage.getItem(themeLocalStorageKey);
    setValue(preference ?? "auto");
  }, []);

  const options = [
    { value: "auto", label: t("auto") },
    { value: "light", label: t("light") },
    { value: "dark", label: t("dark") },
  ];
  return (
    <Select items={options} onValueChange={onThemeChange} value={value}>
      <SelectTrigger
        aria-label={t("label")}
        className="w-full bg-transparent gap-2 p-0 border-none"
      >
        <SelectValue placeholder={t("placeholder")} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} side="bottom" sideOffset={4}>
        {options.map(({ value: optionValue, label }) => (
          <SelectItem key={optionValue} value={optionValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
