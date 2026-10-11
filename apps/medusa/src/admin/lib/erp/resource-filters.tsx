import { Button, Input, Select } from "@medusajs/ui";
import { useState } from "react";

import { tr, trStatus } from "../i18n";
import type { FilterConfig } from "./resource-types";

const ALL = "__all__";
const ENUM_CODE = /^[A-Z0-9_]+$/;

/** Upper-case enum codes go through trStatus, other options through tr. */
const optionText = (option: string): string =>
  ENUM_CODE.test(option) ? trStatus(option) : tr(option.replace(/_/g, " "));

type FilterBarProps = {
  filters: readonly FilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

const TextFilter = ({
  filter,
  value,
  onChange,
}: {
  filter: FilterConfig;
  value: string;
  onChange: (value: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  const label = tr(filter.label);
  return (
    <Input
      aria-label={label}
      onBlur={() => draft !== value && onChange(draft.trim())}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onChange(draft.trim());
        }
      }}
      placeholder={label}
      size="small"
      value={draft}
    />
  );
};

const SelectFilter = ({
  filter,
  value,
  onChange,
}: {
  filter: FilterConfig;
  value: string;
  onChange: (value: string) => void;
}) => {
  const label = tr(filter.label);
  return (
    <Select
      onValueChange={(next) => onChange(next === ALL ? "" : next)}
      size="small"
      value={value === "" ? ALL : value}
    >
      <Select.Trigger aria-label={label}>
        <Select.Value placeholder={label} />
      </Select.Trigger>
      <Select.Content>
        <Select.Item value={ALL}>{tr("{label}: all", { label })}</Select.Item>
        {(filter.options ?? []).map((option) => (
          <Select.Item key={option} value={option}>
            {optionText(option)}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/** Filter controls for a list; `text` filters apply on Enter or blur. */
export const FilterBar = ({ filters, values, onChange }: FilterBarProps) => {
  const active = Object.values(values).some((value) => value !== "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => {
        const value = values[filter.key] ?? "";
        const change = (next: string) => onChange(filter.key, next);
        return (
          <div className="w-44" key={filter.key}>
            {filter.type === "select" ? (
              <SelectFilter filter={filter} onChange={change} value={value} />
            ) : (
              <TextFilter
                filter={filter}
                key={`${filter.key}-${value}`}
                onChange={change}
                value={value}
              />
            )}
          </div>
        );
      })}
      {active ? (
        <Button
          onClick={() => {
            for (const filter of filters) {
              onChange(filter.key, "");
            }
          }}
          size="small"
          variant="transparent"
        >
          {tr("Clear filters")}
        </Button>
      ) : null}
    </div>
  );
};
