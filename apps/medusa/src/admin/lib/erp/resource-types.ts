import type { RefKind } from "./refs";

export type Row = Record<string, unknown>;

export type ColumnKind =
  | "text"
  | "status"
  | "number"
  | "datetime"
  | "boolean"
  | "code"
  | "json"
  /** Foreign id shown as the master record's code (needs `ref`). */
  | "ref";

export type ColumnConfig = {
  key: string;
  label: string;
  kind?: ColumnKind;
  ref?: RefKind;
  /** Computed column: derive the value from the row instead of `row[key]`. */
  value?: (row: Row) => unknown;
};

export type FilterConfig = {
  /** Query-string parameter declared by the API middleware. */
  key: string;
  label: string;
  /** `select` needs `options`; `text` is an exact-match box. */
  type?: "text" | "select";
  options?: readonly string[];
};

/**
 * Everything the generic ResourceTable needs to render one list endpoint.
 * Adding a list screen = adding one of these objects.
 */
export type ResourceConfig = {
  id: string;
  title: string;
  description?: string;
  endpoint: string;
  /** Property of the response that holds the rows (e.g. `suppliers`). */
  responseKey: string;
  /** `auto` derives the columns from the first row (analytics marts). */
  columns: readonly ColumnConfig[] | "auto";
  filters?: readonly FilterConfig[];
  /** Filter values applied on first load (e.g. only pending items). */
  defaultFilters?: Readonly<Record<string, string>>;
  pageSize?: number;
  /** Row property used as React key (default `id`). */
  rowKey?: string;
  /** API `order` parameter, e.g. `-created_at`. */
  order?: string;
  emptyMessage?: string;
};

export type ListResponse = {
  count?: number;
  offset?: number;
  limit?: number;
} & Record<string, unknown>;
