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
import { ResourceTable } from "../../lib/erp/resource-table";
import type { Row } from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";
import {
  createShipmentFields,
  exceptionsList,
  replaceFields,
  resolveFields,
  shipmentHeaderColumns,
  shipmentsList,
  trackingEventColumns,
} from "./fulfillment-config";

const BASE = "/admin/fulfillment";
const TERMINAL = new Set(["DELIVERED", "RETURNED", "CANCELLED"]);

type ShipmentResponse = { shipment: Row; events: Row[] };

const ShipmentDetail = ({ id, onBack }: { id: string; onBack: () => void }) => {
  const query = useErpQuery<ShipmentResponse>(`${BASE}/shipments/${id}`);
  return (
    <div className="flex flex-col divide-y">
      <BackBar label="shipments" onBack={onBack} />
      <QueryBoundary query={query}>
        {({ shipment, events }) => (
          <>
            <DetailSection
              actions={
                TERMINAL.has(String(shipment.status)) ? null : (
                  <>
                    <ActionDrawer
                      description="Replaces this shipment with a new one. A reason is required."
                      endpoint={`${BASE}/shipments/${id}/replace`}
                      fields={replaceFields}
                      label="Replace shipment"
                      submitLabel="Replace"
                    />
                    <ConfirmActionButton
                      danger
                      endpoint={`${BASE}/shipments/${id}/cancel`}
                      label="Cancel shipment"
                      prompt="Cancel this shipment with the carrier?"
                    />
                  </>
                )
              }
              title={tr("Shipment {ref}", {
                ref: String(shipment.tracking_number ?? shipment.id),
              })}
            >
              <KeyValueGrid columns={shipmentHeaderColumns} row={shipment} />
            </DetailSection>
            <DetailSection title="Tracking events">
              <MiniTable
                columns={trackingEventColumns}
                empty={tr("No tracking events yet.")}
                label={tr("Tracking events")}
                rows={events}
              />
            </DetailSection>
          </>
        )}
      </QueryBoundary>
    </div>
  );
};

export const ShipmentsTab = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (selectedId) {
    return (
      <ShipmentDetail id={selectedId} onBack={() => setSelectedId(null)} />
    );
  }
  return (
    <ResourceTable
      config={shipmentsList}
      onRowClick={(row) => setSelectedId(String(row.id))}
      toolbar={
        <ActionDrawer
          endpoint={`${BASE}/shipments`}
          fields={createShipmentFields}
          label="Create shipment"
          submitLabel="Create shipment"
        />
      }
    />
  );
};

export const DeliveryExceptionsTab = () => (
  <ResourceTable
    config={exceptionsList}
    renderRowActions={(row) =>
      row.status === "OPEN" ? (
        <ActionDrawer
          endpoint={`${BASE}/exceptions/${String(row.id)}/resolve`}
          fields={resolveFields}
          label="Resolve"
          submitLabel="Resolve"
          variant="primary"
        />
      ) : null
    }
  />
);
