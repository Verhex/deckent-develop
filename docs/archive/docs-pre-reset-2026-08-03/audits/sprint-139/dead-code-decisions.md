# Dead Code Audit — Decision Matrix (Sprint 139, Step 3)

**Date:** 2026-04-15
**Author:** Worker w-139-039 (doc-writer agent)
**ADR Reference:** ADR-038 (Dead Code Disposition)
**Input:** `docs/audits/sprint-139/dead-code-report.md` (Step 1 audit report)
**Governance:** `.brain/DECISIONS.md` ADR-028, ADR-033, ADR-038

---

## Decision Categories

Each dead/dormant module receives one of four dispositions:

| Decision | Meaning | Action Timeline |
|----------|---------|-----------------|
| **Remove** | Tamamen sil (kaynak + test) | Sprint 140 Adım 4 |
| **Revive + Test** | Canlılaştır, dogfood, test ekle | Sprint 142+ |
| **Deprecate + Warning** | `@deprecated` JSDoc + runtime warning | Sprint 142+ remove değerlendirmesi |
| **Defer + ADR** | ADR-038 ile koru, gelecek sprint'te reassess | Sprint 145+ |

---

## Summary Matrix

| # | Module | LoC | Category | Decision | Future Value | Risk |
|---|--------|-----|----------|----------|-------------|------|
| 1 | learning-decay.ts | 151 | Dead | **Remove** | Low | Minimal |
| 2 | learning-migration.ts | 229 | Dead | **Remove** | Low | Minimal |
| 3 | batch-stats.ts | 141 | Dead | **Remove** | Low-Moderate | Minimal |
| 4 | combination-scorer.ts | 101 | Dead | **Defer + ADR** | High | None |
| 5 | handoff-protocol.ts | 152 | Dead | **Defer + ADR** | High | None |
| 6 | brain-context.ts | 268 | Dead | **Defer + ADR** | High | None |
| 7 | decision-engine.ts | 170 | Dormant | **Deprecate + Warning** | Reference | ADR-028 |
| 8 | decision-replay.ts | 150 | Dormant | **Deprecate + Warning** | Low-Moderate | ADR-028 |
| 9 | decision-steps/agent-step.ts | 83 | Dormant | **Deprecate + Warning** | Low | ADR-028 |
| 10 | decision-steps/scope-step.ts | 92 | Dormant | **Deprecate + Warning** | Moderate | ADR-028 |
| 11 | parallel-pipeline.ts | — | **False Positive** | **No Action** | Critical | Active |

**Totals:**
- Remove: 3 modules, ~521 LoC
- Defer: 3 modules, ~521 LoC
- Deprecate: 4 modules, ~495 LoC (ADR-028 protected)
- False Positive: 1 module (excluded from dead code)

---

## Detailed Decisions

### 1. `src/orchestra/learning-decay.ts` — REMOVE

**Lines:** 151
**Reason:** Manages aging of learning/pattern data by removing learning history files older than N sprints (default 10) and compacting remaining patterns into summary statistics. Connected to a deprecated learning system that was replaced by V2 routing engine.

**Decision Rationale:**
- Zero imports in src/ — completely disconnected from production code
- The decay pattern it implements is trivial (~30 lines of core logic: readdir + filter by age + unlink)
- V2 routing uses outcome-tracker.ts and routing-engine.ts for learning — fundamentally different approach
- The pattern "delete files older than N sprints" can be reimplemented in <30 minutes if ever needed

**Risk Assessment:** Minimal. No production code depends on it. Test file (`tests/orchestra/learning-decay.test.ts`) also removed.

**Rollback Plan:** `git revert <commit-hash>` restores the file. Pre-removal commit hash recorded below.

---

### 2. `src/orchestra/learning-migration.ts` — REMOVE

**Lines:** 229
**Reason:** Provides keyword-to-taskType mapping and legacy learning entry migration between data formats. Contains hardcoded dictionaries mapping words like "test", "doc", "refactor" to task types.

**Decision Rationale:**
- Zero imports in src/ — completely disconnected
- Hardcoded keyword dictionaries are specific to the deprecated learning system format
- If a new learning system is built, it would use intent-classifier.ts (V2 Layer 1) instead of keyword matching
- The migration logic converts between data formats that no longer exist in production

**Risk Assessment:** Minimal. Legacy data format is no longer used. Test file (`tests/orchestra/learning-migration.test.ts`) also removed.

**Rollback Plan:** `git revert <commit-hash>` restores the file.

---

### 3. `src/orchestra/batch-stats.ts` — REMOVE

**Lines:** 141
**Reason:** Implements a queue + delayed batch write mechanism for stats updates (agent/skill/sprint/task). Designed to reduce I/O operations by batching writes.

**Decision Rationale:**
- Zero imports in src/ — completely disconnected
- The batching pattern is generic and well-known — `queue.push()` + `setTimeout()` + `flush()`
- If stats batching is needed in the future, `node:stream.Writable` with `highWaterMark` or a simple buffer provides the same functionality with less code
- Current stats are written synchronously per-task (agent-pool.ts, skill-pool.ts) without performance issues

**Risk Assessment:** Minimal. The pattern can be reimplemented in 20 minutes using Node.js built-in streams.

**Rollback Plan:** `git revert <commit-hash>` restores the file. Test file (`tests/orchestra/batch-stats.test.ts`) also removed.

---

### 4. `src/orchestra/combination-scorer.ts` — DEFER + ADR

**Lines:** 101
**Reason:** Scores task + agent/skills/model combinations using a weighted formula: `score = successCount×2 + avgCoverage×0.1 - failCount×3 - recencyPenalty`. Produces confidence and recommendation (use/avoid/neutral).

**Decision Rationale:**
- Zero imports in src/ currently — BUT the scoring algorithm is directly relevant to routing evolution
- `outcome-tracker.ts` already records routing outcomes; combination-scorer could consume this data for ML-driven routing recommendations
- The formula captures institutional knowledge about what makes good agent/task/model combinations
- Reimplementation cost would be HIGH — the scoring weights were tuned over multiple sprints (Sprint 072-076)

**Future Connection:**
- Sprint 145 routing evolution — feed outcome data into combination scoring
- `routing-engine.ts` Layer 3 confidence scoring could use this as a secondary signal

**Risk Assessment:** None (keeping dead code has zero runtime impact, only compilation cost).

**Reassessment:** Sprint 145. If routing evolution doesn't need combination scoring by then, remove.

**Rollback Plan:** Remove `@deprecated` tag + wire into outcome-tracker data flow.

---

### 5. `src/orchestra/handoff-protocol.ts` — DEFER + ADR

**Lines:** 152
**Reason:** Manages artifact handoffs between dependent tasks: tracks handoff status (pending/ready/failed), stores metadata (from/to task IDs, artifacts list) in `.tasks/handoffs/` directory.

**Decision Rationale:**
- Zero imports in src/ currently — BUT directly addresses a real gap in task coordination
- Sprint 134 T-001 (Task Dependency Pipeline) implemented dependencies at the scheduling level, but not at the artifact exchange level
- When Task A produces a file that Task B needs, the current system relies on filesystem ordering + wave barriers
- handoff-protocol.ts provides the formal handoff mechanism — from/to tracking, artifact list, status FSM

**Future Connection:**
- Sprint 145 distributed execution — worker containers need explicit artifact handoff
- Sprint 142 planner evolution — dependency-aware planning with artifact metadata
- Event stream integration — handoff events as ADR-035 channel extensions

**Risk Assessment:** None (dead code, no runtime impact).

**Reassessment:** Sprint 145. If distributed execution is implemented without handoff protocol, remove.

**Rollback Plan:** Remove `@deprecated` tag + integrate with task-builder.ts dependency metadata.

---

### 6. `src/orchestra/brain-context.ts` — DEFER + ADR

**Lines:** 268
**Reason:** Enriches BrainContext with stack info, agent stats, skill stats, and sprint history from `.deckent/` caches to improve planning decisions. Contains context formatting helpers for planner consumption.

**Decision Rationale:**
- Zero imports in src/ currently — BUT context enrichment is fundamental to intelligent planning
- `planner.ts` currently uses minimal context (DIRECTIVES + task list) — enrichment would improve plan quality
- Functions like `enrichWithAgentStats()`, `enrichWithSkillStats()`, `enrichWithSprintHistory()` are exactly what the planner needs
- The module reads from `.deckent/` caches that are actively maintained (agent-pool, skill-registry, sprint state)

**Future Connection:**
- Sprint 142 planner evolution — context-aware AI planning
- Sprint 140 50-task sprint — brain needs richer context for large-scale planning
- ADR-033 product vision — "intelligent planning" is core value proposition

**Risk Assessment:** None (dead code, no runtime impact).

**Reassessment:** Sprint 142 (planner evolution). If planner doesn't need context enrichment by then, reassess scope.

**Rollback Plan:** Remove `@deprecated` tag + import into planner.ts `buildPlanContext()`.

---

### 7-10. Decision Engine V1 Ecosystem — DEPRECATE + WARNING

**Modules:**
- `src/orchestra/decision-engine.ts` (170 LoC)
- `src/orchestra/decision-replay.ts` (150 LoC)
- `src/orchestra/decision-steps/agent-step.ts` (83 LoC)
- `src/orchestra/decision-steps/scope-step.ts` (92 LoC)

**Total:** 495 LoC

**ADR-028 Status:** These modules are protected by ADR-028 which states: "V1 kod silinmeyecek — referans implementasyonu olarak korunacak. @deprecated ile işaretlendi."

**Decision Rationale:**
- ADR-028 explicitly preserves these as reference implementations
- V2 routing engine has been stable for 10+ sprints (Sprint 066 → Sprint 139 = 73 sprints)
- The V1 reference value diminishes with each sprint — new developers don't study V1 to understand V2
- decision-logger.ts is still actively used by V2 (excluded from dead code — correctly)
- 38 test files continue to pass but test dead code — maintenance burden without value

**Recommendation for Sprint 142:**
- Propose ADR-028 amendment: "V1 referans değerini 10 sprint sonra yeniden değerlendir"
- If V2 has been stable for 75+ sprints by Sprint 142, remove V1 code + tests
- Preserve decision-logger.ts (actively used by V2)

**Risk Assessment:** Low. ADR-028 amendment requires governance process (ADR-036). No production code depends on V1 engine.

**Rollback Plan:** Reject ADR-028 amendment, keep status quo. `git revert` for any V1 removal commits.

---

### 11. `src/orchestra/parallel-pipeline.ts` — FALSE POSITIVE (No Action)

**Audit Report Finding:** Listed in Unused Export Sampling with `PipelineTask` at 0 imports.

**Actual Status:** **ACTIVELY USED** by 4 src/ files:
- `src/orchestra/sprint-spawner.ts` — imports `ParallelPipelineManager` for task dependency validation
- `src/orchestra/sprint-controller.ts` — re-exports `DependencyCycleError`
- `src/orchestra/conflict-resolver.ts` — imports `ParallelPipelineManager` and `ExecutionWave`
- Internal type usage for `createPipeline()` API

**Root Cause of False Positive:** The audit script's unused export sampling found `PipelineTask` (a type export) with 0 import count. This is correct at the type level — `PipelineTask` is only used internally within the module as a parameter type for `createPipeline()`. The module itself is NOT dead.

**Action:** No action. This module is critical infrastructure. Update dead-code-audit.mjs to exclude modules with active module-level imports from the unused export sampling section.

---

## Execute Checklist for Sprint 140 (Adım 4)

The following files are approved for removal in Sprint 140:

### Source Files to Remove
- [ ] `src/orchestra/learning-decay.ts` (151 LoC)
- [ ] `src/orchestra/learning-migration.ts` (229 LoC)
- [ ] `src/orchestra/batch-stats.ts` (141 LoC)

### Test Files to Remove
- [ ] `tests/orchestra/learning-decay.test.ts`
- [ ] `tests/orchestra/learning-migration.test.ts`
- [ ] `tests/orchestra/batch-stats.test.ts`

### Pre-Removal Verification
- [ ] `tsc --noEmit` passes with no errors
- [ ] `npx vitest run` passes with no failures
- [ ] `git log --oneline -1` recorded as pre-removal baseline

### Post-Removal Verification
- [ ] `tsc --noEmit` still passes (no broken imports)
- [ ] `npx vitest run` still passes (no test file dependency)
- [ ] `wc -l src/orchestra/*.ts` confirms LoC reduction

---

## Deferred Modules — @deprecated Tag Template

For Sprint 140, add the following to each deferred module:

```typescript
/**
 * @deprecated ADR-038 — Deferred for reassessment in Sprint 145.
 * This module is not currently used in production but contains
 * architectural patterns that may be valuable for future features.
 * See docs/audits/sprint-139/dead-code-decisions.md for rationale.
 *
 * DEFERRED: ADR-038, reassess Sprint 145
 */
```

---

## Risk Summary

| Decision | Modules | LoC Impact | Risk Level | Rollback Complexity |
|----------|---------|-----------|------------|---------------------|
| Remove | 3 | -521 LoC | Low | `git revert` (single commit) |
| Defer | 3 | 0 (keep) | None | Remove `@deprecated` tag |
| Deprecate | 4 | 0 (keep, ADR-028) | Low | ADR-028 amendment rejection |
| False Positive | 1 | 0 (no action) | None | N/A |

**Net LoC reduction (Sprint 140):** ~521 LoC source + ~300 LoC tests = ~821 LoC total
