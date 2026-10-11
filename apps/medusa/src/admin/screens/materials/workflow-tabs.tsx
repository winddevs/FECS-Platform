import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ConfirmActionButton } from "../../lib/erp/confirm-action-button";
import { LabelButton } from "../../lib/erp/label-dialog";
import { ResourceTable } from "../../lib/erp/resource-table";
import type { ResourceConfig } from "../../lib/erp/resource-types";
import {
  dispatchFields,
  locationFields,
  materialFields,
  receiveFields,
  transferFields,
} from "./materials-forms";
import { locationsList, materialsList, movementsList } from "./materials-lists";
import { cycleCountsList, transfersList } from "./materials-ops-lists";

const BASE = "/admin/material-inventory";

const receiptsLedger: ResourceConfig = {
  ...movementsList,
  id: "receipts",
  title: "Recent receipts",
  description: "Receipt entries of the movements ledger.",
  filters: [{ key: "material_id", label: "Material id" }],
};

export const MaterialsTab = () => (
  <ResourceTable
    config={materialsList}
    toolbar={
      <ActionDrawer
        endpoint={`${BASE}/materials`}
        fields={materialFields}
        label="New material"
        submitLabel="Create material"
        variant="primary"
      />
    }
  />
);

export const LocationsTab = () => (
  <ResourceTable
    config={locationsList}
    renderRowActions={(row) => (
      <LabelButton
        label="Print label"
        path={`${BASE}/labels/location/${encodeURIComponent(String(row.code))}`}
        title={`Location label ${String(row.code)}`}
      />
    )}
    toolbar={
      <ActionDrawer
        endpoint={`${BASE}/locations`}
        fields={locationFields}
        label="New location"
        submitLabel="Create location"
        variant="primary"
      />
    }
  />
);

export const ReceiveTab = () => (
  <ResourceTable
    config={receiptsLedger}
    fixedQuery={{ movement_type: "RECEIPT" }}
    toolbar={
      <ActionDrawer
        description="Receive stock outside a purchase order (opening stock, returns from suppliers)."
        endpoint={`${BASE}/receipts`}
        fields={receiveFields}
        label="Receive stock"
        submitLabel="Receive"
        variant="primary"
      />
    }
  />
);

export const CycleCountsTab = () => (
  <ResourceTable
    config={cycleCountsList}
    renderRowActions={(row) =>
      row.status === "PENDING_APPROVAL" ? (
        <>
          <ConfirmActionButton
            body={{ decision: "APPROVE" }}
            endpoint={`${BASE}/cycle-counts/${String(row.id)}/decision`}
            label="Approve"
            prompt="Approve this count? The difference is posted as a stock adjustment."
            reason={{ label: "Note (optional)" }}
            variant="primary"
          />
          <ConfirmActionButton
            body={{ decision: "REJECT" }}
            danger
            endpoint={`${BASE}/cycle-counts/${String(row.id)}/decision`}
            label="Reject"
            prompt="Reject this count? No stock is changed."
            reason={{ label: "Reason" }}
          />
        </>
      ) : null
    }
  />
);

export const TransfersTab = () => (
  <ResourceTable
    config={transfersList}
    renderRowActions={(row) =>
      row.status === "IN_TRANSIT" ? (
        <>
          <ConfirmActionButton
            endpoint={`${BASE}/transfers/${String(row.id)}/receive`}
            label="Receive"
            prompt="Confirm the goods arrived at the destination?"
            reason={{ label: "Note (optional)" }}
            variant="primary"
          />
          <ConfirmActionButton
            danger
            endpoint={`${BASE}/transfers/${String(row.id)}/cancel`}
            label="Cancel"
            prompt="Cancel this transfer and return the stock to the source?"
            reason={{ label: "Reason" }}
          />
        </>
      ) : null
    }
    toolbar={
      <>
        <ActionDrawer
          endpoint={`${BASE}/transfers`}
          fields={transferFields}
          label="Same-site transfer"
          submitLabel="Transfer"
        />
        <ActionDrawer
          endpoint={`${BASE}/transfers/dispatch`}
          fields={dispatchFields}
          label="Dispatch transfer"
          submitLabel="Dispatch"
          variant="primary"
        />
      </>
    }
  />
);
