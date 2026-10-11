import { defineRouteConfig } from "@medusajs/admin-sdk";

import { ProcurementIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import {
  PurchaseOrdersTab,
  SuppliersTab,
} from "../../screens/procurement/procurement-tabs";

export const config = defineRouteConfig({
  label: "menu.procurement",
  translationNs: "fecs",
  icon: ProcurementIcon,
});

const ProcurementPage = () => (
  <TabbedPage
    description="Suppliers, purchase orders and goods receipts."
    tabs={[
      {
        value: "purchase-orders",
        label: "Purchase orders",
        content: <PurchaseOrdersTab />,
      },
      { value: "suppliers", label: "Suppliers", content: <SuppliersTab /> },
    ]}
    title="Procurement"
  />
);

export default ProcurementPage;
