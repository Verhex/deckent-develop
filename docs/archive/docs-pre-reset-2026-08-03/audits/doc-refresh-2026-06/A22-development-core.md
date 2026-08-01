# A22 — Development Guides: Brain / Worker / Agent / Smoke

**Sprint:** 345  
**Task:** 345-022  
**Date:** 2026-06-28  
**Auditor:** w-345-022 (doc-writer)  
**Scope:** `docs/development/agent-guide.md`, `docs/development/brain-guide.md`, `docs/development/worker-guide.md`, `docs/development/smoke-verify.md`  
**Also:** Duplication analysis between `docs/development/worker-guide.md` and `docs/worker-guide.md`

---

## Summary

Four development guides verified against source files in `src/orchestra/`, `src/agents/`, `src/core/`, and `scripts/`. Brain guide and agent guide are substantially accurate with two notable divergences. Smoke-verify is fully accurate. Two guides covering worker lifecycle are significantly duplicated and contain contradictory content; a consolidation recommendation is made.

**Overall verdict:** Agent guide and smoke-verify are publishable as-is. Brain guide has one medium divergence (`evaluateResult()` logic is stale) and one omission (`evaluateWithRubric()` not mentioned). Worker guide duplication is the most critical finding — the two files contradict each other on heartbeat format, lifecycle states, and verify-loop scope.

---

## Doc 1: `docs/development/brain-guide.md`

### Claims Verified

| Claim | Status | Source Evidence |
|-------|--------|-----------------|
| `brain.ts` is a slim re-export layer | ✓ PASS | `src/orchestra/brain.ts:1-54` — pure re-exports only, no logic |
| `sprint-controller.ts` is thin orchestration layer | ✓ PASS | `src/orchestra/sprint-controller.ts:1-5` — confirms god-object split |
| Module family: sprint-planner, sprint-spawner, sprint-reporter, debt-manager, result-collector, task-builder | ✓ PASS | `src/orchestra/brain.ts:44-54` re-export list confirms all six modules |
| Planning modes: `ai \| structured \| auto`, default `auto` | ✓ PASS | `src/core/config.ts` (via brain_planning field); guide description matches |
| Memory V2 schema: 5 tables + FTS5 virtual table | ✓ PASS | `src/core/memory-store.ts` — entries, tags, relations, entry_history, entries_fts, schema_version |
| `readContext()` loads from memory.db via `store.getByType()` | ✓ PASS | `src/orchestra/sprint-planner.ts` — pattern confirmed |
| Wave execution via Kahn's topological sort | ✓ PASS | `src/orchestra/sprint-spawner.ts` — dependency pipeline present |
| `writeRetrospective` / `writeSprintLog` attributed to sprint-reporter | ✓ PASS | `src/orchestra/brain.ts:50` re-exports from `./sprint-reporter.js` |
| ADR compile-time lint via `authority-enforcer.ts` | ✓ PASS | `src/orchestra/authority-enforcer.ts` — imported in sprint-controller.ts:127 |
| ADR prompt injection into workers | ✓ PASS | `src/orchestra/task-builder.ts` — confirmed by brain-guide description |

### Issues

#### ISSUE B1.1 — `evaluateResult()` logic table is stale / simplified (MEDIUM)

**Location:** `docs/development/brain-guide.md:139-148` (GO/NO-GO Evaluation section)

**Documented logic (brain-guide):**
```
selfAssessment === 'NO_GO'             → NO_GO
selfAssessment === 'GO_WITH_TECH_DEBT' → GO_WITH_TECH_DEBT
selfAssessment === 'DONE':
  testsPassed === false                → NO_GO
  coverage < threshold (default 90)   → GO_WITH_TECH_DEBT
  else                                → DONE
```

**Source reality — three separate functions exist:**

1. **`evaluateResultSync()`** in `src/orchestra/sprint-controller.ts:860` (sync, used by CLI finalize fallback):
   - Matches the documented logic BUT also includes a doc-task shortcut **not mentioned in the guide**:
     ```
     selfAssessment NO_GO → NO_GO
     selfAssessment GO_WITH_TECH_DEBT → GO_WITH_TECH_DEBT
     testsPassed === false → NO_GO
     isDocTask(task) → DONE  ← MISSING from brain-guide table
     coverage check → GO_WITH_TECH_DEBT / DONE
     ```

2. **`evaluateResult()`** in `src/orchestra/result-evaluator.ts:121` (async, 9-step algorithm):
   - Marked `@deprecated` — "Use `evaluateWithRubric()` instead" (`result-evaluator.ts:116-119`)
   - Includes TIMEOUT_WITH_WORK reconciliation (Sprint 145), Bash-unavailability tolerance, new-test-file detection — all absent from the guide
   - Sprint 321 renamed `evaluateResult` → `evaluateResultSync` to end name collision (see `sprint-controller.ts:856`)

3. **`evaluateWithRubric()`** — the **current preferred function** used by sprint EVALUATE and FIX phases — **not mentioned anywhere in brain-guide**

**Fix needed:** Update the GO/NO-GO section to:
- Add the `isDocTask` doc-task shortcut
- Note that `evaluateResultSync` is for CLI finalize fallback only
- Note that sprint phases use `evaluateWithRubric()` (the active evaluation path)
- Note that the async `evaluateResult()` is deprecated

#### ISSUE B1.2 — `evaluateResult` described as "pure function" is ambiguous (MINOR)

**Location:** `docs/development/brain-guide.md:139`

The guide labels `evaluateResult()` as a "pure function — no side effects." `evaluateResultSync()` in sprint-controller IS pure. The async `evaluateResult()` in result-evaluator.ts is NOT pure (it calls `reconcileSpuriousNoGo()` which does async I/O). The guide should specify it's describing `evaluateResultSync()`.

### Links

| Link | Target | Status |
|------|--------|--------|
| `docs/reference/api-surface.md` | `docs/reference/api-surface.md` | ✓ EXISTS |
| `docs/reference/config.md` | `docs/reference/config.md` | ✓ EXISTS |
| `docs/adr-index.md` | `docs/adr-index.md` | ✓ EXISTS |
| `.claude/rules/brain.md` | `.claude/rules/brain.md` | ✓ EXISTS |
| `docs/architecture/architecture.md` | `docs/architecture/architecture.md` | ✓ EXISTS |

---

## Doc 2: `docs/development/agent-guide.md`

### Claims Verified

| Claim | Status | Source Evidence |
|-------|--------|-----------------|
| 15 built-in agents | ✓ PASS | `ls src/core/builtins/agents/` → exactly 15 directories |
| All 15 agent names listed | ✓ PASS | All match: accessibility-auditor, api-builder, architect, architecture-planner, bug-fixer, ci-guardian, code-reviewer, data-engineer, devops-engineer, doc-writer, frontend-designer, migration-specialist, performance-analyzer, refactorer, security-auditor |
| 3-layer routing: intent-classifier → activation-engine → routing-engine | ✓ PASS | `src/core/intent-classifier.ts`, `src/core/activation-engine.ts`, `src/core/routing-engine.ts` — all exist |
| `routeTaskV2()` function name and signature | ✓ PASS | `src/core/routing-engine.ts` — `routeTaskV2` exported |
| Fallback chain: v2 → selectAgentByFallback → generic | ✓ PASS | Consistent with routing-engine.ts structure |
| Evolution pipeline: `promotion-pipeline.ts`, `outcome-tracker.ts`, `rule-evolver.ts` | ✓ PASS | All three files exist in `src/orchestra/` |
| Adaptive Agent at `src/agents/adaptive-agent.ts` | ✓ PASS | File exists |
| Agent pool persistent at `.deckent/agents/`, temp at `.deckent/agents/temp-<id>/`, max 50 temp | ✓ PASS | Referenced to `src/core/agent-pool.ts` which manages both pools |
| Source attribution: `src/core/agent-pool.ts`, `src/core/routing-engine.ts`, `src/cli/commands/agent.ts` | ✓ PASS | All three files verified to exist |

### Issues

No blocking issues found. Agent guide is accurate and well-sourced.

#### NOTE A2.1 — `selectAgentByFallback` not exported from routing-engine (INFORMATIONAL)

The fallback chain mentions `selectAgentByFallback()` but a quick grep shows this is an internal function reference — the guide uses it descriptively rather than as a callable API, which is acceptable.

### Links

All internal links point to valid files. No broken links detected.

---

## Doc 3: `docs/development/worker-guide.md` vs `docs/worker-guide.md`

### Duplication Analysis

Both files cover the same core worker lifecycle content. The table below shows overlap:

| Section | `docs/development/worker-guide.md` | `docs/worker-guide.md` |
|---------|-----------------------------------|-----------------------|
| Lifecycle diagram | ✓ Present | ✓ Present |
| Heartbeat format | ✓ Present (incomplete) | ✓ Present (more complete) |
| Result file format | ✓ Present | ✓ Present |
| Scope rules (ADR-037) | ✓ Present | ✓ Present |
| Verify loop | ✓ Present | ✓ Present |
| Honest self-assessment | ✓ Present | ✓ Present |
| Karpathy 4-Discipline | ✓ Present | ✓ Present |
| RBAC authority matrix | ✓ Present | ✓ Present |

**Both files link to `docs/guide/workers.md` as the "full reference"**, creating a three-way redundancy.

### Divergences (Verified Against Source)

#### DIVERGENCE W3.1 — Lifecycle states differ and both are incomplete (MEDIUM)

**`docs/development/worker-guide.md:24`:**
```
PENDING → CLAIMED → EXECUTING → TESTING → DONE | NO_GO
```

**`docs/worker-guide.md:22`:**
```
PENDING → CLAIMED → EXECUTING → TESTING → DOCUMENTING → DONE / NO_GO
```

**Source truth** (`src/core/monitoring-types.ts:10-23`, `AgentStatus` enum):
```typescript
IDLE, PLANNING, EXECUTING, EVALUATING, SCANNING, CODING, VERIFYING, TESTING, DOCUMENTING, DONE, ERROR, PAUSED
```

Worker's `calculateProgress()` (`src/agents/worker.ts:229-241`) also shows CODING, VERIFYING, DOCUMENTING as live states. Both docs are simplified — neither shows CODING or VERIFYING. `docs/worker-guide.md` is closer to truth by including DOCUMENTING.

#### DIVERGENCE W3.2 — Heartbeat format missing fields (HIGH)

**`docs/development/worker-guide.md:43-50`** only shows:
```json
{ "workerId", "taskId", "status", "sequence", "timestamp" }
```

**`docs/worker-guide.md:40-49`** shows:
```json
{ "workerId", "taskId", "status", "currentAction", "timestamp", "filesChangedCount", "sequence" }
```

**Source truth** (`src/core/monitoring-types.ts:25-38`, `Heartbeat` interface):
```typescript
{
  workerId: string;
  taskId: string;
  status: AgentStatus;
  currentAction: string;     // missing from development guide
  currentFile?: string;      // missing from both docs
  timestamp: string;
  filesChangedCount: number; // missing from development guide
  sequence: number;
  progress: number;          // missing from BOTH docs
  agentId?: string;          // missing from both docs
  backend?: string;          // missing from both docs
}
```

`currentAction` and `filesChangedCount` are required non-optional fields — their omission from `docs/development/worker-guide.md` is a correctness bug. `progress` is missing from BOTH guides.

**`docs/worker-guide.md` has been updated** (see fix applied below) to add the `progress` field. The `currentFile`, `agentId`, and `backend` optional fields are omitted from both guides intentionally — they are optional and internal.

#### DIVERGENCE W3.3 — Verify-loop scope is contradictory (HIGH)

**`docs/development/worker-guide.md:106`:**
> "Targeted tests: `npx vitest run <test-file>` — run only the test file(s) covering changed modules (max 3 attempts)"

**`docs/worker-guide.md:131`:**
```bash
npx vitest run      # all tests must pass
```

These are contradictory. `docs/development/worker-guide.md` aligns with task prompt instructions (targeted-only); `docs/worker-guide.md` says full suite. Individual task prompts include `CRITICAL VERIFY STEPS` that override this with targeted-only guidance, but the contradiction creates confusion.

**Recommendation:** `docs/worker-guide.md` verify-loop section should specify targeted tests (matching task instructions), or add a note that task prompts may specify targeted-only.

### Consolidation Recommendation

**The two guides serve different audiences and should be differentiated, not merged:**

**`docs/worker-guide.md` (canonical worker quick-reference):**
- Keep as the practical, authoritative reference for workers during task execution
- Fix heartbeat format (done — `progress` field added)
- Fix verify-loop to say targeted tests
- Fix lifecycle to include DOCUMENTING

**`docs/development/worker-guide.md` (developer internals guide):**
- Should focus on what `docs/worker-guide.md` does NOT cover:
  - Where worker functions live in source (`src/agents/worker.ts` god-object split, Sprint 144)
  - Forbidden anti-patterns table (unique to this file — valuable)
  - Test hermeticity rules (ADR-087, unique to this file — valuable)
  - Dependency awareness section (unique to this file)
- Should **remove** the duplicated lifecycle/heartbeat/result/scope/verify/Karpathy/RBAC sections
- Should add: `> Worker operational guide: [docs/worker-guide.md](../../worker-guide.md)`

This reduces maintenance surface from 3 overlapping docs to: 1 practical reference (`docs/worker-guide.md`) + 1 developer internals reference (`docs/development/worker-guide.md`) + 1 full API reference (`docs/guide/workers.md`).

### `docs/development/worker-guide.md` — Additional Claims Verified

| Claim | Status | Source Evidence |
|-------|--------|-----------------|
| File lock via `.locks/` directory | ✓ PASS | `src/agents/worker.ts:135-165` — acquireLock/releaseLock delegating to core/file-lock.ts |
| Auditor detects scope violations via `git diff --stat` | ✓ PASS | `src/orchestra/authority-enforcer.ts` — emitAuthorityViolation, referenced in worker.ts:27 |
| ADR-037 V1.0 advisory/soft (warns, does not block) | ✓ PASS | authority-enforcer.ts + worker.ts:27 — advisory only in V1.0 |
| `enforceVerifyLoop` has 0 runtime callers in V1.0 | ✓ PASS | `src/agents/worker-verify.ts` exports `enforceVerifyLoop`; zero active callers confirmed by grep |
| Workers MUST write result even on failure | ✓ PASS | `src/agents/worker.ts:376` `writeResult()` docblock confirms |
| Atomic write (temp + fsync + rename) for result | ✓ PASS | `src/agents/worker.ts:376` — references `atomicWriteFileSync` |

### Links

| Link | Target | Status |
|------|--------|--------|
| `docs/guide/workers.md` | `docs/guide/workers.md` | ✓ EXISTS |
| `.claude/rules/worker-default.md` | `.claude/rules/worker-default.md` | ✓ EXISTS |
| `docs/reference/api-surface.md` | `docs/reference/api-surface.md` | ✓ EXISTS |

---

## Doc 4: `docs/development/smoke-verify.md`

### Claims Verified

| Claim | Status | Source Evidence |
|-------|--------|-----------------|
| `scripts/clean-clone-smoke.mjs` exists | ✓ PASS | File confirmed at `/workspace/scripts/clean-clone-smoke.mjs` |
| 7-step pipeline: archive → npm ci → tsc → build → cli --version → cli --help → init builtins | ✓ PASS | Script steps match documented order |
| Exports `runSmoke` and `runStep` | ✓ PASS | `scripts/clean-clone-smoke.mjs:21` (`export async function runStep`) and `:41` (`export async function runSmoke`) |
| `scripts/test-e2e-surfaces.mjs` exists | ✓ PASS | File confirmed in scripts/ directory |
| ADR-065 cited for clean-clone rationale | ✓ PASS | ADR-065 is accepted (see adr-index) |
| ADR-079 cited for user-surface proof-of-function | ✓ PASS | ADR-079 is accepted (Tier-0/Tier-1 DoD) |

### Other Smoke Scripts Table Verified

| Script (documented) | Status |
|--------------------|--------|
| `scripts/clean-clone-smoke.mjs` | ✓ EXISTS |
| `scripts/test-e2e-surfaces.mjs` | ✓ EXISTS |
| `scripts/build-verify.ts` | ✓ EXISTS |
| `scripts/cli-smoke-test.sh` | ✓ EXISTS |
| `scripts/dashboard-e2e-smoke.mjs` | ✓ EXISTS |
| `scripts/serve-localhost-smoke.mjs` | ✓ EXISTS |
| `scripts/repl-smoke-verify.mjs` | ✓ EXISTS |
| `scripts/validate-publish.mjs` | ✓ EXISTS |

### Issues

No issues found. Smoke-verify doc is accurate and complete.

### Links

All internal links in this file are relative references to scripts/ — all verified to exist.

---

## Consolidated Issue List

| ID | Guide | Severity | Description |
|----|-------|----------|-------------|
| B1.1 | brain-guide | MEDIUM | `evaluateResult()` table is stale: misses doc-task shortcut; omits `evaluateWithRubric()` (current preferred path); omits `@deprecated` status of async variant |
| B1.2 | brain-guide | MINOR | "Pure function" label ambiguous — applies to `evaluateResultSync()`, not the async `evaluateResult()` |
| W3.1 | worker-guides | MEDIUM | Lifecycle states differ between two worker guides; both miss CODING/VERIFYING states present in AgentStatus enum |
| W3.2 | worker-guides | HIGH | Heartbeat format in `docs/development/worker-guide.md` missing required fields: `currentAction`, `filesChangedCount`; `progress` field missing from both guides |
| W3.3 | worker-guides | HIGH | Contradictory verify-loop guidance: development guide says targeted-only; top-level guide says full suite |

---

## Fixes Applied This Sprint

### Fix 1: `docs/worker-guide.md` — Added `progress` field to heartbeat format

The `progress` field is a non-optional member of the `Heartbeat` interface (`src/core/monitoring-types.ts:34`). Both worker guides omitted it. The top-level guide (canonical practical reference) was updated to include it.

---

## Deferred Work

| Item | Priority | Owner |
|------|----------|-------|
| brain-guide: update GO/NO-GO section (B1.1, B1.2) | MEDIUM | Next doc-refresh sprint |
| `docs/development/worker-guide.md`: remove duplicate sections, add pointer to `docs/worker-guide.md` | HIGH | Next doc-refresh sprint |
| `docs/worker-guide.md`: fix verify-loop to say targeted tests (W3.3) | HIGH | Next doc-refresh sprint |
| `docs/development/worker-guide.md`: add missing heartbeat fields (W3.2) | HIGH | Next doc-refresh sprint |

---

*Sources: `src/orchestra/brain.ts`, `src/orchestra/sprint-controller.ts`, `src/orchestra/result-evaluator.ts`, `src/agents/worker.ts`, `src/core/monitoring-types.ts`, `src/core/builtins/agents/`, `src/orchestra/{promotion-pipeline,outcome-tracker,rule-evolver}.ts`, `scripts/clean-clone-smoke.mjs`, `scripts/test-e2e-surfaces.mjs`*
