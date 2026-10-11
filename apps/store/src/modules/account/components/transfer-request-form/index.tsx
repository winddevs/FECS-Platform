"use client";

import { createTransferRequest } from "@lib/data/orders";
import { CheckCircleMiniSolid, XCircleSolid } from "@medusajs/icons";
import {
  Text,
  Heading,
  Input,
  Button,
  IconButton,
  Toaster,
} from "@medusajs/ui";
import { SubmitButton } from "@modules/checkout/components/submit-button";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useEffect, useState } from "react";

export default function TransferRequestForm() {
  const t = useTranslations("account.transfer");
  const [showSuccess, setShowSuccess] = useState(false);

  const [state, formAction] = useActionState(createTransferRequest, {
    success: false,
    error: null,
    order: null,
  });

  useEffect(() => {
    if (state.success && state.order) {
      setShowSuccess(true);
    }
  }, [state.success, state.order]);

  return (
    <div className="flex flex-col gap-y-4 w-full">
      <div className="grid sm:grid-cols-2 items-center gap-x-8 gap-y-4 w-full">
        <div className="flex flex-col gap-y-1">
          <Heading level="h3" className="text-lg text-neutral-950">
            {t("title")}
          </Heading>
          <Text className="text-base-regular text-neutral-500">
            {t("descriptionLine1")}
            <br /> {t("descriptionLine2")}
          </Text>
        </div>
        <form
          action={formAction}
          className="flex flex-col gap-y-1 sm:items-end"
        >
          <div className="flex flex-col gap-y-2 w-full">
            <Input
              className="w-full"
              name="order_id"
              placeholder={t("orderIdPlaceholder")}
              aria-label={t("orderIdPlaceholder")}
            />
            <SubmitButton
              variant="secondary"
              className="w-fit whitespace-nowrap self-end"
            >
              {t("submit")}
            </SubmitButton>
          </div>
        </form>
      </div>
      {!state.success && state.error && (
        <Text className="text-base-regular text-rose-500 text-right">
          {state.error}
        </Text>
      )}
      {showSuccess && (
        <div className="flex justify-between p-4 bg-neutral-50 shadow-borders-base w-full self-stretch items-center">
          <div className="flex gap-x-2 items-center">
            <CheckCircleMiniSolid className="w-4 h-4 text-emerald-500" />
            <div className="flex flex-col gap-y-1">
              <Text className="text-medim-pl text-neutral-950">
                {t("requested", { orderId: state.order?.id ?? "" })}
              </Text>
              <Text className="text-base-regular text-neutral-600">
                {t("emailSent", { email: state.order?.email ?? "" })}
              </Text>
            </div>
          </div>
          <IconButton
            variant="transparent"
            className="h-fit"
            onClick={() => setShowSuccess(false)}
            aria-label={t("dismiss")}
          >
            <XCircleSolid className="w-4 h-4 text-neutral-500" />
          </IconButton>
        </div>
      )}
    </div>
  );
}
