import { useState } from "react";

import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ResourceTable } from "../../lib/erp/resource-table";
import {
  purchaseOrderFields,
  purchaseOrdersList,
  supplierFields,
  suppliersList,
} from "./procurement-config";
import { PurchaseOrderDetail } from "./purchase-order-detail";

export const SuppliersTab = () => (
  <ResourceTable
    config={suppliersList}
    toolbar={
      <ActionDrawer
        endpoint="/admin/procurement/suppliers"
        fields={supplierFields}
        label="New supplier"
        submitLabel="Create supplier"
        variant="primary"
      />
    }
  />
);

export const PurchaseOrdersTab = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (selectedId) {
    return (
      <PurchaseOrderDetail id={selectedId} onBack={() => setSelectedId(null)} />
    );
  }
  return (
    <ResourceTable
      config={purchaseOrdersList}
      onRowClick={(row) => setSelectedId(String(row.id))}
      toolbar={
        <ActionDrawer
          endpoint="/admin/procurement/purchase-orders"
          fields={purchaseOrderFields}
          label="New purchase order"
          onSuccess={(result) => {
            const created = (result as { purchase_order?: { id?: string } })
              .purchase_order;
            if (created?.id) {
              setSelectedId(created.id);
            }
          }}
          submitLabel="Create purchase order"
          variant="primary"
        />
      }
    />
  );
};
