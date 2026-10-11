import { useTranslations } from "next-intl";
import React from "react";

export const PageRange: React.FC<{
  className?: string;
  collection?: "posts";
  collectionLabels?: {
    plural?: string;
    singular?: string;
  };
  currentPage?: number;
  limit?: number;
  totalDocs?: number;
}> = (props) => {
  const {
    className,
    collection,
    collectionLabels: collectionLabelsFromProps,
    currentPage,
    limit,
    totalDocs,
  } = props;
  const t = useTranslations("components.pageRange");

  let indexStart = (currentPage ? currentPage - 1 : 1) * (limit || 1) + 1;
  if (totalDocs && indexStart > totalDocs) indexStart = 0;

  let indexEnd = (currentPage || 1) * (limit || 1);
  if (totalDocs && indexEnd > totalDocs) indexEnd = totalDocs;

  const hasDocs = typeof totalDocs !== "undefined" && totalDocs > 0;
  const range = `${indexStart}${indexStart > 0 ? ` - ${indexEnd}` : ""}`;

  // Labels supplied by the caller win; otherwise use the localized ones.
  const getLabel = (): string => {
    const count = totalDocs ?? 0;
    if (collectionLabelsFromProps) {
      const { plural, singular } = collectionLabelsFromProps;
      return (count > 1 ? plural : singular) ?? "";
    }
    return collection === "posts"
      ? t("posts", { count })
      : t("items", { count });
  };

  return (
    <div className={[className, "font-semibold"].filter(Boolean).join(" ")}>
      {!hasDocs && t("noResults")}
      {hasDocs && t("showing", { range, total: totalDocs, label: getLabel() })}
    </div>
  );
};
