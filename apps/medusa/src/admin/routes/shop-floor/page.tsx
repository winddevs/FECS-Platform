import { defineRouteConfig } from "@medusajs/admin-sdk";

import { ShopFloorIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import { ResourceTable } from "../../lib/erp/resource-table";
import { BundleStation } from "../../screens/shopfloor/bundle-station";
import { bundlesList } from "../../screens/shopfloor/shopfloor-config";

export const config = defineRouteConfig({
  label: "Shop Floor",
  icon: ShopFloorIcon,
});

const ShopFloorPage = () => (
  <TabbedPage
    description="Scan a bundle to report operations, inspect, return rework and pack."
    tabs={[
      {
        value: "station",
        label: "Bundle station",
        content: (
          <BundleStation actions={["operation", "inspect", "rework", "pack"]} />
        ),
      },
      {
        value: "bundles",
        label: "Bundles",
        content: <ResourceTable config={bundlesList} />,
      },
    ]}
    title="Shop Floor"
  />
);

export default ShopFloorPage;
