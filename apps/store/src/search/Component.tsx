"use client";
import { Input } from "@ecommerce/ui/components/input";
import { Label } from "@ecommerce/ui/components/label";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import React, { useState, useEffect } from "react";

import { useDebounce } from "@/utilities/useDebounce";

export const Search: React.FC = () => {
  const [value, setValue] = useState("");
  const router = useRouter();
  const t = useTranslations("search");
  const tSearch = useTranslations("components.searchForm");
  const { locale, countryCode } = useParams<{
    locale: string;
    countryCode: string;
  }>();

  const debouncedValue = useDebounce(value);

  useEffect(() => {
    const query = debouncedValue
      ? `?q=${encodeURIComponent(debouncedValue)}`
      : "";
    router.push(`/${locale}/${countryCode}/search${query}`);
  }, [debouncedValue, router, locale, countryCode]);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
        className="flex flex-col gap-2"
      >
        <Label htmlFor="search" className="sr-only">
          {t("title")}
        </Label>
        <Input
          id="search"
          onChange={(event) => {
            setValue(event.target.value);
          }}
          placeholder={t("title")}
        />
        <button type="submit" className="sr-only">
          {tSearch("submit")}
        </button>
      </form>
    </div>
  );
};
