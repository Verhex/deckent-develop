# Audit: src/agents/prompt-ab-test.ts — 2026-05-21

## 1. Inventory

- **LoC:** 9 (1 header comment line + 1 trailing blank, 7 effective code lines)
- **Last modified (`git log -1 --format=%cs`):** 2026-03-22
- **First commit sprint:** sprint-031 (commit `f7342ec` — `feat: Sprint 031 — Brain Decision Engine, Learning Loop, Multi-Agent Collaboration, Adaptive Agent (+572 tests)`)
- **Most recent commit:** `f95d117` (sprint-036) — *brain.ts split + architectural cleanup — 11/11 done, +315 tests, brain.ts 1312→58 lines*. This is the consolidation commit that reduced the module to a re-export shim.
- **Public exports** (4 total):
  - `PromptABTester` — re-exported value/class from `./prompt-analytics.js` (real definition: `src/agents/prompt-analytics.ts:68`).
  - `type ExperimentResult` — type re-export (real definition: `src/agents/prompt-analytics.ts:11`).
  - `type Experiment` — type re-export (real definition: `src/agents/prompt-analytics.ts:18`).
  - `type ExperimentAnalysis` — type re-export (real definition: `src/agents/prompt-analytics.ts:28`).
- **Direct imports:** none other than the relative re-export targets — entire file body is two `export … from './prompt-analytics.js'` statements (lines 3–9).
- **Reverse dependencies** (`grep -rn "from .*/agents/prompt-ab-test"` against `src/` and `tests/`):
  - `src/` callers: **zero** — no production source file imports this stub. The companion file `src/agents/prompt-metrics.ts` references the shim only inside its own header comment, not as an import.
  - Test callers (4 files, 6 import sites):
    - `tests/agents/prompt-ab-test.test.ts:2` — `import { PromptABTester } from '../../src/agents/prompt-ab-test.js';`
    - `tests/agents/prompt-ab-test.test.ts:3` — `import type { Experiment, ExperimentAnalysis } from '../../src/agents/prompt-ab-test.js';`
    - `tests/agents/prompt-metrics.test.ts:5` — `import type { Experiment } from '../../src/agents/prompt-ab-test.js';`
    - `tests/integration/collaboration-adaptive.test.ts:21` — `import { PromptABTester } from '../../src/agents/prompt-ab-test.js';`
    - `tests/core/error-handling-unification.test.ts:313, 324, 335` — three `await import('../../src/agents/prompt-ab-test.js')` dynamic imports inside the *prompt-ab-test.ts — DeckentError usage* suite.

## 2. Bağlam (Architectural Context)

- **Layer:** `agents/` — agent-side prompt analytics utilities (companion to `prompt-metrics.ts`, `prompt-version.ts`, and the unified `prompt-analytics.ts`).
- **Sub-system role:** Backward-compatibility façade. The original Sprint 031 implementation (`PromptABTester` + experiment types) was extracted in Sprint 036 into a single cohesive module (`prompt-analytics.ts`) that merges *prompt-metrics* and *prompt-ab-test*; the original file path was preserved as a thin re-export stub so that pre-existing tests and any external callers built against the old import path continue to resolve without churn.
- **Sibling pattern:** `src/agents/prompt-metrics.ts` is structurally identical (3-line re-export over `PromptMetrics` + `PromptMetricsReport`). The two stubs form a *paired* backward-compat surface and should be reasoned about as a single decision (keep both or remove both).
- **ADR-related:**
  - **ADR-001 (TypeScript + ESM)** — the file is a TS module emitting ESM `export { … } from` syntax.
  - **ADR-002 (Node16 module resolution)** — the re-export specifier `'./prompt-analytics.js'` carries the mandatory `.js` extension.
  - **ADR-008 (Brain centralized import / one-way dependency)** — the stub does not import from `orchestra/` or `monitor/`, so it does not break the worker→core boundary.
  - **ADR-038 (Dead Code Disposition)** — directly relevant: this file is a *deliberately retained* re-export, but it is also the kind of artefact ADR-038 asks teams to revisit when no production caller remains. See Section 4.

## 3. Debt Risk

| Risk Area | Severity | Evidence (file:line) | Recommendation |
|-----------|----------|----------------------|----------------|
| Hidden alias / two-name surface for the same class | low | `src/agents/prompt-ab-test.ts:9` exports `PromptABTester`, also exported from `src/agents/prompt-analytics.ts:68` | Keep, but document the canonical path in JSDoc or a `@deprecated` tag so new code does not import the stub. |
| Stub goes stale if `prompt-analytics.ts` renames or removes any of the 4 symbols | low | re-exports listed by name at `src/agents/prompt-ab-test.ts:3-9` | Add a compile-time test (e.g. `tsc --noEmit` already covers it) and a 1-line vitest smoke that asserts `typeof PromptABTester === 'function'` to guard against silent removal. |
| Companion sibling (`prompt-metrics.ts`) drifts in maintenance state | low | `src/agents/prompt-metrics.ts:2-5` follows the exact same pattern | Treat both shims as a paired decision (Section 7). |
| No `@deprecated` JSDoc — IDEs cannot nudge callers toward the canonical module | medium | `src/agents/prompt-ab-test.ts:1-9` (no JSDoc at all) | Add `/** @deprecated Import from './prompt-analytics.js' instead. */` above each export. |
| Boundary violation potential | none | file body is pure re-export, no runtime code | n/a |
| Type drift between re-export and source | none (Type-checked) | `tsc --noEmit` would surface any missing-export error at build | n/a |

Net debt assessment: **low** — the only concrete risk is *signposting* (deprecation hint) rather than runtime correctness.

## 4. Dead Code Candidates

- [x] **Exported but zero-caller in `src/`** — all 4 exports (`PromptABTester`, `ExperimentResult`, `Experiment`, `ExperimentAnalysis`) have **zero production-source callers**. Evidence: `grep -rn "from .*/agents/prompt-ab-test" src/` returns no hits other than the shim's own self-references inside `prompt-analytics.ts:3`'s header comment. The only consumers are 4 test files (listed in Section 1).
- [ ] Branches with unreachable logic — n/a; file has no executable logic.
- [ ] Deprecated marker without removal — **no `@deprecated` marker is present**, even though the file is *functionally* a deprecation shim (header comment says "Backward-compatible re-export"). This is an inverse anti-pattern: the deprecation intent is undeclared.

**ADR-038 cross-reference:**
ADR-038 explicitly flags "deprecated marker without removal" and zero-caller exports as Dead-Code Disposition candidates. This stub matches *both* halves of the criterion (zero src callers + dormant shim semantics) **except** that test files still depend on it, which keeps it *live but legacy*. Per ADR-038's spirit, the correct disposition is either (a) migrate the 4 test files to import from `prompt-analytics.js` and delete this file, or (b) annotate `@deprecated` and keep it for an explicit deprecation window. The current state — kept silently — is the worst of both worlds.

## 5. Documentation Gaps

- **Header comment is informative but minimal** (`src/agents/prompt-ab-test.ts:1-2`). It states "Backward-compatible re-export from the unified prompt-analytics module" but does not name a target sprint, deprecation horizon, or canonical path for new code.
- **No JSDoc on the re-exports** — IDE tooling cannot surface a deprecation hint when a user types `import { PromptABTester } from '.../prompt-ab-test'`. Each `export … from` clause could carry a `/** @deprecated … */` block.
- **No cross-link from `prompt-analytics.ts`** — `src/agents/prompt-analytics.ts:1-3` notes the merge but does not point readers back to the stubs (`prompt-ab-test.ts`, `prompt-metrics.ts`) that still exist for compat.
- **No mention in CHANGELOG / Sprint 036 retro export** — the consolidation of `prompt-metrics` + `prompt-ab-test` into `prompt-analytics` is significant enough that user-facing notes (e.g. `.brain/exports/memory.md`) should record it; current memory exports do not name these files.
- **No `tests/agents/prompt-ab-test.test.ts` rename** — the test filename still pins the stub identity rather than the analytics module, which masks the consolidation in CI output.

## 6. ADR Compliance Check

| ADR | Relevant? | Compliant? | Evidence/Violation |
|-----|-----------|------------|--------------------|
| ADR-001 TypeScript + ESM | yes | yes | File is `.ts`, uses ESM `export { … } from` syntax (`src/agents/prompt-ab-test.ts:3-9`). |
| ADR-002 Node16 (`.js` suffix on relative specifiers) | yes | yes | Both re-export statements use `'./prompt-analytics.js'` (`src/agents/prompt-ab-test.ts:7, 9`). |
| ADR-003 vitest over Jest | yes (via tests) | yes | Consumer suites (`tests/agents/prompt-ab-test.test.ts:1`) import from `vitest`. |
| ADR-004 3-Layer Config Merge | no | n/a | No config code in this file. |
| ADR-006 spawnSync Security Pattern | no | n/a | No child-process invocation. |
| ADR-007 SpawnOptions Interface | no | n/a | No spawn surface. |
| ADR-008 Brain centralized import — one-way dependency | yes | yes | Stub does not import from `orchestra/`, `monitor/`, or `agents/worker.ts`; it only re-exports from a sibling agent-layer module. |
| ADR-009 DEBT.md table format | no | n/a | Not a debt-tracking file. |
| ADR-010 single runtime dep (commander.js) | yes | yes | No external runtime imports. |
| ADR-035 Verification Protocol Standard | no | n/a | No worker IPC code. |
| ADR-036 ADR Governance Integration | yes | yes | File contains no architectural decision logic that would need ADR enforcement. |
| ADR-037 RBAC Authority Matrix | yes | yes | Stub is agent-side, not Brain/Auditor — no privileged import. |
| ADR-038 Dead Code Disposition | yes | **partial** | Zero-src-caller + undeclared-deprecation pattern — see Section 4. Compliance requires either `@deprecated` marker or deletion+test migration. |
| ADR-039 Self-Modifying Task Detection | no | n/a | Not relevant. |
| ADR-046 Brain Self-Update Hook | no | n/a | Not relevant. |

Net: 12 ADRs in scope, **11 fully compliant** + 1 partial (ADR-038, signage gap).

## 7. Refactor Recommendations

1. **Annotate as `@deprecated`** — `src/agents/prompt-ab-test.ts:1-9` — add a JSDoc block above the file (or each export) explaining that callers should switch to `./prompt-analytics.js`. Effort: ~5 minutes. Impact: closes the ADR-038 signage gap, lets IDEs warn callers, and freezes the shim's intent in code.
2. **Add a 1-test smoke for re-export integrity** — new `tests/agents/prompt-ab-test-reexport.test.ts` (or fold into existing `tests/agents/prompt-ab-test.test.ts`) — assert that `(typeof PromptABTester === 'function')` and that the three type exports compile. Effort: ~10 minutes. Impact: prevents silent breakage if `prompt-analytics.ts` symbols are renamed.
3. **Plan a deprecation horizon** — record in `.brain/memory.db` (entry type `decision` or `memory`) a sprint number after which test imports must be migrated to `./prompt-analytics.js` and the stub deleted. Effort: 1 commit + retro note. Impact: turns dormant debt into tracked debt.
4. **Pair the decision with `src/agents/prompt-metrics.ts`** — both shims share the same lineage; resolving only one would leave the codebase in an asymmetric state. Effort: include `prompt-metrics.ts` in any change to this stub.
5. **Cross-link from canonical module** — update `src/agents/prompt-analytics.ts:1-3` header to mention "Legacy paths kept for compat: `prompt-ab-test.ts`, `prompt-metrics.ts`". Effort: 1-line edit. Impact: future readers find the stubs from the canonical module.
6. **(Optional) Migrate test imports and delete stub** — rewrite the 6 import sites (Section 1) to `import { PromptABTester } from '.../prompt-analytics.js';` and remove `src/agents/prompt-ab-test.ts`. Effort: ~30 minutes + 1 sprint review. Impact: eliminates dead-shim surface; only safe once any external callers are confirmed absent.

## 8. Sprint 187 Follow-up Items

- [ ] **P1** — Add `@deprecated` JSDoc to `src/agents/prompt-ab-test.ts` and `src/agents/prompt-metrics.ts` (paired). Acceptance: IDE shows strikethrough on `PromptABTester` import from the stub path.
- [ ] **P1** — Cross-link from `src/agents/prompt-analytics.ts:1-3` header → "Legacy compat stubs: `prompt-ab-test.ts`, `prompt-metrics.ts`".
- [ ] **P2** — Add a re-export integrity smoke test for both shims (single test file is fine).
- [ ] **P2** — Record a deprecation-horizon decision in `.brain/memory.db` (target sprint for migration + stub removal).
- [ ] **P2** — Migrate the 6 legacy import sites (4 test files) to `./prompt-analytics.js` *as a single mechanical refactor PR* after the deprecation window opens.
- [ ] **P3** — When all callers are migrated and one full sprint elapses with zero usage, delete `src/agents/prompt-ab-test.ts` and `src/agents/prompt-metrics.ts` together; update CHANGELOG.

## 9. Summary

- **Overall health:** **healthy (legacy)** — the file is correct, tiny, ADR-compliant on every hard rule (001/002/008), and serves a real backward-compatibility purpose for test code. Its only debt is *signage*: the deprecation intent is implicit in the header comment but not encoded in JSDoc, and the deprecation horizon is undocumented anywhere in `.brain/`.
- **Top 3 priorities:**
  1. Add `@deprecated` JSDoc to make the shim's status machine-readable (closes the ADR-038 signage gap).
  2. Pair-resolve with `src/agents/prompt-metrics.ts` — both shims should evolve together.
  3. Record a deprecation horizon in `.brain/memory.db` so the stub eventually exits via planned deletion rather than ambient drift.
