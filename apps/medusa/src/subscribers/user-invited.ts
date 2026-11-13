import { SubscriberArgs, type SubscriberConfig } from "@medusajs/framework";

import { resolveBackendUrl } from "../lib/config/public-urls";

export default async function inviteCreatedHandler({
  event: { data },
  container,
}: SubscriberArgs<{
  id: string;
}>) {
  const query = container.resolve("query");
  const notificationModuleService = container.resolve("notification");
  const config = container.resolve("configModule");

  const {
    data: [invite],
  } = await query.graph({
    entity: "invite",
    fields: ["email", "token"],
    filters: {
      id: data.id,
    },
  });

  const backend_url = resolveBackendUrl(config.admin.backendUrl);
  const adminPath = config.admin.path;

  await notificationModuleService.createNotifications({
    to: invite.email,
    template: "user-invited",
    channel: "email",
    data: {
      invite_url: `${backend_url}${adminPath}/invite?token=${invite.token}`,
    },
  });
}

export const config: SubscriberConfig = {
  event: ["invite.created", "invite.resent"],
};
