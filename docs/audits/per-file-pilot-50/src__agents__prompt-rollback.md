# Audit: src/agents/prompt-rollback.ts

**Sprint:** sprint-186 (per-file pilot — slot 012)
**Date:** 2026-05-21
**Auditor agent:** doc-writer
**File LoC:** 151 (incl. terminator newline)

---

## 1. Inventory

- **Path:** `src/agents/prompt-rollback.ts`
- **LoC:** 151 lines (1 trailing newline)
- **Module style:** ESM, named exports, no default export (ADR-001/ADR-002 compliant)
- **Public exports:**
  - `interface RollbackResult` — return shape of a successful rollback `{ rolledBackTo: number; reason: string }` (lines 9–12)
  - `interface RollbackLogEntry` — single audit record `{ timestamp, fromVersion, toVersion, reason }` (lines 14–19)
  - `class PromptRollback` — orchestrator with five public methods: `shouldRollback`, `rollbackPrompt`, `canRollback`, `logRollback`, `getRollbackLog` (lines 30–150)
- **Internal API:** two private helpers — `_rollbackLogPath`, `_readRollbackLog` (lines 134–149)
- **Module-scoped constants:**
  - `AGENTS_DIR = '.deckent/agents'` (line 23)
  - `ROLLBACK_LOG_FILE = 'rollback-log.json'` (line 24)
  - `ROLLBACK_SUCCESS_THRESHOLD = 0.5` (line 25)
  - `ROLLBACK_MIN_USES = 3` (line 26)
- **Direct imports:**
  - `node:fs` → `existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync` (synchronous I/O — see §6 ADR-005)
  - `node:path` → `join`
  - `./prompt-version.js` → `PromptVersionManager` (sister module)
- **Reverse dependencies (`grep -r "PromptRollback\|prompt-rollback" src/ tests/`):**
  - `tests/agents/prompt-rollback.test.ts` — 193-line dedicated unit suite, imports `PromptRollback`
  - `tests/integration/collaboration-adaptive.test.ts` — three usage sites (lines 18, 251, 337, 368)
  - **Zero callers in `src/`** outside the file itself. No `orchestra/`, `monitor/`, `nervous/`, or `api/` module imports this class.

---

## 2. Bağlam (Architectural Context)

- **Layer:** `src/agents/` — Deckent's worker-execution and prompt-engineering subsystem (20 modules per the architecture map in `CLAUDE.md`). Specifically, this file is part of the **prompt-evolution sub-cluster** alongside `prompt-version.ts`, `prompt-analytics.ts`, `prompt-evolution.ts`, `prompt-ab-test.ts`, and `prompt-metrics.ts`.
- **Sub-system role:** Provides the **inverse mutation** to the live `promotion-pipeline.ts` machinery. Where promotion advances a winning prompt to "permanent" status, rollback is supposed to revert a regressing prompt to its best historical version. The promotion side is wired into `src/orchestra/sprint-finalizer.ts` and `src/orchestra/index.ts`; the rollback side is not wired into either.
- **Lifecycle position:** Conceptually belongs in the EVALUATE → RETRO phase of the sprint lifecycle — after `result-evaluator.ts` updates `successRate` stats, before `sprint-reporter.ts` writes the retrospective.
- **ADR-related context:**
  - **ADR-001 / ADR-002** — TypeScript + ESM + Node16 `.js` suffix → all compliant.
  - **ADR-005 (deprecated)** — Synchronous I/O. Module uses `readFileSync`/`writeFileSync`/`mkdirSync`/`existsSync`. ADR-005 is marked deprecated in `.brain/exports/summary.md`, so async migration is desirable but not mandatory.
  - **ADR-008 (Brain centralized import)** — One-way dependency respected: `src/agents/` does not import from `src/orchestra/`.
  - **ADR-010 (sole runtime dep)** — Compliant: only stdlib (`node:fs`, `node:path`) plus sibling agent module.
  - **ADR-038 (Dead Code Disposition)** — Direct hit: this file is a textbook ADR-038 candidate (see §4).
  - **ADR-041 (Agent Taxonomy — horizontal vs vertical)** — Horizontal infrastructure module, not a vertical agent persona.
  - **ADR-046 (Brain Self-Update Hook Architecture)** — Conceptually adjacent: rollback would naturally be a self-update hook trigger.
  - **ADR-048 (Prompt Lifecycle Contract)** — **Naming collision warning, not a direct match.** ADR-048 governs `.prompt-*.txt` *tmpfile* lifecycle (write-at-spawn → persist-during-sprint → archive-at-cleanup) for Docker/Tmux/Subprocess backends. It does NOT govern *prompt version* rollback. The task brief ("ADR-048 rollback semantigi") conflates the two; this audit treats ADR-048 as related-but-distinct.

---

## 3. Debt Risk

| Risk Area | Severity | Evidence (file:line) | Recommendation |
|-----------|----------|----------------------|----------------|
| Zero production callers — dead-code candidate | high | `prompt-rollback.ts:1–151` + repository-wide grep (0 `src/` hits outside file) | Sprint 187 promote-or-delete decision per ADR-038 |
| `bestVersion` tie-breaker selects never-used candidates | medium | `prompt-rollback.ts:62–73` — initial `bestVersion = null`; first non-current iteration always wins; tie-break does not record `uses` on `bestVersion` for downstream comparison | Skip `v.stats.uses === 0` unless no other option; record `uses` on `bestVersion`; document tie-break policy |
| JSDoc/code drift — `rollbackPrompt` claims `>= 2 uses` guard that does not exist | medium | docstring `prompt-rollback.ts:50–53` vs body `:62–73` (no uses guard) | Either enforce the guard or correct the docstring |
| Unused `_agentId` parameter in public API | low | `prompt-rollback.ts:42` (`_agentId: string`) | Drop the param or implement per-agent threshold lookup |
| Synchronous I/O on a would-be sprint hot path | low | `prompt-rollback.ts:122, 142` (`writeFileSync`, `readFileSync`) | If wired live, migrate to `fs/promises` (ADR-005 deprecated direction) |
| `mkdirSync` + `writeFileSync` not atomic | low | `prompt-rollback.ts:112,122` | Apply Sprint 139 Task 13 atomic-write pattern (tmpfile + `renameSync`) |
| Silent error swallow in `_readRollbackLog` | low | `prompt-rollback.ts:146–148` (`catch { return [] }`) | Emit a warning via observability event stream; silent log-corruption recovery hides disk failures |
| Policy constants hard-coded (threshold + min uses) | low | `prompt-rollback.ts:25–26` | Surface via `.deckent/config.json` (e.g. `rollback.success_threshold`, `rollback.min_uses`) if wired live |
| ADR-048 naming collision risk | low | task brief vs ADR-048 actual scope | Add module header note clarifying "prompt **version** rollback ≠ ADR-048 prompt-file lifecycle" |

---

## 4. Dead Code Candidates

- **[x] Whole module — 0 `src/` callers.** `PromptRollback`, `RollbackResult`, `RollbackLogEntry` are imported only by:
  - `tests/agents/prompt-rollback.test.ts`
  - `tests/integration/collaboration-adaptive.test.ts`
  No `src/orchestra/`, `src/monitor/`, `src/nervous/`, or `src/api/` module references the class. Verified via:
  ```bash
  grep -rn "PromptRollback\|prompt-rollback" src/
  # only src/agents/prompt-rollback.ts itself
  ```
- **[x] Asymmetric pair with `promotion-pipeline.ts`** — Promotion is wired (`src/orchestra/sprint-finalizer.ts`, `src/orchestra/index.ts`); rollback is the never-invoked inverse. This asymmetry indicates the prompt-evolution loop ships only the "advance" half.
- **[ ] Internal unreachable branches** — none; all five public methods and both private helpers are exercised by the test suite.
- **[ ] Deprecated marker** — no `@deprecated` JSDoc tag, but the module's behavior is de-facto dormant since first commit (Sprint 031).
- **ADR-038 disposition:** classic case — either (a) wire-live in Sprint 187 with a verification channel (ADR-035) and config-driven thresholds, or (b) delete the file plus both test files (`tests/agents/prompt-rollback.test.ts`, `tests/integration/collaboration-adaptive.test.ts` lines 251–410). Continued indefinite hold violates ADR-038 spirit.

---

## 5. Documentation Gaps

- **Module-level JSDoc missing dormancy disclosure.** Header comment (`prompt-rollback.ts:1–2`) implies the module is live: *"Automatic rollback to best historical prompt version when current is failing."* Reality is dormant. A maintainer reading this header would reasonably assume a sprint-hot-path module.
- **`RollbackResult.reason` field has no JSDoc.** The actual format (constructed at lines 81–82) follows the pattern `"Current version {N} underperforming. Rolled back to version {M} (successRate: {X}%)."` but this shape is undocumented for downstream consumers (e.g. retro report writers).
- **`RollbackLogEntry.timestamp` lacks format spec.** Code uses `new Date().toISOString()` (line 116) — UTC ISO 8601 — but the type only states `string`.
- **`shouldRollback` JSDoc hard-codes the constants.** Docstring says *"Returns true if successRate < 50% and uses >= 3"* (line 39) — if `ROLLBACK_SUCCESS_THRESHOLD` or `ROLLBACK_MIN_USES` are tuned (lines 25–26), the docstring will drift.
- **`rollbackPrompt` JSDoc/code mismatch.** Docstring (line 51) says *"Roll back to the best historical version (highest successRate with >= 2 uses)"* but the implementation never enforces `uses >= 2`. Either the guard is missing from the code OR the claim is wrong.
- **`logRollback` side effects undocumented.** Creates `.deckent/agents/{agentId}/` if missing (line 112), appends-or-creates log file. Not atomic. None of this is in JSDoc.
- **No cross-reference to `PromptVersionManager`.** Readers cannot infer that `activateVersion()` is what actually applies the rollback (line 78).
- **No ADR cross-references.** Module touches ADR-038, ADR-046, and (tangentially) ADR-048 territory without any `@see` tags.

---

## 6. ADR Compliance Check

| ADR | Relevant? | Compliant? | Evidence / Notes |
|-----|-----------|------------|------------------|
| ADR-001 TypeScript + ESM | yes | ✓ | Named TS exports, no CJS interop, no `require()` |
| ADR-002 Node16 (.js suffix) | yes | ✓ | `import { PromptVersionManager } from './prompt-version.js'` — line 5 |
| ADR-005 Synchronous I/O | yes (deprecated direction) | partial | All fs operations sync; ADR-005 deprecated → migration desirable, not blocking |
| ADR-006 spawnSync security | no | n/a | No child-process usage |
| ADR-007 SpawnOptions interface | no | n/a | No subprocess |
| ADR-008 Brain centralized import | yes | ✓ | `src/agents/` does not import from `src/orchestra/`; one-way dep respected |
| ADR-009 DEBT.md table format | no | n/a | Does not author DEBT.md |
| ADR-010 commander.js sole runtime dep | yes | ✓ | Only `node:fs`/`node:path` + sibling agent module |
| ADR-035 Verification Protocol Standard | yes | n/a | Module is unwired; emits no verification channel |
| ADR-037 RBAC Authority Matrix | yes | unclear | If wired, would sit under worker/agent authority slice; not currently enforced |
| ADR-038 Dead Code Disposition | yes | **candidate violation** | 0 src/ callers since Sprint 031 — see §4 |
| ADR-041 Agent Taxonomy | yes | ✓ | Horizontal infrastructure, not a vertical persona |
| ADR-046 Brain Self-Update Hook | yes | n/a | Natural host for rollback trigger; not registered |
| ADR-048 Prompt Lifecycle Contract | tangential | n/a | ADR-048 governs `.prompt-*.txt` tmpfile lifecycle (not version rollback); naming-collision risk only — see §2 |
| ADR-053 TaskType Taxonomy | no | n/a | Not a task-type module |

---

## 7. Refactor Recommendations

1. **Promote-or-delete decision (ADR-038, P0).** Either wire `PromptRollback` into `src/orchestra/sprint-finalizer.ts` alongside the existing promotion call, with a `.deckent/config.json` flag (`prompt_rollback.enabled`), or delete the file plus `tests/agents/prompt-rollback.test.ts` and the rollback block in `tests/integration/collaboration-adaptive.test.ts`. Continued indefinite hold violates ADR-038. *Owner:* Brain. *Effort:* low if delete, medium if wire-live.
2. **Fix `bestVersion` selection logic (P1).** Lines 62–73 admit any non-current version as `bestVersion` on first iteration regardless of `uses`. Patch: store `uses` on `bestVersion`; skip candidates with `uses === 0` unless no other exists; document tie-break policy in JSDoc. *Effort:* ≤15 LoC + 2 regression tests.
3. **Reconcile JSDoc `>= 2 uses` claim (P1).** Either add the guard (`if (v.stats.uses < 2) continue;`) or remove the claim from the docstring at line 51. Pick one — the current state is unambiguously broken documentation.
4. **Drop or wire `_agentId` parameter (P2).** Public APIs with `_`-prefixed parameters are an anti-pattern. Either signature-narrow to `shouldRollback(stats)` or implement per-agent overrides reading from `.deckent/agents/{agentId}/config.json`. *Effort:* trivial.
5. **Atomic write for `rollback-log.json` (P2).** Apply the Sprint 139 Task 13 atomic-write pattern (write to tmpfile + `renameSync`). Avoids partial-file corruption on Docker SIGTERM during sprint finalization. *Effort:* low; consider extracting `atomicWriteFileSync` helper if not already shared.
6. **Surface policy constants via config (P2).** `ROLLBACK_SUCCESS_THRESHOLD` and `ROLLBACK_MIN_USES` are policy decisions. Surface as `prompt_rollback.success_threshold` / `prompt_rollback.min_uses` in `.deckent/config.json` schema. *Effort:* low.
7. **Add module-level JSDoc clarifying status (P3).** Until §1 P0 lands, the header comment should read something like: *"@status dormant — defined for prompt-version rollback but not wired into sprint lifecycle. See ADR-038 follow-up."* Prevents future maintainer confusion. *Effort:* trivial.
8. **Migrate sync I/O to async (P3, optional).** ADR-005 deprecated direction. Only worth doing if §1 lands on the wire-live path. *Effort:* low.
9. **Disambiguate ADR-048 (P3).** Add a 1-line `@see` note in the module header pointing out that ADR-048 governs *prompt file* lifecycle, not prompt *version* rollback — they share a token but solve different problems. Prevents future Brain task briefs from conflating the two. *Effort:* trivial.

---

## 8. Sprint 188 Follow-up Items

- [ ] **P0 — Disposition decision.** Brain decides ADR-038 fate for `PromptRollback`: wire-live in sprint-finalizer (with config flag + verification channel) OR delete + test suite. No more "latent infrastructure" status after Sprint 188.
- [ ] **P1 — Tie-breaker bug fix.** Patch `rollbackPrompt()` lines 62–73 with a `uses === 0` skip + proper `uses` tracking on `bestVersion`; add regression tests for: (a) zero-use-only candidates, (b) equal-rate tie with differing uses, (c) single-version short-circuit.
- [ ] **P1 — JSDoc reconciliation.** Decide whether `uses >= 2` guard belongs in code or out of docstring; ship the matching version.
- [ ] **P2 — Remove or wire `_agentId`.** Choose: trim the signature or implement per-agent thresholds. Update test sites accordingly.
- [ ] **P2 — Atomic write for `rollback-log.json`.** Match the Sprint 139 hot-path standard if §1 lands on the wire-live path; defer if §1 deletes.
- [ ] **P2 — Config-driven thresholds.** `prompt_rollback.success_threshold` / `prompt_rollback.min_uses` keys in `.deckent/config.json` schema if §1 lands wire-live.
- [ ] **P3 — Module header dormancy disclosure** (until §1 lands).
- [ ] **P3 — ADR-048 disambiguation note.** Add `@see ADR-048 (note: covers prompt-*file* lifecycle, not version rollback)` to avoid future cross-wiring confusion.

---

## 9. Summary

- **Overall health:** dead-code candidate / latent infrastructure. Cleanly written, well-tested (193-LoC dedicated suite + integration coverage), ADR-001/002/008/010 compliant — but never invoked by `src/`. Lives as the asymmetric inverse of the live `promotion-pipeline.ts`.
- **Most material finding:** the module is the textbook ADR-038 case. Since Sprint 031 it has shipped with 0 production callers and a paired test suite that exercises functionality nothing else calls. Sprint 188 must pick wire-live or delete.
- **Most subtle finding:** the `bestVersion` selection logic in `rollbackPrompt()` (lines 62–73) is not just a docstring/code drift — it can actively pick a never-used version (uses=0, successRate=0) as the rollback target when iterating from a `null` accumulator. If the module is ever activated without this fix, the first rollback could silently downgrade an agent to an untested prompt.
- **ADR-048 caveat:** the task brief asks for *"ADR-048 rollback semantigi"*, but ADR-048 actually governs `.prompt-*.txt` tmpfile lifecycle for backends — a different "rollback". The naming collision should be flagged in the module header to prevent future task-brief drift.
- **Top 3 priorities for Sprint 188:**
  1. ADR-038 disposition — wire-live or delete; no more limbo.
  2. Fix `bestVersion` tie-breaker correctness bug (active risk if wire-live).
  3. JSDoc/code reconciliation for the `uses >= 2` claim.
