import {
  authenticate,
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
  AdminRequestReturnSchema,
  AuthorizeReturnSchema,
  CompleteCutSchema,
  CreateBomSchema,
  CreateFgLocationSchema,
  CreateMoSchema,
  CreateRoutingSchema,
  CreateShipmentSchema,
  CreateWorkCenterSchema,
  CutPlanSchema,
  DecideSuggestionSchema,
  EmptySchema,
  ExecuteOperationSchema,
  FgAdjustSchema,
  FgAllocateSchema,
  FgHoldSchema,
  FgRepublishSchema,
  FgSafetyStockSchema,
  FgShipSchema,
  FgTransferCloseSchema,
  FgTransferDispatchSchema,
  HandoffSchema,
  SendAgentMessageSchema,
  InspectBundleSchema,
  InspectReturnItemSchema,
  IssueToMoSchema,
  PackBundleSchema,
  MrpRunSchema,
  PlanningParamSchema,
  ReplaceShipmentSchema,
  ResolveShipmentExceptionSchema,
  SkuPlanningParamSchema,
  ReasonSchema,
  RefundReturnSchema,
  ReleaseMoSchema,
  RequestReturnSchema,
  ReserveMoSchema,
  ReturnReworkSchema,
} from "./schemas";

type Method = "GET" | "POST";
type Mw = NonNullable<MiddlewareRoute["middlewares"]>[number];

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

const guarded = (
  matcher: string,
  method: Method,
  permission: Permission,
  ...rest: Mw[]
): MiddlewareRoute => ({
  matcher,
  methods: [method],
  middlewares: [requirePermission(permission), ...rest],
});

// See middlewares.ts: Medusa's generic validators must receive a non-generic schema type.
const parse = (schema: z.ZodType) => validateAndTransformBody(schema as never);

const body = (
  matcher: string,
  permission: Permission,
  schema: z.ZodType,
  ...after: Mw[]
) => guarded(matcher, "POST", permission, parse(schema), ...after);

const read = (matcher: string, permission: Permission) =>
  guarded(matcher, "GET", permission);

const str = z.string().max(200).optional();

const list = (
  matcher: string,
  permission: Permission,
  filters: z.ZodRawShape = {}
) =>
  guarded(
    matcher,
    "GET",
    permission,
    validateAndTransformQuery(
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
      }) as never,
      { defaults: ["id"], isList: true, defaultLimit: DEFAULT_PAGE_SIZE }
    )
  );

const flag = (key: string) => (b: Record<string, unknown>) => b[key] === true;

const MFG = "/admin/manufacturing";
const FGP = "/admin/finished-goods";

export const opsMiddlewares: MiddlewareRoute[] = [
  // ---- manufacturing master data ------------------------------------------
  list(`${MFG}/boms`, "manufacturing:read", { product_sku: str, status: str }),
  body(`${MFG}/boms`, "manufacturing:plan", CreateBomSchema),
  read(`${MFG}/boms/:id`, "manufacturing:read"),
  body(`${MFG}/boms/:id/release`, "manufacturing:release", EmptySchema),
  list(`${MFG}/routings`, "manufacturing:read", {
    product_sku: str,
    status: str,
  }),
  body(`${MFG}/routings`, "manufacturing:plan", CreateRoutingSchema),
  read(`${MFG}/routings/:id`, "manufacturing:read"),
  body(`${MFG}/routings/:id/release`, "manufacturing:release", EmptySchema),
  list(`${MFG}/work-centers`, "manufacturing:read", { type: str }),
  body(`${MFG}/work-centers`, "manufacturing:plan", CreateWorkCenterSchema),
  read(`${MFG}/work-centers/load`, "manufacturing:read"),
  body(`${MFG}/planning-params`, "manufacturing:plan", PlanningParamSchema),
  body(
    `${MFG}/planning-params/skus`,
    "manufacturing:plan",
    SkuPlanningParamSchema
  ),
  list(`${MFG}/planning-params/skus`, "manufacturing:read", { sku: str }),

  // ---- manufacturing orders --------------------------------------------------
  list(`${MFG}/mos`, "manufacturing:read", {
    status: str,
    order_type: str,
    product_sku: str,
    customer_order_id: str,
  }),
  body(`${MFG}/mos`, "manufacturing:plan", CreateMoSchema),
  read(`${MFG}/mos/:id`, "manufacturing:read"),
  read(`${MFG}/mos/:id/rolls`, "manufacturing:read"),
  body(`${MFG}/mos/:id/check-material`, "manufacturing:plan", EmptySchema),
  body(
    `${MFG}/mos/:id/reserve`,
    "manufacturing:plan",
    ReserveMoSchema,
    requirePermissionIf("manufacturing:approve", flag("planner_approved"))
  ),
  body(`${MFG}/mos/:id/release`, "manufacturing:release", ReleaseMoSchema),
  body(`${MFG}/mos/:id/hold`, "manufacturing:release", ReasonSchema),
  body(`${MFG}/mos/:id/resume`, "manufacturing:release", EmptySchema),
  body(`${MFG}/mos/:id/cancel`, "manufacturing:approve", ReasonSchema),
  body(`${MFG}/mos/:id/short-close`, "manufacturing:approve", ReasonSchema),
  body(`${MFG}/mos/:id/issue`, "inventory:issue", IssueToMoSchema),
  body(`${MFG}/mos/:id/cut-plan`, "manufacturing:cut", CutPlanSchema),
  body(
    `${MFG}/mos/:id/cut`,
    "manufacturing:cut",
    CompleteCutSchema,
    requirePermissionIf(
      "manufacturing:approve",
      flag("overproduction_approved")
    )
  ),
  list(`${MFG}/exceptions`, "manufacturing:read", {
    mo_id: str,
    type: str,
    status: str,
  }),

  // ---- shop floor ----------------------------------------------------------------
  list(`${MFG}/bundles`, "manufacturing:read", {
    mo_id: str,
    batch_id: str,
    sku: str,
  }),
  read(`${MFG}/bundles/by-code/:code`, "manufacturing:read"),
  read(`${MFG}/bundles/by-code/:code/label`, "manufacturing:read"),
  body(
    `${MFG}/bundles/:id/operations`,
    "manufacturing:execute",
    ExecuteOperationSchema
  ),
  body(
    `${MFG}/bundles/:id/inspections`,
    "quality:inspect",
    InspectBundleSchema
  ),
  body(`${MFG}/bundles/:id/rework`, "manufacturing:rework", ReturnReworkSchema),
  body(`${MFG}/bundles/:id/pack`, "manufacturing:pack", PackBundleSchema),
  list("/admin/quality/inspections", "manufacturing:read", {
    target_id: str,
    reference_id: str,
  }),

  // ---- MRP / MTO -----------------------------------------------------------------
  list(`${MFG}/mrp/runs`, "manufacturing:read"),
  body(`${MFG}/mrp/runs`, "manufacturing:plan", MrpRunSchema),
  list(`${MFG}/mrp/suggestions`, "manufacturing:read", {
    run_id: str,
    status: str,
    material_id: str,
  }),
  body(
    `${MFG}/mrp/suggestions/:id/decide`,
    "manufacturing:approve",
    DecideSuggestionSchema
  ),
  list(`${MFG}/production-requests`, "manufacturing:read", {
    order_id: str,
    status: str,
  }),
  body(
    `${MFG}/production-requests/:id/retry`,
    "manufacturing:plan",
    EmptySchema
  ),

  // ---- finished goods -------------------------------------------------------------
  list(`${FGP}/locations`, "fg:read", { warehouse_code: str, kind: str }),
  body(`${FGP}/locations`, "master:write", CreateFgLocationSchema),
  list(`${FGP}/balances`, "fg:read", { sku: str, location_id: str }),
  list(`${FGP}/batches`, "fg:read", { sku: str, mo_id: str, source: str }),
  read(`${FGP}/batches/:id/trace`, "fg:read"),
  list(`${FGP}/movements`, "fg:read", {
    sku: str,
    location_id: str,
    reference_id: str,
  }),
  list(`${FGP}/allocations`, "fg:read", {
    order_id: str,
    sku: str,
    status: str,
  }),
  body(`${FGP}/holds`, "fg:adjust", FgHoldSchema),
  body(`${FGP}/adjustments`, "fg:adjust", FgAdjustSchema),
  body(`${FGP}/safety-stock`, "fg:adjust", FgSafetyStockSchema),
  body(`${FGP}/allocations`, "fg:adjust", FgAllocateSchema),
  body(`${FGP}/shipments`, "fg:receive", FgShipSchema),
  list(`${FGP}/transfers`, "fg:read", { sku: str, status: str }),
  body(`${FGP}/transfers/dispatch`, "fg:receive", FgTransferDispatchSchema),
  body(`${FGP}/transfers/:id/receive`, "fg:receive", FgTransferCloseSchema),
  body(`${FGP}/transfers/:id/cancel`, "fg:receive", FgTransferCloseSchema),
  body(`${FGP}/projection/republish`, "fg:sync", FgRepublishSchema),
  read(`${FGP}/reconciliation`, "fg:read"),

  // ---- fulfillment ----------------------------------------------------------------
  list("/admin/fulfillment/shipments", "fulfillment:read", {
    order_id: str,
    status: str,
    carrier_code: str,
    create_state: str,
  }),
  read("/admin/fulfillment/shipments/:id", "fulfillment:read"),
  list("/admin/fulfillment/exceptions", "fulfillment:read", {
    order_id: str,
    shipment_id: str,
    type: str,
    status: str,
  }),
  body(
    "/admin/fulfillment/exceptions/:id/resolve",
    "fulfillment:manage",
    ResolveShipmentExceptionSchema
  ),
  body(
    "/admin/fulfillment/shipments/:id/replace",
    "fulfillment:manage",
    ReplaceShipmentSchema
  ),
  body(
    "/admin/fulfillment/shipments",
    "fulfillment:manage",
    CreateShipmentSchema
  ),
  body(
    "/admin/fulfillment/shipments/:id/cancel",
    "fulfillment:manage",
    EmptySchema
  ),

  // ---- returns ---------------------------------------------------------------------
  list("/admin/returns", "returns:read", { order_id: str, status: str }),
  body("/admin/returns", "returns:authorize", AdminRequestReturnSchema),
  read("/admin/returns/:id", "returns:read"),
  body(
    "/admin/returns/:id/authorize",
    "returns:authorize",
    AuthorizeReturnSchema
  ),
  body("/admin/returns/:id/reject", "returns:authorize", ReasonSchema),
  body("/admin/returns/:id/receive", "returns:receive", EmptySchema),
  body(
    "/admin/returns/:id/items/:item_id/inspect",
    "returns:inspect",
    InspectReturnItemSchema
  ),
  body("/admin/returns/:id/refund", "returns:refund", RefundReturnSchema),
  body("/admin/returns/:id/close", "returns:authorize", EmptySchema),
  body(
    "/admin/returns/:id/ship-replacement",
    "fulfillment:manage",
    EmptySchema
  ),

  // ---- social / ops ------------------------------------------------------------------
  list("/admin/social/identities", "social:read", {
    customer_id: str,
    handoff_state: str,
  }),
  body("/admin/social/identities/:id/handoff", "social:manage", HandoffSchema),
  read("/admin/social/identities/:id/messages", "social:read"),
  body(
    "/admin/social/identities/:id/messages",
    "social:manage",
    SendAgentMessageSchema
  ),
  read("/admin/ops/summary", "ops:read"),

  // ---- storefront (authenticated customer) -------------------------------------------
  {
    matcher: "/store/fashion/*",
    middlewares: [authenticate("customer", ["session", "bearer"])],
  },
  {
    matcher: "/store/fashion/returns",
    methods: ["POST"],
    middlewares: [parse(RequestReturnSchema)],
  },
];
