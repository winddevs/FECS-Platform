import { ActionDrawer } from "../../lib/erp/action-drawer";
import type { FieldConfig, FormValues } from "../../lib/erp/form-fields";
import { ResourceTable } from "../../lib/erp/resource-table";
import type { ResourceConfig, Row } from "../../lib/erp/resource-types";

const ENDPOINT = "/admin/country-profiles";

const countryProfilesList: ResourceConfig = {
  id: "country-profiles",
  title: "Country profiles",
  endpoint: ENDPOINT,
  responseKey: "country_profiles",
  rowKey: "country_code",
  columns: [
    { key: "country_code", label: "Country", kind: "code" },
    { key: "name", label: "Name" },
    { key: "currency_code", label: "Currency", kind: "code" },
    { key: "tax_region", label: "Tax region" },
    { key: "carrier_code", label: "Carrier" },
    { key: "payment_providers", label: "Payment providers", kind: "json" },
    { key: "warehouse_codes", label: "Warehouses", kind: "json" },
    {
      key: "return_window_days",
      label: "Return window (days)",
      kind: "number",
    },
    { key: "social_channels", label: "Social channels", kind: "json" },
    { key: "is_active", label: "Active", kind: "boolean" },
  ],
};

const profileFields: readonly FieldConfig[] = [
  {
    name: "country_code",
    label: "Country code (2 letters)",
    required: true,
    placeholder: "VN",
  },
  { name: "name", label: "Name", required: true },
  {
    name: "currency_code",
    label: "Currency (3 letters)",
    required: true,
    placeholder: "vnd",
  },
  { name: "tax_region", label: "Tax region" },
  { name: "carrier_code", label: "Carrier code" },
  {
    name: "payment_providers",
    label: "Payment providers",
    type: "list",
    help: "Comma-separated.",
  },
  {
    name: "warehouse_codes",
    label: "Warehouse codes",
    type: "list",
    help: "Comma-separated.",
  },
  {
    name: "return_window_days",
    label: "Return window (days)",
    type: "integer",
  },
  {
    name: "social_channels",
    label: "Social channels",
    type: "list",
    help: "Comma-separated.",
  },
  { name: "legal_entity", label: "Legal entity (JSON)", type: "json" },
  { name: "is_active", label: "Active", type: "checkbox", defaultValue: true },
];

const textOf = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value);

const listOf = (value: unknown): string =>
  Array.isArray(value) ? value.join(", ") : "";

/** Row -> form state, so "Edit" opens the saved profile. */
const toFormValues = (row: Row): FormValues => ({
  country_code: textOf(row.country_code),
  name: textOf(row.name),
  currency_code: textOf(row.currency_code),
  tax_region: textOf(row.tax_region),
  carrier_code: textOf(row.carrier_code),
  payment_providers: listOf(row.payment_providers),
  warehouse_codes: listOf(row.warehouse_codes),
  return_window_days: textOf(row.return_window_days),
  social_channels: listOf(row.social_channels),
  legal_entity: row.legal_entity ? JSON.stringify(row.legal_entity) : "",
  is_active: row.is_active !== false,
});

export const CountryProfilesTab = () => (
  <ResourceTable
    config={countryProfilesList}
    renderRowActions={(row) => (
      <ActionDrawer
        description="Saving updates the profile of this country."
        endpoint={ENDPOINT}
        fields={profileFields}
        initialValues={toFormValues(row)}
        label="Edit"
        submitLabel="Save profile"
      />
    )}
    toolbar={
      <ActionDrawer
        description="Creates the profile, or updates it when the country already exists."
        endpoint={ENDPOINT}
        fields={profileFields}
        label="New country profile"
        submitLabel="Save profile"
        variant="primary"
      />
    }
  />
);
