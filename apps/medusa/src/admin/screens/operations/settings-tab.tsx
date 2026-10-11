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

const BASE = "/admin/settings";

const settingColumns: readonly ColumnConfig[] = [
  { key: "key", label: "Setting", kind: "code" },
  { key: "description", label: "Description" },
  { key: "scopes", label: "Can be set per", kind: "json" },
  { key: "effective", label: "Effective value", kind: "json" },
  { key: "overrides", label: "Overrides", kind: "json" },
];

const settingsList: ResourceConfig = {
  id: "settings",
  title: "Platform settings",
  description: "Click a setting to change it or clear an override.",
  endpoint: BASE,
  responseKey: "settings",
  rowKey: "key",
  columns: settingColumns,
};

const overrideColumns: readonly ColumnConfig[] = [
  { key: "scope_type", label: "Scope" },
  { key: "scope_id", label: "Scope id", kind: "code" },
  { key: "value", label: "Value", kind: "json" },
  { key: "updated_by", label: "Updated by", kind: "code" },
];

const settingFields = (scopes: readonly string[]): FieldConfig[] => [
  {
    name: "scope_type",
    label: "Scope",
    type: "select",
    required: true,
    options: scopes.length > 0 ? scopes : ["GLOBAL"],
    defaultValue: "GLOBAL",
  },
  {
    name: "scope_id",
    label: "Scope id",
    help: "Country code or warehouse code. Leave empty for GLOBAL.",
  },
  {
    name: "value",
    label: "Value (JSON)",
    type: "json",
    required: true,
    help: 'Numbers and booleans as is, text in quotes, e.g. 14 or "PAID".',
  },
];

const SettingDetail = ({
  settingKey,
  onBack,
}: {
  settingKey: string;
  onBack: () => void;
}) => {
  const query = useErpQuery<{ settings: Row[] }>(BASE);
  return (
    <div className="flex flex-col divide-y">
      <BackBar label="settings" onBack={onBack} />
      <QueryBoundary query={query}>
        {({ settings }) => {
          const setting = settings.find((s) => s.key === settingKey);
          if (!setting) {
            return null;
          }
          const scopes = (setting.scopes as string[] | undefined) ?? [];
          const overrides = (setting.overrides as Row[] | undefined) ?? [];
          return (
            <>
              <DetailSection
                actions={
                  <ActionDrawer
                    endpoint={`${BASE}/${settingKey}`}
                    fields={settingFields(scopes)}
                    initialValues={{ value: JSON.stringify(setting.effective) }}
                    label="Set value"
                    method="PUT"
                    submitLabel="Save setting"
                    variant="primary"
                  />
                }
                title={settingKey}
              >
                <KeyValueGrid columns={settingColumns} row={setting} />
              </DetailSection>
              <DetailSection title="Stored overrides">
                <MiniTable
                  columns={overrideColumns}
                  empty="No stored override: the default applies."
                  label="Stored overrides"
                  renderRowActions={(row) => (
                    <ConfirmActionButton
                      danger
                      endpoint={`${BASE}/${settingKey}?scope_type=${encodeURIComponent(String(row.scope_type))}&scope_id=${encodeURIComponent(String(row.scope_id ?? ""))}`}
                      label="Clear"
                      method="DELETE"
                      prompt="Clear this override? The value falls back to the next scope or the default."
                    />
                  )}
                  rows={overrides}
                />
              </DetailSection>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
};

export const SettingsTab = () => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  if (selectedKey) {
    return (
      <SettingDetail
        onBack={() => setSelectedKey(null)}
        settingKey={selectedKey}
      />
    );
  }
  return (
    <ResourceTable
      config={settingsList}
      onRowClick={(row) => setSelectedKey(String(row.key))}
    />
  );
};
