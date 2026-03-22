# Sprint Lifecycle — Deckent Orchestration

> **Blueprint Reference:** §7 Sprint Lifecycle & Orchestration, §8 GO/NO-GO/Tech Debt Protocol, §9 Usage-Aware Planning

This document describes the complete 8-phase sprint lifecycle in Deckent. A sprint is the fundamental unit of orchestrated work — it begins with a directive, coordinates parallel workers, evaluates results, and always reaches COMPLETE state without being abandoned.

**Master function:** `runSprint(projectRoot, config, opts?)` — `src/orchestra/brain.ts:1054`

---

## Overview

```
Phase 0: DIRECTIVE   — You write DIRECTIVES.md (pre-sprint, manual)
Phase 1: PLAN        — Brain reads context, plans tasks, writes .tasks/*.json
Phase 2: SPAWN       — Brain launches workers in tmux windows
Phase 3: EXECUTE     — Workers run in parallel; auditor scans every 30s
Phase 4: EVALUATE    — Brain reads .result files, applies GO/NO-GO logic
Phase 5: FIX         — Brain spawns fix workers for NO-GO tasks
Phase 6: RETRO       — Brain writes RETRO.md, updates MEMORY.md, metrics
Phase 7: DECAY       — Brain compresses .brain/ if over budget
Phase 8: COMPLETE    — Cleanup, final status, config persisted
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

**Brain function:** `planSprint(projectRoot, config, context, recommendation)` — `src/orchestra/brain.ts:325`

**What happens:**

1. **Read context** — `readContext(projectRoot)` reads `DIRECTIVES.md`, `MEMORY.md`, `RETRO.md`, `DEBT.md`, `PATTERNS.md`, `DECISIONS.md`
2. **Check usage** — `checkUsage(config)` measures 5-hour window and weekly quota against configured thresholds
3. **Adjust sprint size** — `adjustSprintSize(config, usage)` determines `maxWorkers`, `modelConstraint`, and `effortCap` based on usage
4. **Handle critical debt** — Any `CRITICAL` priority unresolved debt from `DEBT.md` generates priority-fix tasks first
5. **Generate tasks** (three modes controlled by `brain_planning` config):
   - **`ai` mode:** `callBrainPlanner()` sends context to Claude CLI, gets Zod-validated task JSON
   - **`structured` mode:** `parseStructuredDirectives()` parses `## Task N:` blocks from DIRECTIVES.md
   - **`auto` mode (default):** AI first, structured fallback on failure
6. **Deadlock check** — `detectDeadlocks(tasks)` verifies no circular dependencies exist
7. **Write task files** — Each task is written as `.tasks/task-{id}.json`
8. **Dashboard reset** — `resetDashboard()` clears stale data from any prior sprint

**Files created/updated:**
- `.tasks/task-{sprintId}-{seq}.json` — one per task (status: `PENDING`)
- `.deckent/config.json` — `last_sprint_id` updated at end of sprint (Phase 8)

**Key data structures:**
```typescript
// SprintPhase enum — src/core/types.ts:160
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

**Brain function:** `spawnWorkers(projectRoot, sprint, config, opts)` — `src/orchestra/brain.ts:520`

**What happens:**

1. **Ensure tmux session** — `ensureSession()` creates the `deckent` tmux session if it doesn't exist
2. **Build worker prompt** — `buildWorkerPrompt(task)` constructs the worker instruction string including task ID, title, description, scope, heartbeat format, and result format
3. **Compute allowed tools** — `allowedTools` is scoped to `task.scope.directories + task.scope.filesWrite` (e.g. `Read,Write(src/core/),Bash`)
4. **Spawn each worker** — `spawnWorker(task.id, model, prompt, projectRoot, opts)` creates a new tmux window named `w-{taskId}`, runs `claude` CLI inside it
5. **Update dashboard** — All workers marked `AgentStatus.EXECUTING`, progress counter set to `(active: N, done: 0)`
6. **Start auditor scan loop** — `startScanLoop(projectRoot, sprint.id, undefined, onScanComplete)` begins a `setInterval(30s)` in the Brain process, writing scan results to the dashboard via `writeScanToDashboard()`

**1 retry on failure:** If `spawnWorkers()` throws, Brain retries once. On second failure, it cleans up and throws `BrainError`.

**Files created/updated:**
- `.dashboard` — written with initial agent list and progress
- tmux windows `w-{sprintId}-{seq}` (one per task, in-memory; not a file)

**Blueprint reference:** §7 Phase 2 & Phase 2.5, §10 Dynamic Terminal Management (tmux)

---

## Phase 3: EXECUTE

**`SprintPhase.EXECUTE` | `SprintStatus.ACTIVE`**

**Brain function:** `waitForResults(projectRoot, sprint, timeoutMs?)` — `src/orchestra/brain.ts:564`

**What happens (Brain side):**

1. Brain polls `.tasks/task-{id}.result` every 15 seconds
2. When a result file appears and parses as valid JSON, it is collected
3. Loop exits when all task IDs have results, or when the timeout (default: 30 minutes) expires
4. Tasks that don't produce a result within the timeout get a synthetic `NO_GO` result in Phase 4

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
- `evaluateResult(result, task)` — `src/orchestra/brain.ts:601`
- `handleEvaluation(projectRoot, task, evaluation, result)` — `src/orchestra/brain.ts:611`

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
   - `GO_WITH_TECH_DEBT` → task status → `DONE`, debt appended to `DEBT.md`
   - `NO_GO` → task status → `NO_GO`, fix task created in `.tasks/`
5. **Resolve debt** — `resolveDebt()` marks debt items as resolved for DONE/GO_WITH_TECH_DEBT tasks

**Files created/updated:**
- `.tasks/task-{id}.json` — status updated to `DONE` or `NO_GO`
- `.brain/DEBT.md` — new debt items appended for `GO_WITH_TECH_DEBT` evaluations

**Blueprint reference:** §7 Phase 4, §8 GO/NO-GO/Tech Debt Protocol

---

## Phase 5: FIX

**`SprintPhase.FIX` | `SprintStatus.FIXING`**

**Brain functions:**
- `handleCrossDependencies(projectRoot, sprint, evaluations)` — `src/orchestra/brain.ts:678`
- `spawnWorkers()` (reused) + `waitForResults()` (reused, 10 min timeout)
- `escalateDebt(projectRoot)` — `src/orchestra/brain.ts:725`

**What happens:**

1. **Cross-dependency check** — If Task A got NO-GO because Task B's output was broken, Task B gets a priority fix task even if B was marked GO or GO+DEBT
2. **Collect fix tasks** — Scans `.tasks/` for any `isPriorityFix === true` tasks with status `PENDING`
3. **If fix tasks exist:**
   - Spawns fix workers (same tmux mechanism as Phase 2)
   - Waits up to 10 minutes for fix results
   - Evaluates fix results and resolves debt for completed fixes
4. **Debt escalation** — `escalateDebt()` upgrades debt priorities:
   - 2 sprints unfixed → `HIGH`
   - 3+ sprints unfixed → `CRITICAL` (auto-included next sprint)

**Skipped if:** No NO-GO tasks exist (no fix tasks generated in Phase 4)

**Files created/updated:**
- `.tasks/task-{id}-fix.json` — new fix task files
- `.tasks/task-{id}-fix.result` — fix results
- `.brain/DEBT.md` — priorities escalated

**Blueprint reference:** §7 Phase 5, §8 Cross-Dependency Rule, §8 Tech Debt Escalation

---

## Phase 6: RETRO

**`SprintPhase.RETRO` | `SprintStatus.RETROSPECTIVE`**

**Brain functions:**
- `calculateMetrics(sprint, evaluations, results, debt)` — `src/orchestra/brain.ts:848`
- `writeRetrospective(projectRoot, sprint, evaluations, metrics)` — `src/orchestra/brain.ts:768`
- `writeSprintLog(projectRoot, sprint, metrics, evaluations)` — `src/orchestra/brain.ts:818`

**What happens:**

1. **Re-read debt** — Loads current `DEBT.md` to get accurate open debt count
2. **Calculate metrics** — `calculateMetrics()` computes:
   - `completedTasks`, `techDebtTasks`, `noGoTasks`
   - `durationMs`, `coveragePercent`, `noGoRate`
   - `newDebtCount`, `resolvedDebtCount`, `totalOpenDebt`
   - `boundaryViolations`, `crossAssignments`, `contextLinesUsed`
3. **Write RETRO.md** — `writeRetrospective()` overwrites `.brain/RETRO.md` (max 100 lines per `RETRO_MAX_LINES`)
4. **Write sprint log** — `writeSprintLog()` appends to `.brain/sprints/sprint-{NNN}.md` (max 80 lines)

**Files created/updated:**
- `.brain/RETRO.md` — overwritten with current sprint retrospective
- `.brain/sprints/sprint-{NNN}.md` — sprint log entry appended/created
- `sprint.metrics` — populated on the in-memory Sprint object

**Blueprint reference:** §7 Phase 6, §6 Memory Architecture

---

## Phase 7: DECAY

**`SprintPhase.DECAY`**

**Brain function:** `runDecay(projectRoot, sprintId, opts?)` — `src/orchestra/brain.ts:895`

**What happens:**

1. **Count brain lines** — `countBrainLines(projectRoot)` totals lines across all `.brain/` files
2. **Decay triggers when:** total > `BRAIN_TOTAL_LINE_BUDGET` (600 lines)
3. **Decay actions:**
   - `MEMORY.md` trimmed to `MEMORY_MAX_LINES` (200 lines)
   - `RETRO.md` trimmed to `RETRO_MAX_LINES` (100 lines)
   - Old sprint logs archived to `.brain/archive/`
   - Stale entries pruned from `PATTERNS.md`
4. **Returns `DecayResult`** — `{ trimmed, archived, pruned, linesFreed }`

**`force` option:** `runDecay(root, id, { force: true })` runs decay even if under budget (useful for testing/maintenance).

**Files created/updated:**
- `.brain/MEMORY.md` — potentially trimmed
- `.brain/RETRO.md` — potentially trimmed
- `.brain/archive/` — old sprint logs moved here
- `.brain/PATTERNS.md` — stale patterns pruned

**Blueprint reference:** §7 Phase 7, §6 Memory Architecture (3-Tier)

---

## Phase 8: COMPLETE

**`SprintPhase.COMPLETE` | `SprintStatus.COMPLETE`**

**Brain function:** `cleanup(projectRoot, sprint)` — `src/orchestra/brain.ts:1001`

**What happens:**

1. **Stop scan loop** (if still running) — `clearInterval(scanInterval)`
2. **Cleanup task artifacts** — `cleanup()` removes temporary files:
   - `.tasks/task-{id}.hb` — heartbeat files
   - `.tasks/task-{id}.plan` — execution plans
   - `.tasks/task-{id}.log` — worker logs
   - `.tasks/task-{id}.paused` — paused state files
   - Stale lock files from `.locks/`
3. **Mark sprint complete** — `sprint.status = SprintStatus.COMPLETE`, `sprint.phase = SprintPhase.COMPLETE`, `sprint.completedAt` set
4. **Persist sprint ID** — `updateLastSprintId(projectRoot, sprint.id)` writes to `.deckent/config.json` so `getNextSprintId()` never regresses
5. **Final dashboard update** — Dashboard updated with `done: sprint.tasks.length`, empty alerts

**Files updated:**
- `.deckent/config.json` — `last_sprint_id` persisted
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
  │  Phase 1    │  readContext() → checkUsage() → adjustSprintSize()
  │    PLAN     │  planSprint() → writes .tasks/*.json
  │             │  resetDashboard()
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Phase 2    │  spawnWorkers() → tmux windows per task
  │    SPAWN    │  startScanLoop() → setInterval(30s)
  │             │  [1 retry on failure]
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
  │             │  handleEvaluation() → updates task JSON, DEBT.md
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐  handleCrossDependencies()
  │  Phase 5    │  spawnWorkers() + waitForResults() for fix tasks (10min)
  │     FIX     │  escalateDebt() → priority upgrades in DEBT.md
  │  (if NO-GO) │  [skipped if no NO-GO tasks]
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Phase 6    │  calculateMetrics()
  │    RETRO    │  writeRetrospective() → .brain/RETRO.md (max 100 lines)
  │             │  writeSprintLog() → .brain/sprints/sprint-NNN.md
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Phase 7    │  countBrainLines() → if > 600: runDecay()
  │    DECAY    │  trim MEMORY.md, RETRO.md, archive old sprint logs
  │             │
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │  Phase 8    │  clearInterval() + cleanup() → remove .hb/.plan/.log/.paused
  │  COMPLETE   │  updateLastSprintId() → .deckent/config.json
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
| 4: EVALUATE | `.tasks/task-{id}-fix.json` (if NO-GO) | `.tasks/task-{id}.json` (status), `.brain/DEBT.md` | — |
| 5: FIX | `.tasks/task-{id}-fix.result` | `.brain/DEBT.md` (escalation) | — |
| 6: RETRO | `.brain/sprints/sprint-NNN.md` | `.brain/RETRO.md` (overwrite) | — |
| 7: DECAY | `.brain/archive/*` | `.brain/MEMORY.md`, `.brain/RETRO.md`, `.brain/PATTERNS.md` | Archived sprint logs |
| 8: COMPLETE | — | `.deckent/config.json`, `.dashboard` | `.tasks/*.hb`, `.tasks/*.plan`, `.tasks/*.log`, `.tasks/*.paused`, `.locks/*.lock` |

---

## Error Handling

Every phase in `runSprint()` is wrapped in `try/catch`. Phase failures are:

1. Logged as `AlertLevel.WARNING` alerts to the dashboard
2. Non-fatal — the next phase still runs
3. Exception: Phase 1 (PLAN) and Phase 2 (SPAWN) can throw `BrainError` that propagates to caller

```typescript
// BrainError includes the phase that failed — src/orchestra/brain.ts:60
class BrainError extends Error {
  public readonly phase?: SprintPhase;
}
```

**Usage limit handling:** If usage limits are hit mid-sprint, tasks are paused (status → `PAUSED`, state saved to `.tasks/*.paused`), resumed after limit resets. Sprint is never abandoned.

---

## Key Constants

All constants are defined in `src/core/constants.ts`:

| Constant | Value | Used In |
|----------|-------|---------|
| `MEMORY_MAX_LINES` | 200 | Phase 7: MEMORY.md trim |
| `RETRO_MAX_LINES` | 100 | Phase 6/7: RETRO.md trim |
| `SPRINT_LOG_MAX_LINES` | 80 | Phase 6: sprint log |
| `BRAIN_TOTAL_LINE_BUDGET` | 600 | Phase 7: decay trigger |
| `MEMORY_DECAY_SPRINTS` | — | Phase 7: MEMORY.md rotation |
| `DEBT_HIGH_PRIORITY_SPRINTS` | 2 | Phase 5: debt escalation |
| `DEBT_CRITICAL_SPRINTS` | 3 | Phase 5: debt escalation |
| `TASK_FILE_EXTENSIONS` | `.json,.plan,.hb,.result,.paused,.log` | Phase 8: cleanup |

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
```

**Via MCP tool:**
```json
{ "tool": "deckent_start", "arguments": { "autoApprove": true } }
```

**Blueprint reference:** §3 Native CLI, §21 MCP Server Architecture, §22 User Flows
