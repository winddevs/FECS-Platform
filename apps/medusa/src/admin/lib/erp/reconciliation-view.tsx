import { Button, Heading, Text } from "@medusajs/ui";
import { useQuery } from "@tanstack/react-query";

import { erp } from "./api";
import { QueryBoundary } from "./detail-parts";
import { StatusBadge } from "./status-badge";
import { ERP_QUERY_ROOT } from "./use-erp";

type Reconciliation = { ok: boolean } & Record<string, unknown>;

const HTTP_CONFLICT = 409;

/**
 * Runs a reconciliation endpoint. These answer 409 with the findings when the
 * books do not match, so a 409 is data here, not an error.
 */
export const ReconciliationView = ({
  title,
  endpoint,
}: {
  title: string;
  endpoint: string;
}) => {
  const query = useQuery<Reconciliation, Error>({
    queryKey: [ERP_QUERY_ROOT, "reconciliation", endpoint],
    queryFn: () => erp.getAllowing<Reconciliation>(endpoint, [HTTP_CONFLICT]),
    staleTime: 0,
    retry: false,
  });

  return (
    <section aria-label={title} className="flex flex-col gap-y-3 px-6 py-4">
      <div className="flex items-center justify-between">
        <Heading level="h2">{title}</Heading>
        <Button
          isLoading={query.isFetching}
          onClick={() => query.refetch()}
          size="small"
          variant="secondary"
        >
          Run again
        </Button>
      </div>
      <QueryBoundary query={query}>
        {(result) => (
          <div className="flex flex-col gap-y-3">
            <div className="flex items-center gap-x-2">
              <StatusBadge status={result.ok ? "OK" : "MISMATCH"} />
              <Text className="text-ui-fg-subtle" size="small">
                {result.ok
                  ? "Books are consistent."
                  : "Discrepancies were found. Details below."}
              </Text>
            </div>
            {result.ok ? null : (
              <pre
                aria-label="Reconciliation findings"
                className="max-h-96 overflow-auto rounded-md bg-ui-bg-subtle p-3 text-xs"
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}
      </QueryBoundary>
    </section>
  );
};
