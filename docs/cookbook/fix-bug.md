# Cookbook: Fix a Bug with the Bug-Fixer Agent

> **Scenario:** Your test suite has a failing test. You know there is a bug somewhere — a function returning the wrong value, a null pointer, or a race condition — but you are not sure of the root cause. You hand the problem to Deckent's `bug-fixer` agent and let it diagnose and fix.

---

## What You Will Get

- Root cause analysis written to the task plan
- A targeted fix to the failing code (not a workaround)
- The previously-failing test now passing
- Regression check: the rest of the test suite still green

---

## Prerequisites

- Deckent initialized in your project (`deckent init`)
- A failing test you can identify by name or file
- The test suite runnable locally (`npm test`, `pytest`, etc.)

---

## The Failing Test

Imagine this test fails in your project:

```typescript
// tests/services/invoice-service.test.ts
describe('InvoiceService.calculateTotal', () => {
  it('applies discount correctly when discount > 0', () => {
    const total = InvoiceService.calculateTotal({
      lineItems: [{ price: 100, qty: 2 }],
      discountPercent: 10,
    });
    expect(total).toBe(180); // 200 - 10% = 180
  });
});
```

Running your tests gives:

```
FAIL  tests/services/invoice-service.test.ts
  ● InvoiceService.calculateTotal › applies discount correctly when discount > 0

    Expected: 180
    Received: 200
```

The discount is being ignored. You want Deckent to find and fix the root cause.

---

## Step 1: Write Your Directives

```markdown
# DIRECTIVES -- Sprint 7: Fix Invoice Discount Bug

## Goal: Fix the failing test in InvoiceService.calculateTotal — discount is not applied.

---

## Task 1: Fix Invoice Discount Calculation
- Model: sonnet
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/services/invoice-service.ts, tests/services/invoice-service.test.ts
- Scope: src/services/, tests/services/

### Description
The test `applies discount correctly when discount > 0` in
`tests/services/invoice-service.test.ts` is failing.

Expected: `calculateTotal({ lineItems: [{ price: 100, qty: 2 }], discountPercent: 10 })` → 180
Received: 200 (discount not applied)

**Diagnosis steps:**
1. Read `src/services/invoice-service.ts` — find `calculateTotal()`
2. Trace the logic: where is `discountPercent` read and applied?
3. Identify the root cause (missing conditional, wrong field name, order-of-operations bug)
4. Fix the minimal number of lines necessary — do not refactor unrelated code
5. Run `npm test -- tests/services/invoice-service.test.ts` to confirm the fix
6. Run the full suite `npm test` to check for regressions

**Evidence:** `npm test -- tests/services/invoice-service.test.ts` → all pass
**Test:** Existing test must pass; no new test failures allowed.
```

---

## Step 2: Start the Sprint

```bash
deckent start
```

The `bug-fixer` agent is activated based on the `Agent: bug-fixer` directive. Its system prompt specializes in root cause analysis, minimal targeted fixes, and regression prevention.

```
⏳ Sprint sprint-007 started

SPAWN  007-001  Fix Invoice Discount Calculation  → worker spawned
                agent: bug-fixer
                skills: typescript-expert, testing-expert
```

---

## Step 3: What the Bug-Fixer Does

The bug-fixer agent follows a structured diagnosis loop:

```
[plan]  Read calculateTotal() implementation
[plan]  Locate discountPercent usage
[plan]  Identify: discountPercent not used in subtraction — was never read
[code]  Add: const discountedTotal = subtotal * (1 - discountPercent / 100)
[test]  npm test -- tests/services/invoice-service.test.ts
[test]  PASS — 1/1
[test]  npm test
[test]  PASS — 47/47 (full suite)
[done]  selfAssessment: DONE
```

The plan file (`.tasks/task-007-001.plan`) written by the worker before coding:

```
Root cause: calculateTotal() computes subtotal correctly but never subtracts the
discount. discountPercent is accepted as a parameter but the return statement
ignores it.

Fix: Replace `return subtotal` with `return subtotal * (1 - discountPercent / 100)`.
Guard: if discountPercent is undefined or 0, the expression evaluates to subtotal
unchanged — no regression risk.

Regression check: run full suite after fix.
```

---

## Step 4: Review the Result

```
EVALUATE  007-001

  selfAssessment: DONE
  filesChanged:   src/services/invoice-service.ts (+1/-1)
  testsPassed:    true (47/47)
  linesAdded:     1
  linesRemoved:   1

GO ✓  Fix Invoice Discount Calculation
```

The fix is intentionally minimal: one line changed. The bug-fixer agent does not refactor, rename, or reorganize — it fixes the bug and stops.

---

## Step 5: When the First Attempt Fails (FIX Phase)

Sometimes the first fix attempt does not work — for example, the bug is deeper than it first appears (a race condition, a cache issue, or a missing database migration). When this happens, Brain does not give up.

### Example: Worker Returns NO_GO

```
EVALUATE  007-001

  selfAssessment: NO_GO
  notes: Fix applied but tests still fail — discountPercent is NaN at runtime.
         The field is passed as a string from the API layer and parseInt() is missing.
         Blocked: need to also fix src/api/invoice-controller.ts (outside scope).

NO_GO  007-001 — fix incomplete, cross-scope dependency detected
```

### Brain Enters the FIX Phase

```
FIX  007-001 — retrying with failure context

  reason:       Worker identified cross-scope dependency
  action:       Scope expanded to include src/api/invoice-controller.ts
  retry:        007-001-fix-1
```

Brain expands the task scope, injects the failure context into the worker prompt, and spawns a retry worker. The retry worker knows:
- What was tried (parseInt missing)
- Why it failed (string → number coercion)
- Which additional file to fix (`invoice-controller.ts`)

The retry succeeds:

```
GO ✓  Fix Invoice Discount Calculation (fix-1)
  filesChanged:  src/services/invoice-service.ts (+1/-1),
                 src/api/invoice-controller.ts (+3)
  testsPassed:   true (47/47)
```

---

## Step 6: Check the Retrospective

```bash
deckent retro
```

The retrospective records:
- Root cause pattern: `parameter type coercion — string passed where number expected`
- Cross-sprint impact: Deckent will surface this pattern if a similar bug appears in a future sprint

---

## Tips

- **Specify the failing test:** The more precise your description, the faster the diagnosis. Include the test name, file, and the `Expected`/`Received` values.
- **Agent: bug-fixer is optional:** If you omit it, Deckent's routing engine will assign `bug-fixer` automatically when it sees `fix`, `bug`, or `error` keywords in the task.
- **Keep scope tight:** If you know the bug is in `src/services/`, say so. A tighter scope means a faster, more focused fix.
- **NO_GO is not failure:** It is Deckent being honest. The FIX phase exists precisely for cases where the first attempt is incomplete.

---

## Related

- [Getting Started](/guide/getting-started)
- [Agent Reference — bug-fixer](/reference/agents#bug-fixer)
- [Sprint Lifecycle — FIX Phase](https://github.com/VerhexIO/deckent/blob/main/docs/architecture/sprint-lifecycle.md#fix)
- [Cookbook: Add a REST API Endpoint](add-rest-api)
