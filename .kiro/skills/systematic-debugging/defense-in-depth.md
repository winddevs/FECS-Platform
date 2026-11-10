# Defense in Depth

## Principle

After finding and fixing the root cause, add validation at multiple layers to prevent similar issues.

## The Pattern

```
┌─────────────────────────────────────────────────┐
│ Layer 1: Input Validation (prevent bad input)  │
│   - Validate at API boundary                    │
│   - Check required fields                       │
│   - Reject invalid early                        │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│ Layer 2: Contract Validation (enforce contract)│
│   - Validate between services                   │
│   - Check assumptions                           │
│   - Fail fast if contract violated              │
└────────────────┬────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────┐
│ Layer 3: Defensive Checks (last resort)        │
│   - Explicit error, not silent defaults         │
│   - Log unexpected conditions                   │
│   - Prevent crashes                             │
└─────────────────────────────────────────────────┘
```

## Example: User Authorization

### Layer 1: API Input Validation

```typescript
// Validate at entry point
app.post("/api/resource", validateAuthHeader, async (req, res) => {
  // Handler only runs if header valid
});

function validateAuthHeader(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth) {
    return res.status(401).json({
      error: "Authorization header required",
    });
  }

  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Invalid authorization format. Expected: Bearer <token>",
    });
  }

  next();
}
```

### Layer 2: Service Contract Validation

```typescript
// Validate at service boundary
class AuthService {
  async validateToken(authHeader: string): Promise<User> {
    // Contract: authHeader must be "Bearer <token>"
    const parts = authHeader.split(" ");

    if (parts.length !== 2) {
      throw new AuthError("Invalid authorization format");
    }

    const token = parts[1];

    if (!token || token.length < 10) {
      throw new AuthError("Invalid token");
    }

    const user = await this.parseAndVerifyToken(token);

    if (!user) {
      throw new AuthError("Token validation failed");
    }

    return user;
  }
}
```

### Layer 3: Defensive Checks

```typescript
// Defensive check in permission layer
function getUserPermissions(user: User | null): Permission[] {
  if (!user) {
    // Don't silently return empty array
    // This condition should never happen if layers 1 & 2 work
    console.error("getUserPermissions called with null user - this is a bug");
    throw new Error("User required for permission check");
  }

  if (!user.id) {
    console.error("User missing id:", user);
    throw new Error("Invalid user object");
  }

  return user.permissions || [];
}
```

## Backend-Specific Patterns

### Database Queries

```typescript
// Layer 1: Validate input IDs
async function getOrder(orderId: string) {
  if (!orderId || orderId.trim() === "") {
    throw new ValidationError("Order ID required");
  }

  if (!/^[0-9a-f]{24}$/.test(orderId)) {
    throw new ValidationError("Invalid order ID format");
  }

  const order = await db.orders.findById(orderId);

  // Layer 3: Defensive check
  if (!order) {
    throw new NotFoundError(`Order ${orderId} not found`);
  }

  return order;
}
```

### External API Calls

```typescript
// Layer 1: Validate request params
async function fetchUserData(userId: string): Promise<UserData> {
  if (!userId) {
    throw new ValidationError("User ID required");
  }

  // Layer 2: Validate response
  const response = await externalAPI.get(`/users/${userId}`);

  if (!response.ok) {
    throw new ExternalAPIError(`API returned ${response.status}`);
  }

  const data = response.json();

  if (!data || !data.id || !data.email) {
    throw new ExternalAPIError("Invalid response format from external API");
  }

  // Layer 3: Transform to internal format with defensive checks
  return {
    id: data.id,
    email: data.email,
    name: data.name || "Unknown", // default for optional field
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
  };
}
```

### Environment Configuration

```typescript
// Layer 1: Validate at startup
function loadConfig(): Config {
  const dbUrl = process.env.DATABASE_URL;
  const apiKey = process.env.API_KEY;

  if (!dbUrl) {
    throw new ConfigError("DATABASE_URL environment variable required");
  }

  if (!apiKey) {
    throw new ConfigError("API_KEY environment variable required");
  }

  // Layer 2: Validate format
  if (!dbUrl.startsWith("postgresql://")) {
    throw new ConfigError(
      "DATABASE_URL must be a PostgreSQL connection string"
    );
  }

  return { dbUrl, apiKey };
}

// Call at startup, fail fast
const config = loadConfig();
```

## When NOT to Use Defense in Depth

**Don't add defensive checks when:**

1. **TypeScript types guarantee safety**

   ```typescript
   // No need for defensive check - TypeScript ensures user is not null
   function processUser(user: User) {
     return user.id; // safe, TypeScript guarantees user exists
   }
   ```

2. **Internal private functions with narrow usage**

   ```typescript
   // Private helper, only called from one place with validated input
   private formatDate(date: Date): string {
     return date.toISOString();  // caller guarantees date exists
   }
   ```

3. **Performance-critical paths after root cause fix**
   - Fix root cause
   - Add defensive checks in development
   - Remove inner checks in production if proven unnecessary

## Testing Defense Layers

Each layer should have explicit tests:

```typescript
describe("Defense in depth - User authorization", () => {
  describe("Layer 1: API input validation", () => {
    it("rejects missing Authorization header", async () => {
      await request(app)
        .post("/api/resource")
        .expect(401)
        .expect({ error: "Authorization header required" });
    });

    it("rejects invalid Authorization format", async () => {
      await request(app)
        .post("/api/resource")
        .set("Authorization", "InvalidFormat")
        .expect(401);
    });
  });

  describe("Layer 2: Service contract validation", () => {
    it("throws on empty token", async () => {
      await expect(authService.validateToken("Bearer ")).rejects.toThrow(
        "Invalid token"
      );
    });
  });

  describe("Layer 3: Defensive checks", () => {
    it("throws explicit error on null user", () => {
      expect(() => getUserPermissions(null)).toThrow(
        "User required for permission check"
      );
    });
  });
});
```

## Autonomous Integration

When fixing a bug with systematic-debugging:

1. **Phase 4**: Fix root cause
2. **After fix**: Add defensive checks at 2-3 layers
3. **Document**: Add comment explaining each layer
4. **Test**: Write tests for each defense layer
5. **Handoff**: Note defensive improvements in task handoff

```bash
multica issue comment "Fix applied with defense in depth:

Root cause fix (Layer 1):
- Added Authorization header validation at middleware
- Rejects requests without valid Bearer token

Contract validation (Layer 2):
- validateToken checks token format and length
- Throws AuthError with clear message if invalid

Defensive check (Layer 3):
- getUserPermissions explicitly throws if user is null
- Logs error (indicates bug in layers 1-2)

Tests added:
- Layer 1: Missing/invalid header rejection
- Layer 2: Token format validation
- Layer 3: Null user handling"
```

---

_Adapted from Superpowers defense-in-depth technique_
