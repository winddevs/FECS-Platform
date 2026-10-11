import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ConfirmActionButton } from "../../lib/erp/confirm-action-button";
import {
  BackBar,
  DetailSection,
  KeyValueGrid,
  MiniTable,
  QueryBoundary,
} from "../../lib/erp/detail-parts";
import { LabelButton } from "../../lib/erp/label-dialog";
import type { Row } from "../../lib/erp/resource-types";
import { useErpQuery } from "../../lib/erp/use-erp";
import { tr } from "../../lib/i18n";
import {
  batchColumns,
  bundleColumns,
  moHeaderColumns,
  requirementColumns,
  reservedRollColumns,
} from "./production-config";
import {
  completeCutFields,
  cutPlanFields,
  holdFields,
  issueFabricFields,
  releaseMoFields,
  reserveMoFields,
} from "./production-forms";

const MFG = "/admin/manufacturing";

type MoResponse = {
  manufacturing_order: Row;
  requirements: Row[];
  batches: Row[];
  bundles: Row[];
};

const MATERIAL_STEP = new Set(["PLANNED", "MATERIAL_CHECK"]);
const HOLDABLE = new Set([
  "PLANNED",
  "MATERIAL_CHECK",
  "MATERIAL_RESERVED",
  "RELEASED",
  "IN_PROGRESS",
  "QC_PENDING",
  "PACKING",
]);
const SHOP_FLOOR = new Set([
  "RELEASED",
  "IN_PROGRESS",
  "QC_PENDING",
  "PACKING",
  "PARTIALLY_COMPLETED",
]);
const CANCELLABLE = new Set([
  "DRAFT",
  "PLANNED",
  "MATERIAL_CHECK",
  "MATERIAL_RESERVED",
  "RELEASED",
  "ON_HOLD",
]);

/**
 * Buttons valid for the MO status (the API stays the authority; this only
 * hides commands that cannot succeed).
 */
const MoActions = ({
  id,
  status,
  batches,
  rolls,
}: {
  id: string;
  status: string;
  batches: Row[];
  rolls: Row[];
}) => {
  const url = `${MFG}/mos/${id}`;
  return (
    <>
      {MATERIAL_STEP.has(status) ? (
        <ConfirmActionButton
          endpoint={`${url}/check-material`}
          label="Check material"
          prompt="Check material availability for this order?"
        />
      ) : null}
      {status === "MATERIAL_CHECK" ? (
        <ActionDrawer
          endpoint={`${url}/reserve`}
          fields={reserveMoFields}
          label="Reserve material"
          submitLabel="Reserve"
        />
      ) : null}
      {status === "MATERIAL_RESERVED" ? (
        <ActionDrawer
          endpoint={`${url}/release`}
          fields={releaseMoFields}
          label="Release"
          submitLabel="Release to shop floor"
          variant="primary"
        />
      ) : null}
      {HOLDABLE.has(status) ? (
        <ActionDrawer
          endpoint={`${url}/hold`}
          fields={holdFields}
          label="Hold"
          submitLabel="Put on hold"
        />
      ) : null}
      {status === "ON_HOLD" ? (
        <ConfirmActionButton
          endpoint={`${url}/resume`}
          label="Resume"
          prompt="Resume this order from where it was held?"
          variant="primary"
        />
      ) : null}
      {SHOP_FLOOR.has(status) ? (
        <>
          <ActionDrawer
            endpoint={`${url}/issue`}
            fields={issueFabricFields}
            label="Issue fabric"
            submitLabel="Issue"
          />
          <ActionDrawer
            description="Plan which reserved rolls are laid and the size ratio of each lay."
            endpoint={`${url}/cut-plan`}
            fields={cutPlanFields(batches, rolls)}
            label="Cut plan"
            submitLabel="Save cut plan"
          />
          <ActionDrawer
            description="Record the actual fabric used and the bundles produced."
            endpoint={`${url}/cut`}
            fields={completeCutFields(batches)}
            label="Cut"
            submitLabel="Complete cut"
          />
        </>
      ) : null}
      {status === "PARTIALLY_COMPLETED" ? (
        <ActionDrawer
          endpoint={`${url}/short-close`}
          fields={holdFields}
          label="Short-close"
          submitLabel="Short-close"
        />
      ) : null}
      {CANCELLABLE.has(status) ? (
        <ActionDrawer
          endpoint={`${url}/cancel`}
          fields={holdFields}
          label="Cancel order"
          submitLabel="Cancel order"
          variant="danger"
        />
      ) : null}
    </>
  );
};

export const MoDetail = ({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) => {
  const order = useErpQuery<MoResponse>(`${MFG}/mos/${id}`);
  const rolls = useErpQuery<{ rolls: Row[] }>(`${MFG}/mos/${id}/rolls`);

  return (
    <div className="flex flex-col divide-y">
      <BackBar label="manufacturing orders" onBack={onBack} />
      <QueryBoundary query={order}>
        {({ manufacturing_order: mo, requirements, batches, bundles }) => (
          <>
            <DetailSection
              actions={
                <MoActions
                  batches={batches}
                  id={id}
                  rolls={rolls.data?.rolls ?? []}
                  status={String(mo.status)}
                />
              }
              title={tr("Manufacturing order {number}", {
                number: String(mo.mo_number),
              })}
            >
              <KeyValueGrid columns={moHeaderColumns} row={mo} />
            </DetailSection>
            <DetailSection title="Material requirements">
              <MiniTable
                columns={requirementColumns}
                label={tr("Material requirements")}
                rows={requirements}
              />
            </DetailSection>
            <DetailSection title="Production batches">
              <MiniTable
                columns={batchColumns}
                label={tr("Production batches")}
                rows={batches}
              />
            </DetailSection>
            <DetailSection title="Bundles">
              <MiniTable
                columns={bundleColumns}
                empty={tr(
                  "No bundles yet. They are created when a batch is cut."
                )}
                label={tr("Bundles")}
                renderRowActions={(row) => (
                  <LabelButton
                    label={tr("Print ticket")}
                    path={`${MFG}/bundles/by-code/${encodeURIComponent(String(row.bundle_code))}/label`}
                    title={tr("Bundle ticket {code}", {
                      code: String(row.bundle_code),
                    })}
                  />
                )}
                rows={bundles}
              />
            </DetailSection>
          </>
        )}
      </QueryBoundary>
      <DetailSection title="Rolls reserved for this order">
        <QueryBoundary query={rolls}>
          {({ rolls: reserved }) => (
            <MiniTable
              columns={reservedRollColumns}
              empty={tr("No fabric rolls are reserved yet.")}
              label={tr("Reserved rolls")}
              rows={reserved}
            />
          )}
        </QueryBoundary>
      </DetailSection>
    </div>
  );
};
