/**
 * Translations the Medusa Admin merges into its own i18n instance. Only the
 * sidebar labels need this (route labels are static); screen text is
 * translated by `tr()` in `lib/i18n`.
 */
const en = {
  menu: {
    procurement: "Procurement",
    rawMaterials: "Raw Materials",
    planning: "Planning",
    production: "Production",
    shopFloor: "Shop Floor",
    quality: "Quality",
    finishedGoods: "Finished Goods",
    fulfillment: "Fulfillment",
    returns: "Returns",
    socialSupport: "Social Support",
    operations: "Operations",
  },
};

const vi = {
  menu: {
    procurement: "Mua hàng",
    rawMaterials: "Nguyên phụ liệu",
    planning: "Kế hoạch",
    production: "Sản xuất",
    shopFloor: "Xưởng",
    quality: "Chất lượng",
    finishedGoods: "Thành phẩm",
    fulfillment: "Giao hàng",
    returns: "Trả hàng",
    socialSupport: "Hỗ trợ mạng xã hội",
    operations: "Vận hành",
  },
};

export default {
  en: { fecs: en },
  vi: { fecs: vi },
};
