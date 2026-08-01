# Audit: src/agents/prompt-evolution.ts — 2026-05-21

## 1. Inventory
- **LoC:** 132
- **Last modified (git log -1 --format=%cs):** 2026-03-22
- **First commit sprint:** sprint-033 (commit msg: "feat: Sprint 033 — Integration tests, skill marketplace, adaptive agent advanced, analytics, performance (+559 tests)")
- **Public exports:**
  - `EvolutionType` — union literal type: `'created' | 'improved' | 'reverted' | 'specialized' | 'merged'`
  - `StatsAtTime` (interface) — snapshot of agent stats (`successRate`, `totalUses`, `avgCoverage`)
  - `EvolutionEvent` (interface) — single evolution record (`type`, `version`, `timestamp`, `triggerReason`, `statsAtTime`)
  - `EvolutionTimeline` (interface) — aggregated view (`agentId`, `events`, `totalEvolutions`, `latestVersion`)
  - `PromptEvolutionLog` (class) — file-backed CRUD over `.deckent/agents/{id}/evolution.json`
    - `constructor(projectRoot: string)`
    - `recordEvolution(agentId, event): void`
    - `getEvolutionTimeline(agentId): EvolutionTimeline`
    - `formatTimeline(timeline): string` — human-readable formatter
    - `getEventCount(agentId): number`
    - `clearEvents(agentId): void`
    - `_loadEvents(agentId)` / `_saveEvents(agentId, events)` — private helpers (no `private` keyword, public-by-default reachable; bkz. §3)
- **Direct imports:**
  - `node:fs` (synchronous I/O — `existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`)
  - `node:path` (`path.join`)
- **Reverse dependencies (`grep -r "prompt-evolution\|PromptEvolutionLog\|EvolutionEvent\|EvolutionTimeline\|StatsAtTime\|EvolutionType" src/`):**
  - **Zero production callers.** No `src/**/*.ts` file imports or references `PromptEvolutionLog`, `EvolutionEvent`, or any exported symbol from this module.
  - **Only test reference:** `tests/agents/prompt-evolution.test.ts` (162 LoC) — exercises the class behaviorally but no production wiring exists.

## 2. Bağlam (Architectural Context)
- **Layer:** `src/agents/` — Worker execution + agent metadata management subsystem (per `CLAUDE.md` Architecture overview: "Worker execution, prompt engineering (20 modules)").
- **Sub-system role:** Self-contained "prompt evolution log" — was conceived in sprint-033 as part of the Skill Marketplace / Adaptive Agent Advanced initiative to track per-agent prompt version history (created → improved → specialized → merged → reverted). Persists JSON events to `.deckent/agents/{id}/evolution.json` so that the promotion pipeline / adaptive agent / skill marketplace can show evolution timelines.
- **ADR-related:**
  - ADR-001 (TypeScript + ESM) — directly relevant, file is strict TS with type-only exports and a class export.
  - ADR-002 (Node16 Module Resolution / `.js` suffix) — relevant in principle, but file has **no relative imports**, only `node:` built-ins; not actionable here.
  - ADR-005 (Synchronous I/O — deprecated) — relevant: this file is **all synchronous** (`existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`). Per ADR-005's deprecated status, new code should prefer async; existing sync code is tolerated but tagged as legacy.
  - ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) — relevant: this module does NOT import from `orchestra/brain` or any orchestrator; clean leaf-module status. OK.
  - ADR-038 (Dead Code Disposition) — strongly relevant: zero production callers (see §1 reverse deps and §4 Dead Code Candidates).
  - ADR-041 (Agent Taxonomy — Horizontal Skills vs Vertical Agents) — tangentially relevant: file represents per-agent evolution history, consistent with the "vertical agent" identity model.
  - ADR-046 (Brain Self-Update Hook Architecture) — tangentially relevant: an evolution log is exactly the kind of artifact a self-update hook would write to, but no integration exists today.

## 3. Debt Risk

| Risk Area | Severity | Evidence (file:line) | Recommendation |
|-----------|----------|----------------------|----------------|
| Zero production callers — entire module is orphan | high | `src/agents/prompt-evolution.ts:40-132` (whole class exported, no src/ importer found) | Decide per ADR-038: either (a) wire into agent-pool / promotion-pipeline as originally intended, or (b) delete file + test. Do not leave indefinitely. |
| Synchronous I/O on hot-ish path | medium | `src/agents/prompt-evolution.ts:112` (`fs.existsSync`), `:115` (`readFileSync`), `:125-130` (`mkdirSync` + `writeFileSync`) | If revived, migrate to `fs/promises` per ADR-005's deprecation direction. Low priority while dead. |
| `_loadEvents` / `_saveEvents` underscore-prefixed but **not** `private` | medium | `src/agents/prompt-evolution.ts:110`, `:123` (no `private` keyword) | Mark as `private` so TS visibility matches the underscore convention; or expose them as proper public API with documentation. The current state mixes two conventions. |
| Silent swallow of corrupt JSON | low | `src/agents/prompt-evolution.ts:118-120` (`catch {} → return []`) | Log a warning (or surface via callback) before returning `[]`; silent zero-event return masks data-loss / migration bugs. Acceptable for a non-critical log file, but worth a `console.warn` at minimum. |
| `latestVersion` defaults to `'0.0.0'` semver-style but `version` field is opaque string | low | `src/agents/prompt-evolution.ts:60-61` | Either enforce semver via type / validation or document that `'0.0.0'` is a sentinel meaning "no events". No validation today. |
| No upper bound on event list growth | low | `src/agents/prompt-evolution.ts:48` (`events.push(event)` then full rewrite) | Add max-size or rotation policy if revived; otherwise long-lived agents accumulate unbounded JSON. |
| Concurrent-write race (full-file rewrite, no lock) | low | `src/agents/prompt-evolution.ts:126-130` (writeFileSync, no `.lock`) | If multiple writers per agent are possible, use `.locks/` per the project's lock convention or `writeFileSync` to a temp + rename. Low risk while dead. |

## 4. Dead Code Candidates
- [x] **Exported but zero-caller** (production):
  - `PromptEvolutionLog` class — zero `src/**/*.ts` importers (grep evidence: `Grep prompt-evolution|PromptEvolutionLog` returned only this file + its test).
  - `EvolutionEvent`, `EvolutionTimeline`, `StatsAtTime`, `EvolutionType` — zero `src/**/*.ts` importers.
- [ ] Branches with unreachable logic — none observed; all branches reachable via test paths.
- [ ] Deprecated marker without removal — no `@deprecated` JSDoc tag; file is silently dead rather than explicitly marked.

**ADR-038 cross-reference:** ADR-038 ("Dead Code Disposition — Sprint 139 Audit Results") establishes the disposition protocol for orphaned modules. Under ADR-038, an exported module with zero production callers and only a self-test should be flagged for: (a) revival/wiring, (b) explicit `@deprecated` + removal sprint, or (c) immediate removal. This file's entire surface area qualifies. Recommend opening a Sprint 187 follow-up to either wire `PromptEvolutionLog` into `agent-pool.ts` / `promotion-pipeline.ts` (the original sprint-033 intent) or delete `src/agents/prompt-evolution.ts` + `tests/agents/prompt-evolution.test.ts` together.

## 5. Documentation Gaps
- **Header banner comment (`src/agents/prompt-evolution.ts:1-3`)** describes purpose: "Records and retrieves prompt evolution history for agents. Stored in `.deckent/agents/{id}/evolution.json`." — adequate.
- **Class-level JSDoc missing** on `PromptEvolutionLog` (`src/agents/prompt-evolution.ts:40`) — no `@example`, no `@remarks` explaining intended caller (promotion-pipeline? adaptive-agent? agent-pool?).
- **Method-level JSDoc present but minimal:** `recordEvolution`, `getEvolutionTimeline`, `formatTimeline`, `getEventCount`, `clearEvents` each have a one-line `/** */` block; none document parameters, return shape, or thrown exceptions. Per `doc-writer` agent JSDoc standards (project agent prompt), each public API method should declare `@param`, `@returns`, optional `@throws`, and ideally `@example`.
- **`_loadEvents` / `_saveEvents` have no JSDoc at all** (`src/agents/prompt-evolution.ts:110`, `:123`) — given they are not marked `private` (see §3), they are effectively part of the public API surface and should be documented OR made `private`.
- **No README / module-doc entry** — `src/agents/prompt-evolution.ts` is absent from the `CLAUDE.md` "agents/" sub-section bullet list (which mentions `worker.ts`, `adaptive-agent.ts`, but not `prompt-evolution.ts`). If revived, add to the agents/ inventory.
- **No type-level comment on `EvolutionType`** (`src/agents/prompt-evolution.ts:10`) — meanings of `'specialized'` vs `'merged'` vs `'improved'` are undocumented; consumers cannot infer when each should be emitted.
- **No stale comments** observed contradicting code.

## 6. ADR Compliance Check

| ADR | Relevant? | Compliant? | Evidence / Violation |
|-----|-----------|------------|----------------------|
| ADR-001 TypeScript+ESM | yes | yes | `import * as fs from 'node:fs'` + `export class PromptEvolutionLog` — pure TS ESM. No CJS, no `require`. |
| ADR-002 Node16 (.js suffix on relative imports) | n/a | n/a | File has no relative imports; only `node:fs` and `node:path`. Rule does not apply. |
| ADR-003 vitest over Jest | yes (test side) | yes | `tests/agents/prompt-evolution.test.ts` uses vitest (project standard). Source file itself is test-framework-agnostic. |
| ADR-004 3-Layer Config Merge | no | n/a | File does not touch project config. |
| ADR-005 Synchronous I/O (deprecated) | yes | partial | File is 100% sync I/O (`existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`). ADR-005 is marked `deprecated`, meaning new code should avoid sync; existing sync code is not a hard violation but is tagged for future migration. |
| ADR-006 spawnSync Security Pattern | no | n/a | No subprocess spawning. |
| ADR-008 Brain Merkezi Import — Tek Yönlü Bağımlılık | yes | yes | File does not import from `orchestra/`, `monitor/`, `nervous/`, or any orchestrator module. Clean leaf-module. |
| ADR-010 Tek Runtime Dependency — commander.js | yes | yes | Only `node:fs` + `node:path` (built-ins). Zero external runtime deps added. |
| ADR-037 RBAC Authority Matrix (worker scope) | yes | n/a | Module itself does not enforce or violate RBAC; it is a worker-side utility. Out of scope for this file. |
| ADR-038 Dead Code Disposition | yes | **non-compliant** | Module has zero production callers (see §1, §4). Under ADR-038, must be flagged for revival, explicit `@deprecated`, or removal. Currently silently dead — out of compliance with the disposition protocol. |
| ADR-039 Self-Modifying Task Detection | no | n/a | Not a self-modifying task surface. |
| ADR-046 Brain Self-Update Hook Architecture | yes (latent) | yes | No conflict — file could be wired as a sink for self-update hook events, but is not today. |

## 7. Refactor Recommendations
1. **Disposition decision (ADR-038)** — `src/agents/prompt-evolution.ts:1-132` — Either:
   - **Option A (wire-in, preferred if feature is on roadmap):** Integrate `PromptEvolutionLog` into `src/core/agent-pool.ts` (on agent create/promote/demote events) and `src/orchestra/promotion-pipeline.ts` (on temp→permanent promotion). Effort: medium (~2-3 hours: wire call sites + verify event types map cleanly to current pool events).
   - **Option B (delete):** Remove `src/agents/prompt-evolution.ts` and `tests/agents/prompt-evolution.test.ts` (162 LoC test) together. Effort: low (~15 min: 2 deletes + tsc + vitest).
   - **Rationale:** Sprint 187 owner must pick; leaving this in violation-of-ADR-038 limbo costs reviewer attention every audit and inflates LoC without value.
   - **Impact:** removing eliminates 132 + 162 = 294 LoC dead weight; wiring activates a sprint-033 feature that was abandoned mid-flight.

2. **Mark visibility correctly on `_loadEvents` / `_saveEvents`** — `src/agents/prompt-evolution.ts:110, :123` — Prefix `_` is convention but not enforcement. Add `private` keyword (`private _loadEvents(...)`) or drop the prefix and add `private`. Effort: trivial. Impact: stronger TS visibility guarantees, less risk that future code calls helpers expecting public stability.

3. **Surface JSON-parse failures, do not swallow** — `src/agents/prompt-evolution.ts:118-120` — Replace `catch { return []; }` with `catch (err) { console.warn(...); return []; }` or propagate via callback. Effort: trivial. Impact: prevents silent data loss when an `evolution.json` file is corrupted (currently looks indistinguishable from a fresh agent).

4. **Migrate to async fs (only if revived under Option A)** — Replace `fs.readFileSync` / `writeFileSync` / `existsSync` / `mkdirSync` with `fs/promises` equivalents to align with ADR-005's deprecation direction. Effort: low (~30 min including call-site updates). Impact: future-proofs the module per ADR-005, avoids blocking event-loop on per-agent log writes in long sprints.

5. **JSDoc completeness pass** — `src/agents/prompt-evolution.ts:46, :55, :74, :97, :104, :110, :123` — Add `@param`, `@returns`, and at least one `@example` per public method, per project `doc-writer` agent JSDoc standards. Effort: low (~20 min). Impact: makes the API self-explanatory and consistent with the rest of `src/agents/` (e.g., `worker.ts` is well-documented).

6. **Document `EvolutionType` literal meanings** — `src/agents/prompt-evolution.ts:10` — Add an inline comment or JSDoc explaining when each of `'created' | 'improved' | 'reverted' | 'specialized' | 'merged'` should be emitted. Effort: trivial. Impact: removes ambiguity for future callers.

## 8. Sprint 187 Follow-up Items
- [ ] **P0** — Decide ADR-038 disposition for `src/agents/prompt-evolution.ts`: wire-in (Option A) or delete (Option B). Owner: architect / Alperen. (No further audit value until decided.)
- [ ] **P1** — If retained: add `private` keyword to `_loadEvents` and `_saveEvents` (`src/agents/prompt-evolution.ts:110, :123`).
- [ ] **P1** — If retained: complete JSDoc on all 5 public methods + `EvolutionType` literal meanings (per §5, §7-#5, §7-#6).
- [ ] **P2** — If retained: replace silent `catch {}` at `src/agents/prompt-evolution.ts:118-120` with `console.warn` + return `[]`.
- [ ] **P2** — If retained: schedule `fs/promises` migration per ADR-005 deprecation direction (§7-#4).
- [ ] **P2** — If retained: add `prompt-evolution.ts` to `CLAUDE.md` "agents/" sub-section inventory.

## 9. Summary
- **Overall health:** **dead-code-candidate** — well-written, self-contained, and tested module with **zero production callers** in `src/`. Has been dormant since sprint-033 (2026-03-22) when it was introduced as part of a broader "Skill Marketplace / Adaptive Agent Advanced" sprint that did not complete the wiring step. ADR-038 explicitly addresses this disposition; this file is currently out of compliance with that ADR.
- **Top 3 priorities:**
  1. **(P0)** Force an ADR-038 disposition decision in Sprint 187: wire `PromptEvolutionLog` into `agent-pool.ts` + `promotion-pipeline.ts` (Option A) or delete the file + its test (Option B).
  2. **(P1)** If retained, tighten visibility (`private` on `_loadEvents` / `_saveEvents`) and complete JSDoc on all public methods + `EvolutionType` literal meanings.
  3. **(P2)** If retained, surface JSON-parse failures (replace silent `catch {}` with `console.warn`) and schedule async-fs migration per ADR-005 deprecation direction.
