import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Button, toast } from "@medusajs/ui";
import { useMutation, QueryClientProvider } from "@tanstack/react-query";

import { tr } from "../../../lib/i18n";
import { queryClient } from "../../../lib/query-client";
import { sdk } from "../../../lib/sdk";

const MeilisearchPageContent = () => {
  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/meilisearch/sync", {
        method: "POST",
      }),
    onSuccess: () => {
      toast.success(tr("Successfully triggered data sync to Meilisearch"));
    },
    onError: (err) => {
      console.error(err);
      toast.error(tr("Failed to sync data to Meilisearch"));
    },
  });

  const handleSync = () => {
    mutate();
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{tr("Meilisearch Sync")}</Heading>
      </div>
      <div className="px-6 py-8">
        <Button variant="primary" onClick={handleSync} isLoading={isPending}>
          {tr("Sync Data to Meilisearch")}
        </Button>
      </div>
    </Container>
  );
};

const MeilisearchPage = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <MeilisearchPageContent />
    </QueryClientProvider>
  );
};

export const config = defineRouteConfig({
  label: "Meilisearch",
});

export default MeilisearchPage;
