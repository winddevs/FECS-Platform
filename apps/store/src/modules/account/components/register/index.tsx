"use client";

import { signup } from "@lib/data/customer";
import { LOGIN_VIEW } from "@modules/account/templates/login-template";
import ErrorMessage from "@modules/checkout/components/error-message";
import { SubmitButton } from "@modules/checkout/components/submit-button";
import Input from "@modules/common/components/input";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void;
};

const Register = ({ setCurrentView }: Props) => {
  const t = useTranslations("account.register");
  const tf = useTranslations("account.form");
  const [message, formAction] = useActionState(signup, null);

  return (
    <div
      className="max-w-sm flex flex-col items-center"
      data-testid="register-page"
    >
      <h1 className="text-large-semi uppercase mb-6">{t("title")}</h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">
        {t("subtitle")}
      </p>
      <form className="w-full flex flex-col" action={formAction}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label={tf("firstName")}
            name="first_name"
            required
            autoComplete="given-name"
            data-testid="first-name-input"
          />
          <Input
            label={tf("lastName")}
            name="last_name"
            required
            autoComplete="family-name"
            data-testid="last-name-input"
          />
          <Input
            label={tf("email")}
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            label={tf("phone")}
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="phone-input"
          />
          <Input
            label={tf("password")}
            name="password"
            required
            type="password"
            autoComplete="new-password"
            data-testid="password-input"
          />
        </div>
        <ErrorMessage error={message} data-testid="register-error" />
        <span className="text-center text-ui-fg-base text-small-regular mt-6">
          {t.rich("agree", {
            privacy: (chunks) => (
              <LocalizedClientLink
                href="/content/privacy-policy"
                className="underline"
              >
                {chunks}
              </LocalizedClientLink>
            ),
            terms: (chunks) => (
              <LocalizedClientLink
                href="/content/terms-of-use"
                className="underline"
              >
                {chunks}
              </LocalizedClientLink>
            ),
          })}
        </span>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          {t("submit")}
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        {t("alreadyMember")}{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
        >
          {t("signIn")}
        </button>
        .
      </span>
    </div>
  );
};

export default Register;
