"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

type ActiveFilter = {
  key: string;
  value: string;
  label: string;
};

type ActiveFiltersProps = {
  filters: ActiveFilter[];
  onRemove: (key: string, value?: string) => void;
  onClear: () => void;
};

const ActiveFilters = ({ filters, onRemove }: ActiveFiltersProps) => {
  const t = useTranslations("store.filters");

  if (filters.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center flex-wrap gap-2">
      {filters.map((filter) => (
        <button
          key={`${filter.key}-${filter.value}`}
          type="button"
          onClick={() => onRemove(filter.key, filter.value)}
          aria-label={t("removeFilter", { label: filter.label })}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary text-secondary-foreground rounded-full text-xs font-medium hover:bg-secondary/80 transition-colors"
        >
          {filter.label}
          <X className="size-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
};

export default ActiveFilters;
