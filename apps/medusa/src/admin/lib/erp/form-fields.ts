import { tr, trStatus } from "../i18n";
import { newId } from "./id";
import type { RefKind } from "./refs";

/**
 * Declarative form model. A screen describes a command as a list of
 * FieldConfig; initial state and the request body are derived from it, so
 * forms never need bespoke state code.
 */
export type FieldOption = string | { value: string; label: string };

export type FieldType =
  | "text"
  | "number"
  | "integer"
  | "textarea"
  | "select"
  /** Free text with suggestions from a master list; value is the id. */
  | "lookup"
  | "checkbox"
  | "json"
  /** Comma-separated values sent as a string array. */
  | "list"
  | "datetime"
  | "lines"
  /** Nested object made of `fields` (e.g. `lot: { lot_no, ... }`). */
  | "group";

export type FieldConfig = {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: readonly FieldOption[];
  /** Master list that feeds a `lookup` field. */
  ref?: RefKind;
  /** Sub-fields of a `lines` row or a `group` object. */
  fields?: readonly FieldConfig[];
  help?: string;
  placeholder?: string;
  defaultValue?: string | boolean;
};

export type FormValue = string | boolean | FormValues[] | FormValues;
export type FormValues = { [name: string]: FormValue };
export type FormErrors = Record<string, string>;

export type SerializeResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; errors: FormErrors };

export const NONE_OPTION = "__none__";

const emptyValue = (field: FieldConfig): FormValue => {
  if (field.type === "checkbox") {
    return field.defaultValue === true;
  }
  if (field.type === "lines") {
    return field.required ? [buildInitialValues(field.fields ?? [])] : [];
  }
  if (field.type === "group") {
    return buildInitialValues(field.fields ?? []);
  }
  return typeof field.defaultValue === "string" ? field.defaultValue : "";
};

/** Hidden per-row identity so repeated rows keep their state when others move. */
export const ROW_KEY = "_key";

export const buildInitialValues = (
  fields: readonly FieldConfig[],
  overrides: FormValues = {}
): FormValues => {
  const values: FormValues = { [ROW_KEY]: newId() };
  for (const field of fields) {
    values[field.name] = overrides[field.name] ?? emptyValue(field);
  }
  return values;
};

export const optionValue = (option: FieldOption): string =>
  typeof option === "string" ? option : option.value;

const ENUM_CODE = /^[A-Z0-9_]+$/;

/** Display text of an option: enum codes via trStatus, other text via tr. */
export const optionLabel = (option: FieldOption): string => {
  if (typeof option !== "string") {
    return tr(option.label);
  }
  return ENUM_CODE.test(option) ? trStatus(option) : tr(option);
};

const parseNumber = (
  field: FieldConfig,
  raw: string
): { value?: number; error?: string } => {
  const parsed = Number(raw);
  const label = tr(field.label);
  if (!Number.isFinite(parsed)) {
    return { error: tr("{label} must be a number", { label }) };
  }
  if (field.type === "integer" && !Number.isInteger(parsed)) {
    return { error: tr("{label} must be a whole number", { label }) };
  }
  return { value: parsed };
};

type Parsed = { skip?: boolean; value?: unknown; error?: string };

const parseScalar = (field: FieldConfig, raw: string): Parsed => {
  const text = raw.trim();
  const label = tr(field.label);
  if (text === "" || text === NONE_OPTION) {
    return field.required
      ? { error: tr("{label} is required", { label }) }
      : { skip: true };
  }
  switch (field.type) {
    case "number":
    case "integer": {
      const result = parseNumber(field, text);
      return result.error ? { error: result.error } : { value: result.value };
    }
    case "list": {
      const items = text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return items.length === 0
        ? {
            skip: !field.required,
            error: field.required
              ? tr("{label} is required", { label })
              : undefined,
          }
        : { value: items };
    }
    case "json":
      try {
        return { value: JSON.parse(text) as unknown };
      } catch {
        return { error: tr("{label} must be valid JSON", { label }) };
      }
    case "datetime": {
      const date = new Date(text);
      return Number.isNaN(date.getTime())
        ? { error: tr("{label} is not a valid date", { label }) }
        : { value: date.toISOString() };
    }
    default:
      return { value: text };
  }
};

const parseLines = (field: FieldConfig, rows: FormValues[]): Parsed => {
  if (rows.length === 0) {
    return field.required
      ? {
          error: tr("Add at least one {label} row", {
            label: tr(field.label).toLowerCase(),
          }),
        }
      : { skip: true };
  }
  const bodies: Record<string, unknown>[] = [];
  for (const [index, row] of rows.entries()) {
    const result = serializeValues(field.fields ?? [], row);
    if (!result.ok) {
      const first = Object.values(result.errors)[0];
      return {
        error: tr("{label}, row {row}: {message}", {
          label: tr(field.label),
          row: index + 1,
          message: first ?? "",
        }),
      };
    }
    bodies.push(result.body);
  }
  return { value: bodies };
};

const parseGroup = (field: FieldConfig, value: FormValues): Parsed => {
  const result = serializeValues(field.fields ?? [], value);
  if (!result.ok) {
    const first = Object.values(result.errors)[0];
    return {
      error: tr("{label}: {message}", {
        label: tr(field.label),
        message: first ?? "",
      }),
    };
  }
  return Object.keys(result.body).length === 0 && !field.required
    ? { skip: true }
    : { value: result.body };
};

const isFormValues = (value: FormValue | undefined): value is FormValues =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseField = (
  field: FieldConfig,
  value: FormValue | undefined
): Parsed => {
  if (field.type === "checkbox") {
    return { value: value === true };
  }
  if (field.type === "lines") {
    return parseLines(field, Array.isArray(value) ? value : []);
  }
  if (field.type === "group") {
    return parseGroup(field, isFormValues(value) ? value : {});
  }
  return parseScalar(field, typeof value === "string" ? value : "");
};

/** Validates the form and builds the request body (empty optionals omitted). */
export const serializeValues = (
  fields: readonly FieldConfig[],
  values: FormValues
): SerializeResult => {
  const body: Record<string, unknown> = {};
  const errors: FormErrors = {};
  for (const field of fields) {
    const parsed = parseField(field, values[field.name]);
    if (parsed.error) {
      errors[field.name] = parsed.error;
    } else if (!parsed.skip) {
      body[field.name] = parsed.value;
    }
  }
  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, body };
};
