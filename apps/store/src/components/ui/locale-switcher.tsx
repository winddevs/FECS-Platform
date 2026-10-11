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

import { localization } from "@/i18n/localization";

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

  // Vietnamese first: the order of `localization.locales` is kept on purpose.
  const options = localization.locales.map(({ code, label }) => ({
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
        className="w-auto text-sm bg-transparent gap-2 pl-0 md:pl-3 border-none"
      >
        <SelectValue placeholder={t("label")} />
      </SelectTrigger>
      <SelectContent>
        {options.map(({ value, label }) => (
          <SelectItem value={value} key={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
