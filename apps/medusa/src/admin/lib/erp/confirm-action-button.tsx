import { Button, Label, Prompt, Textarea } from "@medusajs/ui";
import { useId, useState } from "react";

import type { WriteMethod } from "./api";
import { useErpCommand } from "./use-erp";

type ReasonConfig = {
  /** Body property that carries the text (defaults to `reason`). */
  field?: string;
  label?: string;
  required?: boolean;
};

type ConfirmActionButtonProps = {
  label: string;
  /** Question shown in the confirmation dialog. */
  prompt: string;
  endpoint: string;
  method?: WriteMethod;
  /** Fixed body sent with the command. */
  body?: Record<string, unknown>;
  /** Ask the operator for a reason/note and send it with the command. */
  reason?: ReasonConfig;
  danger?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "transparent" | "danger";
  successMessage?: string;
  onSuccess?: (result: unknown) => void;
};

/** Button + confirmation dialog (+ optional reason) for one-click commands. */
export const ConfirmActionButton = ({
  label,
  prompt,
  endpoint,
  method = "POST",
  body,
  reason,
  danger = false,
  disabled,
  variant = "secondary",
  successMessage,
  onSuccess,
}: ConfirmActionButtonProps) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const reasonId = useId();

  const command = useErpCommand({
    endpoint,
    method,
    successMessage: successMessage ?? `${label} done`,
    onSuccess: (result) => {
      setOpen(false);
      setText("");
      onSuccess?.(result);
    },
  });

  const reasonMissing = Boolean(reason?.required) && text.trim() === "";

  const handleConfirm = () => {
    const payload: Record<string, unknown> = { ...body };
    if (reason && text.trim() !== "") {
      payload[reason.field ?? "reason"] = text.trim();
    }
    command.mutate(payload);
  };

  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="small"
        variant={danger ? "danger" : variant}
      >
        {label}
      </Button>
      <Prompt
        onOpenChange={(next) => !command.isPending && setOpen(next)}
        open={open}
        variant={danger ? "danger" : "confirmation"}
      >
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>{label}</Prompt.Title>
            <Prompt.Description>{prompt}</Prompt.Description>
          </Prompt.Header>
          {reason ? (
            <div className="flex flex-col gap-y-1 px-6 pb-4">
              <Label htmlFor={reasonId} size="small" weight="plus">
                {reason.label ?? "Reason"}
                {reason.required ? " *" : ""}
              </Label>
              <Textarea
                id={reasonId}
                onChange={(event) => setText(event.target.value)}
                rows={3}
                value={text}
              />
            </div>
          ) : null}
          <Prompt.Footer>
            <Prompt.Cancel disabled={command.isPending}>Cancel</Prompt.Cancel>
            <Prompt.Action
              disabled={command.isPending || reasonMissing}
              onClick={(event) => {
                // Keep the dialog open until the command has finished.
                event.preventDefault();
                handleConfirm();
              }}
            >
              {command.isPending ? "Working..." : "Confirm"}
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </>
  );
};
