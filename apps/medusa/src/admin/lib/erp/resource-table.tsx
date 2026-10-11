import { Button, Heading, Table, Text } from "@medusajs/ui";
import { type ReactNode, type SyntheticEvent, useMemo, useState } from "react";

import { tr } from "../i18n";
import { type QueryParams, describeError } from "./api";
import { Cell, autoColumns } from "./cells";
import { FilterBar } from "./resource-filters";
import type {
  ColumnConfig,
  ListResponse,
  ResourceConfig,
  Row,
} from "./resource-types";
import { Spinner } from "./spinner";
import { useErpQuery } from "./use-erp";

const DEFAULT_PAGE_SIZE = 20;

type ResourceTableProps = {
  config: ResourceConfig;
  /** Constant query parameters (e.g. a parent id), not shown as filters. */
  fixedQuery?: QueryParams;
  onRowClick?: (row: Row) => void;
  /** Right-aligned header content (buttons). */
  toolbar?: ReactNode;
  /** Per-row action cell. */
  renderRowActions?: (row: Row) => ReactNode;
};

const hasMore = (
  data: ListResponse | undefined,
  offset: number,
  shown: number
): boolean => {
  if (!data) {
    return false;
  }
  if (typeof data.count === "number") {
    return offset + shown < data.count;
  }
  // Endpoints without a count (marts) are paged until a short page.
  return typeof data.limit === "number" && shown >= data.limit;
};

/**
 * True when the event started on the row itself. Events from the action
 * buttons, or from a drawer/dialog they open (React bubbles portal events to
 * the row), must not count as a row click.
 */
const isRowEvent = (event: SyntheticEvent<HTMLElement>): boolean => {
  const target = event.target as Element;
  return (
    event.currentTarget.contains(target) &&
    target.closest("[data-row-actions]") === null
  );
};

const StateMessage = ({ children }: { children: ReactNode }) => (
  <div className="flex items-center justify-center px-6 py-8">{children}</div>
);

const RowCells = ({
  columns,
  row,
}: {
  columns: readonly ColumnConfig[];
  row: Row;
}) => (
  <>
    {columns.map((column) => (
      <Table.Cell key={column.key}>
        <Cell column={column} row={row} />
      </Table.Cell>
    ))}
  </>
);

/**
 * Generic paginated list driven by a ResourceConfig: filters, loading /
 * empty / error states (403 shown as a permission message), row click.
 */
export const ResourceTable = ({
  config,
  fixedQuery,
  onRowClick,
  toolbar,
  renderRowActions,
}: ResourceTableProps) => {
  const title = tr(config.title);
  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
  const [filters, setFilters] = useState<Record<string, string>>({
    ...config.defaultFilters,
  });
  const [offset, setOffset] = useState(0);

  const query = useMemo<QueryParams>(
    () => ({
      ...fixedQuery,
      ...filters,
      order: config.order,
      limit: pageSize,
      offset,
    }),
    [fixedQuery, filters, config.order, pageSize, offset]
  );

  const { data, isLoading, isFetching, error, refetch } =
    useErpQuery<ListResponse>(config.endpoint, query);

  const rows = useMemo(
    () => (data?.[config.responseKey] as Row[] | undefined) ?? [],
    [data, config.responseKey]
  );
  const columns = useMemo(
    () => (config.columns === "auto" ? autoColumns(rows) : config.columns),
    [config.columns, rows]
  );

  const updateFilter = (key: string, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setOffset(0);
  };

  const total = typeof data?.count === "number" ? data.count : undefined;
  const rowKey = config.rowKey ?? "id";
  const clickable = Boolean(onRowClick);

  const renderBody = () => {
    if (isLoading) {
      return (
        <StateMessage>
          <Spinner label={tr("Loading {title}", { title })} />
        </StateMessage>
      );
    }
    if (error) {
      return (
        <StateMessage>
          <div className="flex flex-col items-center gap-y-2" role="alert">
            <Text className="text-ui-fg-error" size="small">
              {describeError(error)}
            </Text>
            <Button onClick={() => refetch()} size="small" variant="secondary">
              {tr("Retry")}
            </Button>
          </div>
        </StateMessage>
      );
    }
    if (rows.length === 0) {
      return (
        <StateMessage>
          <Text className="text-ui-fg-subtle" size="small">
            {config.emptyMessage
              ? tr(config.emptyMessage)
              : tr("No {title} found.", { title: title.toLowerCase() })}
          </Text>
        </StateMessage>
      );
    }
    return (
      <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              {columns.map((column) => (
                <Table.HeaderCell key={column.key}>
                  {tr(column.label)}
                </Table.HeaderCell>
              ))}
              {renderRowActions ? (
                <Table.HeaderCell>
                  <span className="sr-only">{tr("Actions")}</span>
                </Table.HeaderCell>
              ) : null}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row, index) => (
              <Table.Row
                className={clickable ? "cursor-pointer" : undefined}
                key={String(row[rowKey] ?? index)}
                onClick={
                  onRowClick
                    ? (event) => isRowEvent(event) && onRowClick(row)
                    : undefined
                }
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (
                          isRowEvent(event) &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
              >
                <RowCells columns={columns} row={row} />
                {renderRowActions ? (
                  <Table.Cell>
                    <div
                      className="flex justify-end gap-x-2"
                      data-row-actions=""
                    >
                      {renderRowActions(row)}
                    </div>
                  </Table.Cell>
                ) : null}
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    );
  };

  const canPrevious = offset > 0;
  const canNext = hasMore(data, offset, rows.length);

  return (
    <section aria-label={title} className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
        <div>
          <Heading level="h2">{title}</Heading>
          {config.description ? (
            <Text className="text-ui-fg-subtle" size="small">
              {tr(config.description)}
            </Text>
          ) : null}
        </div>
        <div className="flex items-center gap-x-2">
          <Button
            isLoading={isFetching && !isLoading}
            onClick={() => refetch()}
            size="small"
            variant="transparent"
          >
            {tr("Refresh")}
          </Button>
          {toolbar}
        </div>
      </div>
      {config.filters && config.filters.length > 0 ? (
        <div className="px-6 pb-3">
          <FilterBar
            filters={config.filters}
            onChange={updateFilter}
            values={filters}
          />
        </div>
      ) : null}
      {renderBody()}
      {rows.length > 0 || offset > 0 ? (
        <nav
          aria-label={tr("{title} pages", { title })}
          className="flex items-center justify-between px-6 py-3"
        >
          <Text className="text-ui-fg-subtle" size="small">
            {offset + 1} - {offset + rows.length}
            {total === undefined ? "" : ` ${tr("of {total}", { total })}`}
          </Text>
          <div className="flex gap-x-2">
            <Button
              disabled={!canPrevious}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
              size="small"
              variant="secondary"
            >
              {tr("Previous")}
            </Button>
            <Button
              disabled={!canNext}
              onClick={() => setOffset(offset + pageSize)}
              size="small"
              variant="secondary"
            >
              {tr("Next")}
            </Button>
          </div>
        </nav>
      ) : null}
    </section>
  );
};
