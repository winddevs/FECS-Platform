import { defineRouteConfig } from "@medusajs/admin-sdk";

import { PlanningIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import {
  BomTab,
  MrpTab,
  ParamsTab,
  RoutingTab,
  WorkCentersTab,
} from "../../screens/planning/planning-tabs";

export const config = defineRouteConfig({
  label: "Planning",
  icon: PlanningIcon,
});

const PlanningPage = () => (
  <TabbedPage
    description="BOMs, routings, MRP, planning parameters and capacity."
    tabs={[
      { value: "boms", label: "BOMs", content: <BomTab /> },
      { value: "routings", label: "Routings", content: <RoutingTab /> },
      { value: "mrp", label: "MRP", content: <MrpTab /> },
      { value: "params", label: "Planning params", content: <ParamsTab /> },
      {
        value: "work-centers",
        label: "Work centers",
        content: <WorkCentersTab />,
      },
    ]}
    title="Planning"
  />
);

export default PlanningPage;
