import { useState } from "react";

import { ActionDrawer } from "../../lib/erp/action-drawer";
import {
  DetailSection,
  KeyValueGrid,
  QueryBoundary,
} from "../../lib/erp/detail-parts";
import { LabelButton } from "../../lib/erp/label-dialog";
import { LookupBox } from "../../lib/erp/lookup-box";
import type { Row } from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import {
  bundleColumns,
  currentOperationColumns,
  inspectionFields,
  operationFields,
  packFields,
  reworkFields,
  stationMoColumns,
} from "./shopfloor-config";

export type StationAction = "operation" | "inspect" | "rework" | "pack";

const MFG = "/admin/manufacturing";

type BundleLookupResponse = {
  bundle: Row;
  manufacturing_order: Row | null;
  current_operation: Row | null;
};

const StationActions = ({
  bundle,
  allowed,
}: {
  bundle: Row;
  allowed: ReadonlySet<StationAction>;
}) => {
  const url = `${MFG}/bundles/${String(bundle.id)}`;
  const code = String(bundle.bundle_code);
  return (
    <>
      {allowed.has("operation") ? (
        <ActionDrawer
          description="Report the quantities finished at an operation."
          endpoint={`${url}/operations`}
          fields={operationFields}
          initialValues={{ op_seq: String(bundle.current_seq ?? "") }}
          label="Report operation"
          submitLabel="Report"
          variant="primary"
        />
      ) : null}
      {allowed.has("inspect") ? (
        <ActionDrawer
          endpoint={`${url}/inspections`}
          fields={inspectionFields}
          label="Send to inspection"
          submitLabel="Record inspection"
        />
      ) : null}
      {allowed.has("rework") ? (
        <ActionDrawer
          endpoint={`${url}/rework`}
          fields={reworkFields}
          label="Return rework"
          submitLabel="Return rework"
        />
      ) : null}
      {allowed.has("pack") ? (
        <ActionDrawer
          endpoint={`${url}/pack`}
          fields={packFields}
          label="Pack"
          submitLabel="Pack"
        />
      ) : null}
      <LabelButton
        label="Print ticket"
        path={`${MFG}/bundles/by-code/${encodeURIComponent(code)}/label`}
        title={`Bundle ticket ${code}`}
      />
    </>
  );
};

const StationResult = ({
  code,
  allowed,
}: {
  code: string;
  allowed: ReadonlySet<StationAction>;
}) => {
  const query = useErpQuery<BundleLookupResponse>(
    `${MFG}/bundles/by-code/${encodeURIComponent(code)}`
  );
  return (
    <QueryBoundary query={query}>
      {({ bundle, manufacturing_order, current_operation }) => (
        <>
          <DetailSection
            actions={<StationActions allowed={allowed} bundle={bundle} />}
            title={`Bundle ${String(bundle.bundle_code)}`}
          >
            <KeyValueGrid columns={bundleColumns} row={bundle} />
          </DetailSection>
          {manufacturing_order ? (
            <DetailSection title="Manufacturing order">
              <KeyValueGrid
                columns={stationMoColumns}
                row={manufacturing_order}
              />
            </DetailSection>
          ) : null}
          {current_operation ? (
            <DetailSection title="Waiting at operation">
              <KeyValueGrid
                columns={currentOperationColumns}
                row={current_operation}
              />
            </DetailSection>
          ) : null}
        </>
      )}
    </QueryBoundary>
  );
};

/**
 * Scan (or type) a bundle code, then run the shop-floor commands that apply.
 * `actions` limits which commands are offered (Quality only inspects).
 */
export const BundleStation = ({
  actions,
}: {
  actions: readonly StationAction[];
}) => {
  const [code, setCode] = useState<string | null>(null);
  const allowed = new Set(actions);
  return (
    <div className="flex flex-col divide-y">
      <div className="px-6 py-4">
        <LookupBox
          label="Scan or type a bundle code"
          onLookup={setCode}
          placeholder="e.g. BND-0001"
        />
      </div>
      {code ? <StationResult allowed={allowed} code={code} key={code} /> : null}
    </div>
  );
};
