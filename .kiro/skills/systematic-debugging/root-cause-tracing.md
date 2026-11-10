# Root Cause Tracing

## Backward Tracing Technique

When an error occurs deep in the call stack, trace backward to find the original trigger.

## The Process

```
Error at Layer N (deepest)
    ↓ What called this with bad input?
Layer N-1
    ↓ Where did N-1 get this value?
Layer N-2
    ↓ Continue tracing up
...
    ↓
Layer 0 (origin) ← Fix here, not at Layer N
```

## Example: Null Reference Error

```
Error: Cannot read property 'id' of undefined
  at getUserPermissions (permissions.ts:42)
  at authorizeRequest (auth.ts:15)
  at validateToken (token.ts:8)
  at middleware (app.ts:3)
```

**DON'T fix at Layer 4 (permissions.ts):**

```typescript
// ❌ Symptom fix
function getUserPermissions(user) {
  if (!user) return []; // masks the problem
  return user.permissions;
}
```

**DO trace backward:**

1. **Layer 4**: `getUserPermissions` expects `user` object
2. **Layer 3**: `authorizeRequest` passes `user` from token
3. **Layer 2**: `validateToken` returns parsed token
4. **Layer 1**: `middleware` calls `validateToken` with `req.headers.authorization`
5. **Layer 0**: Request has no Authorization header

**Fix at origin (Layer 0/1):**

```typescript
// ✅ Root cause fix
function middleware(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: "Authorization required" });
  }
  // ... continue
}
```

## Tracing Technique

### 1. Start at Error Site

```typescript
// Error occurs here
function getUserPermissions(user) {
  return user.permissions; // user is undefined
}
```

### 2. Find Caller

```bash
# Search for function calls
grep -r "getUserPermissions" src/
```

```typescript
// Found in auth.ts
function authorizeRequest(token) {
  const user = parseToken(token); // ← user is undefined here
  return getUserPermissions(user);
}
```

### 3. Trace Up Another Level

```typescript
// What calls authorizeRequest?
function validateToken(authHeader) {
  const token = authHeader.split(" ")[1]; // ← authHeader is undefined
  return authorizeRequest(token);
}
```

### 4. Continue Until Origin

```typescript
// app.ts - the origin
function middleware(req, res, next) {
  validateToken(req.headers.authorization); // ← no header validation!
}
```

## Autonomous Tracing Workflow

```bash
# 1. Document the error
multica issue comment "Error trace:
Line 42 in permissions.ts: user is undefined
Called from: auth.ts:15
Called from: token.ts:8
Called from: app.ts:3"

# 2. Examine each layer
cat src/permissions.ts | grep -A 5 "getUserPermissions"
cat src/auth.ts | grep -A 10 "authorizeRequest"
cat src/token.ts | grep -A 10 "validateToken"
cat src/app.ts | grep -A 10 "middleware"

# 3. Identify origin
multica issue comment "Root cause: app.ts:3
middleware() calls validateToken() without checking if
req.headers.authorization exists.

When header is missing:
- validateToken receives undefined
- parseToken tries to split undefined
- returns undefined
- getUserPermissions crashes on undefined.permissions

Fix: Add header validation at middleware layer"
```

## When to Stop Tracing

Stop when you find:

1. **Missing validation** - Input not checked before use
2. **Wrong assumption** - Code assumes value always exists
3. **Configuration error** - Environment variable missing
4. **Integration point** - External system returns unexpected data

## Defense in Depth

After finding and fixing root cause, add validation at each layer for robustness:

```typescript
// Layer 0: Origin (prevent bad input)
function middleware(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: "Authorization required" });
  }
  validateToken(req.headers.authorization);
}

// Layer 2: Validate return values
function validateToken(authHeader) {
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    throw new AuthError("Invalid authorization format");
  }
  return authorizeRequest(parts[1]);
}

// Layer 4: Defensive check (last resort)
function getUserPermissions(user) {
  if (!user) {
    throw new Error("User required"); // explicit error, not silent []
  }
  return user.permissions;
}
```

See `defense-in-depth.md` for complete defensive validation patterns.

---

_Adapted from Superpowers root-cause-tracing technique_
