import {
  formatDateTime,
  formatJson,
  formatNumber,
  formatValue,
} from "./format";
import { useRefOptions } from "./refs";
import type { ColumnConfig, Row } from "./resource-types";
import { StatusBadge } from "./status-badge";

const RefCell = ({ column, id }: { column: ColumnConfig; id: unknown }) => {
  const { data } = useRefOptions(column.ref ?? "material");
  const text = typeof id === "string" ? id : "";
  const label = data?.find((option) => option.id === text)?.label;
  return (
    <span className="font-mono text-xs" title={text || undefined}>
      {label ?? formatValue(id)}
    </span>
  );
};

export const cellValue = (column: ColumnConfig, row: Row): unknown =>
  column.value ? column.value(row) : row[column.key];

/** Renders one cell according to its column kind. */
export const Cell = ({ column, row }: { column: ColumnConfig; row: Row }) => {
  const value = cellValue(column, row);
  switch (column.kind) {
    case "ref":
      return <RefCell column={column} id={value} />;
    case "status":
      return <StatusBadge status={typeof value === "string" ? value : null} />;
    case "number":
      return <span className="tabular-nums">{formatNumber(value)}</span>;
    case "datetime":
      return <span>{formatDateTime(value)}</span>;
    case "boolean":
      return (
        <span>
          {formatValue(value === true || value === false ? value : null)}
        </span>
      );
    case "code":
      return <code className="font-mono text-xs">{formatValue(value)}</code>;
    case "json":
      return <span className="font-mono text-xs">{formatJson(value)}</span>;
    default:
      return <span>{formatValue(value)}</span>;
  }
};

/** Column list for `auto` tables: one text column per key of the first row. */
export const autoColumns = (rows: readonly Row[]): ColumnConfig[] =>
  Object.keys(rows[0] ?? {}).map((key) => ({
    key,
    label: key.replace(/_/g, " "),
    kind:
      typeof rows[0]?.[key] === "object" && rows[0]?.[key] !== null
        ? "json"
        : "text",
  }));
