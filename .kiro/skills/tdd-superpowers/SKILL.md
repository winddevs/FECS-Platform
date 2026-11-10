---
name: tdd-superpowers
description: Enhanced RED-GREEN-REFACTOR with evidence-based completion. Load for all feature and bugfix implementation.
version: 1.0.0
source: Adapted from Superpowers test-driven-development skill for autonomous harness operation
triggers:
  - new feature
  - bugfix
  - behavior change
  - implementation
  - red green refactor
---

# TDD Superpowers (Autonomous)

## Core Principle

**Write the test first. Watch it fail. Write minimal code to pass.**

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

**If you didn't watch the test fail, you don't know if it tests the right thing.**

## The Iron Law (Autonomous Enforcement)

Write code before the test?

1. Document violation in Multica comment
2. Delete the code
3. Start over with test-first

No exceptions. No "keep as reference". Delete means delete.

## RED-GREEN-REFACTOR Cycle

```
RED    → Write failing test
         ↓
VERIFY → Run test, confirm correct failure
         ↓
GREEN  → Write minimal code to pass
         ↓
VERIFY → Run test, confirm passes
         ↓
REFACTOR → Clean up (keep tests green)
         ↓
VERIFY → All tests still pass
         ↓
COMMIT → Save checkpoint
         ↓
REPEAT → Next test
```

## Phase 1: RED — Write Failing Test

Write one minimal test showing what should happen.

### Good Test Example (Backend)

```typescript
// ✅ Clear name, tests real behavior, one thing
describe("OrderService", () => {
  test("retries failed payment operations 3 times", async () => {
    let attempts = 0;
    const paymentGateway = {
      charge: async () => {
        attempts++;
        if (attempts < 3) throw new Error("Network timeout");
        return { success: true, transactionId: "txn_123" };
      },
    };

    const service = new OrderService(paymentGateway);
    const result = await service.processPayment(order);

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });
});
```

**Why good:**

- Clear name describes behavior
- Tests real code (minimal mock)
- One assertion about retry behavior
- Tests public API, not internals

### Bad Test Example

```typescript
// ❌ Vague name, tests mock not code
test("retry works", async () => {
  const mock = jest
    .fn()
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce({ success: true });

  await service.processPayment(order);

  expect(mock).toHaveBeenCalledTimes(3);
});
```

**Why bad:**

- Vague name ("retry works")
- Tests mock behavior, not actual code
- Doesn't verify correct result

### Backend-Specific Test Patterns

**Database operations:**

```typescript
test("creates order with correct status", async () => {
  const order = await orderService.create({
    customerId: "cust_123",
    items: [{ sku: "ITEM-1", quantity: 2 }],
  });

  expect(order.status).toBe("pending");
  expect(order.total).toBe(1998); // 2 * 999

  // Verify in database
  const dbOrder = await db.orders.findById(order.id);
  expect(dbOrder.status).toBe("pending");
});
```

**API endpoints:**

```typescript
test("POST /api/orders returns 201 with order ID", async () => {
  const response = await request(app)
    .post("/api/orders")
    .send({
      customerId: "cust_123",
      items: [{ sku: "ITEM-1", quantity: 1 }],
    })
    .expect(201);

  expect(response.body.orderId).toMatch(/^ord_[a-z0-9]+$/);
  expect(response.body.status).toBe("pending");
});
```

## Phase 2: VERIFY RED — Watch It Fail (Mandatory)

**NEVER skip this step.**

```bash
# Run the specific test
npm test -- --testNamePattern="retries failed payment"

# Expected output:
# FAIL: Expected 3 attempts, got undefined
# ReferenceError: processPayment is not defined
```

### Autonomous Verification

```bash
# Capture test output
npm test path/to/test.test.ts 2>&1 | tee test-red.log

# Document in Multica
multica issue comment "RED phase verified:
Test: 'retries failed payment operations 3 times'
Result: FAIL (expected)
Error: ReferenceError: processPayment is not defined
Reason: Feature not implemented yet

Test fails correctly. Proceeding to GREEN phase."
```

### Red Flags

**Test passes?** You're testing existing behavior. Fix test to test NEW behavior.

**Test errors?** Fix error (typo, missing import), re-run until it FAILS correctly.

**Test skipped?** Violation. Must watch fail. Document and escalate.

## Phase 3: GREEN — Minimal Code

Write simplest code to pass the test.

### Good Implementation

```typescript
// ✅ Just enough to pass
class OrderService {
  constructor(private paymentGateway: PaymentGateway) {}

  async processPayment(order: Order): Promise<PaymentResult> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await this.paymentGateway.charge(order.total);
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }
    throw new Error("unreachable");
  }
}
```

**Why good:**

- Implements exactly what test requires
- No extra features
- No premature optimization

### Bad Implementation (Over-engineered)

```typescript
// ❌ YAGNI (You Aren't Gonna Need It)
class OrderService {
  async processPayment(
    order: Order,
    options?: {
      maxRetries?: number;
      backoff?: "linear" | "exponential";
      onRetry?: (attempt: number) => void;
      timeout?: number;
    }
  ): Promise<PaymentResult> {
    const maxRetries = options?.maxRetries || 3;
    const backoff = options?.backoff || "linear";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const delay = this.calculateBackoff(attempt, backoff);
        await sleep(delay);
        // ... complex retry logic
      } catch (error) {
        options?.onRetry?.(attempt);
        // ...
      }
    }
  }

  private calculateBackoff(attempt: number, strategy: string): number {
    // ... 20 more lines
  }
}
```

**Why bad:**

- Test only requires 3 fixed retries
- Added configurable retries, backoff strategies, callbacks, timeouts
- Solving problems you don't have yet

**Rule:** If test doesn't require it, don't implement it.

## Phase 4: VERIFY GREEN — Watch It Pass (Mandatory)

```bash
# Run the specific test
npm test -- --testNamePattern="retries failed payment"

# Expected: PASS

# Run all tests
npm test

# Expected: All pass, no errors/warnings
```

### Autonomous Verification

```bash
# Capture test output
npm test 2>&1 | tee test-green.log

# Document in Multica
multica issue comment "GREEN phase verified:
Test: 'retries failed payment operations 3 times'
Result: PASS ✓
All tests: 42 pass, 0 fail
Output: pristine (no errors, no warnings)

Proceeding to REFACTOR (if needed) or COMMIT."
```

### Red Flags

**Test fails?** Fix code, not test. Re-run.

**Other tests fail?** Regression. Fix immediately before proceeding.

**Warnings in output?** Not pristine. Fix warnings.

## Phase 5: REFACTOR — Clean Up (Optional)

**Only after GREEN. Keep tests green.**

```typescript
// Before: Duplication
test('processes payment with retry', async () => {
  const gateway = { charge: async () => { ... } };
  const service = new OrderService(gateway);
  // ...
});

test('handles payment failure after retries', async () => {
  const gateway = { charge: async () => { ... } };
  const service = new OrderService(gateway);
  // ...
});

// After: Extract helper
function createTestService(chargeImpl) {
  const gateway = { charge: chargeImpl };
  return new OrderService(gateway);
}

test('processes payment with retry', async () => {
  const service = createTestService(async () => { ... });
  // ...
});
```

**Rules:**

- Remove duplication
- Improve names
- Extract helpers
- Don't add behavior
- Keep tests green

```bash
# After each refactor
npm test
```

## Phase 6: COMMIT — Save Checkpoint

```bash
# After GREEN (and optional REFACTOR)
git add src/services/OrderService.ts src/services/__tests__/OrderService.test.ts
git commit -m "feat: add payment retry logic (3 attempts)

- Retries failed payment operations up to 3 times
- Throws error after 3rd failure
- Test: 'retries failed payment operations 3 times'

RED: Confirmed test failed (processPayment undefined)
GREEN: Test passes, all 42 tests pass
REFACTOR: None needed"

git push origin agent/payment-service/iss-42/coder
```

## Autonomous Workflow Integration

### For Coder Agents

When implementing new feature (after planner decomposition):

1. **Read sub-task requirements** from Multica issue
2. **RED**: Write failing test for first behavior
3. **VERIFY RED**: Run test, document failure in comment
4. **GREEN**: Implement minimal code
5. **VERIFY GREEN**: Run all tests, document success
6. **REFACTOR** (if needed): Clean up, verify tests stay green
7. **COMMIT**: Save checkpoint with TDD evidence
8. **REPEAT**: Next behavior until sub-task complete
9. **Handoff**: Update issue with test evidence

### Evidence Documentation

Always include in Multica handoff comment:

```markdown
## Implementation Evidence (TDD)

### Tests Created

- `OrderService.test.ts::retries failed payment operations 3 times`
- `OrderService.test.ts::throws after 3 failed attempts`
- `OrderService.test.ts::returns transaction ID on success`

### TDD Cycle

- RED phases: 3 tests, all failed correctly before implementation
- GREEN phases: All tests pass, 42 total tests pass
- REFACTOR: Extracted retry logic helper
- COMMITS: 3 commits (one per test)

### Test Results
```

PASS src/services/**tests**/OrderService.test.ts
✓ retries failed payment operations 3 times (45ms)
✓ throws after 3 failed attempts (12ms)
✓ returns transaction ID on success (8ms)

Test Suites: 1 passed, 1 total
Tests: 42 passed, 42 total

```

## Common Rationalizations (Autonomous Guard)

| Excuse | Autonomous Action |
|--------|-------------------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. Write test. |
| "I'll test after" | Tests passing immediately prove nothing. Test first. |
| "Need to explore first" | Fine. Throw away exploration, start with TDD. |
| "Test hard = design unclear" | Listen to test. Hard to test = hard to use. Simplify design. |
| "Already manually tested" | Ad-hoc ≠ systematic. Write automated test. |

## Red Flags - Document and Restart

If you catch yourself:
- Writing code before test
- Test passes immediately (didn't watch fail)
- Can't explain why test failed
- Skipping RED verification
- Adding features not in test

**Action: Document violation, delete code, start over with test-first.**

## Integration with Harness Pipeline

```

Planner creates sub-task (task:implementation)
↓
Harness orchestrator routes to coder
↓
Coder loads tdd-superpowers skill
↓
For each behavior:
RED → VERIFY RED → GREEN → VERIFY GREEN → REFACTOR → COMMIT
↓
All behaviors done:
Coder posts handoff comment with test evidence
(test names, results, TDD cycle summary)
Coder reassigns → tech-lead
Coder sets status → in_review
↓
Tech-lead reviews tests + implementation
↓
Tester validates (coder's unit tests already exist). The planner's dedicated
`tester:` sub-task runs once in QA: full suite + integration/edge/regression tests only,
no production code changes

```

## Verification Checklist (Autonomous)

Before marking sub-task complete:

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass (captured in test-green.log)
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)
- [ ] Edge cases and errors covered
- [ ] Documented test evidence in Multica comment

Can't check all boxes? TDD was not followed. Escalate to tech-lead.

## Quick Reference (Autonomous)

| Phase | Action | Verify | Document |
|-------|--------|--------|----------|
| **RED** | Write failing test | Test fails correctly | Error message in comment |
| **GREEN** | Minimal code | All tests pass | Test results in comment |
| **REFACTOR** | Clean up | Tests stay green | Changes in commit |
| **COMMIT** | Save checkpoint | Git push succeeds | Include TDD evidence |

## Related Skills

- **systematic-debugging** - For bugs, start with failing test reproducing bug
- **testing-standards** - Backend-specific test patterns
- **task-handoff-contract** - Include test evidence in handoff

---

*Content rephrased and adapted from Superpowers test-driven-development skill for autonomous harness operation. Original by Jesse Vincent (obra). Licensed under MIT.*
```
