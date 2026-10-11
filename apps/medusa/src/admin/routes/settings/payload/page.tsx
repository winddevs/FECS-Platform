import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Button, Container, Heading, toast } from "@medusajs/ui";
import { useMutation, QueryClientProvider } from "@tanstack/react-query";

import { tr } from "../../../lib/i18n";
import { queryClient } from "../../../lib/query-client";
import { sdk } from "../../../lib/sdk";

const PayloadSettingsPageContent = () => {
  const {
    mutateAsync: syncProductsToPayload,
    isPending: isSyncingProductsToPayload,
  } = useMutation({
    mutationFn: (collection: string) =>
      sdk.client.fetch(`/admin/payload/sync/${collection}`, {
        method: "POST",
      }),
    onSuccess: () =>
      toast.success(tr("Triggered syncing collection data with Payload")),
    onError: (err) => {
      console.error(err);
      toast.error(tr("Failed to sync data with Payload"));
    },
  });

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h1">{tr("Payload Settings")}</Heading>
      </div>
      <div className="flex flex-col gap-4 px-6 py-4">
        <p>
          {tr(
            "This page allows you to trigger syncing your Medusa data with Payload. It will only create items not in Payload."
          )}
        </p>
        <Button
          variant="primary"
          onClick={() => syncProductsToPayload("products")}
          isLoading={isSyncingProductsToPayload}
        >
          {tr("Sync Products to Payload")}
        </Button>
      </div>
    </Container>
  );
};

const PayloadSettingsPage = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <PayloadSettingsPageContent />
    </QueryClientProvider>
  );
};

export const config = defineRouteConfig({
  label: "Payload",
});

export default PayloadSettingsPage;
