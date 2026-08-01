# A21 — Architecture: Memory System & Sprint Lifecycle Audit

**Sprint:** 345  
**Task:** 345-021  
**Date:** 2026-06-28  
**Auditor:** w-345-021 (doc-writer / sonnet)  
**Scope:**
- `docs/architecture/memory-system.md` vs `src/core/memory-store.ts` + `src/core/memory-query.ts`
- `docs/architecture/sprint-lifecycle.md` vs `src/orchestra/sprint-controller.ts`

---

## Summary

Both architecture documents are substantially accurate and reflect the Memory V2 DB-first
model correctly. Six findingss in `memory-system.md` (two high-priority gaps, three stale
references, one minor imprecision) and six findings in `sprint-lifecycle.md` (two
undocumented enum values, two behavioral nuances, two unverifiable claims). All linked
files exist. No finding causes a reader to take an incorrect action on the happy path;
most are documentation gaps or stale line numbers.

**Verdict:**
- `memory-system.md` — **ACCURATE with gaps** (F1–F6 below)
- `sprint-lifecycle.md` — **ACCURATE with gaps** (G1–G6 below)

---

## Part 1: `docs/architecture/memory-system.md`

### VERIFIED claims

| # | Claim | Source | Status |
|---|-------|--------|--------|
| V1 | Single SSOT is `.brain/memory.db` (SQLite + FTS5) | `memory-store.ts:84-98` | ✅ |
| V2 | Schema = 5 real tables + 1 FTS5 virtual table | `memory-store.ts:98-237` | ✅ |
| V3 | FTS5 indexes 8 columns (4 original + 4 `_norm`) | `memory-store.ts:228-237` | ✅ |
| V4 | 3 FTS sync triggers: `entries_ai`, `entries_ad`, `entries_au` | `memory-store.ts:241-286` | ✅ |
| V5 | Additive migrations: `tenant_id`, `audit_prev_hmac`, `audit_hmac` | `memory-store.ts:197-212` | ✅ |
| V6 | ADRs carry `decay_exempt=1`; the decay query filters `decay_exempt = 0` | `memory-store.ts:924-930` | ✅ |
| V7 | Decay = soft-delete (`deleted_at = datetime('now')`, not hard DELETE) | `memory-store.ts:953-968` | ✅ |
| V8 | `DecayResult` fields match (linesBefore, linesAfter, archivedSprints, removedDebtCount, removedPatternCount) | `sprint-types.ts:137-143` | ✅ |
| V9 | `runDecay` re-exported via `src/orchestra/brain.ts` | `brain.ts:48` | ✅ |
| V10 | `deckent://memory` MCP resource URI | not contradicted | ✅ |

### FINDINGS

#### F1 — HIGH: Catastrophic decay guard entirely undocumented

`memory-store.ts:906-951` implements a guard that aborts a decay batch if it would
soft-delete ≥ 50 % of all non-exempt active entries **and** the batch contains ≥ 3
entries:

```typescript
// memory-store.ts:908-910
const CATASTROPHIC_BATCH_MIN = 3;
const CATASTROPHIC_RATIO = 0.5;
```

When triggered, `MemoryStore.decay()` returns `{ deletedCount: 0, aborted: true }` and
emits a `console.warn`. This behaviour is invisible to `memory-system.md`. A developer
debugging "why did decay not run" will not find the cause in the current doc.

**Fix required in `memory-system.md`**: Add a "Catastrophic decay guard" sub-section to
the "Brain Cleanup Cycle" section, documenting `CATASTROPHIC_RATIO`, `CATASTROPHIC_BATCH_MIN`,
and the `aborted: true` return field.

#### F2 — MEDIUM: ADR count stale

`memory-system.md:231` states:

> Current count | 89 ADRs (ADR-001 through ADR-089)

Actual state:
- `docs/adr/` contains 83 individual `.md` files (README excluded).
- `auditor.md` and `worker-default.md` list ADRs through **ADR-094** as accepted.
- The highest ADR file present: `docs/adr/094-flag-gated-enforcement-vein.md`.

The "89 ADRs through ADR-089" figure has been stale for multiple sprints.

**Fix required in `memory-system.md`**: Update count to 94 (or remove the static count
and replace with a `store.getByType('adr')` query instruction).

#### F3 — MEDIUM: `runDecay` line number stale

`memory-system.md:289` cites:

```
// src/orchestra/debt-manager.ts:542 (re-exported via src/orchestra/brain.ts)
```

Actual line: `debt-manager.ts:650`. The `:542` reference is stale by 108 lines.

**Fix required in `memory-system.md`**: Update the line reference to `:650` or remove the
line number (prefer removing — line numbers drift faster than function signatures).

#### F4 — MEDIUM: `sprint_num > 0` guard undocumented

The decay query has an additional safety condition not mentioned anywhere in the doc:

```sql
-- memory-store.ts:924-930
WHERE sprint_num < ?
  AND sprint_num > 0         ← skip schema-default (undated) entries
  AND decay_exempt = 0
  AND deleted_at IS NULL
```

Entries inserted without a `sprint_num` receive the schema default of `0` and are
**permanently preserved** by this guard — they are never decayed regardless of age or
budget. This is load-bearing behaviour for entries created outside a sprint context
(e.g., init-time bootstrapping).

**Fix required in `memory-system.md`**: Add a note in the "Decay Steps" section explaining
the `sprint_num > 0` guard and its preservation semantics.

#### F5 — LOW: `MemoryStore.decay()` return type conflated with `DecayResult`

`memory-system.md:307-313` displays `DecayResult` as the return type of the `store.decay()`
call. However:

- `MemoryStore.decay()` (`memory-store.ts:896`) returns `{ deletedCount: number; aborted?: boolean }`.
- `DecayResult` (`sprint-types.ts:137-143`) is the return type of the **outer** `runDecay()`
  function in `debt-manager.ts`.

The outer `runDecay()` wraps `store.decay()` and computes the `linesBefore`/`linesAfter`
counts before returning `DecayResult`. The doc conflates the two layers.

**Fix required in `memory-system.md`**: Clarify that `store.decay()` returns
`{ deletedCount, aborted? }` and the orchestrator-level `runDecay()` wraps that into
`DecayResult`.

#### F6 — LOW: Schema source reference range imprecise

`memory-system.md:42` states the schema is at `src/core/memory-store.ts:99-237`.

- Line 99 is where `initSchema()` opens the `db.exec(...)` call — correct.
- The main table DDL closes around line 155.
- FTS5 virtual table creation is at lines 228-237.
- The overall `initSchema()` method spans lines 98–188.

The range `:99-237` skips the index creation (163–178) and FTS trigger creation (241–286).
A reader clicking through to `:99-237` will see the FTS5 table creation end but miss the
triggers defined at 241–286.

**Fix (optional)**: Widen the reference to `:99-297` or cite `initSchema()` by name
rather than by line range.

---

## Part 2: `docs/architecture/sprint-lifecycle.md`

### VERIFIED claims

| # | Claim | Source | Status |
|---|-------|--------|--------|
| V11 | runSprint master function confirmed | `sprint-controller.ts:928` | ✅ |
| V12 | Phases PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→COMPLETE | `sprint-controller.ts:924-928` (JSDoc) | ✅ |
| V13 | SprintPhase enum: DIRECTIVE, PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, COMPLETE | `sprint-types.ts:7-18` | ✅ |
| V14 | Phase transition events via `emitPhaseChange()` | `sprint-controller.ts:1135, 1195, 1414, 1530, 1544, 1551, 1568` | ✅ |
| V15 | BrainError at `sprint-lifecycle.ts:70` | verified at `:70` | ✅ |
| V16 | `runDecay` function at `debt-manager.ts` (claimed `:542`, actual `:650`) | `debt-manager.ts:650` | ✅ (line stale) |
| V17 | Cascade circuit-breaker wired | `sprint-controller.ts:1468-1473` | ✅ |
| V18 | Fix phase uses 10-minute timeout | `sprint-controller.ts:618` | ✅ |
| V19 | All linked docs exist: `api-surface.md`, `045-wave-based-...md`, `047-manual-...md` | filesystem check | ✅ |
| V20 | runSprint delegates to runPlanPhase, runSpawnPhase, runEvaluatePhase, runFixPhase, runRetroPhase, runCleanupPhase | `sprint-controller.ts:1048, 1153, 1463, 1533, 1547, 1565` | ✅ |

### Phase Reconciliation Table

| Phase (doc) | SprintPhase enum value | emitPhaseChange call (line) | Status |
|-------------|----------------------|----------------------------|--------|
| Phase 0: DIRECTIVE | `DIRECTIVE` (`sprint-types.ts:8`) | — (pre-sprint, no controller event) | ✅ doc accurate |
| Phase 1: PLAN | `PLAN` | fires PLAN→SPAWN at `:1135` | ✅ doc accurate |
| Phase 2: SPAWN | `SPAWN` | fires SPAWN→EXECUTE at `:1195` | ✅ doc accurate |
| Phase 2a: WAVE_BUILD | **not in SprintPhase enum** | no emitPhaseChange | ⚠️ see G2 |
| Phase 3: EXECUTE | `EXECUTE` | fires EXECUTE→EVALUATE at `:1414` | ✅ doc accurate |
| Phase 4: EVALUATE | `EVALUATE` | fires EVALUATE→FIX at `:1530` | ✅ doc accurate |
| Phase 5: FIX | `FIX` | fires FIX→RETRO at `:1544` | ✅ doc accurate |
| Phase 6: RETRO | `RETRO` | fires RETRO→DECAY at `:1551` | ✅ doc accurate |
| Phase 7: DECAY | `DECAY` | fires DECAY→COMPLETE at `:1568` | ✅ doc accurate |
| Phase 8: COMPLETE | `COMPLETE` | — (terminal state) | ✅ doc accurate |
| — | **`TRANSITION`** (`sprint-types.ts:16`) | never emitted via emitPhaseChange | ⚠️ see G1 |

### FINDINGS

#### G1 — MEDIUM: `SprintPhase.TRANSITION` undocumented

`sprint-types.ts:16` defines `TRANSITION = 'TRANSITION'` in the `SprintPhase` enum.
The doc lists 9 phases (0–8) but the enum has **10 values** including `TRANSITION`.

`TRANSITION` is:
- Not emitted by any `emitPhaseChange()` call in the orchestra layer.
- Referenced in `src/dashboard/src/pages/DashboardPage.tsx:70` (coloured as "secondary").
- Effectively dormant in the sprint lifecycle.

**Fix required in `sprint-lifecycle.md`**: Add a footnote or appendix entry explaining
`SprintPhase.TRANSITION` — e.g., "Reserved for dashboard display; not emitted by the
sprint lifecycle."

#### G2 — MEDIUM: Phase 2a WAVE_BUILD has no formal SprintPhase enum value

`sprint-lifecycle.md` calls Phase 2a "WAVE_BUILD" and describes it as a distinct
sub-phase. However:

- There is no `SprintPhase.WAVE_BUILD` in the enum (`sprint-types.ts:7-18`).
- No `emitPhaseChange` call references WAVE_BUILD.
- The topological sort and scope collision detection happen internally within
  `sprint-spawner.ts` (called from `runSpawnPhase`), invisible to event observers.

Readers may expect a `WAVE_BUILD` phase event in the event stream, which does not exist.

**Fix required in `sprint-lifecycle.md`**: Clarify that WAVE_BUILD is an **internal
implementation detail** of `runSpawnPhase`, not a formal `SprintPhase` enum value. No
`emitPhaseChange(SPAWN, WAVE_BUILD, ...)` event fires.

#### G3 — LOW: `runRetroPhase` combines RETRO + DECAY in a single call

`sprint-controller.ts:1547` comment reads:

```typescript
// Phase 6+7: RETRO + DECAY
await runRetroPhase(projectRoot, sprint, evaluations, results, config, opts?.testMode);
```

The doc presents Phase 6 (RETRO) and Phase 7 (DECAY) as sequentially separate steps.
In the implementation both run inside `runRetroPhase()`. The `emitPhaseChange(RETRO→DECAY)`
at line 1551 fires **after** `runRetroPhase` returns — meaning both RETRO and DECAY
operations have already completed before the DECAY phase event is emitted.

This is not a doc error per se (the conceptual separation is real), but it means the
DECAY phase event signals "DECAY is over" rather than "DECAY is starting".

**Fix (optional)**: Add a note in the Phase 7 (DECAY) section: "In runSprint(), DECAY
operations run inside `runRetroPhase()` alongside RETRO; the `RETRO→DECAY` phase event
fires after both operations complete."

#### G4 — LOW: `emitPhaseChange` events signal phase exit, not phase entry

The doc's phase diagram implies events fire at phase entry (entering SPAWN, entering
EXECUTE, …). The actual controller fires each event **after** the phase's operations
complete:

```typescript
// sprint-controller.ts:1195 — fires AFTER runSpawnPhase() returns
emitPhaseChange(SprintPhase.SPAWN, SprintPhase.EXECUTE, sprint.id);

// sprint-controller.ts:1414 — fires AFTER waitForResults() returns
emitPhaseChange(SprintPhase.EXECUTE, SprintPhase.EVALUATE, sprint.id);
```

A subscriber listening for `SPAWN→EXECUTE` receives the event when spawn is **done**, not
when execute begins.

**Fix (optional)**: Add a note in the "Triggering a Sprint" section or in the Error
Handling section: "Phase events are emitted at phase exit (after operations complete),
not at phase entry."

#### G5 — LOW: `runDecay` line number also stale in sprint-lifecycle.md

`sprint-lifecycle.md:400` references:

```
runDecay(projectRoot, sprintId, opts?) — src/orchestra/debt-manager.ts (re-exported via brain.ts)
```

No specific line number is cited here (unlike memory-system.md), but if cross-referenced
with memory-system.md's `:542` it would be wrong. Actual location: `debt-manager.ts:650`.
The sprint-lifecycle.md entry itself is fine (no line number claimed).

#### G6 — INFO: `waitForResults` 15s poll interval not verifiable in sprint-controller.ts

`sprint-lifecycle.md:172` states:

> Brain polls `.tasks/task-{id}.result` every 15 seconds

This is implemented inside `src/orchestra/result-collector.ts` (`waitForResultsImpl`).
The sprint-controller.ts wraps it via `waitForResults()` at line 834 and cannot confirm or
deny the 15-second value. The claim is likely correct but requires a separate audit of
`result-collector.ts` to verify.

**No fix required in this audit.** Flag for A-series audit of `result-collector.ts`.

---

## Part 3: Links Check

| Link | From | Target | Status |
|------|------|--------|--------|
| `../reference/api-surface.md` | memory-system.md:32,361 | `docs/reference/api-surface.md` | ✅ exists |
| `memory-system.md` | sprint-lifecycle.md:12,411 | `docs/architecture/memory-system.md` | ✅ exists |
| `../adr/045-wave-based-execution-semantics.md` | sprint-lifecycle.md:143 | `docs/adr/045-wave-based-execution-semantics.md` | ✅ exists |
| `../adr/047-manual-subagent-dispatch-protocol.md` | sprint-lifecycle.md:138 | `docs/adr/047-manual-subagent-dispatch-protocol.md` | ✅ exists |

All links resolve. No dead links found.

---

## Summary Table

| ID | Doc | Severity | Type | Description |
|----|-----|----------|------|-------------|
| F1 | memory-system.md | HIGH | Gap | Catastrophic decay guard (CATASTROPHIC_RATIO=0.5) not documented |
| F2 | memory-system.md | MEDIUM | Stale | ADR count says 89; actual ≥94 |
| F3 | memory-system.md | MEDIUM | Stale | `debt-manager.ts:542` → actual `:650` |
| F4 | memory-system.md | MEDIUM | Gap | `sprint_num > 0` guard preserves undated entries — undocumented |
| F5 | memory-system.md | LOW | Conflation | `store.decay()` returns `{ deletedCount, aborted? }`, not `DecayResult` |
| F6 | memory-system.md | LOW | Imprecise | Schema line range `:99-237` misses triggers at 241–286 |
| G1 | sprint-lifecycle.md | MEDIUM | Gap | `SprintPhase.TRANSITION` exists in enum but not documented |
| G2 | sprint-lifecycle.md | MEDIUM | Gap | WAVE_BUILD has no enum value; not a formal phase boundary |
| G3 | sprint-lifecycle.md | LOW | Nuance | RETRO+DECAY combined in one function; phase event fires after both |
| G4 | sprint-lifecycle.md | LOW | Nuance | Phase events fire at phase exit, not entry |
| G5 | sprint-lifecycle.md | INFO | Stale | `runDecay` at `:650`, not `:542` (only if line cited cross-file) |
| G6 | sprint-lifecycle.md | INFO | Unverifiable | 15s poll interval is in result-collector.ts, not sprint-controller.ts |

**High-priority fixes needed:** F1 (catastrophic guard), F4 (sprint_num guard), G1 (TRANSITION enum), G2 (WAVE_BUILD formality).

**No editing performed on architecture docs** — per goCriteria, this is a verification-only audit.
