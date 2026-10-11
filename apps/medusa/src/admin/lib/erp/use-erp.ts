import { toast } from "@medusajs/ui";
import {
  type UseMutationResult,
  type UseQueryResult,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { type QueryParams, type WriteMethod, erp, reportError } from "./api";

/** Every ERP data query lives under this root so a command can refresh all. */
export const ERP_QUERY_ROOT = "erp";

type QueryOptions = { enabled?: boolean };

/** GET through the ERP API helper; errors stay in `query.error`. */
export const useErpQuery = <T>(
  path: string,
  query?: QueryParams,
  options: QueryOptions = {}
): UseQueryResult<T, Error> =>
  useQuery<T, Error>({
    queryKey: [ERP_QUERY_ROOT, path, query ?? {}],
    queryFn: () => erp.get<T>(path, query),
    enabled: options.enabled ?? true,
    // Keep the old page visible while the next one loads (no spinner flash).
    placeholderData: keepPreviousData,
    // Back-office data must not look fresh when it is not.
    staleTime: 0,
    // A 403/404 will not fix itself; show it at once.
    retry: false,
  });

type CommandOptions<TResult> = {
  endpoint: string;
  method?: WriteMethod;
  successMessage?: string;
  onSuccess?: (result: TResult) => void;
};

/**
 * POST/PUT/DELETE command. Surfaces API errors as a toast (403 -> permission
 * message) and refreshes every ERP query on success.
 */
export const useErpCommand = <TResult = unknown>(
  options: CommandOptions<TResult>
): UseMutationResult<TResult, Error, unknown> => {
  const queryClient = useQueryClient();
  const method = options.method ?? "POST";
  return useMutation<TResult, Error, unknown>({
    mutationFn: (body) => {
      if (method === "DELETE") {
        return erp.del<TResult>(options.endpoint);
      }
      return method === "PUT"
        ? erp.put<TResult>(options.endpoint, body)
        : erp.post<TResult>(options.endpoint, body);
    },
    onSuccess: async (result) => {
      toast.success(options.successMessage ?? "Done");
      options.onSuccess?.(result);
      await queryClient.invalidateQueries({ queryKey: [ERP_QUERY_ROOT] });
    },
    onError: reportError,
    // A command must never be replayed behind the operator's back.
    retry: false,
  });
};
