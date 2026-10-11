"use client";

import { HttpTypes } from "@medusajs/types";
import { toast } from "@medusajs/ui";
import Input from "@modules/common/components/input";
import { useTranslations } from "next-intl";
import React, { useEffect, useActionState } from "react";

import AccountInfo from "../account-info";

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer;
};

const ProfilePassword: React.FC<MyInformationProps> = ({ customer }) => {
  const t = useTranslations("account.profile");
  const [successState, setSuccessState] = React.useState(false);

  // TODO: Add support for password updates
  const updatePassword = async () => {
    toast.info(t("passwordNotImplemented"));
  };

  const clearState = () => {
    setSuccessState(false);
  };

  return (
    <form
      action={updatePassword}
      onReset={() => clearState()}
      className="w-full"
    >
      <AccountInfo
        label={t("passwordLabel")}
        currentInfo={<span>{t("passwordHidden")}</span>}
        isSuccess={successState}
        isError={false}
        errorMessage={undefined}
        clearState={clearState}
        data-testid="account-password-editor"
      >
        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t("oldPassword")}
            name="old_password"
            required
            type="password"
            data-testid="old-password-input"
          />
          <Input
            label={t("newPassword")}
            type="password"
            name="new_password"
            required
            data-testid="new-password-input"
          />
          <Input
            label={t("confirmPassword")}
            type="password"
            name="confirm_password"
            required
            data-testid="confirm-password-input"
          />
        </div>
      </AccountInfo>
    </form>
  );
};

export default ProfilePassword;
