import { isEmpty } from "./isEmpty";
import { intlTag } from "./locale-format";

type ConvertToLocaleParams = {
  amount: number;
  currency_code: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** URL locale (`vi`, `en`, ...). Defaults to the shop language (Vietnamese). */
  locale?: string;
};

/** VND has no minor unit: Vietnamese shows 250.000 ₫, English ₫250,000. */
export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale,
}: ConvertToLocaleParams) => {
  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(intlTag(locale), {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(amount)
    : amount.toString();
};
