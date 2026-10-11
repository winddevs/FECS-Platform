import { Badge, Text } from "@medusajs/ui";

import { autoColumns } from "../../lib/erp/cells";
import {
  DetailSection,
  MiniTable,
  QueryBoundary,
} from "../../lib/erp/detail-parts";
import { formatDateTime, formatValue } from "../../lib/erp/format";
import type { Row } from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";

type Summary = {
  generated_at: string;
  feature_flags: Record<string, unknown>;
  outbox: Record<string, Row[]>;
  inbox: Row[];
  shipments_needing_attention: Row[];
  stale_tracking: Row[];
  production_requests: Row[];
  open_manufacturing_exceptions: Row[];
};

const AutoTable = ({ label, rows }: { label: string; rows: Row[] }) => (
  <MiniTable
    columns={autoColumns(rows)}
    empty={tr("Nothing needs attention.")}
    label={tr(label)}
    rows={rows}
  />
);

const FeatureFlags = ({ flags }: { flags: Record<string, unknown> }) => (
  <ul aria-label={tr("Feature flags")} className="flex flex-wrap gap-2">
    {Object.entries(flags).map(([name, value]) => (
      <li key={name}>
        <Badge color={value === true ? "green" : "grey"} size="small">
          {name}: {formatValue(value)}
        </Badge>
      </li>
    ))}
  </ul>
);

const OutboxTable = ({ outbox }: { outbox: Record<string, Row[]> }) => {
  const rows: Row[] = [];
  for (const [table, entries] of Object.entries(outbox)) {
    for (const entry of entries) {
      rows.push({ queue: table.replace(/_outbox_event$/, ""), ...entry });
    }
  }
  return <AutoTable label="Outbox backlog" rows={rows} />;
};

/** Read-only operational health: backlogs, stuck work and enabled integrations. */
export const OpsSummary = () => {
  const query = useErpQuery<Summary>("/admin/ops/summary");
  return (
    <QueryBoundary query={query}>
      {(summary) => (
        <div className="flex flex-col divide-y">
          <DetailSection title="Feature flags">
            <Text className="text-ui-fg-subtle" size="small">
              {tr("Generated {time}", {
                time: formatDateTime(summary.generated_at),
              })}
            </Text>
            <FeatureFlags flags={summary.feature_flags} />
          </DetailSection>
          <DetailSection title="Outbox backlog (events not yet published)">
            <OutboxTable outbox={summary.outbox} />
          </DetailSection>
          <DetailSection title="Inbox (provider events not yet processed)">
            <AutoTable label="Inbox" rows={summary.inbox} />
          </DetailSection>
          <DetailSection title="Shipments needing attention">
            <AutoTable
              label="Shipments needing attention"
              rows={summary.shipments_needing_attention}
            />
          </DetailSection>
          <DetailSection title="Stale tracking (no event for 48h)">
            <AutoTable label="Stale tracking" rows={summary.stale_tracking} />
          </DetailSection>
          <DetailSection title="Production requests stuck">
            <AutoTable
              label="Production requests"
              rows={summary.production_requests}
            />
          </DetailSection>
          <DetailSection title="Open manufacturing exceptions">
            <AutoTable
              label="Open manufacturing exceptions"
              rows={summary.open_manufacturing_exceptions}
            />
          </DetailSection>
        </div>
      )}
    </QueryBoundary>
  );
};
