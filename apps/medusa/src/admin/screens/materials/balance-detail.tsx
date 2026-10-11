import { ActionDrawer } from "../../lib/erp/action-drawer";
import {
  BackBar,
  DetailSection,
  KeyValueGrid,
} from "../../lib/erp/detail-parts";
import { ResourceTable } from "../../lib/erp/resource-table";
import type { ResourceConfig, Row } from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";
import {
  adjustmentFields,
  cycleCountFields,
  dispatchFields,
  qcDecisionFields,
  scrapFields,
  transferFields,
} from "./materials-forms";
import { balanceColumns, movementsList } from "./materials-lists";

const BASE = "/admin/material-inventory";

const balanceMovements: ResourceConfig = {
  ...movementsList,
  id: "balance-movements",
  title: "Movements of this balance",
  filters: [],
};

/**
 * One balance with every stock command that applies to it. There is no
 * single-balance endpoint, so the live row comes from the filtered list.
 */
export const BalanceDetail = ({
  row,
  onBack,
}: {
  row: Row;
  onBack: () => void;
}) => {
  const live = useErpQuery<{ balances: Row[] }>(`${BASE}/balances`, {
    material_id: String(row.material_id),
    location_id: String(row.location_id),
    limit: 200,
  });
  const current = live.data?.balances.find((b) => b.id === row.id) ?? row;
  const balanceId = String(row.id);
  const prefill = { balance_id: balanceId };

  return (
    <div className="flex flex-col divide-y">
      <BackBar label="balances" onBack={onBack} />
      <DetailSection
        actions={
          <>
            <ActionDrawer
              description="Records the count. A second person must approve it before stock changes."
              endpoint={`${BASE}/cycle-counts`}
              fields={cycleCountFields}
              initialValues={{
                ...prefill,
                expected_version: String(current.version ?? ""),
              }}
              label="Record count"
              submitLabel="Record count"
            />
            <ActionDrawer
              endpoint={`${BASE}/adjustments`}
              fields={adjustmentFields}
              initialValues={prefill}
              label="Adjust"
              submitLabel="Post adjustment"
            />
            <ActionDrawer
              endpoint={`${BASE}/qc-decisions`}
              fields={qcDecisionFields}
              initialValues={prefill}
              label="QC decision"
              submitLabel="Post decision"
            />
            <ActionDrawer
              endpoint={`${BASE}/transfers`}
              fields={transferFields}
              initialValues={prefill}
              label="Transfer (same site)"
              submitLabel="Transfer"
            />
            <ActionDrawer
              endpoint={`${BASE}/transfers/dispatch`}
              fields={dispatchFields}
              initialValues={prefill}
              label="Dispatch (in transit)"
              submitLabel="Dispatch"
            />
            <ActionDrawer
              endpoint={`${BASE}/scraps`}
              fields={scrapFields}
              initialValues={prefill}
              label="Scrap"
              submitLabel="Post scrap"
              variant="danger"
            />
          </>
        }
        title={tr("Balance {id}", { id: balanceId })}
      >
        <KeyValueGrid columns={balanceColumns} row={current} />
      </DetailSection>
      <ResourceTable
        config={balanceMovements}
        fixedQuery={{ balance_id: balanceId }}
      />
    </div>
  );
};
