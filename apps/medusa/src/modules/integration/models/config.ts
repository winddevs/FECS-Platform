import { model } from "@medusajs/framework/utils";

export const SETTING_SCOPES = ["GLOBAL", "COUNTRY", "WAREHOUSE"] as const;
export type SettingScope = (typeof SETTING_SCOPES)[number];

/**
 * Operator-editable configuration (FR-ADM-004). A value can be set for the
 * whole platform or overridden for one country or one warehouse; the most
 * specific one wins. The set of keys and their rules live in code
 * (lib/config/settings.ts), so a bad value is rejected before it is stored.
 */
export const PlatformSetting = model
  .define("platform_setting", {
    id: model.id({ prefix: "pset" }).primaryKey(),
    key: model.text(),
    scope_type: model.enum([...SETTING_SCOPES]).default("GLOBAL"),
    /** Country code or warehouse code; empty for GLOBAL. */
    scope_id: model.text().default(""),
    value: model.json(),
    updated_by: model.text(),
  })
  .indexes([
    {
      name: "IDX_platform_setting_unique",
      on: ["key", "scope_type", "scope_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

/**
 * What differs per country (FR-... section 26): payment, tax, carrier,
 * currency, warehouses, returns policy, social channels and legal entity.
 * Products and manufacturing stay shared; only this profile varies.
 */
export const CountryProfile = model
  .define("country_profile", {
    id: model.id({ prefix: "ctry" }).primaryKey(),
    /** ISO 3166-1 alpha-2, upper case. */
    country_code: model.text(),
    name: model.text(),
    currency_code: model.text(),
    tax_region: model.text().nullable(),
    carrier_code: model.text().nullable(),
    payment_providers: model.json().nullable(),
    warehouse_codes: model.json().nullable(),
    return_window_days: model.number().nullable(),
    social_channels: model.json().nullable(),
    legal_entity: model.json().nullable(),
    is_active: model.boolean().default(true),
    updated_by: model.text(),
  })
  .indexes([
    {
      name: "IDX_country_profile_code_unique",
      on: ["country_code"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);

/**
 * Last value of an operational check that runs in a worker (reconciliation
 * issues, ...), so the metrics endpoint on any replica can report it.
 */
export const OpsGauge = model
  .define("ops_gauge", {
    id: model.id({ prefix: "ogau" }).primaryKey(),
    name: model.text(),
    value: model.number(),
  })
  .indexes([
    {
      name: "IDX_ops_gauge_name_unique",
      on: ["name"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ]);
