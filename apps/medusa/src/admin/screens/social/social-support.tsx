import { Badge, Text } from "@medusajs/ui";
import { useState } from "react";

import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ConfirmActionButton } from "../../lib/erp/confirm-action-button";
import {
  BackBar,
  DetailSection,
  KeyValueGrid,
  QueryBoundary,
} from "../../lib/erp/detail-parts";
import type { FieldConfig } from "../../lib/erp/form-fields";
import { formatDateTime } from "../../lib/erp/format";
import { ResourceTable } from "../../lib/erp/resource-table";
import type {
  ColumnConfig,
  ResourceConfig,
  Row,
} from "../../lib/erp/resource-types";
import { StatusBadge } from "../../lib/erp/status-badge";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";

const BASE = "/admin/social/identities";

const identityColumns: readonly ColumnConfig[] = [
  { key: "channel", label: "Channel" },
  { key: "handoff_state", label: "Handled by", kind: "status" },
  { key: "account_id", label: "Account", kind: "code" },
  { key: "external_user_id", label: "External user", kind: "code" },
  { key: "customer_id", label: "Customer", kind: "code" },
  { key: "consent_status", label: "Consent", kind: "status" },
  {
    key: "last_inbound_at",
    label: "Last message from customer",
    kind: "datetime",
  },
];

const identitiesList: ResourceConfig = {
  id: "social-identities",
  title: "Conversations",
  description: "Customers the bot handed over to a person are listed first.",
  endpoint: BASE,
  responseKey: "identities",
  order: "-last_inbound_at",
  defaultFilters: { handoff_state: "HUMAN" },
  columns: identityColumns,
  filters: [
    {
      key: "handoff_state",
      label: "Handled by",
      type: "select",
      options: ["BOT", "HUMAN"],
    },
    { key: "customer_id", label: "Customer id" },
  ],
};

const replyFields: readonly FieldConfig[] = [
  { name: "text", label: "Message", type: "textarea", required: true },
];

const oldestFirst = (messages: readonly Row[]): Row[] =>
  messages.reduceRight<Row[]>((acc, message) => {
    acc.push(message);
    return acc;
  }, []);

const MessageItem = ({ message }: { message: Row }) => {
  const outgoing = message.direction === "OUT";
  return (
    <li
      className={`flex flex-col gap-y-1 rounded-md p-3 ${
        outgoing ? "bg-ui-bg-highlight" : "bg-ui-bg-subtle"
      }`}
    >
      <div className="flex items-center gap-x-2">
        <Badge color={outgoing ? "blue" : "grey"} size="2xsmall">
          {outgoing ? tr("Agent / bot") : tr("Customer")}
        </Badge>
        <Text className="text-ui-fg-subtle" leading="compact" size="small">
          {formatDateTime(message.created_at)}
        </Text>
        {typeof message.status === "string" ? (
          <StatusBadge status={message.status} />
        ) : null}
        {typeof message.intent === "string" && message.intent ? (
          <Text className="text-ui-fg-muted" leading="compact" size="small">
            {message.intent}
          </Text>
        ) : null}
      </div>
      <Text leading="compact" size="small">
        {typeof message.text === "string" ? message.text : "-"}
      </Text>
    </li>
  );
};

const Conversation = ({ id }: { id: string }) => {
  const query = useErpQuery<{ messages: Row[] }>(`${BASE}/${id}/messages`);
  return (
    <QueryBoundary query={query}>
      {({ messages }) =>
        messages.length === 0 ? (
          <Text className="text-ui-fg-subtle" size="small">
            {tr("No messages yet.")}
          </Text>
        ) : (
          // The API returns newest first; read top-down oldest first.
          <ol
            aria-label={tr("Conversation history")}
            className="flex flex-col gap-y-2"
          >
            {oldestFirst(messages).map((message) => (
              <MessageItem key={String(message.id)} message={message} />
            ))}
          </ol>
        )
      }
    </QueryBoundary>
  );
};

const ConversationScreen = ({
  identity,
  onBack,
}: {
  identity: Row;
  onBack: () => void;
}) => {
  const id = String(identity.id);
  // Refreshing the list keeps the hand-off state current after a command.
  const live = useErpQuery<{ identities: Row[] }>(BASE, {
    customer_id:
      typeof identity.customer_id === "string"
        ? identity.customer_id
        : undefined,
    limit: 200,
  });
  const current =
    live.data?.identities.find((row) => row.id === identity.id) ?? identity;
  const withHuman = current.handoff_state === "HUMAN";
  return (
    <div className="flex flex-col divide-y">
      <BackBar label="conversations" onBack={onBack} />
      <DetailSection
        actions={
          withHuman ? (
            <>
              <ActionDrawer
                endpoint={`${BASE}/${id}/messages`}
                fields={replyFields}
                label="Reply"
                submitLabel="Send"
                variant="primary"
              />
              <ConfirmActionButton
                body={{ state: "BOT" }}
                endpoint={`${BASE}/${id}/handoff`}
                label="Hand back to bot"
                prompt="Hand this conversation back to the bot?"
              />
            </>
          ) : (
            <ConfirmActionButton
              body={{ state: "HUMAN" }}
              endpoint={`${BASE}/${id}/handoff`}
              label="Take over"
              prompt="Take over this conversation? The bot will stop replying."
              variant="primary"
            />
          )
        }
        title={tr("{channel} conversation", {
          channel: String(identity.channel),
        })}
      >
        <KeyValueGrid columns={identityColumns} row={current} />
      </DetailSection>
      <DetailSection title="History">
        <Conversation id={id} />
      </DetailSection>
    </div>
  );
};

export const SocialSupportTab = () => {
  const [selected, setSelected] = useState<Row | null>(null);
  if (selected) {
    return (
      <ConversationScreen
        identity={selected}
        onBack={() => setSelected(null)}
      />
    );
  }
  return <ResourceTable config={identitiesList} onRowClick={setSelected} />;
};
