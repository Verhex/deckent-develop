# Audit: src/agents/prompt-metrics.ts — 2026-05-21

## 1. Inventory

- **LoC:** 5 (non-blank source lines: 3 export statements + 2 banner comment lines)
- **Last modified (git log -1 --format=%cs):** 2026-03-22
- **First commit sprint:** Sprint 031 (`f7342ec7 — feat: Sprint 031 — Brain Decision Engine, Learning Loop, Multi-Agent Collaboration, Adaptive Agent`)
- **Touched since:** Sprint 036 (`f95d1178 — sprint-036: brain.ts split + architectural cleanup`) — last source-level change. No further edits between Sprint 036 and Sprint 185 (the file has been inert for 150+ sprints).
- **Public exports:**
  - `PromptMetrics` (value export — re-exported class from `./prompt-analytics.js`).
  - `PromptMetricsReport` (type export — re-exported interface from `./prompt-analytics.js`).
- **Direct imports:** Single dependency — `./prompt-analytics.js` (one value re-export + one type re-export). No external packages, no Node built-ins, no `core/` imports.
- **Reverse dependencies (consumers of this file's path):**
  - `tests/agents/prompt-metrics.test.ts` (line 2-3, both `PromptMetrics` value and `PromptMetricsReport` type)
  - `tests/integration/collaboration-adaptive.test.ts` (line 24, `PromptMetrics` value only)
  - `tests/core/non-null-safety.test.ts` (line 14, `PromptMetrics` value only)
  - `src/` callers: **zero** — no production code references `prompt-metrics.js` after the Sprint 036 consolidation; only the tests above still go through the stub. Production code paths import the unified module (`prompt-analytics.ts`) directly.

## 2. Bağlam (Architectural Context)

- **Katman:** `src/agents/` — Worker execution + prompt engineering layer (per CLAUDE.md architecture table, “20 modules”).
- **Sub-system role:** Backward-compatible re-export shim. The original `prompt-metrics.ts` housed the `PromptMetrics` analytics class. During the Sprint 036 brain split + Sprint 031→Sprint 036 architectural cleanup, metrics and A/B-testing were consolidated into a unified `prompt-analytics.ts` (473 LoC) that combines metrics collection, experiment lifecycle, and trend analysis. This file (and its sibling `prompt-ab-test.ts`) survives as a thin pass-through to avoid breaking pre-consolidation import paths — chiefly used by test files that pre-date the merge.
- **ADR-related:**
  - **ADR-001 (TypeScript+ESM):** governs the export syntax — `export type { ... }` + `export { ... }`.
  - **ADR-002 (Node16 Module Resolution):** dictates the mandatory `.js` extension on the source-module specifier.
  - **ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık):** the file lives in `agents/` and imports only from `agents/` — no Brain coupling, no inverse import. Compliant.
  - **ADR-038 (Dead Code Disposition):** this is the canonical re-export-shim case. Because no `src/` caller still references it, the shim survives only to keep three test imports compiling; promotion to a removal candidate is the natural ADR-038 disposition.

## 3. Debt Risk

| Risk Area | Severity | Evidence (file:line) | Recommendation |
|-----------|----------|----------------------|----------------|
| Backward-compat shim with no production callers | low | `src/agents/prompt-metrics.ts:1-5` + grep result: only 3 test files import from this path; 0 `src/` callers | Keep for now (zero maintenance cost), schedule deletion after migrating the 3 test imports to `prompt-analytics.js` |
| Drift risk if `prompt-analytics.ts` removes `PromptMetrics` symbol | low | `src/agents/prompt-metrics.ts:3,5` re-exports symbols that must exist in `prompt-analytics.ts` (currently lines 38-47 for the type, exported class within the same module) | A `tsc --noEmit` catch is sufficient — no runtime risk |
| Inconsistent comment/code count drift | low | `src/agents/prompt-metrics.ts:1-2` (2 banner lines for 3 code lines — 40% comment density on a 5-line file) | Acceptable for a stub; do not refactor in isolation |
| Sprint-036 cleanup-debt residue | low | File has not changed in 150+ sprints; Sprint 036 commit message records "architectural cleanup" but did not remove the shim | Track under ADR-038 “Dead Code Disposition” candidate list rather than ad-hoc removal |

**Composite verdict:** All risks are low. The file is in steady-state and protected by the type checker.

## 4. Dead Code Candidates

- [x] **Whole-file dead-from-`src/` candidate** — `grep -rn "from .*prompt-metrics" src/` returns no hits (only `src/agents/prompt-analytics.ts` itself matches, by virtue of containing the substring in its own export-comment). All production code already targets the consolidated module.
- [ ] Per-symbol dead code — n/a: the file has only two exports and both are still consumed (by tests).
- [ ] Unreachable branches — n/a: no branching, no logic.
- [ ] Deprecated marker without removal — file has **no** `@deprecated` JSDoc tag despite being a pure compatibility shim. Adding `@deprecated` would correctly signal the migration intent without breaking anything.

**ADR-038 cross-reference:** This file matches the ADR-038 “Backward-compat re-export stub, zero internal callers, only test references” pattern. The recommended disposition under ADR-038 is **mark `@deprecated` now, schedule removal after the three test imports are migrated**. Outright deletion would break the existing test build until the test imports are rewritten — so a two-step retirement (deprecate → migrate tests → delete) is the safe path.

## 5. Documentation Gaps

- The two banner comment lines describe the file's purpose accurately ("Backward-compatible re-export from the unified prompt-analytics module"), so the *file-level* intent is documented.
- **Missing JSDoc on re-exported `PromptMetrics`:** the consumer-facing documentation lives in `prompt-analytics.ts`; the stub does not duplicate it. This is acceptable but means IDE “Go to Definition” on the symbol from a test file lands here first and shows no JSDoc — minor DX paper-cut.
- **Missing `@deprecated` annotation:** as noted in §4, this is the most actionable gap. A two-line JSDoc block would make the migration plan discoverable from the editor.
- **No CHANGELOG entry referencing the Sprint 036 consolidation:** the unified-module decision is recorded in commit `f95d1178` only — there is no project-level note in CHANGELOG.md, docs/, or `.brain/exports/decisions.md` ADR list that mentions the prompt-analytics consolidation. Followers reading only ADRs cannot reconstruct why the stub exists.

## 6. ADR Compliance Check

| ADR | Relevant? | Compliant? | Evidence / Violation |
|-----|-----------|------------|----------------------|
| ADR-001 TypeScript + ESM | yes | yes | `src/agents/prompt-metrics.ts:3,5` use `export type { ... }` and `export { ... }` — pure ESM, TS-typed. |
| ADR-002 Node16 (`.js` suffix) | yes | yes | `./prompt-analytics.js` specifier on lines 3 and 5; both ESM-compliant. |
| ADR-003 vitest over Jest | indirect | yes | Consumers (`tests/agents/prompt-metrics.test.ts`) use `vitest`; the file itself has no test framework dependency. |
| ADR-004 3-Layer Config Merge | no | n/a | Not config-related. |
| ADR-006 spawnSync Security Pattern | no | n/a | No child-process invocation. |
| ADR-007 SpawnOptions Interface | no | n/a | Same as ADR-006. |
| ADR-008 Brain Merkezi Import — Tek Yönlü Bağımlılık | yes | yes | File lives in `agents/`, imports only from `agents/`. No Brain import, no upward dependency. |
| ADR-009 DEBT.md Markdown Tablo Formatı | no | n/a | Not the debt manager. |
| ADR-010 Tek Runtime Dependency — commander.js | yes | yes | Zero external dependencies. |
| ADR-029 Managed-Docs Universalization | no | n/a | Outside managed-docs scope. |
| ADR-030 Template Engine + Plugin Loader | no | n/a | Outside managed-docs scope. |
| ADR-032 i18n Pattern System | no | n/a | No user-facing strings. |
| ADR-035 Verification Protocol Standard | no | n/a | No worker/brain/auditor verification interaction. |
| ADR-037 RBAC V1.0 | indirect | yes | The file is read by workers (via the `PromptMetrics` class indirectly); does not bypass any RBAC layer. |
| ADR-038 Dead Code Disposition | yes | partial | The file qualifies as a backward-compat shim with zero `src/` callers — under ADR-038 it should carry a `@deprecated` marker pointing at the unified module. Currently no marker — **soft non-compliance**. |
| ADR-041 Agent Taxonomy | no | n/a | Not an agent-taxonomy concern. |
| ADR-046 Brain Self-Update Hook Architecture | no | n/a | Outside the brain self-update path. |
| ADR-048 Prompt Lifecycle Contract | indirect | yes | `PromptMetrics` belongs to the prompt lifecycle stack but is re-exported transparently; no contract change here. |

**Aggregate compliance verdict:** Fully compliant on hard architectural ADRs (001, 002, 008, 010). Soft non-compliance only on ADR-038 (no `@deprecated` marker). No accepted ADR is *violated* — no NO_GO trigger.

## 7. Refactor Recommendations

1. **Add `@deprecated` JSDoc** — `src/agents/prompt-metrics.ts:1-5`
   - Rationale: align with ADR-038, surface migration intent in IDE.
   - Impact: zero runtime change; IDE squiggle on the three remaining test imports.
   - Effort: ~5 minutes; one commit.
   - Suggested form (one short tag, no multi-paragraph block):
     ```ts
     /** @deprecated Use `./prompt-analytics.js` instead. Retained for legacy test imports — see ADR-038. */
     ```
     placed once at file top.
2. **Migrate the three test imports** — `tests/agents/prompt-metrics.test.ts:2-3`, `tests/integration/collaboration-adaptive.test.ts:24`, `tests/core/non-null-safety.test.ts:14`
   - Rationale: removes the last reason for the shim to exist.
   - Impact: each test file replaces `'../../src/agents/prompt-metrics.js'` with `'../../src/agents/prompt-analytics.js'`; symbols are identical.
   - Effort: ~10 minutes total; one commit; CI auto-validates.
3. **Delete the stub after migration** — `src/agents/prompt-metrics.ts`
   - Rationale: realises ADR-038 closure for this symbol.
   - Impact: shrinks `src/agents/` by 5 LoC, removes one Surface entry from `docs/reference/api-surface.md` if listed (it is not), simplifies the prompt-* family from 6 files to 5 (`prompt-analytics`, `prompt-ab-test`, `prompt-evolution`, `prompt-rollback`, `prompt-version`).
   - Effort: trivial; one commit.
4. **Optional symmetry cleanup with `prompt-ab-test.ts`** — same shim pattern (lines 1-9 of `prompt-ab-test.ts`).
   - Rationale: if step 3 lands, the sibling stub should follow the same disposition pattern so the `prompt-*` family stays internally consistent.
   - Impact: bundle as a single "retire compat-shims" PR rather than two independent commits.
   - Effort: low.

## 8. Sprint 187 Follow-up Items

- [ ] **P1 — Add `@deprecated` annotation** to `src/agents/prompt-metrics.ts` (and to `src/agents/prompt-ab-test.ts` for symmetry) referencing ADR-038. Single one-line JSDoc; no behaviour change.
- [ ] **P2 — Migrate the three test imports** off `prompt-metrics.js` onto `prompt-analytics.js`:
  - `tests/agents/prompt-metrics.test.ts:2-3`
  - `tests/integration/collaboration-adaptive.test.ts:24`
  - `tests/core/non-null-safety.test.ts:14`
- [ ] **P2 — Delete the stub** once the three test imports are migrated. Bundle the deletion of `prompt-ab-test.ts` into the same PR for symmetry.
- [ ] **P2 — Record the prompt-analytics consolidation** as an ADR or a short note in `.brain/exports/decisions.md` so future readers understand the Sprint 031 → Sprint 036 evolution without having to read commit `f95d1178`. (One ADR entry per shim family is enough.)
- [ ] **P2 — Consider renaming the test file** `tests/agents/prompt-metrics.test.ts` to `prompt-analytics.test.ts` after migration so the file name tracks the module it actually exercises.

## 9. Summary

- **Overall health:** dead-code-candidate (low-risk, low-effort cleanup) — the file itself is well-behaved and ADR-compliant on hard constraints, but it is a Sprint-036 leftover backward-compatibility shim with **zero `src/` callers** and only three test references. Under ADR-038 the natural disposition is `@deprecated` → migrate tests → delete.
- **Top 3 priorities:**
  1. **Mark `@deprecated`** with a single one-line JSDoc tag referencing ADR-038 and pointing at `./prompt-analytics.js` (~5 min).
  2. **Migrate the three test imports** to `prompt-analytics.js` (~10 min, mechanical edit).
  3. **Delete the stub** (and `prompt-ab-test.ts` for symmetry) in one consolidating commit (~5 min).
