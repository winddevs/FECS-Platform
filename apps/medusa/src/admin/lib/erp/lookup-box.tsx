import { Button, Input, Label } from "@medusajs/ui";
import { useId, useState } from "react";

/**
 * Single input for a barcode scanner (it types the code and presses Enter) or
 * for manual entry. Calls `onLookup` with the trimmed code.
 */
export const LookupBox = ({
  label,
  placeholder,
  onLookup,
  isLoading = false,
}: {
  label: string;
  placeholder?: string;
  onLookup: (code: string) => void;
  isLoading?: boolean;
}) => {
  const [code, setCode] = useState("");
  const id = useId();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = code.trim();
        if (trimmed) {
          onLookup(trimmed);
        }
      }}
    >
      <div className="flex w-72 flex-col gap-y-1">
        <Label htmlFor={id} size="small" weight="plus">
          {label}
        </Label>
        <Input
          autoComplete="off"
          id={id}
          onChange={(event) => setCode(event.target.value)}
          placeholder={placeholder}
          size="small"
          value={code}
        />
      </div>
      <Button
        disabled={code.trim() === ""}
        isLoading={isLoading}
        size="small"
        type="submit"
      >
        Look up
      </Button>
    </form>
  );
};
