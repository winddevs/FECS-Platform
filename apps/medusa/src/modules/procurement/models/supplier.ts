import { model } from "@medusajs/framework/utils";

export const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const Supplier = model
  .define("supplier", {
    id: model.id({ prefix: "sup" }).primaryKey(),
    code: model.text(),
    name: model.text(),
    status: model.enum([...SUPPLIER_STATUSES]).default("ACTIVE"),
    contact_name: model.text().nullable(),
    email: model.text().nullable(),
    phone: model.text().nullable(),
    address: model.text().nullable(),
    payment_terms: model.text().nullable(),
    /** Material IDs this supplier is qualified to supply. */
    supported_material_ids: model.array().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_supplier_code_unique",
      on: ["code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);
