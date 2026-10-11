import { Button, Heading, Table, Text } from "@medusajs/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { tr } from "../i18n";
import { describeError } from "./api";
import { Cell } from "./cells";
import type { ColumnConfig, Row } from "./resource-types";
import { Spinner } from "./spinner";

/** Spinner / error (with retry) / content for one query. */
export const QueryBoundary = <T,>({
  query,
  children,
}: {
  query: UseQueryResult<T, Error>;
  children: (data: T) => ReactNode;
}) => {
  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center px-6 py-8">
        <Spinner />
      </div>
    );
  }
  if (query.error || query.data === undefined) {
    return (
      <div
        className="flex flex-col items-center gap-y-2 px-6 py-8"
        role="alert"
      >
        <Text className="text-ui-fg-error" size="small">
          {describeError(query.error ?? new Error(tr("No data")))}
        </Text>
        <Button
          onClick={() => query.refetch()}
          size="small"
          variant="secondary"
        >
          {tr("Retry")}
        </Button>
      </div>
    );
  }
  return <>{children(query.data)}</>;
};

/** Titled block with an optional action area, used on detail screens. */
export const DetailSection = ({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <section aria-label={tr(title)} className="flex flex-col gap-y-3 px-6 py-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Heading level="h3">{tr(title)}</Heading>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
    {children}
  </section>
);

/** Label/value pairs for one record, rendered with the column kinds. */
export const KeyValueGrid = ({
  row,
  columns,
}: {
  row: Row;
  columns: readonly ColumnConfig[];
}) => (
  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
    {columns.map((column) => (
      <div className="flex flex-col gap-y-1" key={column.key}>
        <dt>
          <Text className="text-ui-fg-subtle" leading="compact" size="small">
            {tr(column.label)}
          </Text>
        </dt>
        <dd>
          <Text leading="compact" size="small" weight="plus">
            <Cell column={column} row={row} />
          </Text>
        </dd>
      </div>
    ))}
  </dl>
);

/** Small non-paginated table for child rows (lines, items, events). */
export const MiniTable = ({
  columns,
  rows,
  empty = "Nothing to show.",
  label,
  renderRowActions,
}: {
  columns: readonly ColumnConfig[];
  rows: readonly Row[];
  empty?: string;
  label: string;
  renderRowActions?: (row: Row) => ReactNode;
}) => {
  if (rows.length === 0) {
    return (
      <Text className="text-ui-fg-subtle" size="small">
        {tr(empty)}
      </Text>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table aria-label={tr(label)}>
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
            <Table.Row key={String(row.id ?? index)}>
              {columns.map((column) => (
                <Table.Cell key={column.key}>
                  <Cell column={column} row={row} />
                </Table.Cell>
              ))}
              {renderRowActions ? (
                <Table.Cell>
                  <div className="flex justify-end gap-x-2">
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

export const BackBar = ({
  label,
  onBack,
}: {
  label: string;
  onBack: () => void;
}) => (
  <div className="px-6 pt-4">
    <Button onClick={onBack} size="small" variant="transparent">
      {tr("< Back to {label}", { label: tr(label) })}
    </Button>
  </div>
);
