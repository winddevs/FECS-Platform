"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { useFormContext } from "react-hook-form";

export const Error = ({ name }: { name: string }) => {
  const t = useTranslations("errors");
  const {
    formState: { errors },
  } = useFormContext();
  return (
    <div className="mt-2 text-red-500 text-sm">
      {(errors[name]?.message as string) || t("fieldRequired")}
    </div>
  );
};
