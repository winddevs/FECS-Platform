import {
  validateAndTransformBody,
  validateAndTransformQuery,
  type MiddlewareRoute,
} from "@medusajs/framework/http";
import { z } from "zod";

import type { Permission } from "../../lib/authz/permissions";
import {
  requirePermission,
  requirePermissionIf,
} from "../../lib/authz/require-permission";
import {
  AdjustStockSchema,
  CreateLocationSchema,
  CreateMaterialSchema,
  CreatePurchaseOrderSchema,
  CloseTransferSchema,
  CountryProfileSchema,
  CreateSupplierSchema,
  CycleCountSchema,
  DecideCycleCountSchema,
  DispatchTransferSchema,
  IssueMaterialSchema,
  PostGoodsReceiptSchema,
  PurchaseOrderActionSchema,
  QcDecisionSchema,
  ReceiveMaterialSchema,
  ReleaseReservationSchema,
  ReserveMaterialSchema,
  ReturnMaterialSchema,
  ScrapMaterialSchema,
  SettingValueSchema,
  TransferStockSchema,
  UpdateLocationSchema,
  UpdateMaterialSchema,
  UpdateSupplierSchema,
} from "./schemas";

type Method = "GET" | "POST";

const DEFAULT_PAGE_SIZE = 20;

const guarded = (
  matcher: string,
  method: Method,
  permission: Permission,
  ...rest: NonNullable<MiddlewareRoute["middlewares"]>
): MiddlewareRoute => ({
  matcher,
  methods: [method],
  middlewares: [requirePermission(permission), ...rest],
});

// NOTE: Medusa's validate* helpers are generic over the zod schema type, and
// inferring it for each schema makes the TypeScript checker explode (heap OOM).
// Schemas are typed at their definition site (see ./schemas), so we pass them
// through a non-generic boundary here.
const body = (
  matcher: string,
  permission: Permission,
  schema: z.ZodType,
  ...after: NonNullable<MiddlewareRoute["middlewares"]>
) =>
  guarded(
    matcher,
    "POST",
    permission,
    validateAndTransformBody(schema as never),
    ...after
  );

const MAX_PAGE_SIZE = 200;

// Same query contract as Medusa's createFindParams (fields/limit/offset/order),
// expressed with the project's zod version.
const listParams = (filters: z.ZodRawShape) =>
  z.object({
    fields: z.string().max(1000).optional(),
    order: z.string().max(200).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
    ...filters,
  });

const list = (
  matcher: string,
  permission: Permission,
  filters: z.ZodRawShape = {}
) =>
  guarded(
    matcher,
    "GET",
    permission,
    validateAndTransformQuery(listParams(filters) as never, {
      defaults: ["id"],
      isList: true,
      defaultLimit: DEFAULT_PAGE_SIZE,
    })
  );

const str = z.string().max(200).optional();

export const fashionMiddlewares: MiddlewareRoute[] = [
  // ---- master data ---------------------------------------------------------
  list("/admin/material-inventory/materials", "master:read", {
    code: str,
    material_type: str,
  }),
  body(
    "/admin/material-inventory/materials",
    "master:write",
    CreateMaterialSchema
  ),
  body(
    "/admin/material-inventory/materials/:id",
    "master:write",
    UpdateMaterialSchema
  ),
  list("/admin/material-inventory/locations", "master:read", {
    warehouse_code: str,
    kind: str,
  }),
  body(
    "/admin/material-inventory/locations",
    "master:write",
    CreateLocationSchema
  ),
  guarded("/admin/material-inventory/locations/:id", "GET", "master:read"),
  body(
    "/admin/material-inventory/locations/:id",
    "master:write",
    UpdateLocationSchema
  ),
  list("/admin/procurement/suppliers", "procurement:read", {
    status: str,
    code: str,
  }),
  body("/admin/procurement/suppliers", "master:write", CreateSupplierSchema),
  body(
    "/admin/procurement/suppliers/:id",
    "master:write",
    UpdateSupplierSchema
  ),

  // ---- material inventory reads -------------------------------------------
  list("/admin/material-inventory/lots", "inventory:read", {
    material_id: str,
    source_type: str,
    source_id: str,
    lot_no: str,
    dye_lot_no: str,
  }),
  list("/admin/material-inventory/rolls", "inventory:read", {
    material_id: str,
    lot_id: str,
    roll_code: str,
    status: str,
  }),
  list("/admin/material-inventory/balances", "inventory:read", {
    material_id: str,
    lot_id: str,
    roll_id: str,
    location_id: str,
  }),
  list("/admin/material-inventory/movements", "inventory:read", {
    material_id: str,
    balance_id: str,
    roll_id: str,
    movement_type: str,
    reference_type: str,
    reference_id: str,
  }),
  list("/admin/material-inventory/reservations", "inventory:read", {
    material_id: str,
    reference_type: str,
    reference_id: str,
    status: str,
  }),

  // ---- material inventory commands ----------------------------------------
  body(
    "/admin/material-inventory/receipts",
    "inventory:receive",
    ReceiveMaterialSchema
  ),
  body(
    "/admin/material-inventory/reservations",
    "inventory:reserve",
    ReserveMaterialSchema,
    // Overriding the dye-lot policy is a planning decision, like on the MO route.
    requirePermissionIf(
      "manufacturing:approve",
      (b) => b.planner_approved === true
    )
  ),
  body(
    "/admin/material-inventory/reservations/:id/release",
    "inventory:reserve",
    ReleaseReservationSchema
  ),
  body(
    "/admin/material-inventory/issues",
    "inventory:issue",
    IssueMaterialSchema
  ),
  body(
    "/admin/material-inventory/returns",
    "inventory:return",
    ReturnMaterialSchema
  ),
  body(
    "/admin/material-inventory/scraps",
    "inventory:scrap",
    ScrapMaterialSchema
  ),
  body(
    "/admin/material-inventory/adjustments",
    "inventory:adjust",
    AdjustStockSchema
  ),
  body(
    "/admin/material-inventory/cycle-counts",
    "inventory:count",
    CycleCountSchema
  ),
  list("/admin/material-inventory/cycle-counts", "inventory:read", {
    balance_id: str,
    material_id: str,
    status: str,
  }),
  // Approving a count posts the adjustment, so it needs adjust rights.
  body(
    "/admin/material-inventory/cycle-counts/:id/decision",
    "inventory:adjust",
    DecideCycleCountSchema
  ),
  body(
    "/admin/material-inventory/transfers",
    "inventory:transfer",
    TransferStockSchema
  ),
  list("/admin/material-inventory/transfers", "inventory:read", {
    material_id: str,
    status: str,
    to_location_id: str,
  }),
  body(
    "/admin/material-inventory/transfers/dispatch",
    "inventory:transfer",
    DispatchTransferSchema
  ),
  body(
    "/admin/material-inventory/transfers/:id/receive",
    "inventory:transfer",
    CloseTransferSchema
  ),
  body(
    "/admin/material-inventory/transfers/:id/cancel",
    "inventory:transfer",
    CloseTransferSchema
  ),
  body(
    "/admin/material-inventory/qc-decisions",
    "inventory:qc",
    QcDecisionSchema
  ),
  guarded("/admin/material-inventory/materials/:id", "GET", "master:read"),
  guarded(
    "/admin/material-inventory/materials/:id/availability",
    "GET",
    "inventory:read"
  ),
  guarded("/admin/material-inventory/rolls/:code", "GET", "inventory:read"),
  guarded("/admin/material-inventory/scan/:code", "GET", "inventory:read"),
  guarded(
    "/admin/material-inventory/labels/:type/:code",
    "GET",
    "inventory:read"
  ),
  guarded(
    "/admin/material-inventory/reservations/:id",
    "GET",
    "inventory:read"
  ),
  guarded(
    "/admin/material-inventory/reconciliation",
    "GET",
    "inventory:reconcile"
  ),

  // ---- configuration ----------------------------------------------------------
  guarded("/admin/settings", "GET", "ops:read"),
  {
    matcher: "/admin/settings/:key",
    methods: ["PUT"],
    middlewares: [
      requirePermission("config:manage"),
      validateAndTransformBody(SettingValueSchema as never),
    ],
  },
  {
    matcher: "/admin/settings/:key",
    methods: ["DELETE"],
    middlewares: [requirePermission("config:manage")],
  },
  guarded("/admin/country-profiles", "GET", "master:read"),
  body("/admin/country-profiles", "config:manage", CountryProfileSchema),
  // ---- procurement ---------------------------------------------------------
  list("/admin/procurement/purchase-orders", "procurement:read", {
    supplier_id: str,
    status: str,
    po_number: str,
  }),
  body(
    "/admin/procurement/purchase-orders",
    "procurement:write",
    CreatePurchaseOrderSchema
  ),
  guarded("/admin/procurement/suppliers/:id", "GET", "procurement:read"),
  guarded("/admin/procurement/purchase-orders/:id", "GET", "procurement:read"),
  body(
    "/admin/procurement/purchase-orders/:id/approve",
    "procurement:approve",
    PurchaseOrderActionSchema
  ),
  body(
    "/admin/procurement/purchase-orders/:id/send",
    "procurement:write",
    PurchaseOrderActionSchema
  ),
  body(
    "/admin/procurement/purchase-orders/:id/close",
    "procurement:approve",
    PurchaseOrderActionSchema
  ),
  body(
    "/admin/procurement/purchase-orders/:id/cancel",
    "procurement:approve",
    PurchaseOrderActionSchema
  ),
  guarded(
    "/admin/procurement/purchase-orders/:id/receipts",
    "GET",
    "procurement:read"
  ),
  body(
    "/admin/procurement/purchase-orders/:id/receipts",
    "procurement:receive",
    PostGoodsReceiptSchema
  ),
];
