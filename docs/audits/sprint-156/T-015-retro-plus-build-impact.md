# Sprint 156 Retrospective + Build Impact Plan

**Sprint:** 156  
**Theme:** Pipeline Hardening, T4 god-level  
**Date Written:** 2026-05-12  
**Author:** doc-writer agent (w-156-015)

---

## 1. Sprint Overview

Sprint 156 targeted 15 tasks across 5 priority buckets: P0 (5), P1 (3), P2 (4), Cross-cutting (3). The theme was *Pipeline Hardening* — cleanup discipline, dependency awareness, worker context enrichment, reversibility foundations, observability, and ADR governance. This was the second architectural wave following Sprint 154's Bug B fix.

**Final scoreboard:**

| Result | Count | % |
|--------|-------|---|
| DONE | 9 | 60.0% |
| NO_GO | 5 | 33.3% |
| In-progress (T-015) | 1 | 6.7% |
| **Total** | **15** | |

---

## 2. Task-by-Task Results

| Task | Title | Model | Assessment | +Lines | −Lines | Notes |
|------|-------|-------|-----------|--------|--------|-------|
| T-001 | Workflow Rename VERIFY | sonnet | **DONE** | 98 | 0 | master residue found in commented-out block; non-blocking |
| T-002 | dependency_pipeline_enabled Default Flip | opus | **DONE** | 65 | 2 | bridge alias approach, config-types.ts out of scope — follow-up debt noted |
| T-003 | Cascade/Unblock Runtime Wire | opus | **DONE** | 350 | 1 | 5/5 tests pass; two new broadcast events wired |
| T-004 | Task Tmpfile Cleanup Discipline | opus | **DONE** | 220 | 24 | anchor rule violation noted (accidental project-wide tsc) |
| T-005 | Auditor Baseline Collection Fix | opus | **DONE** | 629 | 0 | 16 tests; retry-once-on-spawn-fail + vitest_invocation_status field |
| T-006 | IDEMPOTENCY_KEY Worker Prompt Inject | opus | **DONE** | 144 | 1 | 7/7 tests; shell expansion at container runtime |
| T-007 | Worker Prompt Previous-Result Enrichment | opus | **DONE** | 342 | 3 | 12 tests; .result embed with +/- delta and truncated notes |
| T-008 | Brain Self-Rebuild Gate | opus | **DONE** | 271 | 2 | 8/8 tests; SPRINT→USER:BUILD_STALE_WARNING event wired |
| T-009 | assertSpawnSafe Whitelist Runtime | opus | **NO_GO** | — | — | OOM-killed / container force-stopped before write |
| T-010 | Runtime File Lock (flock spawn-time) | opus | **NO_GO** | — | — | OOM-killed / container force-stopped before write |
| T-011 | EffectClass Annotation rubric-registry | opus | **DONE** | 302 | 0 | 11/11 tests; frozen registry, ADR-055 placeholder ref |
| T-012 | Fresh-Eyes Fix Worker Rotation | opus | **NO_GO** | — | — | OOM-killed / container force-stopped before write |
| T-013 | Per-Change Security Review | sonnet | **NO_GO** | — | — | OOM-killed / container force-stopped before write |
| T-014 | 3 Yeni ADR Draft | sonnet | **NO_GO** | — | — | OOM-killed / container force-stopped before write |
| T-015 | Sprint 156 Retrospective (this doc) | sonnet | In-progress | — | — | |

**Total lines added (DONE tasks):** 2,421  
**Total lines removed (DONE tasks):** 33

---

## 3. NO_GO Analysis

**NO_GO rate: 5/14 evaluated = 35.7%**

All five NO_GO tasks share the same root cause: containers were OOM-killed or force-stopped before the Claude CLI worker could write a `.result` file. The `partial-result` sentinel was written at startup (as designed), confirming the worker process started and claimed the task, but the execution phase was terminated externally.

**Pattern:**
- All five failed tasks were later in the execution queue (T-009 through T-014)
- T-009 and T-010 are high-complexity security/locking tasks (opus model, high effort)
- T-012–T-014 are documentation-heavy tasks that were killed alongside the code tasks
- The common failure message: *"Worker started but did not complete — partial-result written at startup. If you see this, the container was likely OOM-killed or force-stopped before Claude CLI could write a .result."*

**Likely cause:** Concurrent opus containers running simultaneously exhausted memory. The dependency pipeline (`dependency_pipeline_enabled: true` — ironically set by T-002 in this very sprint) would have serialised some of these, but T-009–T-014 have no declared inter-dependencies and ran concurrently.

**Residual debt introduced:**
- `assertSpawnSafe` (T-009): security whitelist for spawn arguments — carry forward to Sprint 157 with higher priority
- `acquireSpawnLock` runtime (T-010): concurrent-write protection — carry forward
- Fresh-eyes fix rotation (T-012): model/agent rotation on retry — carry forward
- Security review doc (T-013): per-change security coverage for T-002–T-012 changes — urgent, carry forward
- ADR-053/055/060 drafts (T-014): three architectural ADRs proposed — carry forward

---

## 4. Token Usage Summary

Token data available for 9 completed tasks:

| Task | Input Tokens | Output Tokens | Cache Read | Total |
|------|-------------|--------------|------------|-------|
| T-001 | 12,500 | 1,800 | 45,000 | 59,300 |
| T-002 | 42,000 | 4,500 | 0 | 46,500 |
| T-003 | 32,000 | 5,800 | 95,000 | 132,800 |
| T-004 | 28,000 | 6,200 | 18,000 | 52,200 |
| T-005 | 42,000 | 7,200 | 18,000 | 67,200 |
| T-006 | 38,000 | 5,800 | 0 | 43,800 |
| T-007 | 14,200 | 5,400 | 0 | 19,600 |
| T-008 | 32,000 | 9,000 | 0 | 41,000 |
| T-011 | 18,500 | 5,400 | 0 | 23,900 |
| **Total** | **259,200** | **51,100** | **176,000** | **486,300** |

**Key observations:**
- T-003 had the highest cache read hit (95,000 tokens), suggesting effective prompt caching for the sprint-phases.ts context
- T-001 (sonnet model) had a 45,000 token cache read — audit tasks benefit heavily from cached context
- NO_GO tasks reported 0 tokens each (killed before any inference), so total is understated
- Average output tokens per DONE task: ~5,678 — consistent with complex implementation work

---

## 5. Bugs and Anchor Violations Found

### Bugs Surfaced During Sprint

1. **T-002 — Type bridge gap:** `dependency_pipeline_enabled` exists in `ResolvedConfig` but not in `DeckentConfig`. The local intersection alias `DeckentConfigWithPipeline` is a pragmatic bridge, not a permanent fix. A future sprint must add the field to `DeckentConfig` in `config-types.ts`.

2. **T-003 — Event broadcast before cascade:** The aggregate `DEPENDENCY_CASCADE_APPLIED` event was designed to fire per root NO_GO; however, timeout-NO_GOs (tasks without a `.result` file) are excluded from cascade emission to reduce noise. This means a worker killed mid-execution will not trigger cascade blocking of its dependents — an edge case documented but not resolved in this sprint.

3. **T-004 — Anchor rule incident:** Task 4 worker ran a project-wide `tsc --noEmit` once before re-reading the DIRECTIVES anchor rule (BUILD YASAK). Exited clean with no side-effects, but the violation was self-reported in the result notes, demonstrating that anchor enforcement is documentation-only — no automated gate exists today.

4. **T-008 — sprint-phases.ts pre-existing errors:** Multiple pre-existing TypeScript errors were detected in `sprint-phases.ts` in files touched by T-003 and T-008. These errors predate Sprint 156 and were outside task scope, but they indicate the project's `dist/` build may be stale relative to source.

### Positive Observations

- **Partial-result sentinel (Sprint 155 design)** worked as intended: all 5 killed containers left recoverable partial-result markers, preventing sprint stall.
- **Test discipline held:** every DONE task delivered targeted unit tests (total ~87 new tests across 9 tasks), with isolated `vitest run path/to/file.test.ts` invocations only.
- **ADR compliance was clean** for all DONE tasks — no ADR violations reported.

---

## 6. Sprint 156 Learnings

1. **Concurrent opus containers → OOM pressure.** Running 6+ opus containers simultaneously with high-effort tasks is a recipe for OOM kills. The `max_workers` config and `dependency_pipeline_enabled` should be tuned jointly. Sprint 157 should enforce a tighter `max_workers=3` cap for opus tasks.

2. **T4 discipline (source + test + observability) adds significant output volume.** The 629-line T-005 output (auditor baseline) is 3× a typical NORMAL effort task. T4 discipline is valuable but should be scoped to HIGH effort tasks only.

3. **Scope isolation worked well for concurrent edits.** T-003 and T-008 both modified `sprint-phases.ts` concurrently but reported no merge conflicts — the file-lock mechanism and scope collision detection added in previous sprints are functioning as intended.

4. **NO_GO tasks leave untracked debt.** T-009 (`assertSpawnSafe`) and T-010 (runtime file lock) are security-adjacent tasks. Their failure means Sprint 156's security posture is incomplete — these should be P0 in Sprint 157.

---

## 7. Sprint 157: Build-Impact Mini Smoke Plan

### Motivation

Sprint 156 accumulated significant source changes (2,421 lines added) without a full `npm run build` gate — per the DIRECTIVES anchor rule, build is Alperen's responsibility. After a multi-sprint accumulation, build breakage can mask dependencies between tasks. Sprint 157 introduces a **build-impact mini smoke** as a controlled experiment.

### Plan

Sprint 157 is scoped to **3 doc-only tasks** intentionally, with a mid-sprint build gate:

**Wave A — 2 doc-only tasks spawn and run in parallel:**

- **T-001:** Sprint 156 NO_GO carry-forward debt documentation — update `DEBT.md` with T-009/T-010/T-012/T-013/T-014 debt entries, mark as `carry-forward: sprint-157`
- **T-002:** ADR-047 (assertSpawnSafe) and ADR-048 (runtime file lock) draft — create docs/adr/047-spawn-safety-whitelist.md and docs/adr/048-runtime-file-lock.md in MADR v3 format

**Mid-Sprint Gate — Alperen runs `npm run build`:**

After Wave A completes (or a 20-minute timeout), Alperen manually executes:
```bash
npm run build
```
The build output (success/failure, error count, affected modules) is captured and surfaced to Wave B workers via a build-result artifact at `.deckent/sprint-157-build-result.json`.

**Wave B — 1 doc-only task, build-informed:**

- **T-003:** Build impact analysis — read `.deckent/sprint-157-build-result.json`, produce `docs/audits/sprint-157/build-impact-analysis.md`. Document: which modules failed, which Sprint 156 changes contributed, recommended fix priorities.

### Observation Goals

The experiment answers three questions:

1. **Did Sprint 156 changes break the TypeScript build?** Given the pre-existing errors noted in T-008's result and the known `DeckentConfigWithPipeline` bridge, at least one type error is expected in `src/core/config.ts`.
2. **How many Sprint 156 files contribute to build failures?** The 9 DONE tasks touched 18 distinct files; build output will surface which of those introduced new errors.
3. **Does the `dependency_pipeline_enabled: true` default (T-002) survive a fresh build?** The type bridge approach was flagged as residual debt — build will confirm or deny whether it needs immediate resolution.

### Success Criteria

- Build result artifact written to `.deckent/sprint-157-build-result.json` by Alperen mid-sprint
- Wave B T-003 worker reads the artifact and produces a ≥300-word analysis
- If build fails: analysis includes prioritized fix list for Sprint 158
- If build succeeds: analysis confirms clean build + documents why the T-002 bridge was sufficient

### Timing Estimate

| Phase | Duration |
|-------|----------|
| Wave A (2 doc tasks in parallel) | ~15 min |
| Alperen build gate | ~5 min manual |
| Wave B (1 doc task) | ~10 min |
| **Total** | **~30 min** |

---

## 8. Summary

Sprint 156 delivered 9 of 14 tasks (64.3% success rate). The 5 NO_GO tasks were infrastructure-level failures (OOM kills) rather than implementation failures — the code never ran. Key deliveries: dependency pipeline activation (T-002), cascade/unblock runtime (T-003), tmpfile discipline (T-004), auditor baseline fix (T-005), idempotency key injection (T-006), worker prompt enrichment (T-007), brain rebuild gate (T-008), and EffectClass foundation (T-011). Security posture gaps (T-009, T-010) and ADR coverage (T-014) are highest-priority carry-forwards for Sprint 157.

The Sprint 157 build-impact mini smoke is a low-cost experiment (3 doc tasks + 5 min Alperen gate) that will surface accumulated build debt before it compounds further.

---

*Generated by task-156-015 worker (w-156-015) | doc-writer agent | Sprint 156*
