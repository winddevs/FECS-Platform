import { declineTransferRequest } from "@lib/data/orders";
import { Heading, Text } from "@medusajs/ui";
import TransferImage from "@modules/order/components/transfer-image";
import { getTranslations } from "next-intl/server";

export default async function TransferPage({
  params,
}: {
  params: { id: string; token: string };
}) {
  const t = await getTranslations("order.transfer");
  const { id, token } = params;

  const { success, error } = await declineTransferRequest(id, token);

  return (
    <div className="flex flex-col gap-y-4 items-start w-2/5 mx-auto mt-10 mb-20">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        {success && (
          <>
            <Heading level="h1" className="text-xl text-zinc-900">
              {t("declinedTitle")}
            </Heading>
            <Text className="text-zinc-600">{t("declinedText", { id })}</Text>
          </>
        )}
        {!success && (
          <>
            <Text className="text-zinc-600">{t("declineFailed")}</Text>
            {error && (
              <Text className="text-red-500">
                {t("errorMessage", { error })}
              </Text>
            )}
          </>
        )}
      </div>
    </div>
  );
}
