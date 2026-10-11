import { Button, Label, Select, toast } from "@medusajs/ui";
import { useId, useState } from "react";

import { erp, reportError } from "../../lib/erp/api";
import { QueryBoundary } from "../../lib/erp/detail-parts";
import { toCsvCell } from "../../lib/erp/format";
import { ResourceTable } from "../../lib/erp/resource-table";
import type { ResourceConfig, Row } from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";

const MAX_EXPORT_ROWS = 1000;
const TABLE_PAGE_SIZE = 50;

const martConfig = (mart: string): ResourceConfig => ({
  id: `mart-${mart}`,
  title: mart.replace(/_/g, " "),
  endpoint: `/admin/analytics-marts/${mart}`,
  responseKey: "rows",
  columns: "auto",
  pageSize: TABLE_PAGE_SIZE,
  emptyMessage: "This mart has no rows yet.",
});

/** Header = union of keys in first-seen order; values escaped per RFC 4180. */
const toCsv = (rows: readonly Row[]): string => {
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) {
        headers.push(key);
      }
    }
  }
  const lines = [headers.map(toCsvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => toCsvCell(row[header])).join(","));
  }
  return lines.join("\r\n");
};

const downloadCsv = (name: string, csv: string): void => {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const CsvButton = ({ mart }: { mart: string }) => {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    setBusy(true);
    try {
      const { rows } = await erp.get<{ rows: Row[] }>(
        `/admin/analytics-marts/${mart}`,
        {
          limit: MAX_EXPORT_ROWS,
        }
      );
      downloadCsv(mart, toCsv(rows));
      toast.success(tr("Downloaded {count} rows", { count: rows.length }));
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      isLoading={busy}
      onClick={handleClick}
      size="small"
      variant="secondary"
    >
      {tr("Download CSV (up to {max} rows)", { max: MAX_EXPORT_ROWS })}
    </Button>
  );
};

/** Pick a read-only analytics mart, browse it as a table, export it as CSV. */
export const AnalyticsTab = () => {
  const marts = useErpQuery<{ marts: string[] }>("/admin/analytics-marts");
  const [selected, setSelected] = useState<string>();
  const selectId = useId();
  return (
    <QueryBoundary query={marts}>
      {({ marts: names }) => {
        const mart = selected ?? names[0];
        return (
          <div className="flex flex-col">
            <div className="flex flex-col gap-y-1 px-6 pt-4">
              <Label htmlFor={selectId} size="small" weight="plus">
                {tr("Mart")}
              </Label>
              <div className="w-72">
                <Select onValueChange={setSelected} size="small" value={mart}>
                  <Select.Trigger id={selectId}>
                    <Select.Value placeholder={tr("Select a mart")} />
                  </Select.Trigger>
                  <Select.Content>
                    {names.map((name) => (
                      <Select.Item key={name} value={name}>
                        {name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
            </div>
            {mart ? (
              <ResourceTable
                config={martConfig(mart)}
                key={mart}
                toolbar={<CsvButton mart={mart} />}
              />
            ) : null}
          </div>
        );
      }}
    </QueryBoundary>
  );
};
