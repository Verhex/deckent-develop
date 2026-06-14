# Sprint Lifecycle — Deckent Orchestration

> **Blueprint Reference:** §7 Sprint Lifecycle & Orchestration, §8 GO/NO-GO/Tech Debt Protocol, §9 Usage-Aware Planning

> ℹ️ **Memory V2 / constants note.** ADRs and learnings are stored **DB-first**
> in `.brain/memory.db`; the `.brain/*.md` files (incl. `decisions.md`,
> `memory.md`) are **generated exports**, not hand-edited source — there is no
> live `.brain/DECISIONS.md`. The DECAY line-budget figures quoted below
> (e.g. 900 / 300 / 100 / 5) are the **original V1 design values and are
> outdated**; the authoritative current values live in `src/core/constants.ts`
> (`BRAIN_TOTAL_LINE_BUDGET`, `MEMORY_MAX_LINES`, `MEMORY_DECAY_SPRINTS`, …).
> See [memory-system.md](memory-system.md) for the canonical memory model.

This document describes the complete 8-phase sprint lifecycle in Deckent. A sprint is the fundamental unit of orchestrated work — it begins with a directive, coordinates parallel workers, evaluates results, and always reaches COMPLETE state without being abandoned.

**Master function:** `runSprint(projectRoot, config, opts?)` — `src/orchestra/sprint-controller.ts`

**Finalize function:** `finalizeSprint(projectRoot, sprint, config)` — `src/orchestra/sprint-controller.ts` (Sprint 037)

---

## Overview

```
Phase 0: DIRECTIVE   — You write DIRECTIVES.md (pre-sprint, manual)
Phase 1: PLAN        — Brain reads context, plans tasks, writes .tasks/*.json
                       Plugin hook: beforeSprint (after plan, before spawn)
Phase 2: SPAWN       — Brain routes tasks to providers, launches workers
Phase 2a: WAVE_BUILD — (when dependency_pipeline_enabled: true, default)
                       Kahn's topological sort → dependency waves (ADR-045)
                       Wave N tasks run in parallel; Wave N+1 waits for Wave N DONE
Phase 3: EXECUTE     — Workers run in parallel within each wave; auditor scans every 30s
Phase 4: EVALUATE    — Brain reads .result files, applies GO/NO-GO logic
                       Plugin hook: afterTask (after each task evaluation)
Phase 5: FIX         — Brain spawns fix workers for NO-GO tasks
Phase 6: RETRO       — Brain writes RETRO.md, updates MEMORY.md, metrics
                       Plugin hook: afterSprint (after retro, before decay)
Phase 7: DECAY       — Brain compresses .brain/ if over budget
Phase 8: COMPLETE    — finalizeSprint(): sprint log, MEMORY, RETRO,
                       last_sprint_id, decay, managed-docs export, afterSprint hooks
```

**Key invariant:** Every phase is wrapped in `try/catch`. A phase failure never stops the sprint — it logs a dashboard alert and continues to the next phase. Sprint is NEVER left incomplete.

---

## Phase 0: DIRECTIVE

**What happens:** You (the user) write or update `DIRECTIVES.md` in the project root.

This is the only phase that happens outside of `runSprint()`. DIRECTIVES.md is the natural-language specification that Brain reads when planning.

**Format:** Free-form markdown. Structured `## Task N:` blocks enable the structured parser; AI mode works with any format.

**Files created/updated:**
- `DIRECTIVES.md` (written by user)

**Blueprint reference:** §7 Phase 0, §3 Native CLI

---

## Phase 1: PLAN

**`SprintPhase.PLAN` | `SprintStatus.PLANNING`**

**Brain function:** `planSprint(projectRoot, config, context, recommendation)` — `src/orchestra/sprint-planner.ts` (re-exported via `brain.ts`)

**What happens:**

1. **Read context** — `readContext(projectRoot)` queries `memory.db` via `MemoryStore` (Memory V2 DB-first): memory entries, latest retro, accepted ADRs, active patterns, open debt items. `DIRECTIVES.md` is always read from file. If the DB is absent, fields fall back to empty strings/arrays.
2. **Handle critical debt** — Any `CRITICAL` priority unresolved debt from the DB generates priority-fix tasks first
5. **Generate tasks** (three modes controlled by `brain_planning` config):
   - **`ai` mode:** `callBrainPlanner()` sends context to Claude CLI, gets Zod-validated task JSON
   - **`structured` mode:** `parseStructuredDirectives()` parses `## Task N:` blocks from DIRECTIVES.md
   - **`auto` mode (default):** AI first, structured fallback on failure
6. **Deadlock check** — `detectDeadlocks(tasks)` verifies no circular dependencies exist
7. **Write task files** — Each task is written as `.tasks/task-{id}.json`
8. **Dashboard reset** — `resetDashboard()` clears stale data from any prior sprint
9. **Plugin hook: `beforeSprint`** — fired after planning is complete, before any worker is spawned. Plugins receive the full `Sprint` object and may mutate task metadata (e.g. inject environment variables, add labels). Hook failures are non-fatal.

**Files created/updated:**
- `.tasks/task-{sprintId}-{seq}.json` — one per task (status: `PENDING`)
- `.deckent/config.json` — `last_sprint_id` updated at end of sprint (Phase 8)

**Key data structures:**
```typescript
// SprintPhase enum — src/core/sprint-types.ts
SprintPhase.PLAN

// Sprint object returned by planSprint
{
  id: 'sprint-018',
  number: 18,
  status: SprintStatus.PLANNING,
  phase: SprintPhase.PLAN,
  tasks: Task[],
  workers: string[],
  planningMode: 'ai' | 'structured' | 'fallback'
}
```

**Blueprint reference:** §7 Phase 1, §9 Usage-Aware Planning, §9 BrainPlanningMode

---

## Phase 2: SPAWN

**`SprintPhase.SPAWN` | `SprintStatus.ACTIVE`**

**Brain function:** `spawnWorkers(projectRoot, sprint, config, opts)` — `src/orchestra/sprint-spawner.ts` (re-exported via `brain.ts`)

**What happens:**

1. **Bootstrap providers** — `bootstrapProviders()` is called at startup to detect and register all available provider adapters (Claude, Codex, Gemini). Only providers whose runtimes are detected on the host are registered. (Sprint 038)
2. **Ensure tmux session** — `ensureSession()` creates the `deckent` tmux session if it doesn't exist (Claude tasks only)
3. **Build worker prompt** — `buildWorkerPrompt(task)` constructs the worker instruction string including task ID, title, description, scope, heartbeat format, and result format
4. **Compute allowed tools** — `allowedTools` is scoped to `task.scope.directories + task.scope.filesWrite` (e.g. `Read,Write(src/core/),Bash`)
5. **Route each task to its provider** — `task.provider` determines which `ProviderAdapter` handles the task: (Sprint 038)
   - `claude` (default) → tmux window running the `claude` CLI subprocess
   - `codex` → `CodexAdapter.spawn(task, prompt, projectRoot)`
   - `gemini` → `GeminiAdapter.spawn(task, prompt, projectRoot)`
   - Mixed sprints are fully supported — different tasks in the same sprint may use different providers
6. **Update dashboard** — All workers marked `AgentStatus.EXECUTING`, progress counter set to `(active: N, done: 0)`
7. **Start auditor scan loop** — `startScanLoop(projectRoot, sprint.id, undefined, onScanComplete)` begins a `setInterval(30s)` in the Brain process, writing scan results to the dashboard via `writeScanToDashboard()`

**1 retry on failure:** If `spawnWorkers()` throws, Brain retries once. On second failure, it cleans up and throws `BrainError`.

**Files created/updated:**
- `.dashboard` — written with initial agent list and progress
- tmux windows `w-{sprintId}-{seq}` (one per Claude task, in-memory; not a file)

**Blueprint reference:** §7 Phase 2 & Phase 2.5, §10 Dynamic Terminal Management (tmux)

---

## Phase 2a: WAVE_BUILD — Dependency Wave Sorting

**Active when:** `dependency_pipeline_enabled: true` (default `true` in `src/core/config.ts`; override in `.deckent/config.json` for manual wave management per ADR-047)

**ADR reference:** [ADR-045](../adr/045-wave-based-execution-semantics.md) — Wave-Based Execution Semantics

**What happens:**

When the dependency pipeline is enabled, tasks are sorted into **dependency waves** using **Kahn's topological sort algorithm** (`src/orchestra/sprint-spawner.ts`) before workers are spawned:

1. **Build dependency graph** — each task's `dependencies[]` array is used to construct a DAG
2. **Kahn's topological sort** — tasks with no unresolved dependencies form Wave 1; tasks that only depend on Wave 1 tasks form Wave 2; etc.
3. **Scope collision detection** — `detectScopeCollisions()` (`src/orchestra/conflict-resolver.ts`) identifies tasks that write the same files and separates them into different waves even if they have no explicit dependency
4. **Wave assignment** — each task gets a wave number; tasks in the same wave may run in parallel

**Wave execution semantics:**
- Tasks within the same wave run **in parallel**
- Wave N+1 tasks are only spawned when all Wave N tasks reach `DONE ∪ MANUAL_REVIEW_REQUIRED` (ADR-045 amendment, Sprint 280 MRR-deadlock fix)
- `respawnEligibleTasks()` (`src/orchestra/sprint-spawner.ts`) is called from `waitForResults()` after each result is collected; it filters for tasks whose all dependencies are satisfied
- `BRAIN→WORKER:DEPENDENCY_BLOCKED` event is emitted for tasks waiting on an upstream dependency

**If `dependency_pipeline_enabled: false`** (manual wave management mode per ADR-047): all tasks spawn concurrently in a single wave (legacy FIFO mode); Brain manages wave ordering manually.

**Blueprint reference:** §7 Phase 2.5, ADR-045

---

## Phase 3: EXECUTE

**`SprintPhase.EXECUTE` | `SprintStatus.ACTIVE`**

**Brain function:** `waitForResults(projectRoot, sprint, timeoutMs?)` — `src/orchestra/result-collector.ts` (re-exported via `brain.ts`)

**What happens (Brain side):**

1. Brain polls `.tasks/task-{id}.result` every 15 seconds
2. When a result file appears and parses as valid JSON, it is collected and the task's in-memory status is updated (`DONE` / `NO_GO`)
3. **Wave progression (ADR-045):** After each result is collected, `respawnEligibleTasks()` is called. It finds tasks whose all dependencies are now in `DONE ∪ MANUAL_REVIEW_REQUIRED` and spawns them. This drives Wave 2, Wave 3, etc. automatically without a barrier.
4. Loop exits when all task IDs have results, or when the timeout (default: 30 minutes) expires
5. Tasks that don't produce a result within the timeout get a synthetic `NO_GO` result in Phase 4

**What happens (Worker side — parallel):**

Each worker (a Claude Code CLI instance in a tmux window) independently:

1. Reads its `.tasks/task-{id}.json`
2. Writes `.tasks/task-{id}.plan` (execution plan)
3. Acquires locks via `.locks/` before writing files
4. Updates `.tasks/task-{id}.hb` (heartbeat) on every file change
5. Runs `tsc --noEmit` and `npx vitest run`
6. Writes `.tasks/task-{id}.result` when done

**Auditor (in-process, concurrent with workers):**

- `startScanLoop()` runs every 30 seconds
- Detects stale heartbeats (>2 min = alert)
- Detects stale locks (>5 min)
- Detects boundary violations via `git diff --stat`
- Writes scan results to `.dashboard` via callback

**Files created/updated (per worker):**
- `.tasks/task-{id}.plan` — execution plan
- `.tasks/task-{id}.hb` — heartbeat (JSON, updated frequently)
- `.locks/{path-with-__-separators}.lock` — file locks
- Source files within `task.scope.directories`/`scope.filesWrite`
- `.tasks/task-{id}.result` — final result (JSON)
- `.dashboard` — updated every scan cycle

**Blueprint reference:** §7 Phase 3 & Phase 3.5, §5 Agent System (Worker), §10 tmux

---

## Phase 4: EVALUATE

**`SprintPhase.EVALUATE` | `SprintStatus.EVALUATING`**

**Brain functions:**
- `evaluateResult(result, task)` — `src/orchestra/result-evaluator.ts` (re-exported via `brain.ts`)
- `handleEvaluation(projectRoot, task, evaluation, result)` — `src/orchestra/debt-manager.ts` (re-exported via `brain.ts`)

**What happens:**

1. **Stop auditor** — `clearInterval(scanInterval)` stops the 30-second scan loop
2. For each task in the sprint:
   - If a result was collected → `evaluateResult()` computes the evaluation
   - If no result (timeout) → synthetic `NO_GO` result is created
3. **Evaluation logic** (`evaluateResult` — pure function):
   ```
   result.selfAssessment === 'NO_GO'            → TaskEvaluation.NO_GO
   result.selfAssessment === 'GO_WITH_TECH_DEBT' → TaskEvaluation.GO_WITH_TECH_DEBT
   result.selfAssessment === 'DONE' but !testsPassed → TaskEvaluation.NO_GO (override)
   result.selfAssessment === 'DONE' but coverage < 90 → TaskEvaluation.GO_WITH_TECH_DEBT (override)
   all criteria met                              → TaskEvaluation.DONE
   ```
4. **Handle each evaluation** via `handleEvaluation()`:
   - `DONE` → task status → `DONE`, worker freed
   - `GO_WITH_TECH_DEBT` → task status → `DONE`, debt entry written to `memory.db` (Memory V2 DB-first)
   - `NO_GO` → task status → `NO_GO`, fix task created in `.tasks/`
5. **Resolve debt** — `resolveDebt()` marks debt items as resolved for DONE/GO_WITH_TECH_DEBT tasks
6. **Plugin hook: `afterTask`** — fired after each individual task evaluation. Receives the `Task`, its `TaskResult`, and `TaskEvaluation`. Plugins may log metrics, send notifications, or update external trackers. Hook failures are non-fatal.

**Files created/updated:**
- `.tasks/task-{id}.json` — status updated to `DONE` or `NO_GO`
- `.brain/memory.db` — new `type: 'debt'` entries inserted for `GO_WITH_TECH_DEBT` evaluations (Memory V2 DB-first)

**Blueprint reference:** §7 Phase 4, §8 GO/NO-GO/Tech Debt Protocol

---

## Phase 5: FIX — Autonomous Recovery Cycle

**`SprintPhase.FIX` | `SprintStatus.FIXING`**

**Brain functions:**
- `handleCrossDependencies(projectRoot, sprint, evaluations)` — `src/orchestra/debt-manager.ts`
- `spawnWorkers()` (reused) + `waitForResults()` (reused, 10 min timeout)
- `evaluateResult()` (reused for fix results)
- `escalateDebt(projectRoot)` — `src/orchestra/debt-manager.ts`

**Overview:** The FIX phase is Brain's autonomous recovery mechanism. When Phase 4 (EVALUATE) identifies NO_GO tasks, Brain doesn't simply mark them as failed — it analyzes **why** they failed, creates targeted fix tasks, spawns new workers to address the issues, and re-evaluates the results. This is a self-healing loop that distinguishes deckent from simple task runners.

### Step 1: Cross-Dependency Analysis

```
handleCrossDependencies(projectRoot, sprint, evaluations)
```

Brain examines all NO_GO tasks and their dependency chains:

- **For each NO_GO task:** check all tasks in its `dependencies[]` array
- **If a dependency was DONE or GO_WITH_TECH_DEBT:** that dependency's output may have caused the downstream failure → create a **cross-fix task** for the dependency to investigate
- **Cross-fix tasks** carry `isPriorityFix: true` and `fixForTaskId` pointing to the original dependency

**Example:** Task 003 (Planner Decoupling) depends on Task 001 (Codex Adapter Fix). Task 001 passed but Task 003 got NO_GO. Brain creates a fix task for Task 001 to investigate whether its output broke Task 003.

### Step 2: Fix Task Collection

Brain scans `.tasks/` for all tasks matching:
```typescript
task.isPriorityFix === true && task.status === TaskStatus.PENDING
```

Fix tasks are created in two ways:
1. **Phase 4's `handleEvaluation()`** — every NO_GO creates a direct fix task
2. **Phase 5's `handleCrossDependencies()`** — cross-dependency failures create investigation fix tasks

### Step 3: Fix Worker Spawn + Evaluation

If fix tasks exist, Brain reuses the same spawn mechanism as Phase 2:

```
fixSprint = { ...sprint, tasks: fixTasks, workers: fixTasks.map(t => `w-${t.id}`) }
spawnWorkers(projectRoot, fixSprint, config, opts)
fixResults = await waitForResults(projectRoot, fixSprint, 10 * 60 * 1000)
```

- Fix workers run with the **same tmux backend** as main workers
- Timeout is shorter: **10 minutes** (vs 30 minutes for main phase)
- Fix workers receive the original task's context plus the failure reason

After results arrive, each fix result is evaluated:
```
evaluateResult(fixResult, fixTask) → DONE / GO_WITH_TECH_DEBT / NO_GO
```

- **Fix DONE + has `fixForTaskId`** → `resolveDebt()` clears the original task's debt entry
- **Fix NO_GO** → debt remains, escalated in next step

### Step 4: Debt Escalation

```
escalateDebt(projectRoot)
```

After fix attempts, Brain escalates unresolved debt based on age:

| Sprints Unfixed | New Priority | Effect |
|-----------------|-------------|--------|
| 1 sprint | NORMAL | Regular debt tracking |
| 2 sprints | **HIGH** | Highlighted in `deckent status` |
| 3+ sprints | **CRITICAL** | Auto-included as priority fix in next sprint's Phase 1 |

**Skipped if:** No NO_GO tasks exist (no fix tasks generated in Phase 4)

### Complete FIX Phase Flow

```
Phase 4 produces NO_GO tasks
         │
         ▼
  handleCrossDependencies()
  ├── For each NO_GO task:
  │   └── Check dependencies → DONE dep caused failure? → create cross-fix
  │
  ▼
  Collect all isPriorityFix tasks
         │
         ▼ (if any exist)
  spawnWorkers(fixTasks)  ← same tmux/provider backend
         │
  waitForResults(10 min timeout)
         │
         ▼
  evaluateResult(fixResult) per fix task
  ├── DONE → resolveDebt(original task)
  ├── GO_WITH_TECH_DEBT → partial resolution
  └── NO_GO → debt persists
         │
         ▼
  escalateDebt()
  ├── 2 sprints → HIGH
  └── 3+ sprints → CRITICAL (auto-fix next sprint)
```

### Key Design Decisions

- **Single retry, no infinite loops:** Fix workers get one attempt. If the fix also fails, the debt is recorded and escalated — Brain never enters a retry loop.
- **Cross-dependency intelligence:** Brain doesn't just re-run failed tasks. It traces failure **upstream** through dependency chains and creates targeted investigation tasks.
- **Same infrastructure:** Fix workers use the exact same spawn backend (tmux/subprocess/provider) as main workers. No separate "fix mode" — consistent execution model.
- **Time-bounded:** 10-minute timeout prevents fix phase from dominating sprint duration. If fixes are slow, they're cut and deferred to next sprint.

**Files created/updated:**
- `.tasks/task-{id}-fix.json` — new fix task files
- `.tasks/task-{id}-fix.result` — fix results
- `.brain/memory.db` — debt entry priorities escalated in DB (Memory V2 DB-first)

**Blueprint reference:** §7 Phase 5, §8 Cross-Dependency Rule, §8 Tech Debt Escalation

---

## Phase 6: RETRO

**`SprintPhase.RETRO` | `SprintStatus.RETROSPECTIVE`**

**Brain functions:**
- `calculateMetrics(sprint, evaluations, results, debt)` — `src/orchestra/sprint-reporter.ts` (re-exported via `brain.ts`)
- `writeRetrospective(projectRoot, sprint, evaluations, metrics)` — `src/orchestra/sprint-retro-writer.ts` (re-exported via `brain.ts`)
- `writeSprintLog(projectRoot, sprint, metrics, evaluations)` — `src/orchestra/sprint-docs-updater.ts` (re-exported via `brain.ts`)

**What happens:**

1. **Re-read debt** — Open debt items loaded from `memory.db` (`store.getByType('debt')`) to get accurate open debt count
2. **Calculate metrics** — `calculateMetrics()` computes:
   - `completedTasks`, `techDebtTasks`, `noGoTasks`
   - `durationMs`, `coveragePercent`, `noGoRate`
   - `newDebtCount`, `resolvedDebtCount`, `totalOpenDebt`
   - `boundaryViolations`, `crossAssignments`, `contextLinesUsed`
3. **Write RETRO.md** — `writeRetrospective()` overwrites `.brain/RETRO.md` (max `RETRO_MAX_LINES` lines — see `src/core/constants.ts`); also writes retro + memory entries to `memory.db`
4. **Write sprint log** — `writeSprintLog()` appends to `.brain/sprints/sprint-{NNN}.md` (max `SPRINT_LOG_MAX_LINES` lines — see `src/core/constants.ts`)
5. **Plugin hook: `afterSprint`** — fired after the retrospective is written, before decay runs. Receives the full `Sprint` object including metrics. Plugins may post summaries, trigger CI, or archive artifacts. Hook failures are non-fatal.

**Files created/updated:**
- `.brain/RETRO.md` — overwritten with current sprint retrospective
- `.brain/sprints/sprint-{NNN}.md` — sprint log entry appended/created
- `sprint.metrics` — populated on the in-memory Sprint object

**Blueprint reference:** §7 Phase 6, §6 Memory Architecture

---

## Phase 7: DECAY

**`SprintPhase.DECAY`**

**Brain function:** `runDecay(projectRoot, sprintId, opts?)` — `src/orchestra/debt-manager.ts` (re-exported via `brain.ts`)

**What happens (Memory V2 DB-first):**

1. **Open memory.db** — `MemoryStore` is obtained for the project root
2. **Decay triggers when:** total DB entry count > `memoryBudget` (from `opts.memoryBudget` → `config.memory_budget` → fallback `900`; config default `5000` — see `src/core/config.ts:545` and `src/core/constants.ts`)
3. **Decay actions:** `store.decay(currentSprintNum, decaySprints)` — DB entries older than `decaySprints` sprints are pruned (default `8` when called without config; config default `20`)
4. **Returns `DecayResult`** — `{ linesBefore, linesAfter, archivedSprints, removedDebtCount, removedPatternCount }`

**`force` option:** `runDecay(root, id, { force: true })` runs decay even if under budget (useful for testing/maintenance).

> ℹ️ **V1 file-based decay is superseded.** Earlier versions trimmed `.brain/MEMORY.md`, `.brain/RETRO.md`, and `.brain/PATTERNS.md` as text files. Memory V2 (Sprint 140+) operates on `memory.db` rows. The `BRAIN_TOTAL_LINE_BUDGET`, `MEMORY_MAX_LINES`, `RETRO_MAX_LINES` constants in `src/core/constants.ts` are now `@deprecated` (kept for backward compat & tests only). The authoritative budget is `config.memory_budget`. See [memory-system.md](memory-system.md).

**Files created/updated:**
- `.brain/memory.db` — old entries pruned by `store.decay()`
- `.brain/archive/` — may be written if file-based archiving is triggered as fallback

**Blueprint reference:** §7 Phase 7, §6 Memory Architecture (3-Tier)

---

## Phase 8: COMPLETE

**`SprintPhase.COMPLETE` | `SprintStatus.COMPLETE`**

**Brain functions:**
- `cleanup(projectRoot, sprint)` — `src/orchestra/sprint-controller.ts`
- `finalizeSprint(projectRoot, sprint, config)` — `src/orchestra/sprint-finalizer.ts` (re-exported via `sprint-controller.ts`; Sprint 037)

**What happens:**

1. **Stop scan loop** (if still running) — `clearInterval(scanInterval)`
2. **Cleanup task artifacts** — `cleanup()` removes temporary files:
   - `.tasks/task-{id}.hb` — heartbeat files
   - `.tasks/task-{id}.plan` — execution plans
   - `.tasks/task-{id}.log` — worker logs
   - `.tasks/task-{id}.paused` — paused state files
   - Stale lock files from `.locks/`
3. **`finalizeSprint()` — consolidated post-sprint actions** (Sprint 037): This function was introduced to fix a structured mode gap where post-sprint actions (RETRO, MEMORY update, etc.) were silently skipped. It is called at the end of `runSprint()` and is also exposed via the `deckent finalize` CLI command for manual recovery. It performs ALL of the following in order:
   a. **Write sprint log** — `writeSprintLog()` appends to `.brain/sprints/sprint-{NNN}.md`
   b. **Write RETRO.md and update MEMORY.md** — `writeRetrospective()` overwrites `.brain/RETRO.md` and appends learnings to `.brain/MEMORY.md` (both capped by `RETRO_MAX_LINES`/`MEMORY_MAX_LINES` constants); also writes sprint, retro, and memory entries to `memory.db` (Memory V2 DB dual-write)
   c. **Project identity** — the legacy `.brain/PROJECT-IDENTITY.md` regen step is **deprecated** (ADR-046, Sprint 166; 0-caller since Sprint 168 C0a-1) and that file has been removed. Project identity is now `.deckent/workspace/IDENTITY.md`, maintained via the managed-docs pipeline (`docs.json` `identity-md`) during the docs-export step, not by a hand-written identity file.
   d. **Persist sprint ID** — `updateLastSprintId(projectRoot, sprint.id)` writes `last_sprint_id` to `.deckent/config.json` so `getNextSprintId()` never regresses
   e. **Run decay** — `runDecay()` is called; it self-gates on `config.memory_budget` (default `5000`, fallback `900`) — see Phase 7
   f. **Fire `afterSprint` hooks** — plugin hooks are executed as the last finalize step
4. **Mark sprint complete** — `sprint.status = SprintStatus.COMPLETE`, `sprint.phase = SprintPhase.COMPLETE`, `sprint.completedAt` set
5. **Final dashboard update** — Dashboard updated with `done: sprint.tasks.length`, empty alerts

**CLI entry point:**
```bash
deckent finalize          # Re-run finalize on the last sprint (idempotent)
deckent finalize --sprint sprint-042   # Target a specific sprint
```

**Files updated:**
- `.deckent/config.json` — `last_sprint_id` persisted
- `.brain/memory.db` — sprint, retro, memory entries written (Memory V2 dual-write)
- `.brain/MEMORY.md` — sprint learnings appended
- `.brain/RETRO.md` — overwritten with current sprint retrospective
- `.brain/sprints/sprint-{NNN}.md` — sprint log created/updated
- `.deckent/workspace/IDENTITY.md` — refreshed via managed-docs export (legacy `.brain/PROJECT-IDENTITY.md` deprecated/removed, ADR-046)
- `.dashboard` — final state written
- `.tasks/*.hb`, `.tasks/*.plan`, `.tasks/*.log`, `.tasks/*.paused` — deleted
- `.locks/*.lock` (stale) — deleted

**Sprint object returned** to caller with full metrics and COMPLETE status.

**Blueprint reference:** §7 Phase 8 TRANSITION/CLEANUP

---

## Complete Phase Flow Diagram

```
User writes DIRECTIVES.md
         │
         ▼
  ┌─────────────┐
  │  Phase 1    │  readContext() → planSprint() → writes .tasks/*.json
  │    PLAN     │
  │             │  resetDashboard()
  │             │  hook: beforeSprint (after plan, before spawn)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Phase 2    │  bootstrapProviders() → detect Claude/Codex/Gemini
  │    SPAWN    │  spawnWorkers() → route each task to task.provider
  │             │    claude → tmux window; codex → CodexAdapter.spawn()
  │             │    gemini → GeminiAdapter.spawn()
  │             │  startScanLoop() → setInterval(30s)
  │             │  [1 retry on failure]
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐  (when dependency_pipeline_enabled: true — default)
  │ Phase 2a    │  Kahn's topological sort → dependency waves
  │  WAVE_BUILD │  detectScopeCollisions() → same-file writes → separate waves
  │  (ADR-045)  │  Wave N tasks spawn in parallel; Wave N+1 waits on Wave N DONE
  │             │  respawnEligibleTasks() fires after each result collected
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐  Workers (parallel):
  │  Phase 3    │    read task JSON → plan → code → test → write .result
  │   EXECUTE   │  Brain: waitForResults() polls every 15s (30min timeout)
  │             │  Auditor: scanLoop every 30s → updates .dashboard
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Phase 4    │  clearInterval(scanInterval)
  │  EVALUATE   │  evaluateResult() per task → DONE / GO_WITH_TECH_DEBT / NO_GO
  │             │  handleEvaluation() → updates task JSON, memory.db (debt)
  │             │  hook: afterTask (per task, after evaluation)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐  handleCrossDependencies()
  │  Phase 5    │  spawnWorkers() + waitForResults() for fix tasks (10min)
  │     FIX     │  escalateDebt() → priority upgrades in memory.db
  │  (if NO-GO) │  [skipped if no NO-GO tasks]
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Phase 6    │  calculateMetrics()
  │    RETRO    │  writeRetrospective() → .brain/RETRO.md + .brain/MEMORY.md + memory.db
  │             │  writeSprintLog() → .brain/sprints/sprint-NNN.md
  │             │  hook: afterSprint (after retro, before decay)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Phase 7    │  runDecay() → if DB entries > memory_budget: store.decay()
  │    DECAY    │  prunes old DB entries (Memory V2 DB-first; file-based trim deprecated)
  │             │
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Phase 8    │  clearInterval() + cleanup() → remove .hb/.plan/.log/.paused
  │  COMPLETE   │  finalizeSprint():
  │             │    writeSprintLog() → .brain/sprints/sprint-NNN.md
  │             │    writeRetrospective() → .brain/RETRO.md + .brain/MEMORY.md + memory.db
  │             │    managed-docs export → .deckent/workspace/IDENTITY.md
  │             │    updateLastSprintId() → .deckent/config.json
  │             │    runDecay() (self-gated on config.memory_budget)
  │             │    hook: afterSprint
  │             │  final updateDashboard()
  └─────────────┘
         │
         ▼
    Sprint returned
    (SprintStatus.COMPLETE)
```

---

## Files Created Per Phase — Quick Reference

| Phase | Files Created | Files Updated | Files Deleted |
|-------|--------------|---------------|---------------|
| 0: DIRECTIVE | `DIRECTIVES.md` | — | — |
| 1: PLAN | `.tasks/task-{id}.json` (N files) | `.dashboard` | — |
| 2: SPAWN | — | `.dashboard` | — |
| 3: EXECUTE | `.tasks/task-{id}.hb`, `.tasks/task-{id}.plan`, `.tasks/task-{id}.result`, `.locks/*.lock`, source files | `.dashboard` (every 30s) | — |
| 4: EVALUATE | `.tasks/task-{id}-fix.json` (if NO-GO) | `.tasks/task-{id}.json` (status), `.brain/memory.db` (debt entries) | — |
| 5: FIX | `.tasks/task-{id}-fix.result` | `.brain/memory.db` (debt priority escalation) | — |
| 6: RETRO | `.brain/sprints/sprint-NNN.md` | `.brain/RETRO.md` (overwrite), `.brain/MEMORY.md`, `.brain/memory.db` (sprint/retro/memory entries) | — |
| 7: DECAY | `.brain/archive/*` (if fallback triggered) | `.brain/memory.db` (old DB entries pruned) | Old DB entries past retention window |
| 8: COMPLETE | `.brain/sprints/sprint-NNN.md` (if not yet written) | `.deckent/config.json`, `.brain/memory.db`, `.brain/MEMORY.md`, `.brain/RETRO.md`, `.deckent/workspace/IDENTITY.md` (managed-docs), `.dashboard` | `.tasks/*.hb`, `.tasks/*.plan`, `.tasks/*.log`, `.tasks/*.paused`, `.locks/*.lock` |

---

## Error Handling

Every phase in `runSprint()` is wrapped in `try/catch`. Phase failures are:

1. Logged as `AlertLevel.WARNING` alerts to the dashboard
2. Non-fatal — the next phase still runs
3. Exception: Phase 1 (PLAN) and Phase 2 (SPAWN) can throw `BrainError` that propagates to caller

```typescript
// BrainError includes the phase that failed — src/orchestra/sprint-lifecycle.ts:70
class BrainError extends Error {
  public readonly phase?: SprintPhase;
}
```

**Usage limit handling:** If usage limits are hit mid-sprint, tasks are paused (status → `PAUSED`, state saved to `.tasks/*.paused`), resumed after limit resets. Sprint is never abandoned.

---

## Key Constants

All constants are defined in `src/core/constants.ts`:

| Constant | Value | Used In | Note |
|----------|-------|---------|------|
| `MEMORY_MAX_LINES` | 1500 | Phase 6/8: MEMORY.md trim | Updated Sprint 140 (was 300) |
| `RETRO_MAX_LINES` | 400 | Phase 6/8: RETRO.md trim | Updated Sprint 140 (was 100/120) |
| `SPRINT_LOG_MAX_LINES` | 500 | Phase 6: sprint log | Updated Sprint 140 (was 80/100) |
| `BRAIN_TOTAL_LINE_BUDGET` | 5000 | `@deprecated` — prefer `config.memory_budget` | Updated Sprint 140 (was 900); runtime uses `config.memory_budget` (default 5000) |
| `MEMORY_DECAY_SPRINTS` | 20 | `@deprecated` — prefer `config.decay_after_sprints` | Updated Sprint 140 (was 5); runtime uses `config.decay_after_sprints` (default 20) |
| `DEBT_HIGH_PRIORITY_SPRINTS` | 2 | Phase 5: debt escalation | — |
| `DEBT_CRITICAL_SPRINTS` | 3 | Phase 5: debt escalation | — |
| `TASK_FILE_EXTENSIONS` | `.json,.plan,.hb,.result,.paused,.log` | Phase 8: cleanup | — |

**Timeouts (in `runSprint`):**
- `waitForResults` default: 30 minutes
- `waitForResults` fix sprint: 10 minutes
- Auditor scan interval: 30 seconds
- `waitForResults` poll interval: 15 seconds

---

## Triggering a Sprint

**Via CLI:**
```bash
deckent start                    # Interactive — reads DIRECTIVES.md
deckent start --auto-approve     # Skip confirmations
deckent start --dry-run          # Plan only, no workers spawned
deckent finalize                 # Re-run finalizeSprint on last sprint (idempotent)
deckent finalize --sprint sprint-042  # Target a specific sprint
```

**Via MCP tool:**
```json
{ "tool": "deckent_start", "arguments": { "autoApprove": true } }
```

**Blueprint reference:** §3 Native CLI, §21 MCP Server Architecture, §22 User Flows
