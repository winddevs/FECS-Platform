import { Input, Label } from "@medusajs/ui";
import { useId, useState } from "react";

import { ActionDrawer } from "../../lib/erp/action-drawer";
import { ConfirmActionButton } from "../../lib/erp/confirm-action-button";
import { ViewSwitch } from "../../lib/erp/page-shell";
import { ResourceTable } from "../../lib/erp/resource-table";
import {
  bomFields,
  bomHeaderColumns,
  bomLineColumns,
  bomsList,
  materialParamFields,
  mrpRunFields,
  mrpRunsList,
  mrpSuggestionsList,
  routingFields,
  routingHeaderColumns,
  routingOperationColumns,
  routingsList,
  skuParamFields,
  skuParamsList,
  workCenterFields,
  workCenterLoadList,
  workCentersList,
} from "./planning-config";
import { type VersionedDocConfig, VersionedDocTab } from "./versioned-doc-tab";

const MFG = "/admin/manufacturing";

const BOM_DOC: VersionedDocConfig = {
  label: "BOM",
  list: bomsList,
  base: `${MFG}/boms`,
  docKey: "bom",
  childKey: "lines",
  childTitle: "Components",
  headerColumns: bomHeaderColumns,
  childColumns: bomLineColumns,
  createFields: bomFields,
};

const ROUTING_DOC: VersionedDocConfig = {
  label: "routing",
  list: routingsList,
  base: `${MFG}/routings`,
  docKey: "routing",
  childKey: "operations",
  childTitle: "Operations",
  headerColumns: routingHeaderColumns,
  childColumns: routingOperationColumns,
  createFields: routingFields,
};

export const BomTab = () => <VersionedDocTab doc={BOM_DOC} />;
export const RoutingTab = () => <VersionedDocTab doc={ROUTING_DOC} />;

const SuggestionsView = () => (
  <ResourceTable
    config={mrpSuggestionsList}
    renderRowActions={(row) =>
      row.status === "PENDING" ? (
        <>
          <ConfirmActionButton
            body={{ decision: "APPROVED" }}
            endpoint={`${MFG}/mrp/suggestions/${String(row.id)}/decide`}
            label="Approve"
            prompt="Approve this suggestion?"
            variant="primary"
          />
          <ConfirmActionButton
            body={{ decision: "REJECTED" }}
            danger
            endpoint={`${MFG}/mrp/suggestions/${String(row.id)}/decide`}
            label="Reject"
            prompt="Reject this suggestion?"
          />
        </>
      ) : null
    }
  />
);

export const MrpTab = () => (
  <ViewSwitch
    views={[
      {
        value: "suggestions",
        label: "Suggestions",
        content: <SuggestionsView />,
      },
      {
        value: "runs",
        label: "Runs",
        content: (
          <ResourceTable
            config={mrpRunsList}
            toolbar={
              <ActionDrawer
                description="Calculates net requirements and creates purchase, transfer and production suggestions."
                endpoint={`${MFG}/mrp/runs`}
                fields={mrpRunFields}
                label="Run MRP"
                submitLabel="Run"
                variant="primary"
              />
            }
          />
        ),
      },
    ]}
  />
);

export const ParamsTab = () => (
  <ResourceTable
    config={skuParamsList}
    toolbar={
      <>
        <ActionDrawer
          endpoint={`${MFG}/planning-params`}
          fields={materialParamFields}
          label="Set material parameters"
          submitLabel="Save"
        />
        <ActionDrawer
          endpoint={`${MFG}/planning-params/skus`}
          fields={skuParamFields}
          label="Set SKU reorder rule"
          submitLabel="Save"
          variant="primary"
        />
      </>
    }
  />
);

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const LoadView = () => {
  const [date, setDate] = useState(todayIso);
  const id = useId();
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-y-1 px-6 pt-4">
        <Label htmlFor={id} size="small" weight="plus">
          Load for day (UTC)
        </Label>
        <div className="w-48">
          <Input
            id={id}
            onChange={(event) => setDate(event.target.value)}
            size="small"
            type="date"
            value={date}
          />
        </div>
      </div>
      <ResourceTable config={workCenterLoadList} fixedQuery={{ date }} />
    </div>
  );
};

export const WorkCentersTab = () => (
  <ViewSwitch
    views={[
      {
        value: "load",
        label: "Load",
        content: <LoadView />,
      },
      {
        value: "centers",
        label: "Work centers",
        content: (
          <ResourceTable
            config={workCentersList}
            toolbar={
              <ActionDrawer
                endpoint={`${MFG}/work-centers`}
                fields={workCenterFields}
                label="New work center"
                submitLabel="Create"
                variant="primary"
              />
            }
          />
        ),
      },
    ]}
  />
);
