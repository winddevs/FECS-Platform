"use client";
import { Button } from "@ecommerce/ui/components/button";
import type {
  FormFieldBlock,
  Form as FormType,
} from "@payloadcms/plugin-form-builder/types";
import type { DefaultTypedEditorState } from "@payloadcms/richtext-lexical";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import { FCaptchaField } from "@/components/FCaptchaField";
import RichText from "@/components/RichText";
import { CAPTCHA_ERROR_CODE, CAPTCHA_HEADER } from "@/lib/captcha/constants";
import { getClientSideURL } from "@/utilities/getURL";
import { safeRedirectTarget } from "@/utilities/safeRedirect";

import { fields } from "./fields";

export type FormBlockType = {
  blockName?: string;
  blockType?: "formBlock";
  enableIntro: boolean;
  form: FormType;
  introContent?: SerializedEditorState;
};

export const FormBlock: React.FC<
  {
    id?: string;
  } & FormBlockType
> = (props) => {
  const {
    enableIntro,
    form: formFromProps,
    form: {
      id: formID,
      confirmationMessage,
      confirmationType,
      redirect,
      submitButtonLabel,
    } = {},
    introContent,
  } = props;

  const formMethods = useForm({
    defaultValues: formFromProps.fields,
  });
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = formMethods;

  const [isLoading, setIsLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>();
  const [error, setError] = useState<
    { message: string; status?: string } | undefined
  >();
  const router = useRouter();
  const t = useTranslations();
  const tErrors = useTranslations("errors");

  const onSubmit = useCallback(
    (data: FormFieldBlock[]) => {
      let loadingTimerID: ReturnType<typeof setTimeout>;
      const submitForm = async () => {
        setError(undefined);

        const dataToSend = Object.entries(data).map(([name, value]) => ({
          field: name,
          value,
        }));

        // delay loading indicator by 1s
        loadingTimerID = setTimeout(() => {
          setIsLoading(true);
        }, 1000);

        try {
          const req = await fetch(
            `${getClientSideURL()}/api/form-submissions`,
            {
              body: JSON.stringify({
                form: formID,
                submissionData: dataToSend,
              }),
              headers: {
                "Content-Type": "application/json",
                // Verified by Payload before the submission is stored.
                ...(captchaToken ? { [CAPTCHA_HEADER]: captchaToken } : {}),
              },
              method: "POST",
            }
          );

          const res = await req.json();

          clearTimeout(loadingTimerID);

          if (req.status >= 400) {
            setIsLoading(false);

            const errorData = res.errors?.[0]?.data;
            const isCaptchaError = errorData?.code === CAPTCHA_ERROR_CODE;
            const captchaMessage =
              errorData?.reason === "unavailable"
                ? tErrors("captchaUnavailable")
                : tErrors("captchaFailed");
            setError({
              message: isCaptchaError
                ? captchaMessage
                : res.errors?.[0]?.message || tErrors("server"),
              status: res.status,
            });

            return;
          }

          setIsLoading(false);
          setHasSubmitted(true);

          if (confirmationType === "redirect" && redirect) {
            // The URL is CMS content; only follow it when it stays on this site.
            const redirectUrl = safeRedirectTarget(redirect.url);

            if (redirectUrl) router.push(redirectUrl);
          }
        } catch (err) {
          console.warn(err);
          setIsLoading(false);
          setError({
            message: tErrors("generic"),
          });
        } finally {
          // A token works once, so the visitor verifies again for the next try.
          setAttempts((count) => count + 1);
        }
      };

      void submitForm();
    },
    [router, formID, redirect, confirmationType, tErrors, captchaToken]
  );

  return (
    <div className="container lg:max-w-[48rem]">
      {enableIntro && introContent && !hasSubmitted && (
        <RichText
          className="mb-8 lg:mb-12"
          data={introContent as DefaultTypedEditorState}
          enableGutter={false}
        />
      )}
      <div className="fading-border p-4 lg:p-6">
        <FormProvider {...formMethods}>
          {!isLoading && hasSubmitted && confirmationType === "message" && (
            <RichText data={confirmationMessage as DefaultTypedEditorState} />
          )}
          {isLoading && !hasSubmitted && <p>{t("loading")}</p>}
          {error && (
            <div>{`${error.status || "500"}: ${error.message || ""}`}</div>
          )}
          {!hasSubmitted && (
            <form id={formID} onSubmit={handleSubmit(onSubmit)}>
              <div className="mb-4 last:mb-0">
                {formFromProps &&
                  formFromProps.fields &&
                  formFromProps.fields?.map((field, index) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const Field: React.FC<any> =
                      fields?.[field.blockType as keyof typeof fields];
                    if (Field) {
                      return (
                        <div className="mb-6 last:mb-0" key={index}>
                          <Field
                            form={formFromProps}
                            {...field}
                            {...formMethods}
                            control={control}
                            errors={errors}
                            register={register}
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
              </div>

              <FCaptchaField
                onTokenChange={setCaptchaToken}
                resetSignal={attempts}
              />

              <Button
                form={formID}
                type="submit"
                variant="ghost"
                className="fading-border rounded-none"
              >
                {submitButtonLabel}
              </Button>
            </form>
          )}
        </FormProvider>
      </div>
    </div>
  );
};
