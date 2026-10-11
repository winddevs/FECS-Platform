import { tr } from "../i18n";

/** Loading indicator (@medusajs/ui has no Spinner export in this version). */
/** `label` must already be translated; the default is translated here. */
export const Spinner = ({ label }: { label?: string }) => (
  <output aria-label={label ?? tr("Loading")} className="inline-flex">
    <svg
      aria-hidden="true"
      className="size-5 animate-spin text-ui-fg-muted"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 0 1 8-8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg>
  </output>
);
