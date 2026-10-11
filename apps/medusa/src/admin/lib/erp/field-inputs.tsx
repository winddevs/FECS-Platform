import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  Text,
  Textarea,
} from "@medusajs/ui";

import {
  type FieldConfig,
  type FormErrors,
  type FormValue,
  type FormValues,
  NONE_OPTION,
  ROW_KEY,
  buildInitialValues,
  optionLabel,
  optionValue,
} from "./form-fields";
import { useRefOptions } from "./refs";

type FormFieldsProps = {
  fields: readonly FieldConfig[];
  values: FormValues;
  errors?: FormErrors;
  idPrefix: string;
  onChange: (name: string, value: FormValue) => void;
};

type FieldInputProps = {
  field: FieldConfig;
  value: FormValue | undefined;
  error?: string;
  id: string;
  onChange: (value: FormValue) => void;
};

const asText = (value: FormValue | undefined): string =>
  typeof value === "string" ? value : "";

const inputType = (field: FieldConfig): string => {
  if (field.type === "number" || field.type === "integer") {
    return "number";
  }
  return field.type === "datetime" ? "datetime-local" : "text";
};

const SelectInput = ({ field, value, id, onChange }: FieldInputProps) => (
  <Select
    onValueChange={onChange}
    value={asText(value) === "" ? undefined : asText(value)}
  >
    <Select.Trigger id={id}>
      <Select.Value placeholder={field.placeholder ?? "Select"} />
    </Select.Trigger>
    <Select.Content>
      {field.required ? null : (
        <Select.Item value={NONE_OPTION}>None</Select.Item>
      )}
      {(field.options ?? []).map((option) => (
        <Select.Item key={optionValue(option)} value={optionValue(option)}>
          {optionLabel(option)}
        </Select.Item>
      ))}
    </Select.Content>
  </Select>
);

const LookupInput = ({ field, value, id, onChange }: FieldInputProps) => {
  const { data } = useRefOptions(field.ref ?? "material");
  const listId = `${id}-options`;
  const current = data?.find((option) => option.id === asText(value));
  return (
    <>
      <Input
        autoComplete="off"
        id={id}
        list={listId}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder ?? "Type a code or paste an id"}
        size="small"
        value={asText(value)}
      />
      <datalist id={listId}>
        {(data ?? []).map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </datalist>
      {current ? (
        <Text className="text-ui-fg-subtle" leading="compact" size="small">
          {current.label}
        </Text>
      ) : null}
    </>
  );
};

const LinesInput = ({ field, value, id, onChange }: FieldInputProps) => {
  const rows = Array.isArray(value) ? value : [];
  const subFields = field.fields ?? [];
  const updateRow = (index: number, name: string, next: FormValue) =>
    onChange(
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [name]: next } : row
      )
    );
  return (
    <div className="flex flex-col gap-y-3" id={id}>
      {rows.map((row, index) => (
        <fieldset
          className="flex flex-col gap-y-3 rounded-md border border-ui-border-base p-3"
          key={asText(row[ROW_KEY])}
        >
          <legend className="px-1">
            <Text leading="compact" size="small" weight="plus">
              {field.label} {index + 1}
            </Text>
          </legend>
          <FormFields
            fields={subFields}
            idPrefix={`${id}-${index}`}
            onChange={(name, next) => updateRow(index, name, next)}
            values={row}
          />
          <div>
            <Button
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              size="small"
              type="button"
              variant="transparent"
            >
              Remove {field.label.toLowerCase()} {index + 1}
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button
          onClick={() => onChange([...rows, buildInitialValues(subFields)])}
          size="small"
          type="button"
          variant="secondary"
        >
          Add {field.label.toLowerCase()}
        </Button>
      </div>
    </div>
  );
};

const GroupInput = ({ field, value, id, onChange }: FieldInputProps) => {
  const current: FormValues =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? value
      : {};
  return (
    <fieldset className="flex flex-col gap-y-3 rounded-md border border-ui-border-base p-3">
      <legend className="px-1">
        <Text leading="compact" size="small" weight="plus">
          {field.label}
        </Text>
      </legend>
      <FormFields
        fields={field.fields ?? []}
        idPrefix={id}
        onChange={(name, next) => onChange({ ...current, [name]: next })}
        values={current}
      />
    </fieldset>
  );
};

const CheckboxInput = ({ field, value, id, onChange }: FieldInputProps) => (
  <div className="flex items-center gap-x-2">
    <Checkbox
      checked={value === true}
      id={id}
      onCheckedChange={(checked) => onChange(checked === true)}
    />
    <Label htmlFor={id} size="small" weight="plus">
      {field.label}
    </Label>
  </div>
);

const ControlFor = (props: FieldInputProps) => {
  const { field, value, id, onChange } = props;
  switch (field.type) {
    case "select":
      return <SelectInput {...props} />;
    case "lookup":
      return <LookupInput {...props} />;
    case "lines":
      return <LinesInput {...props} />;
    case "group":
      return <GroupInput {...props} />;
    case "checkbox":
      return <CheckboxInput {...props} />;
    case "textarea":
    case "json":
      return (
        <Textarea
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={field.type === "json" ? 5 : 3}
          value={asText(value)}
        />
      );
    default:
      return (
        <Input
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          size="small"
          step={field.type === "number" ? "any" : undefined}
          type={inputType(field)}
          value={asText(value)}
        />
      );
  }
};

const FieldInput = (props: FieldInputProps) => {
  const { field, error, id } = props;
  const hasOwnLabel = field.type === "checkbox" || field.type === "group";
  return (
    <div className="flex flex-col gap-y-1">
      {hasOwnLabel ? null : (
        <Label htmlFor={id} size="small" weight="plus">
          {field.label}
          {field.required ? " *" : ""}
        </Label>
      )}
      <ControlFor {...props} />
      {field.help ? (
        <Text className="text-ui-fg-subtle" leading="compact" size="small">
          {field.help}
        </Text>
      ) : null}
      {error ? (
        <Text
          className="text-ui-fg-error"
          leading="compact"
          role="alert"
          size="small"
        >
          {error}
        </Text>
      ) : null}
    </div>
  );
};

export const FormFields = ({
  fields,
  values,
  errors,
  idPrefix,
  onChange,
}: FormFieldsProps) => (
  <div className="flex flex-col gap-y-4">
    {fields.map((field) => (
      <FieldInput
        error={errors?.[field.name]}
        field={field}
        id={`${idPrefix}-${field.name}`}
        key={field.name}
        onChange={(next) => onChange(field.name, next)}
        value={values[field.name]}
      />
    ))}
  </div>
);
