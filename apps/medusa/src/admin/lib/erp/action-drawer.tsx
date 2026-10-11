import { Button } from "@medusajs/ui";
import { useState } from "react";

import type { WriteMethod } from "./api";
import { FormFields } from "./field-inputs";
import { FormDrawer } from "./form-drawer";
import {
  type FieldConfig,
  type FormErrors,
  type FormValue,
  type FormValues,
  buildInitialValues,
  serializeValues,
} from "./form-fields";
import { useErpCommand } from "./use-erp";

type ActionDrawerProps = {
  /** Trigger button text. */
  label: string;
  /** Drawer title (defaults to the label). */
  title?: string;
  description?: string;
  endpoint: string;
  method?: Exclude<WriteMethod, "DELETE">;
  fields: readonly FieldConfig[];
  /** Pre-filled values, e.g. from the row the action belongs to. */
  initialValues?: FormValues;
  /** Merge fixed values into the validated body before sending. */
  extraBody?: Record<string, unknown>;
  submitLabel?: string;
  successMessage?: string;
  variant?: "primary" | "secondary" | "transparent" | "danger";
  disabled?: boolean;
  onSuccess?: (result: unknown) => void;
};

/**
 * A button that opens a drawer with a declarative form and sends the result
 * as one command. This is the single way screens create/act on records.
 */
export const ActionDrawer = ({
  label,
  title,
  description,
  endpoint,
  method = "POST",
  fields,
  initialValues,
  extraBody,
  submitLabel,
  successMessage,
  variant = "secondary",
  disabled,
  onSuccess,
}: ActionDrawerProps) => {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<FormErrors>({});

  const command = useErpCommand({
    endpoint,
    method,
    successMessage: successMessage ?? `${label} done`,
    onSuccess: (result) => {
      setOpen(false);
      onSuccess?.(result);
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setValues(buildInitialValues(fields, initialValues));
      setErrors({});
    }
    setOpen(next);
  };

  const handleChange = (name: string, value: FormValue) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const handleSubmit = () => {
    const result = serializeValues(fields, values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    command.mutate({ ...result.body, ...extraBody });
  };

  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
        size="small"
        variant={variant}
      >
        {label}
      </Button>
      <FormDrawer
        description={description}
        isPending={command.isPending}
        onOpenChange={handleOpenChange}
        onSubmit={handleSubmit}
        open={open}
        submitLabel={submitLabel ?? "Submit"}
        title={title ?? label}
      >
        <FormFields
          errors={errors}
          fields={fields}
          idPrefix={`action-${endpoint}`}
          onChange={handleChange}
          values={values}
        />
      </FormDrawer>
    </>
  );
};
