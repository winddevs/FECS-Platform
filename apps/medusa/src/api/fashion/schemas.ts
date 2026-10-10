import { z } from "zod";

import { hasValidPrecision } from "../../lib/quantity";
import {
  ALLOCATION_POLICIES,
  MATERIAL_TYPES,
} from "../../modules/materialInventory/models/material";
import { LOCATION_KINDS } from "../../modules/materialInventory/models/material-location";
import { SUPPLIER_STATUSES } from "../../modules/procurement/models/supplier";

const MAX_TEXT = 500;
const text = (max = MAX_TEXT) => z.string().trim().min(1).max(max);
const optionalText = (max = MAX_TEXT) => z.string().trim().max(max).nullish();

/** Positive quantity with at most 4 decimals. */
export const qty = z
  .number()
  .positive()
  .refine(hasValidPrecision, "At most 4 decimal places");

const bucket = z.enum(["GOOD", "QC_HOLD", "DAMAGED"]);

// ---- master data -----------------------------------------------------------

export const CreateMaterialSchema = z.object({
  code: text(100),
  name: text(),
  material_type: z.enum(MATERIAL_TYPES).optional(),
  uom: text(20),
  track_lot: z.boolean().optional(),
  track_roll: z.boolean().optional(),
  track_dye_lot: z.boolean().optional(),
  max_dye_lots: z.number().int().min(1).max(10).optional(),
  allocation_policy: z.enum(ALLOCATION_POLICIES).optional(),
});
export type CreateMaterialBody = z.infer<typeof CreateMaterialSchema>;

export const UpdateMaterialSchema = z.object({
  name: text().optional(),
  max_dye_lots: z.number().int().min(1).max(10).optional(),
  allocation_policy: z.enum(ALLOCATION_POLICIES).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateMaterialBody = z.infer<typeof UpdateMaterialSchema>;

export const CreateLocationSchema = z.object({
  code: text(100),
  name: text(),
  warehouse_code: text(50),
  kind: z.enum(LOCATION_KINDS).optional(),
});
export type CreateLocationBody = z.infer<typeof CreateLocationSchema>;

export const UpdateLocationSchema = z.object({
  name: text().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateLocationBody = z.infer<typeof UpdateLocationSchema>;

export const CreateSupplierSchema = z.object({
  code: text(100),
  name: text(),
  contact_name: optionalText(),
  email: z.string().trim().email().nullish(),
  phone: optionalText(50),
  address: optionalText(),
  payment_terms: optionalText(),
  supported_material_ids: z.array(z.string()).max(1000).nullish(),
});
export type CreateSupplierBody = z.infer<typeof CreateSupplierSchema>;

export const UpdateSupplierSchema = z.object({
  name: text().optional(),
  status: z.enum(SUPPLIER_STATUSES).optional(),
  contact_name: optionalText(),
  email: z.string().trim().email().nullish(),
  phone: optionalText(50),
  address: optionalText(),
  payment_terms: optionalText(),
  supported_material_ids: z.array(z.string()).max(1000).nullish(),
});
export type UpdateSupplierBody = z.infer<typeof UpdateSupplierSchema>;

// ---- material inventory commands ------------------------------------------

const rollSchema = z.object({
  roll_code: text(100),
  qty,
  width_cm: z.number().int().positive().nullish(),
});

export const ReceiveMaterialSchema = z.object({
  material_id: text(100),
  location_id: text(100),
  lot: z.object({
    lot_no: text(100),
    dye_lot_no: optionalText(100),
    supplier_id: optionalText(100),
    source_type: optionalText(100),
    source_id: optionalText(100),
  }),
  rolls: z.array(rollSchema).min(1).max(500).optional(),
  qty: qty.optional(),
  bucket: bucket.optional(),
  reference_type: optionalText(100),
  reference_id: optionalText(100),
});
export type ReceiveMaterialBody = z.infer<typeof ReceiveMaterialSchema>;

export const ReserveMaterialSchema = z.object({
  material_id: text(100),
  qty,
  reference_type: text(100),
  reference_id: text(100),
  reference_line: optionalText(100),
  location_id: optionalText(100),
  planner_approved: z.boolean().optional(),
});
export type ReserveMaterialBody = z.infer<typeof ReserveMaterialSchema>;

export const ReleaseReservationSchema = z.object({
  qty: qty.optional(),
  reason: optionalText(),
});
export type ReleaseReservationBody = z.infer<typeof ReleaseReservationSchema>;

export const IssueMaterialSchema = z.object({
  reservation_id: text(100),
  qty,
});
export type IssueMaterialBody = z.infer<typeof IssueMaterialSchema>;

export const ReturnMaterialSchema = z.object({
  material_id: text(100),
  lot_id: optionalText(100),
  roll_id: optionalText(100),
  location_id: text(100),
  qty,
  bucket,
  reference_type: text(100),
  reference_id: text(100),
});
export type ReturnMaterialBody = z.infer<typeof ReturnMaterialSchema>;

export const ScrapMaterialSchema = z.object({
  balance_id: text(100),
  qty,
  source_bucket: bucket,
  reason: text(),
  reference_type: optionalText(100),
  reference_id: optionalText(100),
});
export type ScrapMaterialBody = z.infer<typeof ScrapMaterialSchema>;

export const AdjustStockSchema = z.object({
  balance_id: text(100),
  direction: z.enum(["PLUS", "MINUS"]),
  qty,
  reason: text(),
});
export type AdjustStockBody = z.infer<typeof AdjustStockSchema>;

export const CycleCountSchema = z.object({
  balance_id: text(100),
  counted_qty: z
    .number()
    .min(0)
    .refine(hasValidPrecision, "At most 4 decimal places"),
  expected_version: z.number().int().min(1),
  reason: text(),
});
export type CycleCountBody = z.infer<typeof CycleCountSchema>;

export const TransferStockSchema = z.object({
  balance_id: text(100),
  to_location_id: text(100),
  qty,
  reference_type: optionalText(100),
  reference_id: optionalText(100),
});
export type TransferStockBody = z.infer<typeof TransferStockSchema>;

export const QcDecisionSchema = z.object({
  balance_id: text(100),
  qty,
  decision: z.enum(["RELEASE", "REJECT"]),
  reason: optionalText(),
});
export type QcDecisionBody = z.infer<typeof QcDecisionSchema>;

// ---- procurement -----------------------------------------------------------

export const CreatePurchaseOrderSchema = z.object({
  supplier_id: text(100),
  currency_code: z.string().trim().length(3).toUpperCase().optional(),
  expected_at: z.coerce.date().nullish(),
  notes: optionalText(2000),
  lines: z
    .array(
      z.object({
        material_id: text(100),
        uom: text(20),
        ordered_qty: qty,
        unit_price: z.number().min(0).optional(),
        over_receipt_pct: z.number().min(0).max(100).optional(),
      })
    )
    .min(1)
    .max(200),
});
export type CreatePurchaseOrderBody = z.infer<typeof CreatePurchaseOrderSchema>;

export const PurchaseOrderActionSchema = z.object({
  reason: optionalText(),
});
export type PurchaseOrderActionBody = z.infer<typeof PurchaseOrderActionSchema>;

export const PostGoodsReceiptSchema = z.object({
  location_id: text(100),
  delivery_note: optionalText(),
  lines: z
    .array(
      z.object({
        purchase_order_line_id: text(100),
        qty,
        bucket: bucket.optional(),
        lot_no: text(100),
        dye_lot_no: optionalText(100),
        rolls: z.array(rollSchema).min(1).max(500).optional(),
      })
    )
    .min(1)
    .max(200),
});
export type PostGoodsReceiptBody = z.infer<typeof PostGoodsReceiptSchema>;

// =============================================================================
// Phases 2-8
// =============================================================================

const posInt = z.number().int().positive();
const nonNegInt = z.number().int().min(0);
const idText = text(100);

// ---- manufacturing ---------------------------------------------------------
export const CreateBomSchema = z.object({
  product_sku: text(100),
  output_uom: text(20).optional(),
  notes: optionalText(),
  lines: z
    .array(
      z.object({
        material_id: idText,
        uom: text(20),
        qty_per_unit: qty,
        waste_factor: z
          .number()
          .min(0)
          .max(1)
          .refine(hasValidPrecision)
          .optional(),
      })
    )
    .min(1)
    .max(200),
});
export type CreateBomBody = z.infer<typeof CreateBomSchema>;

export const CreateRoutingSchema = z.object({
  product_sku: text(100),
  notes: optionalText(),
  operations: z
    .array(
      z.object({
        seq: posInt,
        code: text(50),
        name: text(),
        work_center_type: text(50),
        standard_minutes: z
          .number()
          .min(0)
          .refine(hasValidPrecision)
          .optional(),
        qc_gate: z.boolean().optional(),
      })
    )
    .min(1)
    .max(100),
});
export type CreateRoutingBody = z.infer<typeof CreateRoutingSchema>;

export const CreateWorkCenterSchema = z.object({
  code: text(50),
  name: text(),
  type: text(50),
  capacity_minutes_per_day: posInt.max(1440).optional(),
  efficiency_pct: z.number().int().min(1).max(100).optional(),
});
export type CreateWorkCenterBody = z.infer<typeof CreateWorkCenterSchema>;

export const PlanningParamSchema = z.object({
  material_id: idText,
  safety_stock: z.number().min(0).refine(hasValidPrecision),
  lead_time_days: nonNegInt.max(365),
});
export type PlanningParamBody = z.infer<typeof PlanningParamSchema>;

export const CreateMoSchema = z.object({
  order_type: z.enum(["MTS", "MTO", "REPLENISHMENT", "SAMPLE", "REWORK"]),
  product_sku: text(100),
  lines: z
    .array(z.object({ sku: text(100), qty: posInt }))
    .min(1)
    .max(200),
  due_date: z.coerce.date().nullish(),
  customer_order_id: optionalText(100),
  bom_id: optionalText(100),
  routing_id: optionalText(100),
  notes: optionalText(2000),
});
export type CreateMoBody = z.infer<typeof CreateMoSchema>;

export const ReserveMoSchema = z.object({
  planner_approved: z.boolean().optional(),
});
export type ReserveMoBody = z.infer<typeof ReserveMoSchema>;

export const ReleaseMoSchema = z.object({
  batches: z
    .array(z.object({ planned_qty: posInt }))
    .min(1)
    .max(50)
    .optional(),
});
export type ReleaseMoBody = z.infer<typeof ReleaseMoSchema>;

export const ReasonSchema = z.object({ reason: text() });
export type ReasonBody = z.infer<typeof ReasonSchema>;

export const EmptySchema = z.object({});
export type EmptyBody = z.infer<typeof EmptySchema>;

export const IssueToMoSchema = z.object({ material_id: idText, qty });
export type IssueToMoBody = z.infer<typeof IssueToMoSchema>;

export const CutPlanSchema = z.object({
  batch_id: idText,
  fabric_material_id: idText,
  lays: z
    .array(
      z.object({
        roll_code: text(100),
        planned_consumption: qty,
        size_ratio: z.record(z.string(), posInt),
      })
    )
    .min(1)
    .max(200),
});
export type CutPlanBody = z.infer<typeof CutPlanSchema>;

export const CompleteCutSchema = z.object({
  batch_id: idText,
  fabric_material_id: idText,
  actual_consumption: qty,
  bundles: z
    .array(z.object({ sku: text(100), qty: posInt }))
    .min(1)
    .max(500),
  overproduction_approved: z.boolean().optional(),
});
export type CompleteCutBody = z.infer<typeof CompleteCutSchema>;

export const ExecuteOperationSchema = z.object({
  op_seq: posInt,
  input_qty: posInt,
  good_qty: nonNegInt,
  rework_qty: nonNegInt.optional(),
  reject_qty: nonNegInt.optional(),
  work_center_id: optionalText(100),
});
export type ExecuteOperationBody = z.infer<typeof ExecuteOperationSchema>;

export const InspectBundleSchema = z.object({
  pass_qty: nonNegInt,
  rework_qty: nonNegInt.optional(),
  reject_qty: nonNegInt.optional(),
  hold_qty: nonNegInt.optional(),
  defects: z
    .array(z.object({ code: text(50), qty: nonNegInt, note: optionalText() }))
    .max(50)
    .nullish(),
  notes: optionalText(2000),
});
export type InspectBundleBody = z.infer<typeof InspectBundleSchema>;

export const ReturnReworkSchema = z.object({
  good_qty: nonNegInt,
  scrap_qty: nonNegInt,
});
export type ReturnReworkBody = z.infer<typeof ReturnReworkSchema>;

export const PackBundleSchema = z.object({ qty: posInt, location_id: idText });
export type PackBundleBody = z.infer<typeof PackBundleSchema>;

export const DecideSuggestionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
});
export type DecideSuggestionBody = z.infer<typeof DecideSuggestionSchema>;

// ---- finished goods --------------------------------------------------------
export const CreateFgLocationSchema = z.object({
  code: text(50),
  name: text(),
  warehouse_code: text(50),
  is_commerce: z.boolean().optional(),
  medusa_stock_location_id: optionalText(100),
});
export type CreateFgLocationBody = z.infer<typeof CreateFgLocationSchema>;

export const FgHoldSchema = z.object({
  sku: text(100),
  location_id: idText,
  qty: posInt,
  kind: z.enum(["WAREHOUSE", "QC"]),
  action: z.enum(["HOLD", "RELEASE"]),
  reason: text(),
});
export type FgHoldBody = z.infer<typeof FgHoldSchema>;

export const FgAdjustSchema = z.object({
  sku: text(100),
  location_id: idText,
  direction: z.enum(["PLUS", "MINUS"]),
  qty: posInt,
  reason: text(),
});
export type FgAdjustBody = z.infer<typeof FgAdjustSchema>;

export const FgSafetyStockSchema = z.object({
  sku: text(100),
  location_id: idText,
  safety_stock: nonNegInt,
});
export type FgSafetyStockBody = z.infer<typeof FgSafetyStockSchema>;

export const FgAllocateSchema = z.object({
  order_id: idText,
  sku: text(100),
  location_id: idText,
  qty: posInt,
});
export type FgAllocateBody = z.infer<typeof FgAllocateSchema>;

export const FgShipSchema = z.object({
  sku: text(100),
  location_id: idText,
  qty: posInt,
  reference_type: text(50),
  reference_id: idText,
  order_id: optionalText(100),
});
export type FgShipBody = z.infer<typeof FgShipSchema>;

export const FgRepublishSchema = z.object({ sku: optionalText(100) });
export type FgRepublishBody = z.infer<typeof FgRepublishSchema>;

// ---- fulfillment -----------------------------------------------------------
export const CreateShipmentSchema = z.object({
  order_id: idText,
  fulfillment_id: idText,
});
export type CreateShipmentBody = z.infer<typeof CreateShipmentSchema>;

// ---- returns ---------------------------------------------------------------
const returnItems = z
  .array(z.object({ order_line_id: idText, sku: text(100), qty: posInt }))
  .min(1)
  .max(50);

export const RequestReturnSchema = z.object({
  order_id: idText,
  type: z.enum(["RETURN", "EXCHANGE"]).default("RETURN"),
  reason: text(1000),
  exchange_sku: optionalText(100),
  items: returnItems,
});
export type RequestReturnBody = z.infer<typeof RequestReturnSchema>;

export const AdminRequestReturnSchema = RequestReturnSchema.extend({
  customer_id: optionalText(100),
});
export type AdminRequestReturnBody = z.infer<typeof AdminRequestReturnSchema>;

export const AuthorizeReturnSchema = z.object({
  override_reason: optionalText(1000),
  pickup_address: z
    .object({
      name: text(),
      phone: text(30),
      address_line: text(1000),
      district: optionalText(),
      province: optionalText(),
    })
    .optional(),
  exchange_location_id: optionalText(100),
});
export type AuthorizeReturnBody = z.infer<typeof AuthorizeReturnSchema>;

export const InspectReturnItemSchema = z.object({
  disposition: z.enum(["A_GRADE", "B_GRADE", "REWORK", "DAMAGED", "SCRAP"]),
  destination_location_id: optionalText(100),
  notes: optionalText(2000),
});
export type InspectReturnItemBody = z.infer<typeof InspectReturnItemSchema>;

export const RefundReturnSchema = z.object({
  payment_id: idText,
  amount: z.number().positive().optional(),
  note: optionalText(),
});
export type RefundReturnBody = z.infer<typeof RefundReturnSchema>;

// ---- social ------------------------------------------------------------------
export const HandoffSchema = z.object({ state: z.enum(["BOT", "HUMAN"]) });
export type HandoffBody = z.infer<typeof HandoffSchema>;
