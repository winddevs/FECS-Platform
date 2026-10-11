import { useState } from "react";

import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ConfirmActionButton } from "../../lib/erp/confirm-action-button";
import { ResourceTable } from "../../lib/erp/resource-table";
import { MoDetail } from "./mo-detail";
import {
  manufacturingExceptionsList,
  manufacturingOrdersList,
  productionRequestsList,
} from "./production-config";
import { moFields } from "./production-forms";

const RETRYABLE = new Set(["WAITING_MATERIAL", "FAILED"]);

export const ManufacturingOrdersTab = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (selectedId) {
    return <MoDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }
  return (
    <ResourceTable
      config={manufacturingOrdersList}
      onRowClick={(row) => setSelectedId(String(row.id))}
      toolbar={
        <ActionDrawer
          endpoint="/admin/manufacturing/mos"
          fields={moFields}
          label="New manufacturing order"
          submitLabel="Create order"
          variant="primary"
        />
      }
    />
  );
};

export const ExceptionsTab = () => (
  <ResourceTable config={manufacturingExceptionsList} />
);

export const ProductionRequestsTab = () => (
  <ResourceTable
    config={productionRequestsList}
    renderRowActions={(row) =>
      RETRYABLE.has(String(row.status)) ? (
        <ConfirmActionButton
          endpoint={`/admin/manufacturing/production-requests/${String(row.id)}/retry`}
          label="Retry"
          prompt="Retry creating a manufacturing order for this request?"
        />
      ) : null
    }
  />
);
