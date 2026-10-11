import { useState } from "react";

import { ActionDrawer } from "../../lib/erp/action-drawer";
import { LabelButton } from "../../lib/erp/label-dialog";
import { ViewSwitch } from "../../lib/erp/page-shell";
import { ResourceTable } from "../../lib/erp/resource-table";
import type { Row } from "../../lib/erp/resource-types";
import { BalanceDetail } from "./balance-detail";
import {
  issueFields,
  releaseReservationFields,
  reserveFields,
} from "./materials-forms";
import {
  balancesList,
  lotsList,
  movementsList,
  rollsList,
} from "./materials-lists";
import { reservationsList } from "./materials-ops-lists";

const BASE = "/admin/material-inventory";
const RELEASABLE = new Set(["ACTIVE", "PARTIALLY_ISSUED"]);

const BalancesView = () => {
  const [selected, setSelected] = useState<Row | null>(null);
  if (selected) {
    return <BalanceDetail onBack={() => setSelected(null)} row={selected} />;
  }
  return <ResourceTable config={balancesList} onRowClick={setSelected} />;
};

const RollsView = () => (
  <ResourceTable
    config={rollsList}
    renderRowActions={(row) => (
      <LabelButton
        label="Print label"
        path={`${BASE}/labels/roll/${encodeURIComponent(String(row.roll_code))}`}
        title={`Roll label ${String(row.roll_code)}`}
      />
    )}
  />
);

const ReservationsView = () => (
  <ResourceTable
    config={reservationsList}
    renderRowActions={(row) => {
      const id = String(row.id);
      return (
        <>
          <ActionDrawer
            endpoint={`${BASE}/issues`}
            fields={issueFields}
            initialValues={{ reservation_id: id }}
            label="Issue"
            submitLabel="Issue to production"
          />
          {RELEASABLE.has(String(row.status)) ? (
            <ActionDrawer
              endpoint={`${BASE}/reservations/${id}/release`}
              fields={releaseReservationFields}
              label="Release"
              submitLabel="Release"
            />
          ) : null}
        </>
      );
    }}
    toolbar={
      <ActionDrawer
        endpoint={`${BASE}/reservations`}
        fields={reserveFields}
        label="Reserve material"
        submitLabel="Reserve"
        variant="primary"
      />
    }
  />
);

/** Stock views. Balances open a detail screen with the stock commands. */
export const StockTab = () => (
  <ViewSwitch
    views={[
      { value: "balances", label: "Balances", content: <BalancesView /> },
      {
        value: "lots",
        label: "Lots",
        content: <ResourceTable config={lotsList} />,
      },
      { value: "rolls", label: "Rolls", content: <RollsView /> },
      {
        value: "movements",
        label: "Movements ledger",
        content: <ResourceTable config={movementsList} />,
      },
      {
        value: "reservations",
        label: "Reservations",
        content: <ReservationsView />,
      },
    ]}
  />
);
