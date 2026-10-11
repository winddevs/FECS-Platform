import { defineRouteConfig } from "@medusajs/admin-sdk";

import { ProductionIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import {
  ExceptionsTab,
  ManufacturingOrdersTab,
  ProductionRequestsTab,
} from "../../screens/production/production-tabs";

export const config = defineRouteConfig({
  label: "menu.production",
  translationNs: "fecs",
  icon: ProductionIcon,
});

const ProductionPage = () => (
  <TabbedPage
    description="Manufacturing orders, make-to-order requests and exceptions."
    tabs={[
      {
        value: "orders",
        label: "Manufacturing orders",
        content: <ManufacturingOrdersTab />,
      },
      {
        value: "requests",
        label: "Production requests",
        content: <ProductionRequestsTab />,
      },
      { value: "exceptions", label: "Exceptions", content: <ExceptionsTab /> },
    ]}
    title="Production"
  />
);

export default ProductionPage;
