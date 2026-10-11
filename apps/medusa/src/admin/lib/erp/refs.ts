import { useQuery } from "@tanstack/react-query";

import { erp } from "./api";
import { ERP_QUERY_ROOT } from "./use-erp";

/**
 * Master records referenced by id all over the ERP. Screens show their code
 * instead of an opaque id, and forms offer them in a lookup.
 */
export type RefKind =
  | "material"
  | "location"
  | "supplier"
  | "fgLocation"
  | "workCenter";

export type RefOption = { id: string; label: string };

type RefSource = {
  endpoint: string;
  responseKey: string;
  label: (row: Record<string, unknown>) => string;
};

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

const codeAndName = (row: Record<string, unknown>): string =>
  [text(row.code), text(row.name)].filter(Boolean).join(" - ");

const REF_SOURCES: Record<RefKind, RefSource> = {
  material: {
    endpoint: "/admin/material-inventory/materials",
    responseKey: "materials",
    label: codeAndName,
  },
  location: {
    endpoint: "/admin/material-inventory/locations",
    responseKey: "locations",
    label: codeAndName,
  },
  supplier: {
    endpoint: "/admin/procurement/suppliers",
    responseKey: "suppliers",
    label: codeAndName,
  },
  fgLocation: {
    endpoint: "/admin/finished-goods/locations",
    responseKey: "locations",
    label: codeAndName,
  },
  workCenter: {
    endpoint: "/admin/manufacturing/work-centers",
    responseKey: "work_centers",
    label: codeAndName,
  },
};

const MAX_REFS = 200;
const REF_STALE_MS = 60_000;

/** Id -> label options for a master list (first 200, the API maximum). */
export const useRefOptions = (kind: RefKind) => {
  const source = REF_SOURCES[kind];
  return useQuery<RefOption[], Error>({
    queryKey: [ERP_QUERY_ROOT, "ref", kind],
    queryFn: async () => {
      const response = await erp.get<Record<string, unknown>>(source.endpoint, {
        limit: MAX_REFS,
      });
      const rows =
        (response[source.responseKey] as Record<string, unknown>[]) ?? [];
      return rows.map((row) => ({
        id: text(row.id),
        label: source.label(row) || text(row.id),
      }));
    },
    staleTime: REF_STALE_MS,
    // A user without read access to the master just sees raw ids.
    retry: false,
  });
};
