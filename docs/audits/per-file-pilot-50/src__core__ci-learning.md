# Audit — src/core/ci-learning.ts

**Sprint:** 186 (per-file pilot 50) · **Task:** 186-033 · **Auditor:** doc-writer (w-186-033)
**Source LoC:** 460 (DIRECTIVES recorded as 461 — off-by-one EOF) · **Test LoC:** 477 (`tests/core/ci-learning.test.ts`)

---

## 1. Inventory

| Item | Count | Detail |
|------|-------|--------|
| Total LoC | 460 | Pure TypeScript, ESM, no JSX |
| Exports — interfaces | 6 | `CiReportData`, `RegressionHotspot`, `FailurePattern`, `CiSuggestion`, `ConfigSuggestion`, `CiLearningResult` |
| Exports — functions | 7 | `readCiReports`, `detectFailurePatterns`, `generateSuggestions`, `generateConfigSuggestions`, `buildCiLearningLine`, `buildCiLearningsSection`, `analyzeCiLearnings`, `writeCiLearnings` (8 actually — counted) |
| Imports — node | `node:path` (`join`), `node:fs` (`existsSync`, `readFileSync`, `readdirSync`, `writeFileSync`) | sync-only FS |
| Imports — internal | `./constants.js` (`BRAIN_DIR`) | single internal dep |
| External consumers (src) | `src/orchestra/ci-reporter.ts` (lines 11–15, 197, 200, 222, 243) | imports `analyzeCiLearnings`, `buildCiLearningsSection`, `writeCiLearnings`, type `CiLearningResult` |
| External consumers (tests) | `tests/core/ci-learning.test.ts` | imports the full surface for unit coverage |
| Reverse deps | 2 (1 prod + 1 test) | narrow blast radius |

Public function surface: 8 functions × ~3 unit-test stanzas ≈ saturated test coverage in `tests/core/ci-learning.test.ts` (477 LoC test file > source file).

## 2. Bağlam — Architectural Context

Module purpose: cross-sprint CI failure-pattern miner. Consumes per-sprint CI JSON reports written under `.brain/ci-report-{sprintId}.json` and produces three artefacts: (a) detected failure patterns, (b) actionable suggestions for humans, (c) machine-readable config suggestions for the `ci_guardian.*` config namespace, plus (d) a one-liner appended to `MEMORY.md` via the managed-docs pipeline.

Position in the architecture: a pure **`core/`** library — no side effects beyond the explicit `writeCiLearnings` writer. Consumed by **`orchestra/ci-reporter.ts`** during the RETRO/CLEANUP sprint phase. Aligns with ADR-008 (Brain-only import, no upstream coupling) since `core/ci-learning.ts` imports only `./constants.js` and never reaches into `orchestra/` or `agents/`.

ADR alignment: ADR-001 (ESM, `.js` import extensions present at lines 5–7), ADR-002 (Node16 module resolution honoured), ADR-008 (one-way dependency core → orchestra, never reverse), ADR-009 (DEBT/MEMORY MD writes consumed by `ci-reporter.ts:222–235`). Touches the `ci_guardian.*` config space defined indirectly via `ConfigSuggestion.key` literals — see Debt Risk row.

## 3. Debt Risk

| ID | Risk | Severity | Evidence |
|----|------|----------|----------|
| CIL-001 | Silent error swallowing — `catch {}` blocks at L88-90, L113, L456-459 hide all read/parse/write failures | medium | `} catch { /* skip malformed */ }` (L113) and `} catch { ... }` (L88, L456) — operators get no signal when reports are corrupt |
| CIL-002 | Magic constants throughout: `5` (maxSprints default), `-0.5` (coverage drop threshold L155), severity tiers `3/2`, `5/2`, `3/1`, `2` literals (L137, L150, L163, L175), coverage floor `80` (L314), regression severity `>= 2` (L208, L219) | medium | No `CI_LEARNING_CONSTANTS` block; thresholds are scattered and undocumented |
| CIL-003 | Name collision — `generateConfigSuggestions` is also exported by `src/orchestra/sprint-metrics.ts:513` with a **different signature**. Sprint-reporter pulls the sprint-metrics version (sprint-reporter.ts:28→32 imports from `./sprint-metrics.js`), leaving ci-learning's version reachable only via `analyzeCiLearnings` and tests | high | Refactor hazard: future contributors may mis-import; identical name across two modules in adjacent layers |
| CIL-004 | Loose runtime validation — `JSON.parse(raw) as Partial<CiReportData>` (L96) trusts disk bytes; no shape check beyond `data.sprintId && data.result` guard. Nested numbers fall back to `?? 0` (L102-105) silently masking schema drift | medium | Future schema additions to `ci-report-*.json` will not surface here |
| CIL-005 | Sync I/O on sprint-boundary path — `readFileSync`, `writeFileSync`, `readdirSync`, `existsSync`. ADR-005 deprecated sync I/O for hot paths; acceptable here (RETRO phase, ≤5 small JSON files) but locks in pattern | low | L84, L95, L455 |
| CIL-006 | `Math.max(Math.floor(minCoverage) - 2, 80)` (L314) hard-codes 80 as universal coverage floor — ignores per-project baselines | low | Could yield a "raise floor to 80" suggestion for a project sitting at 60 |
| CIL-007 | Dead-branch suggestion at L334-341 — `all-green → suggest keeping pre_sprint_check enabled with currentValue:true, suggestedValue:true` produces a no-op recommendation that pollutes output | low | Tautological config suggestion |
| CIL-008 | `RegressionHotspot` interface (L31-36) is exported but **never used** anywhere in src/ or tests/ — type-level dead code | low | Verified via grep below |
| CIL-009 | `process.stderr.write` on write failure (L458) — no structured logger, breaks containment for callers wanting to surface errors | low | L458 |

## 4. Dead Code Candidates — Grep Evidence

```
$ grep -rn "RegressionHotspot" src/ tests/
src/core/ci-learning.ts:32:export interface RegressionHotspot {
# 1 occurrence — declaration only, zero call-sites → CONFIRMED DEAD TYPE
```

```
$ grep -rn "from .*ci-learning" src/ tests/
src/orchestra/ci-reporter.ts:15: import { analyzeCiLearnings, buildCiLearningsSection, writeCiLearnings, ... }
src/orchestra/ci-reporter.ts:243: export type { CiLearningResult } from '../core/ci-learning.js';
tests/core/ci-learning.test.ts:17: from '../../src/core/ci-learning.js';
# Production use-sites import only 3 of 8 exported functions: analyzeCiLearnings,
# buildCiLearningsSection, writeCiLearnings. The remaining 5 (readCiReports,
# detectFailurePatterns, generateSuggestions, generateConfigSuggestions,
# buildCiLearningLine) are reachable ONLY through analyzeCiLearnings and tests.
# Not dead, but candidates for narrowing to module-private with `export` removed.
```

```
$ grep -n "generateConfigSuggestions" src/
src/orchestra/sprint-metrics.ts:513: export function generateConfigSuggestions(sprintResult: ...)
src/orchestra/sprint-reporter.ts:28:  generateConfigSuggestions,  ← imports from sprint-metrics
src/core/ci-learning.ts:292: export function generateConfigSuggestions(reports, patterns)
# Confirmed: two functions with identical name and divergent signatures. The
# ci-learning variant is unreachable from sprint-reporter and is invoked only by
# analyzeCiLearnings (same file) and the dedicated test file.
```

Summary of dead/narrowing candidates: `RegressionHotspot` interface (true dead), and 5 helper exports that could be `export`-stripped if tests are re-routed through `analyzeCiLearnings` only.

## 5. Documentation Gaps

| Gap | Location | Recommendation |
|-----|----------|----------------|
| No JSDoc on interfaces — only one-line `/** ... */` per interface | L11-70 | Expand to document field semantics: e.g. `coverageDelta` units (percentage points vs ratio), `severity` ordering |
| `analyzeCiLearnings` JSDoc lacks return-shape contract | L400-403 | Document that an empty `reports` array produces `summary: "No CI reports found."` |
| Magic threshold values undocumented | L137, L150, L155, L163, L175, L208, L219, L245, L252, L301, L311, L314, L334 | Add header comment block enumerating severity tiers and their numeric boundaries |
| No example output for `buildCiLearningLine` | L348-351 | The format string in the docstring (`"Sprint 062: 85 new tests, ..."`) drifts from the actual implementation which prepends `- ` |
| No reference to consumers in module-level header | L1-3 | Add "Consumed by: src/orchestra/ci-reporter.ts (RETRO phase)" |
| `writeCiLearnings` output schema not documented | L437-440 | Document `analyzedAt`, `reportCount`, `sprintIds[]` fields written to `.brain/ci-learnings.json` |
| Silent failure modes invisible to caller | L88, L113, L456 | Either log via a passed-in logger or document the swallow explicitly with rationale |

## 6. ADR Compliance Check

| ADR | Subject | Compliance | Evidence |
|-----|---------|------------|----------|
| ADR-001 | TypeScript + ESM | ✅ Pass | `.js` extensions on internal imports (L7); no CJS `require` |
| ADR-002 | Node16 Module Resolution | ✅ Pass | `node:path`, `node:fs` namespace imports (L5-6) |
| ADR-004 | 3-Layer Config Merge | N/A | Module emits `ConfigSuggestion[]` but does not mutate config |
| ADR-005 | Synchronous I/O (deprecated) | ⚠ Soft drift | Uses `readFileSync`/`writeFileSync` — tolerable on RETRO boundary, not regression |
| ADR-006 | `spawnSync` Security Pattern | N/A | No subprocess invocation |
| ADR-007 | `SpawnOptions` Interface | N/A | No subprocess invocation |
| ADR-008 | Brain merkezi import — tek yönlü bağımlılık | ✅ Pass | Imports only `./constants.js`; no `orchestra/` or `agents/` reach-back |
| ADR-009 | DEBT.md Markdown Tablo Formatı | ✅ Indirect | Produces `buildCiLearningsSection` markdown block consumed by managed-docs pipeline |
| ADR-010 | Tek runtime dependency — commander | ✅ Pass | Zero new dependencies |
| ADR-019 | Language-Agnostic Worker Verify | N/A | Module operates on JSON report artefacts, language-neutral by construction |
| ADR-029 | Managed-Docs Universalization | ✅ Pass | `buildCiLearningsSection` output is the upstream feed for managed-docs `ci-learnings` section |
| ADR-035 | Verification Protocol Standard | ✅ Pass | No worker/auditor cross-channel calls |
| ADR-036 | ADR Governance | ✅ Pass | No ADR violations introduced |

## 7. Refactor Recommendations

1. **Centralise thresholds.** Hoist all severity boundaries and magic constants into a top-of-file `const SEVERITY_THRESHOLDS = { ... } as const;` block. Document the rationale for each tier so future tuning is one-line.
2. **Resolve name collision.** Rename `generateConfigSuggestions` in this module to `generateCiConfigSuggestions` (or `inferCiConfigChanges`) to disambiguate from `sprint-metrics.ts`'s same-named export. This eliminates a real footgun for new contributors.
3. **Narrow public surface.** Demote `readCiReports`, `detectFailurePatterns`, `generateSuggestions`, `generateConfigSuggestions`, `buildCiLearningLine` to module-internal (drop `export`). Re-route tests through `analyzeCiLearnings` + fixture inputs. This collapses 8 exports → 3 (+ types).
4. **Delete `RegressionHotspot`.** Interface has zero use-sites; remove it or wire it into `detectFailurePatterns` (which currently mentions regressions but emits no per-file hotspot data — a feature gap matching the unused type).
5. **Add Zod (or hand-rolled) validation for `CiReportData`.** Currently `JSON.parse(raw) as Partial<CiReportData>` is unverified. A minimal schema check at L96 would surface report-format drift loudly instead of silently substituting `?? 0`.
6. **Drop the tautological all-green suggestion** (L334-341) or convert it into a positive `summary` line — currently it emits a `currentValue=true, suggestedValue=true` no-op.
7. **Surface write failures through return value.** `writeCiLearnings` returns `void`; let it return `{ ok: boolean, error?: string }` so the caller (`ci-reporter.ts:200`) can include the failure in the retro report rather than only stderr.
8. **Async migration optional.** Sync I/O is acceptable for ≤5 small JSON reads, but if future projects log hundreds of sprints, swap to `node:fs/promises` to keep the RETRO phase responsive.

## 8. Sprint 188 Follow-up Items

| # | Action | Owner suggested |
|---|--------|-----------------|
| F-1 | Rename `generateConfigSuggestions` in ci-learning → `generateCiConfigSuggestions`; update tests + analyzeCiLearnings call site | bug-fixer + typescript-expert |
| F-2 | Delete unused `RegressionHotspot` interface OR add a hotspot detector that populates it (decide which) | code-reviewer |
| F-3 | Add minimal runtime schema check for `CiReportData` in `readCiReports` (lightweight, no dep) | security-specialist |
| F-4 | Hoist magic thresholds into a single `const` block with JSDoc per tier | refactorer |
| F-5 | Remove tautological all-green config suggestion at L334-341 | bug-fixer |
| F-6 | Document `writeCiLearnings` output schema in module header or sibling `.md` | doc-writer |
| F-7 | Sprint 188 dependency: confirm `src/orchestra/ci-reporter.ts:243` re-export of `CiLearningResult` is still needed elsewhere — if not, drop the re-export | architect |
| F-8 | Migrate test entry points away from helper exports so they can be narrowed to module-private | testing-expert |

## 9. Summary

`src/core/ci-learning.ts` is a 460-LoC, dependency-light, ADR-clean module that delivers cross-sprint CI pattern mining for the RETRO phase. Public surface is **broader than it needs to be** (8 functions, 6 types) — only 3 functions and 1 type are reached from production code (`src/orchestra/ci-reporter.ts`); the remaining 5 helpers exist as a test-surface convenience. The most concrete debt items are (a) a **name collision** with `sprint-metrics.ts::generateConfigSuggestions` — a real refactor hazard — (b) one **truly dead interface** (`RegressionHotspot`), and (c) scattered, undocumented **magic thresholds** driving severity classification. Code quality is otherwise high: explicit return types, single internal dependency, narrow ADR exposure, fully exercised by a 477-LoC sibling test file. Refactor effort to address all Sprint-188 follow-ups: **~1 day** for a single bug-fixer + code-reviewer pair. No NO_GO concerns identified; the file is production-stable.

**Risk posture:** medium (one high-severity item: name collision; rest low/medium). **Refactor priority:** F-1 (rename) and F-2 (dead interface) first — both are mechanical and reduce contributor confusion. **ADR amendment required:** none.
