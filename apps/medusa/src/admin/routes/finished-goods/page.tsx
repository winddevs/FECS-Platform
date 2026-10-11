import { defineRouteConfig } from "@medusajs/admin-sdk";

import { FinishedGoodsIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import { ReconciliationView } from "../../lib/erp/reconciliation-view";
import {
  AllocationsTab,
  BalancesTab,
  BatchesTab,
  FgLocationsTab,
  FgTransfersTab,
  HoldsAdjustmentsTab,
} from "../../screens/finished-goods/fg-tabs";

export const config = defineRouteConfig({
  label: "menu.finishedGoods",
  translationNs: "fecs",
  icon: FinishedGoodsIcon,
});

const FinishedGoodsPage = () => (
  <TabbedPage
    description="Finished goods stock, batches, allocations, locations and transfers."
    tabs={[
      { value: "balances", label: "Balances", content: <BalancesTab /> },
      { value: "batches", label: "Batches", content: <BatchesTab /> },
      {
        value: "allocations",
        label: "Allocations",
        content: <AllocationsTab />,
      },
      {
        value: "holds",
        label: "Holds & adjustments",
        content: <HoldsAdjustmentsTab />,
      },
      { value: "transfers", label: "Transfers", content: <FgTransfersTab /> },
      { value: "locations", label: "Locations", content: <FgLocationsTab /> },
      {
        value: "reconciliation",
        label: "Reconciliation",
        content: (
          <ReconciliationView
            endpoint="/admin/finished-goods/reconciliation"
            title="Ledger vs balances, projection vs storefront inventory"
          />
        ),
      },
    ]}
    title="Finished Goods"
  />
);

export default FinishedGoodsPage;
