"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ecommerce/ui/components/select";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { storefrontLocales } from "@/i18n/localization";

/** Each language is shown in its own language, whatever the current one is. */
const NATIVE_NAMES: Record<string, string> = {
  vi: "Tiếng Việt",
  en: "English",
  fr: "Français",
  ar: "العربية",
};

/** `/vi/vn/cart?x=1` -> `/en/vn/cart?x=1`: only the first segment changes. */
const swapLocale = (pathname: string, current: string, next: string) => {
  const segments = pathname.split("/");
  if (segments[1] === current) {
    segments[1] = next;
  } else {
    segments.splice(1, 0, next);
  }
  return segments.join("/") || `/${next}`;
};

export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("components.localeSwitcher");
  const [, startTransition] = useTransition();
  const pathname = usePathname();

  // Vietnamese first: the order of `storefrontLocales` is kept on purpose.
  const options = storefrontLocales.map(({ code, label }) => ({
    value: code,
    label: NATIVE_NAMES[code] ?? label,
  }));

  const onSelectChange = (value: string | null) => {
    if (!value || value === locale) {
      return;
    }
    startTransition(() => {
      router.replace(
        `${swapLocale(pathname, locale, value)}${window.location.search}`
      );
    });
  };

  return (
    <Select items={options} onValueChange={onSelectChange} value={locale}>
      <SelectTrigger
        aria-label={t("label")}
        className="w-auto min-h-11 text-sm bg-transparent gap-2 pl-0 md:pl-3 border-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2"
      >
        <SelectValue placeholder={t("label")} />
      </SelectTrigger>
      {/*
        Open below the button, always. With the default alignment the list is
        positioned so the selected language sits over the button: when English
        is selected, "Tiếng Việt" is drawn above it, behind the header.
      */}
      <SelectContent alignItemWithTrigger={false} align="end" side="bottom">
        {options.map(({ value, label }) => (
          <SelectItem value={value} key={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
