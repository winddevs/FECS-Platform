import { Button, Drawer } from "@medusajs/ui";
import type { FormEvent, ReactNode } from "react";

import { tr } from "../i18n";

type FormDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel?: string;
  isPending?: boolean;
  onSubmit: () => void;
  children: ReactNode;
};

/**
 * Side drawer wrapping a <form>: Enter submits, the submit button shows the
 * pending state and every control is blocked while a command is in flight.
 */
export const FormDrawer = ({
  open,
  onOpenChange,
  title,
  description,
  submitLabel = "Save",
  isPending = false,
  onSubmit,
  children,
}: FormDrawerProps) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isPending) {
      onSubmit();
    }
  };

  return (
    <Drawer onOpenChange={onOpenChange} open={open}>
      <Drawer.Content className="max-w-xl">
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={handleSubmit}
        >
          <Drawer.Header>
            <Drawer.Title>{tr(title)}</Drawer.Title>
            {description ? (
              <Drawer.Description>{tr(description)}</Drawer.Description>
            ) : null}
          </Drawer.Header>
          <Drawer.Body className="flex-1 overflow-y-auto p-4">
            <fieldset className="contents" disabled={isPending}>
              {children}
            </fieldset>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button disabled={isPending} size="small" variant="secondary">
                {tr("Cancel")}
              </Button>
            </Drawer.Close>
            <Button isLoading={isPending} size="small" type="submit">
              {tr(submitLabel)}
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  );
};
