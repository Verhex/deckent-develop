# Token Usage Audit Report — Sprint 139

**Generated:** 2026-04-15
**Sprint:** sprint-139
**Task:** 139-022 Worker Token Tracking Mandatory

---

## Executive Summary

Sprint 138 token tracking analysis revealed significant gaps:
- Tasks 138-001, 138-003: No `tokenUsage` field at all
- Task 138-002: Partial — `provider: "claude"`, `model: "sonnet"` present, but `inputTokens`/`outputTokens` were `undefined`
- Tasks 138-004, 138-010: Complete token tracking (these were HIGH effort / longer tasks)

**Sprint 139 enforcement level:** Soft warning (Sprint 140 → hard NO_GO)

---

## Sprint 138 Baseline Analysis

| Task | inputTokens | outputTokens | provider | model | Status |
|------|-------------|--------------|----------|-------|--------|
| 138-001 | ❌ missing | ❌ missing | ❌ missing | ❌ missing | No tokenUsage field |
| 138-002 | ❌ undefined | ❌ undefined | ✅ claude | ✅ sonnet | Partial |
| 138-003 | ❌ missing | ❌ missing | ❌ missing | ❌ missing | No tokenUsage field |
| 138-004 | ✅ present | ✅ present | ✅ present | ✅ present | Complete |
| 138-010 | ✅ present | ✅ present | ✅ present | ✅ present | Complete |

**Coverage:** 2/5 tasks with complete token data = **40%**

---

## Root Cause Analysis

1. **Worker prompt ambiguity:** The old instruction said *"If you cannot determine exact token counts, omit the tokenUsage field"* — this gave workers an easy escape hatch. Low-effort tasks (138-001, 138-003) used it.

2. **Partial data from Claude API:** Workers calling the Claude API directly had access to exact counts, but the result template encouraged omitting the field rather than estimating.

3. **No enforcement:** `result-evaluator.ts` had `aggregateTokenUsage()` that silently skipped missing data — no warning was emitted.

---

## Changes Made in Sprint 139 (Task 139-022)

### 1. `src/orchestra/result-evaluator.ts` — `validateTokenUsage()` function

New exported function that validates all four required fields:
- `inputTokens`: non-negative number
- `outputTokens`: non-negative number  
- `provider`: non-empty string ("claude", "codex", or "gemini")
- `model`: non-empty string

Returns `TokenUsageValidationResult` with:
- `isComplete: boolean` — all fields present and valid
- `warnings: string[]` — human-readable warnings per missing field
- `tokenUsageMissing: boolean` — whether the entire field was absent

**Sprint 139 behavior:** Warnings emitted but do NOT affect evaluation decision.
**Sprint 140 behavior:** Missing `tokenUsage` will trigger hard NO_GO.

### 2. `src/orchestra/task-builder.ts` — `buildWorkerPrompt()` template update

Changed token tracking instruction from optional ("omit if unknown") to MUST level:

**Before:**
> Include tokenUsage in your result JSON: {...}  
> If you cannot determine exact token counts, omit the tokenUsage field — the brain will estimate it.

**After:**
> MUST include tokenUsage with ALL four fields: {...}  
> Sprint 140 will reject results with missing tokenUsage as NO_GO.

The new instruction explicitly requires all four fields, provides the hardcoded `provider` and `model` values from the task config, and communicates the Sprint 140 enforcement escalation.

---

## Sprint 139 Target

**Goal:** ≥80% of workers write complete token data in Sprint 139

**Measurement:** After sprint execution, compare `.tasks/*.result` files:
```bash
# Count results with complete tokenUsage
node -e "
const fs = require('fs');
const results = fs.readdirSync('.tasks').filter(f => f.endsWith('.result'));
let complete = 0, total = 0;
for (const f of results) {
  const r = JSON.parse(fs.readFileSync('.tasks/' + f, 'utf8'));
  total++;
  const tu = r.tokenUsage;
  if (tu && typeof tu.inputTokens === 'number' && typeof tu.outputTokens === 'number' && tu.provider && tu.model) complete++;
}
console.log(complete + '/' + total + ' (' + Math.round(complete/total*100) + '%)');
"
```

---

## Sprint 140 Plan

If Sprint 139 achieves ≥80% coverage:
- Promote `validateTokenUsage()` warnings to hard enforcement
- Add `validateTokenUsage()` call inside `evaluateWithRubric()` — missing tokenUsage returns NO_GO decision
- Update `result-evaluator.ts` enforcement comment from "Sprint 140 hard NO_GO" to active code

If Sprint 139 achieves <60% coverage:
- Investigate which worker types are still missing data
- Consider adding token counting utility to worker runtime
