import { defineRouteConfig } from "@medusajs/admin-sdk";

import { FulfillmentIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import {
  DeliveryExceptionsTab,
  ShipmentsTab,
} from "../../screens/fulfillment/fulfillment-tabs";

export const config = defineRouteConfig({
  label: "menu.fulfillment",
  translationNs: "fecs",
  icon: FulfillmentIcon,
});

const FulfillmentPage = () => (
  <TabbedPage
    description="Carrier shipments, tracking and delivery exceptions."
    tabs={[
      { value: "shipments", label: "Shipments", content: <ShipmentsTab /> },
      {
        value: "exceptions",
        label: "Delivery exceptions",
        content: <DeliveryExceptionsTab />,
      },
    ]}
    title="Fulfillment"
  />
);

export default FulfillmentPage;
