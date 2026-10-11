import { defineRouteConfig } from "@medusajs/admin-sdk";

import { OperationsIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import { AnalyticsTab } from "../../screens/operations/analytics-tab";
import { CountryProfilesTab } from "../../screens/operations/country-profiles-tab";
import { OpsSummary } from "../../screens/operations/ops-summary";
import { SettingsTab } from "../../screens/operations/settings-tab";

export const config = defineRouteConfig({
  label: "menu.operations",
  translationNs: "fecs",
  icon: OperationsIcon,
});

const OperationsPage = () => (
  <TabbedPage
    description="System health, platform settings, country profiles and analytics marts."
    tabs={[
      { value: "summary", label: "Ops summary", content: <OpsSummary /> },
      { value: "settings", label: "Settings", content: <SettingsTab /> },
      {
        value: "countries",
        label: "Country profiles",
        content: <CountryProfilesTab />,
      },
      { value: "analytics", label: "Analytics", content: <AnalyticsTab /> },
    ]}
    title="Operations"
  />
);

export default OperationsPage;
