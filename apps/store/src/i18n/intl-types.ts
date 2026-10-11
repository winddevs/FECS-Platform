import account from "./messages/areas/account.en.json";
import blocks from "./messages/areas/blocks.en.json";
import cart from "./messages/areas/cart.en.json";
import checkout from "./messages/areas/checkout.en.json";
import common from "./messages/areas/common.en.json";
import components from "./messages/areas/components.en.json";
import errors from "./messages/areas/errors.en.json";
import home from "./messages/areas/home.en.json";
import layout from "./messages/areas/layout.en.json";
import order from "./messages/areas/order.en.json";
import products from "./messages/areas/products.en.json";
import search from "./messages/areas/search.en.json";
import shipping from "./messages/areas/shipping.en.json";
import store from "./messages/areas/store.en.json";
import type en from "./messages/en.json";

/** Shape of the merged messages (core file + one namespace per area). */
export type AppMessages = typeof en & {
  account: typeof account;
  cart: typeof cart;
  checkout: typeof checkout;
  order: typeof order;
  layout: typeof layout;
  store: typeof store;
  products: typeof products;
  common: typeof common;
  search: typeof search;
  home: typeof home;
  blocks: typeof blocks;
  errors: typeof errors;
  shipping: typeof shipping;
  components: typeof components;
};
