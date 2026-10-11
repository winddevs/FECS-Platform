import finishedGoods from "../../i18n/vi/finished-goods";
import fulfillment from "../../i18n/vi/fulfillment";
import materials from "../../i18n/vi/materials";
import operations from "../../i18n/vi/operations";
import planning from "../../i18n/vi/planning";
import procurement from "../../i18n/vi/procurement";
import production from "../../i18n/vi/production";
import quality from "../../i18n/vi/quality";
import returns from "../../i18n/vi/returns";
import settings from "../../i18n/vi/settings";
import shared from "../../i18n/vi/shared";
import shopfloor from "../../i18n/vi/shopfloor";
import social from "../../i18n/vi/social";
import status from "../../i18n/vi/status";

/** All Vietnamese dictionaries, keyed by the English source text. */
export const VI_DICTIONARY: Readonly<Record<string, string>> = {
  ...shared,
  ...materials,
  ...procurement,
  ...planning,
  ...production,
  ...shopfloor,
  ...quality,
  ...finishedGoods,
  ...fulfillment,
  ...returns,
  ...social,
  ...operations,
  ...settings,
  ...status,
};
