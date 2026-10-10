/**
 * Role -> permission matrix (Requirement section 5, TDD section 41).
 * Warehouse, production, procurement, CS and finance permissions are separated
 * (NFR-SEC-004). Roles are stored on the admin user as
 * `metadata.fashion_roles: string[]`.
 */
export const FASHION_ROLES = [
  "ERP_ADMIN",
  "PROCUREMENT",
  "WAREHOUSE_OPERATOR",
  "WAREHOUSE_MANAGER",
  "PRODUCTION_PLANNER",
  "CUTTING_OPERATOR",
  "SEWING_OPERATOR",
  "SEWING_SUPERVISOR",
  "QC",
  "PACKING_OPERATOR",
  "COMMERCE_ADMIN",
  "CUSTOMER_SUPPORT",
  "FINANCE",
  "SRE",
  "AUDITOR",
] as const;

export type FashionRole = (typeof FASHION_ROLES)[number];

export const PERMISSIONS = [
  "master:read",
  "master:write",
  "procurement:read",
  "procurement:write",
  "procurement:approve",
  "procurement:receive",
  "inventory:read",
  "inventory:receive",
  "inventory:reserve",
  "inventory:issue",
  "inventory:return",
  "inventory:transfer",
  "inventory:qc",
  "inventory:scrap",
  "inventory:adjust",
  "inventory:reconcile",
  "manufacturing:read",
  "manufacturing:plan",
  "manufacturing:release",
  "manufacturing:approve",
  "manufacturing:cut",
  "manufacturing:execute",
  "manufacturing:rework",
  "manufacturing:pack",
  "quality:inspect",
  "fg:read",
  "fg:receive",
  "fg:adjust",
  "fg:sync",
  "fulfillment:read",
  "fulfillment:manage",
  "returns:read",
  "returns:authorize",
  "returns:receive",
  "returns:inspect",
  "returns:refund",
  "social:read",
  "social:manage",
  "order:read",
  "ops:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const warehouseOperator: Permission[] = [
  "master:read",
  "procurement:read",
  "procurement:receive",
  "inventory:read",
  "inventory:receive",
  "inventory:issue",
  "inventory:return",
  "inventory:transfer",
];

const readOnly: Permission[] = [
  "master:read",
  "procurement:read",
  "inventory:read",
];

export const ROLE_PERMISSIONS: Record<FashionRole, readonly Permission[]> = {
  ERP_ADMIN: PERMISSIONS,
  PROCUREMENT: [
    "master:read",
    "master:write",
    "procurement:read",
    "procurement:write",
    "procurement:approve",
    "inventory:read",
  ],
  WAREHOUSE_OPERATOR: warehouseOperator,
  WAREHOUSE_MANAGER: [
    ...warehouseOperator,
    "inventory:qc",
    "inventory:scrap",
    "inventory:adjust",
    "inventory:reconcile",
    "manufacturing:read",
    "fg:read",
    "fg:receive",
    "fg:adjust",
    "fulfillment:read",
    "fulfillment:manage",
    "returns:read",
    "returns:receive",
  ],
  PRODUCTION_PLANNER: [
    "master:read",
    "inventory:read",
    "inventory:reserve",
    "manufacturing:read",
    "manufacturing:plan",
    "manufacturing:release",
    "manufacturing:approve",
    "fg:read",
  ],
  CUTTING_OPERATOR: [
    "inventory:read",
    "inventory:issue",
    "inventory:return",
    "manufacturing:read",
    "manufacturing:cut",
  ],
  SEWING_OPERATOR: [
    "inventory:read",
    "manufacturing:read",
    "manufacturing:execute",
  ],
  SEWING_SUPERVISOR: [
    "inventory:read",
    "manufacturing:read",
    "manufacturing:execute",
    "manufacturing:rework",
  ],
  QC: [
    "inventory:read",
    "inventory:qc",
    "manufacturing:read",
    "quality:inspect",
    "returns:read",
    "returns:inspect",
  ],
  PACKING_OPERATOR: [
    "manufacturing:read",
    "manufacturing:pack",
    "fg:read",
    "fulfillment:read",
  ],
  COMMERCE_ADMIN: ["fg:read", "fulfillment:read", "order:read", "social:read"],
  CUSTOMER_SUPPORT: [
    "fg:read",
    "fulfillment:read",
    "fulfillment:manage",
    "returns:read",
    "returns:authorize",
    "order:read",
    "social:read",
    "social:manage",
    "manufacturing:read",
  ],
  FINANCE: ["procurement:read", "returns:read", "returns:refund", "order:read"],
  SRE: [
    "ops:read",
    "inventory:read",
    "inventory:reconcile",
    "fg:read",
    "fg:sync",
    "fulfillment:read",
    "social:read",
  ],
  AUDITOR: [
    ...readOnly,
    "ops:read",
    "inventory:reconcile",
    "manufacturing:read",
    "fg:read",
    "fulfillment:read",
    "returns:read",
    "social:read",
    "order:read",
  ],
};

const isFashionRole = (value: unknown): value is FashionRole =>
  typeof value === "string" &&
  (FASHION_ROLES as readonly string[]).includes(value);

/** Extracts valid roles from user metadata; unknown values are ignored. */
export const rolesFromMetadata = (metadata: unknown): FashionRole[] => {
  const raw = (metadata as { fashion_roles?: unknown } | null | undefined)
    ?.fashion_roles;
  return Array.isArray(raw) ? raw.filter(isFashionRole) : [];
};

export const hasPermission = (
  roles: readonly FashionRole[],
  permission: Permission
): boolean => roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
