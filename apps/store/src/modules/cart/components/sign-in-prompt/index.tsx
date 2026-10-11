import { Button, Heading, Text } from "@medusajs/ui";
import LocalizedClientLink from "@modules/common/components/localized-client-link";
import { useTranslations } from "next-intl";

const SignInPrompt = () => {
  const t = useTranslations("cart.signIn");

  return (
    <div className="bg-white flex items-center justify-between">
      <div>
        <Heading level="h2" className="txt-xlarge">
          {t("title")}
        </Heading>
        <Text className="txt-medium text-ui-fg-subtle mt-2">
          {t("subtitle")}
        </Text>
      </div>
      <div>
        <Button
          asChild
          variant="secondary"
          className="h-11"
          data-testid="sign-in-button"
        >
          <LocalizedClientLink href="/account">
            {t("button")}
          </LocalizedClientLink>
        </Button>
      </div>
    </div>
  );
};

export default SignInPrompt;
