"use client";

import { HttpTypes } from "@medusajs/types";
import Back from "@modules/common/icons/back";
import FastDelivery from "@modules/common/icons/fast-delivery";
import Refresh from "@modules/common/icons/refresh";
import { useTranslations } from "next-intl";

import Accordion from "./accordion";

type ProductTabsProps = {
  product: HttpTypes.StoreProduct;
};

const ProductTabs = ({ product }: ProductTabsProps) => {
  const t = useTranslations("products.tabs");
  const tabs = [
    {
      label: t("productInformation"),
      component: <ProductInfoTab product={product} />,
    },
    {
      label: t("shippingReturns"),
      component: <ShippingInfoTab />,
    },
  ];

  return (
    <div className="w-full">
      <Accordion type="multiple">
        {tabs.map((tab, i) => (
          <Accordion.Item
            key={i}
            title={tab.label}
            headingSize="medium"
            value={tab.label}
          >
            {tab.component}
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  );
};

const ProductInfoTab = ({ product }: ProductTabsProps) => {
  const t = useTranslations("products.tabs");
  return (
    <div className="text-small-regular py-8">
      <div className="grid grid-cols-2 gap-x-8">
        <div className="flex flex-col gap-y-4">
          <div>
            <span className="font-semibold">{t("material")}</span>
            <p>{product.material ? product.material : "-"}</p>
          </div>
          <div>
            <span className="font-semibold">{t("origin")}</span>
            <p>{product.origin_country ? product.origin_country : "-"}</p>
          </div>
          <div>
            <span className="font-semibold">{t("type")}</span>
            <p>{product.type ? product.type.value : "-"}</p>
          </div>
        </div>
        <div className="flex flex-col gap-y-4">
          <div>
            <span className="font-semibold">{t("weight")}</span>
            <p>
              {product.weight
                ? t("weightValue", { weight: product.weight })
                : "-"}
            </p>
          </div>
          <div>
            <span className="font-semibold">{t("dimensions")}</span>
            <p>
              {product.length && product.width && product.height
                ? t("dimensionsValue", {
                    length: product.length,
                    width: product.width,
                    height: product.height,
                  })
                : "-"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const ShippingInfoTab = () => {
  const t = useTranslations("products.tabs");
  return (
    <div className="text-small-regular py-8">
      <div className="grid grid-cols-1 gap-y-8">
        <div className="flex items-start gap-x-2">
          <FastDelivery />
          <div>
            <span className="font-semibold">{t("fastDeliveryTitle")}</span>
            <p className="max-w-sm">{t("fastDeliveryText")}</p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Refresh />
          <div>
            <span className="font-semibold">{t("exchangesTitle")}</span>
            <p className="max-w-sm">{t("exchangesText")}</p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Back />
          <div>
            <span className="font-semibold">{t("returnsTitle")}</span>
            <p className="max-w-sm">{t("returnsText")}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductTabs;
