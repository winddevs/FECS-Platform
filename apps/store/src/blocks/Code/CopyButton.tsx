"use client";
import { Button } from "@ecommerce/ui/components/button";
import { CopyIcon } from "@payloadcms/ui/icons/Copy";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function CopyButton({ code }: { code: string }) {
  const t = useTranslations("blocks.code");
  const [copied, setCopied] = useState(false);

  function updateCopyStatus() {
    if (!copied) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1000);
    }
  }

  return (
    <div className="flex justify-end align-middle">
      <Button
        className="flex gap-1"
        variant={"secondary"}
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          updateCopyStatus();
        }}
      >
        <p>{copied ? t("copied") : t("copy")}</p>
        <CopyIcon />
      </Button>
    </div>
  );
}
