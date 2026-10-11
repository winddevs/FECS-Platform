import { useState } from "react";

import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ConfirmActionButton } from "../../lib/erp/confirm-action-button";
import {
  BackBar,
  DetailSection,
  KeyValueGrid,
  MiniTable,
  QueryBoundary,
} from "../../lib/erp/detail-parts";
import type { FormValues } from "../../lib/erp/form-fields";
import { ResourceTable } from "../../lib/erp/resource-table";
import type { Row } from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";
import {
  allocationsList,
  balancesList,
  batchesList,
  fgLocationsList,
  fgMovementsList,
  fgTransfersList,
  shipmentLineColumns,
  traceBatchColumns,
} from "./fg-config";
import {
  adjustFields,
  allocateFields,
  fgDispatchFields,
  fgLocationFields,
  holdFields,
  republishFields,
  safetyStockFields,
} from "./fg-forms";

const FGP = "/admin/finished-goods";

/** Hold / adjust / safety-stock commands, optionally prefilled for a balance. */
const StockCommands = ({ initial }: { initial?: FormValues }) => (
  <>
    <ActionDrawer
      endpoint={`${FGP}/holds`}
      fields={holdFields}
      initialValues={initial}
      label="Hold / release"
      submitLabel="Apply"
    />
    <ActionDrawer
      endpoint={`${FGP}/adjustments`}
      fields={adjustFields}
      initialValues={initial}
      label="Adjust"
      submitLabel="Post adjustment"
    />
    <ActionDrawer
      endpoint={`${FGP}/safety-stock`}
      fields={safetyStockFields}
      initialValues={initial}
      label="Safety stock"
      submitLabel="Save"
    />
  </>
);

export const BalancesTab = () => (
  <ResourceTable
    config={balancesList}
    renderRowActions={(row) => (
      <StockCommands
        initial={{
          sku: String(row.sku),
          location_id: String(row.location_id),
        }}
      />
    )}
    toolbar={
      <ActionDrawer
        description="Re-emits the current sellable quantity to the storefront inventory (repairs a drifted copy)."
        endpoint={`${FGP}/projection/republish`}
        fields={republishFields}
        label="Republish projection"
        submitLabel="Republish"
      />
    }
  />
);

type TraceResponse = { batch: Row; shipments: Row[] };

const BatchTrace = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const query = useErpQuery<TraceResponse>(`${FGP}/batches/${id}/trace`);
  return (
    <div className="flex flex-col divide-y">
      <BackBar label="batches" onBack={onBack} />
      <QueryBoundary query={query}>
        {({ batch, shipments }) => (
          <>
            <DetailSection
              title={tr("Trace of batch {batch_no}", {
                batch_no: String(batch.batch_no),
              })}
            >
              <KeyValueGrid columns={traceBatchColumns} row={batch} />
            </DetailSection>
            <DetailSection title="Shipped to">
              <MiniTable
                columns={shipmentLineColumns}
                empty={tr("Nothing from this batch has shipped yet.")}
                label={tr("Shipments fed by this batch")}
                rows={shipments}
              />
            </DetailSection>
          </>
        )}
      </QueryBoundary>
    </div>
  );
};

export const BatchesTab = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (selectedId) {
    return <BatchTrace id={selectedId} onBack={() => setSelectedId(null)} />;
  }
  return (
    <ResourceTable
      config={batchesList}
      onRowClick={(row) => setSelectedId(String(row.id))}
    />
  );
};

export const AllocationsTab = () => (
  <ResourceTable
    config={allocationsList}
    toolbar={
      <ActionDrawer
        endpoint={`${FGP}/allocations`}
        fields={allocateFields}
        label="Allocate to order"
        submitLabel="Allocate"
        variant="primary"
      />
    }
  />
);

export const HoldsAdjustmentsTab = () => (
  <ResourceTable config={fgMovementsList} toolbar={<StockCommands />} />
);

export const FgLocationsTab = () => (
  <ResourceTable
    config={fgLocationsList}
    toolbar={
      <ActionDrawer
        endpoint={`${FGP}/locations`}
        fields={fgLocationFields}
        label="New location"
        submitLabel="Create location"
        variant="primary"
      />
    }
  />
);

export const FgTransfersTab = () => (
  <ResourceTable
    config={fgTransfersList}
    renderRowActions={(row) =>
      row.status === "IN_TRANSIT" ? (
        <>
          <ConfirmActionButton
            endpoint={`${FGP}/transfers/${String(row.id)}/receive`}
            label="Receive"
            prompt="Confirm the goods arrived at the destination?"
            reason={{ label: "Note (optional)" }}
            variant="primary"
          />
          <ConfirmActionButton
            danger
            endpoint={`${FGP}/transfers/${String(row.id)}/cancel`}
            label="Cancel"
            prompt="Cancel this transfer and return the stock to the source?"
            reason={{ label: "Reason" }}
          />
        </>
      ) : null
    }
    toolbar={
      <ActionDrawer
        endpoint={`${FGP}/transfers/dispatch`}
        fields={fgDispatchFields}
        label="Dispatch transfer"
        submitLabel="Dispatch"
        variant="primary"
      />
    }
  />
);
