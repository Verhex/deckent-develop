# Sprint 176 Dogfood Evidence (recovered)

**Captured:** 2026-05-20 by Claude during forensic audit after Sprint 176 cleanup.

**Why this file exists:** During Sprint 176 (sub-project #2 — planner state-hygiene + self-security), the runtime triggered `brain-honest-gate` after a worker SIGTERM, which stub-overwrote the original `task-176-001.result` worker forensic notes (3 KB → 364 B stub). This file restores the original NO_GO refuse notes from the conversation transcript so the dogfood evidence stays in the repository (referenced by Sprint 177 plan §spec §1d.1 regression fixture for W1-1 — Auto-debt empty-scope inheritance).

## Context

- **Spec:** `docs/superpowers/specs/2026-05-21-sub-project-2-design.md` §1d.1 — auto-debt-injection empty-scope bug
- **Plan:** `docs/superpowers/plans/2026-05-21-sub-project-2.md` Task 1 (W1-1) — fix in `src/orchestra/sprint-planner.ts:197-216`
- **Sprint id when captured:** sprint-176 (rolled back after misconfig discovered — see "Sprint 176 misconfig forensic" below)
- **Worker:** dispatched to fix `debt-adr-019-reconciliation` (auto-injected at slot 176-001) with the planner's broken empty-scope output

## task-176-001.result — original worker NO_GO refuse notes (3 KB, pre-honest-gate overwrite)

```
selfAssessment: NO_GO
evaluationDecision: NO_GO
testsPassed: false
coverage: 0
linesAdded: 0, linesRemoved: 0
tokenUsage: input=9500, output=2200, provider=claude, model=opus
rubricScores: correctness=0, test_coverage=0, scope_compliance=100, documentation=100
```

**notes (verbatim):**

> REFUSED — empty-scope debt-injection dispatch. The task as dispatched is a live reproduction of the exact bug that W1-1 (now at `.tasks/task-176-002.json`) is designed to fix.
>
> **ROOT CAUSE FORENSICS:**
>
> 1. `task-176-001.json` scope is empty: `directories=[]`, `filesRead=[]`, `filesWrite=[]`. This violates the prerequisite for any source-code change.
> 2. The CRITICAL debt item `debt-adr-019-reconciliation` was auto-converted into a priority-fix task at slot 176-001, displacing the DIRECTIVES.md-planned W1-1 to slot 176-002. The debt→task converter failed to inherit origin scope — exactly the failure mode W1-1 must repair.
> 3. `task-176-003.json` (W1-2) declares `dependencies=['176-001']`, so the dependency graph is now mis-wired: W1-2 incorrectly depends on the broken debt-fix task instead of on W1-1.
> 4. Tool allowlist for this worker is `Write(.tasks/)`, `Edit(.tasks/)` — source code writes are blocked at the tool layer regardless of scope.
> 5. `estimatedTokens=1346` contradicts the task title (implementing ADR-019 language-agnostic verify is a multi-file feature, not a low-effort fix).
> 6. `assignedSkills=[]` and `fixForTaskId=''` — incomplete priority-fix metadata.
>
> **WHY NO_GO (HONEST SELF-ASSESSMENT):**
> - Baseline: ADR-019 unimplemented; sprint-planner's debt-injection bug present.
> - End state: unchanged.
> - Delta: 0% of dispatched task complete. Any attempt to "partially implement ADR-019" under empty scope + `.tasks/`-only allowlist would be theater, not engineering. Writing code under these conditions would violate ADR-037 (advisory boundary) and DIRECTIVES.md Worker Contract ("Scope DIŞINA yazma YASAK").
>
> **RECOMMENDATION FOR BRAIN/ALPEREN (outside worker authority):**
> - Block 176-001 (do not retry as-is).
> - Re-plan: discard the auto-injected 176-001, restore DIRECTIVES ordering so W1-1 lands at 176-001 and the rest shift accordingly; repair dependency edges in 176-003 and any other downstream task referencing '176-001'.
> - Leave `debt-adr-019-reconciliation` in DEBT.md until W1-1 lands; re-inject under a properly scoped task afterwards.
> - This dispatch trace is high-value canlı dogfood evidence for the W1-1 regression test fixture — preserve it.
>
> No source-code or test files were modified by this worker. `.tasks/task-176-001.plan` contains the detailed diagnosis.

## Why the worker's recommendation matters

The worker's refusal **proved spec §1d.1 was a real, reproducible bug** — not theoretical. Specifically:

- Empty-scope task (`directories=[]`, `filesWrite=[]`) is mathematically incapable of producing any verifiable code change.
- Auto-injection prepends to the wave queue (displacing the planned W1-1 fix), so the **bug fixes itself only after** the broken task has already been dispatched and fails.
- The downstream dependency mis-wire (`176-003 → ["176-001"]` instead of `→ ["176-002"]` = W1-1) propagates the failure across the wave.

W1-1's regression test (`tests/orchestra/sprint-planner-debt-injection.test.ts` per plan Task 1) must cover all three vectors:

1. `originScope` inheritance from the debt record into the injected task.
2. `class:'verified-no-result'` skip + honest closure for the no-recovery-possible variant.
3. Dependency graph reconciliation when the injected task displaces a planned slot.

## Sprint 176 misconfig forensic (concurrent dogfood)

While the worker correctly diagnosed the planner bug, the sprint itself was running against the wrong config because of a separate dogfood bug:

- **Root cause:** PR #16 (sub-project #1 hygiene commit `d3148926`) ran `git rm --cached .deckent/config.json`. The on-disk file remained but was later regenerated from a template (trigger: most likely `deckent_set_directives` validation or init auto-restore). The regenerated file dropped the project-specific fields: `spawn_backend: "docker"`, `model_strategy`, `dependency_pipeline_enabled: false`, `haiku_allowed: false`, `brain_planning: "structured"`, `language`, `projectName`.
- **Effect:** With `spawn_backend` missing, `src/orchestra/timeout-estimator.ts:resolveBackend()` returned `'tmux'` from the `'auto'` default. Sprint 176 ran on tmux instead of docker, with auto AI planning, dependency-pipeline enabled, and haiku allowed — none of which match the deckent-dev project policy.
- **Recovery:** `cp .deckent/config.json.bak.2026-05-19T22-29-17-902Z .deckent/config.json` restored every dropped field. Sprint controller (`PID 1799599`) was already self-exiting via RETRO→CLEANUP at that point; the auditor wrote `docs/audits/sprint-176/load-test-report.md` (GATE_FAILURE, 25 tasks NO_GO across original + FIX + FIX-FIX iterations).
- **Captured lesson:** `.brain/exports/` memory + `~/.claude/projects/.../memory/feedback_config_json_git_rm_yasak.md` — `.deckent/config.json` must stay tracked-or-restored, never untrack via `git rm --cached`.

## Concurrent dogfood: nervous_system directives_protection rollback

After `deckent_kill` + `deckent_cleanup`, `nervous_system.directives_protection.auto_restore: true` reverted `DIRECTIVES.md` from Sprint 176 content back to Sprint 175 content (the previous baseline). This caused `deckent_plan` after the cleanup to plan **Sprint 175 task ids** (W0.1..W4.3, 21 tasks) instead of the intended Sprint 176 task ids (W1-1..W5-12, 12 tasks + 1 auto-inject). Restore was: `auto_restore: false` (temporary) + `cp /tmp/directives-176.md DIRECTIVES.md`.

**Open question for sub-project #2 backlog #8:** `nervous_system.directives_protection` needs a "baseline update on `deckent_set_directives` success" hook so that intentional sprint-boundary changes are not silently rolled back. (Track this in Sprint 177's spec under "process invariants".)

## Recovered files cross-reference

| Original location | Status | Recovery |
|-------------------|--------|----------|
| `.tasks/task-176-001.result` (live) | ⚠️ Overwritten by `brain-honest-gate` stub during kill+cleanup | This document — full notes restored from conversation transcript |
| `.tasks/task-176-001.plan` (live) | ⚠️ Not found in archive | Worker referenced it but content was never read into conversation transcript — **soft loss** |
| `.brain/archive/sprint-176-tasks/task-176-001.json` | ✅ Preserved | Original task definition (empty-scope auto-injection visible) |
| `.brain/archive/sprint-176-tasks/task-176-001-fix.result` | ✅ Preserved | FIX phase iteration result |
| `.brain/archive/sprint-176-tasks/task-176-001-fix-fix.json` | ✅ Preserved | Second FIX iteration definition |
| `docs/audits/sprint-176/load-test-report.md` | ✅ Preserved | Auditor GATE_FAILURE summary |
| `.brain/memory.db` (RETRO entries) | ✅ Preserved | RETRO + memory entries written during cleanup phase |
| `.brain/archive/sprint-176-tasks/task-176-002..013.result` | ✅ Preserved | Other workers' results (mostly stub-overwritten too; subject to same forensic gap) |
| `.brain/archive/sprint-176-tasks/task-176-014..021.json` | ⚠️ Mixed sprint 175 content | nervous_system rollback period contamination — Sprint 175 W3.2..W4.3 ids ended up at these slots |

## Cross-reference to sub-project #2 plan

When Sprint 177 launches and Task 1 (W1-1) regression test is written, **include this file's "ROOT CAUSE FORENSICS" block as the canonical fixture description** (paraphrase in test code; cite this file in test comments). The three test cases in the plan map exactly to the three forensic vectors above.
