import { defineRouteConfig } from "@medusajs/admin-sdk";

import { MaterialsIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import { ReconciliationView } from "../../lib/erp/reconciliation-view";
import { ScanTab } from "../../screens/materials/scan-tab";
import { StockTab } from "../../screens/materials/stock-tab";
import {
  CycleCountsTab,
  LocationsTab,
  MaterialsTab,
  ReceiveTab,
  TransfersTab,
} from "../../screens/materials/workflow-tabs";

export const config = defineRouteConfig({
  label: "Raw Materials",
  icon: MaterialsIcon,
});

const RawMaterialsPage = () => (
  <TabbedPage
    description="Raw material master data, stock, counts, transfers and reconciliation."
    tabs={[
      { value: "stock", label: "Stock", content: <StockTab /> },
      { value: "receive", label: "Receive", content: <ReceiveTab /> },
      { value: "counts", label: "Cycle counts", content: <CycleCountsTab /> },
      { value: "transfers", label: "Transfers", content: <TransfersTab /> },
      { value: "scan", label: "Scan", content: <ScanTab /> },
      { value: "materials", label: "Materials", content: <MaterialsTab /> },
      { value: "locations", label: "Locations", content: <LocationsTab /> },
      {
        value: "reconciliation",
        label: "Reconciliation",
        content: (
          <ReconciliationView
            endpoint="/admin/material-inventory/reconciliation"
            title="Ledger vs balances vs reservations"
          />
        ),
      },
    ]}
    title="Raw Materials"
  />
);

export default RawMaterialsPage;
