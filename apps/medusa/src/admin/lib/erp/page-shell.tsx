import { Container, Heading, Tabs, Text } from "@medusajs/ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { queryClient } from "../query-client";

export type TabConfig = {
  value: string;
  label: string;
  content: ReactNode;
};

/** Provides the shared QueryClient (admin routes are separate React roots). */
export const ErpPage = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

/**
 * Standard screen: one heading and tabs. Tab contents mount only while
 * selected, so a tab fetches nothing until the operator opens it.
 */
export const TabbedPage = ({
  title,
  description,
  tabs,
}: {
  title: string;
  description?: string;
  tabs: readonly TabConfig[];
}) => (
  <ErpPage>
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">{title}</Heading>
        {description ? (
          <Text className="text-ui-fg-subtle" size="small">
            {description}
          </Text>
        ) : null}
      </div>
      <Tabs defaultValue={tabs[0]?.value}>
        <Tabs.List className="flex-wrap px-6">
          {tabs.map((tab) => (
            <Tabs.Trigger key={tab.value} value={tab.value}>
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Content key={tab.value} value={tab.value}>
            {tab.content}
          </Tabs.Content>
        ))}
      </Tabs>
    </Container>
  </ErpPage>
);

/** Second-level switch inside a tab (e.g. Balances | Lots | Rolls). */
export const ViewSwitch = ({ views }: { views: readonly TabConfig[] }) => {
  const [active, setActive] = useState(views[0]?.value);
  const current = views.find((view) => view.value === active) ?? views[0];
  return (
    <div className="flex flex-col">
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 border-0 px-6 pt-4">
        <legend className="sr-only">Views</legend>
        {views.map((view) => (
          <button
            aria-pressed={view.value === current?.value}
            className={
              view.value === current?.value
                ? "rounded-md bg-ui-bg-base-pressed px-3 py-1 text-ui-fg-base txt-compact-small-plus shadow-borders-base"
                : "rounded-md px-3 py-1 text-ui-fg-subtle txt-compact-small-plus hover:bg-ui-bg-base-hover"
            }
            key={view.value}
            onClick={() => setActive(view.value)}
            type="button"
          >
            {view.label}
          </button>
        ))}
      </fieldset>
      {current?.content}
    </div>
  );
};
