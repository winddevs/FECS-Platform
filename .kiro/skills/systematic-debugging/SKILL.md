---
name: systematic-debugging
description: Root-cause-first debugging for bugs, test failures, and unexpected behavior. Load when fixing bugs or investigating failures.
version: 1.0.0
source: Adapted from Superpowers systematic-debugging skill for autonomous harness operation
triggers:
  - bug
  - test failure
  - unexpected behavior
  - error investigation
  - debugging
loads_references_on_demand:
  - root-cause-tracing.md
  - defense-in-depth.md
---

# Systematic Debugging — AI Team (Autonomous)

## Core Principle

**ALWAYS find root cause before attempting fixes. Symptom fixes are failure.**

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

Random fixes waste time and create new bugs. Quick patches mask underlying issues.

## When to Use

Use for ANY technical issue:

- Test failures
- Bugs reported in Multica issue
- Unexpected behavior
- Performance problems
- Build failures
- Integration issues

**Use this ESPECIALLY when:**

- Under time pressure (emergencies make guessing tempting)
- "Just one quick fix" seems obvious
- You've already tried multiple fixes
- Previous fix didn't work

## The Four Phases (Autonomous Workflow)

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read Error Messages Completely**

   ```bash
   # Capture full error output
   npm test 2>&1 | tee error.log
   # or
   docker logs <container> > error.log
   ```
   - Read stack traces completely
   - Note line numbers, file paths, error codes
   - Don't skip warnings

2. **Reproduce Consistently**

   ```bash
   # Document reproduction steps in Multica comment
   multica issue comment "Reproduction steps:
   1. Run: npm test path/to/failing-test
   2. Fails with: <error message>
   3. Occurs: every time / intermittent (XX% of runs)"
   ```
   - Can you trigger it reliably?
   - If intermittent: run 10 times, note failure rate

3. **Check Recent Changes**

   ```bash
   # What changed that could cause this?
   git log --oneline -10
   git diff HEAD~5..HEAD -- path/to/affected/file

   # Check dependencies
   git diff HEAD~1 package.json
   git diff HEAD~1 package-lock.json
   ```

4. **Gather Evidence in Multi-Component Systems**

   **For systems with multiple layers (API → service → database, CI → build → deployment):**

   Add diagnostic instrumentation **BEFORE** proposing fixes:

   ```typescript
   // Layer 1: API entry
   console.log("=== Request received ===", {
     method: req.method,
     path: req.path,
     body: req.body,
     headers: req.headers,
   });

   // Layer 2: Service call
   console.log("=== Service input ===", serviceInput);
   const result = await service.process(serviceInput);
   console.log("=== Service output ===", result);

   // Layer 3: Database query
   console.log("=== DB query ===", { sql, params });
   const rows = await db.query(sql, params);
   console.log("=== DB result ===", { rowCount: rows.length });
   ```

   Run once to gather evidence, identify failing layer, then investigate that specific component.

5. **Trace Data Flow (See root-cause-tracing.md)**

   When error is deep in call stack, trace backward:

   ```bash
   # Where does bad value originate?
   # What called this with bad value?
   # Keep tracing up until you find the source
   ```

### Phase 2: Pattern Analysis

**Find the pattern before fixing:**

1. **Find Working Examples**

   ```bash
   # Locate similar working code in same codebase
   grep -r "similarPattern" src/
   ```

2. **Compare Against References**
   - Read reference implementation COMPLETELY (don't skim)
   - Read documentation fully
   - Check CONTEXT.md for service-specific patterns

3. **Identify Differences**

   ```bash
   # Compare working vs broken
   diff working.ts broken.ts
   ```
   - List every difference, however small
   - Don't assume "that can't matter"

4. **Understand Dependencies**
   - Check package.json versions
   - Review environment variables
   - Check configuration files

### Phase 3: Hypothesis and Testing

**Scientific method (autonomous):**

1. **Form Single Hypothesis**

   ```bash
   # Document in Multica comment
   multica issue comment "Hypothesis: X is the root cause because Y

   Evidence:
   - Error occurs at line 42 in auth.ts
   - auth.ts calls validateToken with undefined
   - validateToken expects non-null token
   - Token is undefined when request has no Authorization header

   Root cause: Missing header validation before calling validateToken"
   ```

2. **Test Minimally**
   - Make the SMALLEST possible change to test hypothesis
   - One variable at a time
   - Create new branch for test:
     ```bash
     git checkout -b test/hypothesis-missing-header-validation
     ```

3. **Verify Before Continuing**

   ```bash
   npm test path/to/test.test.ts
   ```
   - Did it work? Yes → Phase 4
   - Didn't work? Form NEW hypothesis, document in comment
   - DON'T add more fixes on top

4. **Escalate When Stuck**
   ```bash
   # After 3 failed hypotheses, escalate to tech-lead
   multica issue comment "Attempted 3 hypotheses, all failed:
   1. [hypothesis 1] - result: [still fails because X]
   2. [hypothesis 2] - result: [still fails because Y]
   3. [hypothesis 3] - result: [still fails because Z]

   Request: Escalate to tech-lead for architectural review"

   multica issue update --status in_review
   ```

### Phase 4: Implementation (Autonomous)

**Fix the root cause, not the symptom:**

1. **Create Failing Test Case**

   ```typescript
   test("rejects request with missing Authorization header", async () => {
     const response = await request(app).get("/api/protected").expect(401);

     expect(response.body.error).toBe("Authorization header required");
   });
   ```

   Run and confirm it fails:

   ```bash
   npm test -- --testNamePattern="missing Authorization header"
   ```

2. **Implement Single Fix**

   ```typescript
   // Address the root cause identified
   function validateRequest(req: Request) {
     if (!req.headers.authorization) {
       throw new AuthError("Authorization header required");
     }
     // ... rest of validation
   }
   ```

   - ONE change at a time
   - No "while I'm here" improvements
   - No bundled refactoring

3. **Verify Fix**

   ```bash
   # Test passes now?
   npm test -- --testNamePattern="missing Authorization header"

   # No other tests broken?
   npm test

   # Document in Multica
   multica issue comment "Fix verified:
   - New test passes
   - All existing tests pass
   - No regressions introduced"
   ```

4. **If 3+ Fixes Failed: Escalate Architecture Question**

   If you've tried 3+ fixes and each reveals new problems:

   ```bash
   multica issue comment "Pattern indicates architectural problem:
   - Fix 1 revealed shared state issue in layer A
   - Fix 2 revealed coupling issue in layer B
   - Fix 3 revealed different symptom in layer C

   Each fix requires massive refactoring.

   Request: tech-lead review - is this pattern fundamentally sound?
   Should we refactor architecture vs. continue fixing symptoms?"

   multica issue update --status in_review
   ```

   This is NOT a failed hypothesis - this is wrong architecture. Tech-lead decides.

## Autonomous Workflow Integration

### For Coder Agents

When assigned a bug (label: `task:bugfix`):

1. **Phase 1**: Investigate, document findings in Multica comment
2. **Phase 2**: Analyze patterns, document comparison
3. **Phase 3**: Form hypothesis, test minimally, document result
4. **Phase 4**: If hypothesis confirmed, implement fix with test
5. **Handoff**: Update issue with evidence before setting status=done

### Escalation Triggers (Autonomous)

Automatically escalate (status=in_review) when:

- 3+ fix attempts failed
- Each fix reveals new problem in different area
- Fix requires "massive refactoring"
- Fundamental architectural question emerges

## Evidence Documentation Format

Always document in Multica comments:

```markdown
## Debugging Progress

### Investigation (Phase 1)

- Error: [full error message]
- Reproduction: [steps + consistency]
- Recent changes: [relevant commits]
- Evidence: [logs/traces]

### Pattern Analysis (Phase 2)

- Working example: [file:line]
- Key differences: [list]
- Dependencies checked: [list]

### Hypothesis (Phase 3)

- Hypothesis: [statement]
- Evidence: [supporting data]
- Test result: [pass/fail + why]

### Implementation (Phase 4)

- Test created: [file:line]
- Fix applied: [file:line]
- Verification: [all tests pass + evidence]
```

## Red Flags - Document and Escalate

If you catch yourself thinking:

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "One more fix attempt" (when already tried 2+)

**ALL of these mean: STOP. Document current state, escalate to tech-lead.**

## Common Rationalizations (Autonomous Guard)

| Excuse                                | Autonomous Action                                        |
| ------------------------------------- | -------------------------------------------------------- |
| "Issue is simple, don't need process" | Simple issues have root causes too. Follow process.      |
| "Emergency, no time for process"      | Systematic is FASTER than thrashing. Follow process.     |
| "Just try this first"                 | First fix sets pattern. Investigate first.               |
| "I see the problem, let me fix it"    | Seeing symptoms ≠ understanding root cause. Investigate. |
| "One more fix attempt" (after 2+)     | 3+ failures = architectural problem. Escalate.           |

## Integration with Harness Pipeline

```
Bug issue created (label: task:bugfix)
     ↓
Harness orchestrator routes to coder
     ↓
Coder loads systematic-debugging skill
     ↓
Phases 1-4 (documented in comments)
     ↓
If 3+ attempts: escalate to tech-lead
     ↓
If successful: status=done with evidence
     ↓
Tech-lead reviews evidence + fix
     ↓
If approved: tester validates
```

## Quick Reference (Autonomous)

| Phase                 | Key Activities                          | Success Criteria            | Escalate If        |
| --------------------- | --------------------------------------- | --------------------------- | ------------------ |
| **1. Root Cause**     | Read errors, reproduce, gather evidence | Understand WHAT and WHY     | Can't reproduce    |
| **2. Pattern**        | Find working examples, compare          | Identify differences        | No pattern found   |
| **3. Hypothesis**     | Form theory, test minimally             | Confirmed or new hypothesis | 3+ failed          |
| **4. Implementation** | Create test, fix, verify                | Tests pass, no regressions  | Architecture issue |

## Related Skills

- **tdd** - For creating failing test case (Phase 4, Step 1)
- **task-handoff-contract** - For documenting evidence in handoff
- **code-review** - Tech-lead uses to verify fix quality

---

_Content rephrased and adapted from Superpowers systematic-debugging skill for autonomous harness operation. Original by Jesse Vincent (obra). Licensed under MIT._
