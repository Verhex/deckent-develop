# Audit: src/agents/prompt-rollback.ts — 2026-05-21

## 1. Inventory

- **LoC:** 150
- **Last modified (git log -1 --format=%cs):** 2026-03-22
- **First commit sprint:** Sprint 031 (feat: Brain Decision Engine, Learning Loop, Multi-Agent Collaboration, Adaptive Agent)
- **Public exports:**
  - `interface RollbackResult` — `{ rolledBackTo: number; reason: string }` — return shape of a successful rollback
  - `interface RollbackLogEntry` — `{ timestamp: string; fromVersion: number; toVersion: number; reason: string }` — single audit-log record
  - `class PromptRollback` — orchestrates rollback decisions against a `PromptVersionManager` instance, persists log to `.deckent/agents/{agentId}/rollback-log.json`
- **Direct imports:**
  - `node:fs` → `existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync` (sync I/O)
  - `node:path` → `join`
  - `./prompt-version.js` → `PromptVersionManager` (sister module in `src/agents/`)
- **Reverse dependencies (grep -r "PromptRollback\|prompt-rollback" src/ tests/):**
  - `tests/agents/prompt-rollback.test.ts` — unit tests (193 LoC, dedicated suite)
  - `tests/integration/collaboration-adaptive.test.ts` — integration suite, lines 18/251/337/368
  - **Zero `src/` production callers** — no module in `src/` outside this file imports `PromptRollback`

## 2. Bağlam (Architectural Context)

- **Layer:** `src/agents/` — worker execution and prompt engineering subsystem (20 modules per CLAUDE.md architecture map).
- **Sub-system role:** Decides whether an agent's *current* prompt version is underperforming and, if so, activates the best historical version via `PromptVersionManager`. Maintains an append-only rollback audit log per agent. Designed as the "automatic revert" half of the prompt evolution loop initiated in Sprint 031 (adaptive-agent.ts + prompt-version.ts + promotion-pipeline.ts triad).
- **ADR-related:**
  - **ADR-001 TypeScript + ESM** — single-file ESM module, named exports only.
  - **ADR-002 Node16 .js suffix** — `import … from './prompt-version.js'` complies.
  - **ADR-005 Synchronous I/O (deprecated)** — uses `readFileSync`/`writeFileSync`/`mkdirSync`/`existsSync`; ADR-005 is marked deprecated in `.brain/exports/summary.md`, so async migration is non-mandatory but desirable.
  - **ADR-038 Dead Code Disposition** — this file is a candidate (see §4).
  - **ADR-041 Agent Taxonomy** — sits in the horizontal infrastructure under `src/agents/`, not a vertical agent.
  - **ADR-046 Brain Self-Update Hook Architecture** — conceptually adjacent: rollback is the inverse mutation of promotion; currently not wired into the Brain lifecycle.

## 3. Debt Risk

| Risk Area | Severity | Evidence (file:line) | Recommendation |
|-----------|----------|----------------------|----------------|
| Zero production callers — only tests import it | high | grep yields 0 hits in `src/` outside this file | Either wire into sprint-controller / promotion-pipeline (Sprint 187), or remove per ADR-038 |
| `_agentId` parameter unused in `shouldRollback` | low | `prompt-rollback.ts:42` (`_agentId: string`) | Drop the parameter or actually use it (e.g. per-agent thresholds) |
| `bestVersion` tie-breaker is subtly incorrect | medium | `prompt-rollback.ts:66-72` — the equal-rate branch checks `v.stats.uses > 0` but does not compare against `bestVersion.uses`; ordering depends on `listVersions()` traversal order | Compare `v.stats.uses` against `bestVersion.uses`, store `uses` on `bestVersion`, document tie-break policy (highest uses ⇒ most evidence) |
| `bestVersion` may select a version with `successRate === 0` and zero uses | medium | `prompt-rollback.ts:62` initial `bestVersion = null` → first non-current version always wins on first iteration | Skip versions with `uses === 0` unless no other candidate exists; or fall back to the highest `version` number |
| Sync I/O on hot path | low | `prompt-rollback.ts:122` (`writeFileSync`) inside sprint lifecycle | If wired into Brain, consider promoting to async fs/promises (ADR-005 deprecated direction) |
| `_readRollbackLog` swallows all parse errors silently | low | `prompt-rollback.ts:146-148` (`catch { return [] }`) | Log to observability event-stream or at minimum surface a warn; silent log-corruption recovery may hide disk issues |
| `mkdirSync` + `writeFileSync` not atomic | low | `prompt-rollback.ts:112,122` — crash between mkdir and write leaves partial dir; concurrent writers race on JSON file | Use `atomicWriteFileSync` pattern (Sprint 139 Task 13 prior art for Docker HB) or a temp-then-rename |
| Constants hard-coded instead of configurable | low | `prompt-rollback.ts:25-26` — `ROLLBACK_SUCCESS_THRESHOLD = 0.5`, `ROLLBACK_MIN_USES = 3` | Surface via `.deckent/config.json` (e.g. `rollback.success_threshold`) if this module is wired live |

## 4. Dead Code Candidates

- **[x] Exported but zero production callers** — `PromptRollback`, `RollbackResult`, `RollbackLogEntry` are imported only by `tests/agents/prompt-rollback.test.ts` and `tests/integration/collaboration-adaptive.test.ts`. No `src/` module references the class. The promotion side (`src/orchestra/promotion-pipeline.ts`) exists and is wired; the inverse rollback side has never been integrated. (Verified via repository-wide grep — see §1 reverse dependencies.)
- **[ ] Branches with unreachable logic** — none observed; all branches are reachable from the test suite.
- **[ ] Deprecated marker without removal** — no `@deprecated` JSDoc tag, but the entire module behaves as latent infrastructure.
- **ADR-038 cross-reference:** Sprint 139 catalogued similar 0-caller exports as candidates for hard-delete or explicit live-wire. This module is a clean ADR-038 case: either *deliberately latent* (document as such with a `@since/@dormant` JSDoc note) or *promote-or-delete* in Sprint 187.

## 5. Documentation Gaps

- `RollbackResult.reason` field has no JSDoc — describe expected format (e.g. "Current version N underperforming. Rolled back to version M (successRate: X%)").
- `RollbackLogEntry.timestamp` lacks format spec — readers may not realize it is `new Date().toISOString()` UTC.
- `shouldRollback` JSDoc states "Returns true if successRate < 50% and uses >= 3" but the constant is `ROLLBACK_SUCCESS_THRESHOLD = 0.5` and `ROLLBACK_MIN_USES = 3` — drift risk if constants are tuned without updating docstring (the JSDoc hard-codes the numbers).
- `rollbackPrompt` JSDoc claims "highest successRate with >= 2 uses" but the implementation does **not** enforce `uses >= 2`; it accepts any non-current version. Documentation contradicts code.
- `logRollback` does not document side effects: creates `.deckent/agents/{agentId}/` if missing, appends to existing log atomically? (it is not atomic — see §3).
- No module-level JSDoc explaining the dormant production status; readers may assume it is on the hot path.

## 6. ADR Compliance Check

| ADR | Relevant? | Compliant? | Evidence/Violation |
|-----|-----------|------------|--------------------|
| ADR-001 TypeScript + ESM | yes | yes | Named TS exports, no CJS interop, no `require()` |
| ADR-002 Node16 (.js suffix) | yes | yes | `import { PromptVersionManager } from './prompt-version.js'` — line 5 |
| ADR-005 Synchronous I/O | yes (deprecated direction) | partial | All fs calls sync; ADR-005 is marked **deprecated** in `.brain/exports/summary.md`, so this is no longer the preferred pattern but is not a violation |
| ADR-006 spawnSync security | no | n/a | No child-process usage |
| ADR-007 SpawnOptions interface | no | n/a | No subprocess |
| ADR-008 Brain centralized import | yes | yes | Lives in `src/agents/`; does not import from `src/orchestra/` (Brain layer) — one-way dependency respected |
| ADR-009 DEBT.md table format | no | n/a | Module does not write debt |
| ADR-010 commander.js sole runtime dep | yes | yes | Only `node:fs` + `node:path` + sibling module — no new runtime deps |
| ADR-035 Verification Protocol | yes | n/a | Module is not called in sprint pipeline; no verification channel emitted |
| ADR-037 RBAC Authority Matrix | yes | unclear | Class would belong to worker/agent authority slice if wired; currently not enforced |
| ADR-038 Dead Code Disposition | yes | **violation candidate** | 0 production callers — flagged for Sprint 187 promote-or-delete (see §4) |
| ADR-041 Agent Taxonomy (horizontal vs vertical) | yes | yes | Horizontal infrastructure under `src/agents/`, not a vertical agent persona |
| ADR-046 Brain Self-Update Hook | yes | n/a | Could plug into self-update hook; not currently registered |
| ADR-048 Prompt Lifecycle Contract | yes | partial | Implements the *rollback* segment of a prompt lifecycle but is not registered with the contract surface |
| ADR-053 TaskType Taxonomy | no | n/a | Not a task-type module |

## 7. Refactor Recommendations

1. **Promote-or-delete decision (ADR-038)** — `src/agents/prompt-rollback.ts` whole file — *Rationale:* the module has lived for ~14 sprints (Sprint 031 → Sprint 185) with zero `src/` callers; Sprint 139 audit policy says either wire-live with verification channel or remove. *Impact:* clears dead-code debt and reduces test-only export surface. *Effort:* low if delete (also drop `tests/agents/prompt-rollback.test.ts` and the `collaboration-adaptive.test.ts` block lines 251-410); medium if wire-live (need `sprint-reporter.ts` / `promotion-pipeline.ts` integration point + config keys).
2. **Fix `bestVersion` tie-breaker logic** — `prompt-rollback.ts:62-73` — *Rationale:* current implementation lets a never-used version (uses=0, successRate=0) win against an unused incumbent on first iteration; tie-break does not consider `uses` count meaningfully. *Impact:* correctness of rollback target. *Effort:* low (≤10 LoC change + 2 new tests for the zero-use and tie cases).
3. **Drop or wire the unused `_agentId` argument** — `prompt-rollback.ts:42` — *Rationale:* underscore-prefixed parameters in a public API are an anti-pattern; either delete it (signature `shouldRollback(stats)`) or use it to enforce per-agent overrides. *Impact:* cleaner API surface. *Effort:* trivial (signature + 5 test sites).
4. **Atomic write for rollback log** — `prompt-rollback.ts:122` — *Rationale:* Sprint 139 Task 13 established atomic-write pattern for sprint hot-path files; rollback log should match. *Impact:* crash-safety on Docker workers. *Effort:* low (reuse existing helper if exposed; otherwise temp + `renameSync`).
5. **Surface thresholds via config** — `prompt-rollback.ts:25-26` — *Rationale:* `ROLLBACK_SUCCESS_THRESHOLD` and `ROLLBACK_MIN_USES` are policy decisions, not implementation constants. *Impact:* tunability without code change. *Effort:* low (add `rollback.*` keys to `.deckent/config.json` schema, plumb via constructor).
6. **Module-level JSDoc clarifying status** — `prompt-rollback.ts:1-2` — *Rationale:* current header comment ("Automatic rollback to best historical prompt version when current is failing.") implies live behavior; reality is dormant. *Impact:* prevents future maintainer confusion. *Effort:* trivial.
7. **Align JSDoc with code for `rollbackPrompt` "uses >= 2"** — `prompt-rollback.ts:50-53` — *Rationale:* docstring promises a guard that the code does not enforce. *Impact:* documentation accuracy. *Effort:* trivial (either add the guard or drop the claim).

## 8. Sprint 187 Follow-up Items

- [ ] **P0** — Decide on `PromptRollback` disposition per ADR-038: integrate into `promotion-pipeline.ts` / `sprint-reporter.ts` evaluation phase, **or** delete with tests. Owner: Brain.
- [ ] **P1** — Fix `bestVersion` tie-breaker correctness bug (prompt-rollback.ts:62-73) and add regression tests covering: zero-use candidates only, equal-rate tie, single-version short-circuit.
- [ ] **P1** — Reconcile JSDoc `uses >= 2` claim with code path in `rollbackPrompt()` — either enforce or remove the docstring promise.
- [ ] **P2** — Remove or wire `_agentId` argument in `shouldRollback()`.
- [ ] **P2** — Apply atomic-write pattern to `rollback-log.json` to match Sprint 139 hot-path standard.
- [ ] **P2** — Surface `ROLLBACK_SUCCESS_THRESHOLD` and `ROLLBACK_MIN_USES` via `.deckent/config.json` schema.
- [ ] **P2** — Add module-level JSDoc indicating dormant status (or remove once §1 P0 lands).

## 9. Summary

- **Overall health:** dead-code-candidate (latent infrastructure with no production callers since Sprint 031; tests-only surface)
- **Top 3 priorities:**
  1. Resolve ADR-038 disposition — wire into promotion/evaluation lifecycle in Sprint 187 or delete the file and its dedicated test suite.
  2. Fix the `bestVersion` tie-breaker bug — current logic can select a never-used version as the rollback target.
  3. Reconcile JSDoc/code drift (`uses >= 2` claim, unused `_agentId` parameter) before any live-wire effort.
