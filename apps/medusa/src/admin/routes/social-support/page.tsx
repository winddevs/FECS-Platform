import { defineRouteConfig } from "@medusajs/admin-sdk";

import { SocialIcon } from "../../lib/erp/icons";
import { TabbedPage } from "../../lib/erp/page-shell";
import { SocialSupportTab } from "../../screens/social/social-support";

export const config = defineRouteConfig({
  label: "Social Support",
  icon: SocialIcon,
});

const SocialSupportPage = () => (
  <TabbedPage
    description="Customer chats that need a person: read the history, reply or hand back to the bot."
    tabs={[
      {
        value: "conversations",
        label: "Conversations",
        content: <SocialSupportTab />,
      },
    ]}
    title="Social Support"
  />
);

export default SocialSupportPage;
