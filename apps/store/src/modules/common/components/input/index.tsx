import { Label } from "@medusajs/ui";
import Eye from "@modules/common/icons/eye";
import EyeOff from "@modules/common/icons/eye-off";
import { useTranslations } from "next-intl";
import React, { useEffect, useImperativeHandle, useState } from "react";

type InputProps = Omit<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
  "placeholder"
> & {
  label: string;
  errors?: Record<string, unknown>;
  touched?: Record<string, unknown>;
  name: string;
  topLabel?: string;
};

// Upper bound for any text field. The server re-checks; this keeps honest
// users from pasting megabytes and gives the browser a limit to enforce.
const DEFAULT_MAX_LENGTH = 255;

// Types where autocorrect / auto-capitalize would corrupt the value.
const RAW_TYPES = new Set(["email", "password", "url"]);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ type, name, label, touched, required, topLabel, ...props }, ref) => {
    const t = useTranslations("common.input");
    const generatedId = React.useId();
    const inputId = props.id ?? generatedId;
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [inputType, setInputType] = useState(type);

    useEffect(() => {
      if (type === "password" && showPassword) {
        setInputType("text");
      }

      if (type === "password" && !showPassword) {
        setInputType("password");
      }
    }, [type, showPassword]);

    useImperativeHandle(ref, () => inputRef.current!);

    return (
      <div className="flex flex-col w-full">
        {topLabel && (
          <Label className="mb-2 txt-compact-medium-plus">{topLabel}</Label>
        )}
        <div className="flex relative z-0 w-full txt-compact-medium">
          <input
            type={inputType}
            name={name}
            placeholder=" "
            required={required}
            maxLength={DEFAULT_MAX_LENGTH}
            autoCapitalize={RAW_TYPES.has(type ?? "") ? "none" : undefined}
            autoCorrect={RAW_TYPES.has(type ?? "") ? "off" : undefined}
            spellCheck={RAW_TYPES.has(type ?? "") ? false : undefined}
            className="pt-4 pb-1 block w-full h-11 px-4 mt-0 bg-ui-bg-field border rounded-md appearance-none focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active border-ui-border-base hover:bg-ui-bg-field-hover"
            {...props}
            id={inputId}
            ref={inputRef}
          />
          <label
            htmlFor={inputId}
            className="pointer-events-none absolute top-3 z-[1] mx-3 flex origin-left items-center justify-center px-1 text-ui-fg-subtle transition-all duration-300"
          >
            {label}
            {required && <span className="text-rose-500">*</span>}
          </label>
          {type === "password" && (
            <button
              type="button"
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              onClick={() => setShowPassword(!showPassword)}
              className="text-ui-fg-subtle px-4 min-h-11 flex items-center transition-colors duration-150 outline-none focus:text-ui-fg-base absolute right-0 top-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive"
            >
              {showPassword ? <Eye /> : <EyeOff />}
            </button>
          )}
        </div>
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
