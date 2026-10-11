import { useState } from "react";

import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ConfirmActionButton } from "../../lib/erp/confirm-action-button";
import {
  BackBar,
  DetailSection,
  KeyValueGrid,
  MiniTable,
  QueryBoundary,
} from "../../lib/erp/detail-parts";
import type { FieldConfig } from "../../lib/erp/form-fields";
import { ResourceTable } from "../../lib/erp/resource-table";
import type {
  ColumnConfig,
  ResourceConfig,
  Row,
} from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";

/** Describes a versioned master document (BOM or routing). */
export type VersionedDocConfig = {
  label: string;
  /** Lower-case plural for the "Back to ..." bar (plain English; translated by the kit). */
  backLabel: string;
  /** Prompt asked before releasing a draft (plain English; translated by the kit). */
  releasePrompt: string;
  /** Toolbar button that opens the create drawer (plain English; translated by the kit). */
  newLabel: string;
  list: ResourceConfig;
  base: string;
  /** Property of the detail response holding the header record. */
  docKey: string;
  /** Property holding the child rows (lines / operations). */
  childKey: string;
  childTitle: string;
  headerColumns: readonly ColumnConfig[];
  childColumns: readonly ColumnConfig[];
  createFields: readonly FieldConfig[];
};

const VersionedDocDetail = ({
  doc,
  id,
  onBack,
}: {
  doc: VersionedDocConfig;
  id: string;
  onBack: () => void;
}) => {
  const query = useErpQuery<Record<string, unknown>>(`${doc.base}/${id}`);
  return (
    <div className="flex flex-col divide-y">
      <BackBar label={doc.backLabel} onBack={onBack} />
      <QueryBoundary query={query}>
        {(data) => {
          const header = data[doc.docKey] as Row;
          const children = (data[doc.childKey] as Row[] | undefined) ?? [];
          return (
            <>
              <DetailSection
                actions={
                  header.status === "DRAFT" ? (
                    <ConfirmActionButton
                      endpoint={`${doc.base}/${id}/release`}
                      label="Release"
                      prompt={doc.releasePrompt}
                      variant="primary"
                    />
                  ) : null
                }
                title={tr("{doc} {sku} v{version}", {
                  doc: tr(doc.label),
                  sku: String(header.product_sku),
                  version: String(header.version),
                })}
              >
                <KeyValueGrid columns={doc.headerColumns} row={header} />
              </DetailSection>
              <DetailSection title={doc.childTitle}>
                <MiniTable
                  columns={doc.childColumns}
                  label={tr(doc.childTitle)}
                  rows={children}
                />
              </DetailSection>
              <ResourceTable
                config={{
                  ...doc.list,
                  id: `${doc.list.id}-versions`,
                  title: "All versions of this product",
                  filters: [],
                  defaultFilters: {},
                }}
                fixedQuery={{ product_sku: String(header.product_sku) }}
              />
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
};

/** List + create + detail (with release) for a versioned document. */
export const VersionedDocTab = ({ doc }: { doc: VersionedDocConfig }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (selectedId) {
    return (
      <VersionedDocDetail
        doc={doc}
        id={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }
  return (
    <ResourceTable
      config={doc.list}
      onRowClick={(row) => setSelectedId(String(row.id))}
      toolbar={
        <ActionDrawer
          description="Creates a new draft version. Release it to make it usable."
          endpoint={doc.base}
          fields={doc.createFields}
          label={doc.newLabel}
          submitLabel="Create draft"
          variant="primary"
        />
      }
    />
  );
};
