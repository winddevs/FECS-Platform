import { defineRouteConfig } from "@medusajs/admin-sdk";

import { QualityIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import { ResourceTable } from "../../lib/erp/resource-table";
import { BundleStation } from "../../screens/shopfloor/bundle-station";
import { inspectionsList } from "../../screens/shopfloor/shopfloor-config";

export const config = defineRouteConfig({
  label: "menu.quality",
  translationNs: "fecs",
  icon: QualityIcon,
});

const QualityPage = () => (
  <TabbedPage
    description="Inspection history and bundle inspections."
    tabs={[
      {
        value: "inspections",
        label: "Inspections",
        content: <ResourceTable config={inspectionsList} />,
      },
      {
        value: "inspect",
        label: "Inspect a bundle",
        content: <BundleStation actions={["inspect"]} />,
      },
    ]}
    title="Quality"
  />
);

export default QualityPage;
