import { defineRouteConfig } from "@medusajs/admin-sdk";

import { ReturnsIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import { ReturnsTab } from "../../screens/returns/returns-tab";

export const config = defineRouteConfig({
  label: "Returns",
  icon: ReturnsIcon,
});

const ReturnsPage = () => (
  <TabbedPage
    description="Return authorization, receiving, inspection and refunds."
    tabs={[{ value: "returns", label: "Returns", content: <ReturnsTab /> }]}
    title="Returns"
  />
);

export default ReturnsPage;
