# Workers

Complete reference for Deckent worker agents. Read this before starting any task.

> **Canonical location:** `docs/guide/workers.md` — This file consolidates three formerly separate worker guides (`docs/development/worker-guide.md`, `docs/worker-guide.md`, `.deckent/workspace/WORKER-GUIDE.md`).

---

## Table of Contents

1. [Worker Role Overview](#1-worker-role-overview)
2. [Worker Lifecycle](#2-worker-lifecycle)
3. [Step 1 — Task Reading (CLAIM)](#3-step-1--task-reading-claim)
4. [Step 2 — Heartbeat Initialization](#4-step-2--heartbeat-initialization)
5. [Step 3 — Plan Writing](#5-step-3--plan-writing)
6. [Step 4 — Lock Management](#6-step-4--lock-management)
7. [Step 5 — Code Execution (Within Scope)](#7-step-5--code-execution-within-scope)
8. [Step 6 — Scope Rules](#8-step-6--scope-rules)
9. [Step 7 — Test Execution](#9-step-7--test-execution)
10. [Step 8 — Result Writing](#10-step-8--result-writing)
11. [Honest-Result Gate](#11-honest-result-gate)
12. [Error Classes & Handling](#12-error-classes--handling)
13. [RBAC — Authority Matrix](#13-rbac--authority-matrix)
14. [Forbidden Anti-Patterns](#14-forbidden-anti-patterns)
15. [processQueue Stall Awareness](#15-processqueue-stall-awareness)
16. [Worker API Reference](#16-worker-api-reference)
17. [File Format Reference](#17-file-format-reference)
18. [Worker Rules Summary](#18-worker-rules-summary)

---

## 1. Worker Role Overview

Workers are ephemeral, scoped execution agents. Each worker:

- Is spawned by Brain inside a dedicated **tmux window** (or subprocess/Docker)
- Receives exactly one task (identified by `taskId`)
- Operates as a Claude Code session in **headless mode** (`claude -p`)
- Has strict **scope restrictions** enforced by the Auditor
- Cannot plan, orchestrate, or spawn other agents

```
Brain spawns worker
  → Worker reads .tasks/task-XXX.json
  → Worker writes heartbeat (.tasks/task-XXX.hb)
  → Worker writes plan (.tasks/task-XXX.plan)
  → Worker acquires locks → writes files → releases locks
  → Worker runs tests
  → Worker writes result (.tasks/task-XXX.result)
  → Brain evaluates result → GO / NO-GO / TECH_DEBT
```

**Source file:** `src/agents/worker.ts`
**Rules file:** `.claude/rules/worker-default.md`

---

## 2. Worker Lifecycle

Three distinct state representations exist in the worker system. Do not conflate them.

### 2a. Task-File Status (`TaskStatus`)

Recorded in `.tasks/task-{id}.json`. The Brain and Auditor read this field.

```
PENDING ──► CLAIMED ──► EXECUTING ──► DONE
                                       │
                                       └──► NO_GO
```

### 2b. Worker Process Lifecycle (`WorkerLifecycleState`)

Tracked by `WorkerStateMachine` in `worker-lifecycle.ts`. Drives Docker-stop / orphan detection.

```
SPAWNING ──► STARTING ──► EXECUTING ──► VERIFYING ──► TESTING ──► WRITING_RESULT ──► DONE ──► EXITED
                              │                                          │
                              └──────────────────────────────────────►ERROR ──► EXITED
                              └──────────────────────────────────────►ORPHAN
```

| State | Meaning |
|-------|---------|
| `SPAWNING` | Backend is launching the container/process |
| `STARTING` | Worker process started, reading task |
| `EXECUTING` | Worker is implementing the task |
| `VERIFYING` | Running `tsc --noEmit` (type check) |
| `TESTING` | Running test suite |
| `WRITING_RESULT` | Writing `.result` file to disk |
| `DONE` | `.result` written, exiting normally |
| `EXITED` | Process has exited |
| `ERROR` | Unrecoverable error encountered |
| `ORPHAN` | Worker lost contact; Brain detected via stale heartbeat |

Valid transitions are defined in `VALID_TRANSITIONS` (`worker-lifecycle.ts`). Stoppable states: `SPAWNING`, `STARTING`, `EXECUTING`, `VERIFYING`, `TESTING`, `WRITING_RESULT`. Terminal states: `DONE`, `EXITED`, `ERROR`, `ORPHAN`.

### 2c. Heartbeat Status (`AgentStatus`)

Written to `.tasks/task-{id}.hb` by the worker. The Auditor reads this every 30 s.

```
EXECUTING ──► CODING ──► VERIFYING ──► TESTING ──► DOCUMENTING ──► DONE
```

### 2d. Phase-to-Status Mapping

| Phase | Task Status | Heartbeat Status | Lifecycle State |
|-------|-------------|-----------------|-----------------|
| 1. Claim | `CLAIMED` | — | `STARTING` |
| 2. Heartbeat init | `EXECUTING` | `EXECUTING` | `EXECUTING` |
| 3. Plan | `EXECUTING` | `EXECUTING` | `EXECUTING` |
| 4. Lock + Code | `EXECUTING` | `CODING` | `EXECUTING` |
| 5. Type check | `EXECUTING` | `VERIFYING` | `VERIFYING` |
| 6. Test | `TESTING` | `TESTING` | `TESTING` |
| 7. Document | `DOCUMENTING` | `DOCUMENTING` | `WRITING_RESULT` |
| 8. Result | `DONE` or `NO_GO` | `DONE` | `DONE` |

---

## 3. Step 1 — Task Reading (CLAIM)

Every worker starts by reading its assigned task from `.tasks/task-{id}.json`:

```typescript
// src/agents/worker.ts — readTask()
export function readTask(projectRoot: string, taskId: string): Task {
  const path = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as Task;
}
```

**Fields workers must read:**

| Field | Purpose |
|-------|---------|
| `scope.directories` | Directories where the worker may write |
| `scope.filesRead` | Additional files the worker may read |
| `scope.filesWrite` | Specific files the worker may write (outside directories) |
| `goNogo.goCriteria` | What constitutes a successful result |
| `goNogo.noGoCriteria` | Conditions that force NO_GO assessment |
| `goNogo.techDebtAcceptable` | Debt Brain will accept as GO_WITH_TECH_DEBT |

---

## 4. Step 2 — Heartbeat Initialization

The heartbeat file **MUST** be created before any work begins. The Auditor monitors heartbeat files to detect stale agents (>2 min without update = alert).

**File path:** `.tasks/task-{id}.hb`

```json
{
  "workerId": "w-{taskId}",
  "taskId": "{taskId}",
  "status": "EXECUTING",
  "currentAction": "Starting task",
  "timestamp": "<new Date().toISOString() — UTC ISO 8601>",
  "filesChangedCount": 0,
  "sequence": 0,
  "backend": "tmux | subprocess | docker (optional)"
}
```

**Update rules:**
- `status`: EXECUTING → CODING → VERIFYING → TESTING → DOCUMENTING
- `currentAction`: describe what you're doing right now
- `sequence`: increment on every update
- `filesChangedCount`: reflect actual files modified
- `timestamp`: always use `new Date().toISOString()` — never hardcode or use locale strings

**Stale detection threshold:** Auditor alerts if `now - timestamp > 2 minutes`

---

## 5. Step 3 — Plan Writing

Before writing any code, workers must write their execution plan to `.tasks/task-{id}.plan` using `writeTaskPlan()`. The file is written as **JSON** matching the `TaskPlan` interface (`src/core/task-types.ts`).

**`TaskPlan` schema:**

```json
{
  "taskId": "{taskId}",
  "workerId": "w-{taskId}",
  "filesToCreate": ["list/of/files/to/create.ts"],
  "filesToModify": ["list/of/files/to/modify.ts"],
  "executionSteps": [
    "Step 1: Read task scope and identify affected files",
    "Step 2: Implement changes to X",
    "Step 3: Run tsc --noEmit, fix errors",
    "Step 4: Run targeted tests, fix failures"
  ],
  "testStrategy": "Run targeted vitest tests covering changed files",
  "documentationPlan": "Update relevant docs if public API or behavior changed",
  "estimatedDurationMin": 30
}
```

LLM workers may write freeform prose into the `executionSteps` array; the field is `string[]` and any length is valid.

**Why write a plan first?**

1. **Auditability** — Brain and Auditor can verify that the worker understood the task before execution began
2. **Debugging** — When a task fails (NO_GO), the `.plan` file reveals whether the failure was in understanding (bad plan) or execution (good plan, bad implementation)
3. **Accountability** — Forces think-before-code, reducing scope creep

Missing `.plan` triggers a soft warning in the result file (`planWarning: 'missing'`).

---

## 6. Step 4 — Lock Management

Workers must check and acquire locks before writing to any file. Locks prevent concurrent modification of the same file by multiple workers.

**Lock file naming:** Path separators replaced by `__`:

```
src/auth/jwt.ts  →  .locks/src__auth__jwt.ts.lock
```

**Lock file format:**

```json
{
  "filePath": "src/auth/jwt.ts",
  "ownerWorkerId": "w-018-001",
  "acquiredAt": "2026-03-18T09:02:00.000Z",
  "taskId": "018-001"
}
```

**Stale lock detection:**

| Threshold | Auditor Action |
|-----------|----------------|
| > 5 minutes | WARNING alert (`stale_lock` boundary violation logged) |

`checkStaleLocks()` in `src/monitor/auditor.ts` uses a single 300 000 ms (5 min) threshold. There is no second CRITICAL tier for file locks.

**Critical rule:** Always release locks in a `finally` block. Use `releaseAllLocks(projectRoot, workerId)` on exit.

---

## 7. Step 5 — Code Execution (Within Scope)

During code execution, workers must:

1. Update heartbeat to `CODING` status
2. Update `currentFile` and increment `sequence` on every file write
3. Update `filesChangedCount`
4. Stay strictly within assigned scope (see §8)

---

## 8. Step 6 — Scope Rules

Scope enforcement is the primary security boundary in Deckent. Workers that write outside their assigned scope are detected by Auditor via `git diff --stat`.

```json
"scope": {
  "directories": ["src/auth/"],
  "filesRead": ["src/core/types.ts"],
  "filesWrite": ["src/auth/index.ts"]
}
```

| Field | Meaning |
|-------|---------|
| `directories` | Worker may write to ANY file under these directories |
| `filesRead` | Worker may READ these specific files (outside directories) |
| `filesWrite` | Worker may WRITE these specific files (outside directories) |

**`isWithinScope()` logic:**
1. Normalize path
2. Check if `filePath` starts with any directory in `scope.directories` (trailing `/` protection prevents `src/core/` matching `src/core-extra/`)
3. Check if `filePath` exactly matches any entry in `scope.filesWrite`
4. Return `true` only if either check passes

**Golden rule:** When in doubt, do NOT write the file. Read-only access to `scope.filesRead` is always permitted.

---

## 9. Step 7 — Test Execution

Before writing the result file, workers MUST run both checks:

```bash
# 1. TypeScript type check (must pass with zero errors)
tsc --noEmit

# 2. Full test suite
npx vitest run
```

| Check | Minimum Bar |
|-------|-------------|
| `tsc --noEmit` | Zero type errors |
| `npx vitest run` | All tests pass |

Max 3 attempts each. If still failing after 3 attempts, write NO_GO result.

**Note (ADR-037 V1.0):** The verify loop is a **prompt instruction** (advisory). `enforceVerifyLoop` is not wired in production callers — it is enforced through worker honesty and the Honest-Result Gate below, not through automated code enforcement. Hard enforcement is planned for ADR-037 V2 (post-GA integrity-hardening).

---

## 10. Step 8 — Result Writing

The result file is **required**. Without it, Brain cannot evaluate the task and will generate a synthetic NO_GO result after timeout.

**File path:** `.tasks/task-{id}.result`

```json
{
  "taskId": "{taskId}",
  "filesChanged": ["list/of/files/you/created/or/modified"],
  "linesAdded": 0,
  "linesRemoved": 0,
  "testsPassed": true,
  "coverage": 0,
  "selfAssessment": "DONE",
  "notes": "Brief summary of what was done",
  "tokenUsage": {
    "inputTokens": 0,
    "outputTokens": 0,
    "cacheReadTokens": 0,
    "provider": "claude",
    "model": "opus"
  }
}
```

`selfAssessment` values:
- `"DONE"` — task fully completed, all tests pass
- `"GO_WITH_TECH_DEBT"` — mostly done, minor issues documented
- `"NO_GO"` — could not complete, error details in notes

**Atomic write:** Write to `.tmp` first, then `renameSync` to final path (Bug K fix — prevents partial result reads).

---

## 11. Honest-Result Gate

Before writing `selfAssessment: "DONE"`, you MUST verify:

1. **Baseline:** What was the test/code state BEFORE your work?
2. **End state:** What is it NOW?
3. **Delta:** How much of the task did you ACTUALLY complete?

**Thresholds:**
- ≥80% complete → `"DONE"`
- 50–79% complete → `"GO_WITH_TECH_DEBT"` with specific gap in notes
- <50% complete → `"NO_GO"` with explanation

**"Code written" ≠ "DONE".** Functional outcome must match task spec.

---

## 12. Error Classes & Handling

Three error classes are defined in `src/agents/worker.ts`:

### `TaskClaimError`

**Causes:** Task is not `PENDING`, or already has an `assignedWorker`.
**Response:** Log the error, do not retry without Brain intervention.

### `LockError`

**Causes:** Another worker holds a lock on the file, or lock is corrupted.
**Response:** Wait and retry (with backoff), or skip the file and note in result.

### `ScopeViolationError`

**Causes:** Worker attempts to write a file not in `scope.directories` or `scope.filesWrite`.
**Response:** Never suppress this error. Report in result notes. Set `selfAssessment: "NO_GO"` if it blocks completion.

**Error handling rules:**
- `tsc --noEmit` fails after 3 attempts → write NO_GO result with error details
- `npx vitest run` fails after 3 attempts → write NO_GO result with failing test names
- Blocked by another task → write NO_GO result explaining the dependency
- Unsure about scope → err on the side of caution, do NOT touch files outside scope

---

## 13. RBAC — Authority Matrix

Per ADR-037 V1.0 (Sprint 139):

| Role | Write Source Code | Write Docs | Write `.tasks/` | Write `.brain/` |
|------|:-----------------:|:----------:|:---------------:|:---------------:|
| Brain | ❌ | ✅ | ✅ | ✅ |
| Worker | ✅ (scope only) | ✅ (scope only) | ✅ (own files) | ❌ |
| Auditor | ❌ | ❌ | ❌ | ✅ (patterns) |

Workers MAY ONLY write files listed in `scope.filesWrite`. Auditor detects violations via `git diff --stat`. ADR-037 V1.0 runtime enforcement is **advisory/soft** (compile-time lint + audit-trail); hard enforcement is planned for ADR-037 V2 post-GA.

---

## 14. Forbidden Anti-Patterns

| Anti-Pattern | Status | Reason |
|-------------|--------|--------|
| `it.skip(...)` without justification comment | FORBIDDEN | Hides failing tests — must fix or document why |
| `stub()` / empty function returning hardcoded value | FORBIDDEN | Produces false GO results — implement real logic |
| `npm run build` in worker | FORBIDDEN | Alperen decision — dist/ contamination risk |
| Writing outside `scope.filesWrite` | FORBIDDEN | ADR-037 RBAC violation — auditor will flag |
| `selfAssessment: "DONE"` without honest verification | FORBIDDEN | Sprint evaluator rejects, task → NO_GO |
| Hardcoded timestamps in `.hb` files | FORBIDDEN | Use `new Date().toISOString()` always |
| Ignoring ADR constraints | FORBIDDEN | Violation requires NO_GO + ADR amendment proposal |

---

## 15. processQueue Stall Awareness

If your task depends on another task's output and it has not arrived:

- Use the prompt's host-evaluated `aggregate` dependency verdict as the only dependency-status
  authority. Raw `.tasks/task-{dep-id}.result` files describe one attempt (often the original
  `NO_GO`) and must never override a repaired logical lineage's aggregate `DONE`.
- Verify the declared dependency output artifact, not the original attempt verdict.
- Do NOT busy-wait — write `NO_GO` result explaining the dependency
- Brain will reschedule via mid-sprint-adapter

---

## 16. Worker API Reference

> **Sprint 144 God Object Split:** `worker.ts` was refactored from 1 670 LoC into a re-export router plus four extracted modules. `worker.ts` retains core task I/O and re-exports everything for backward compatibility — all public symbols remain importable from `src/agents/worker.ts`.
>
> | Module | Responsibility |
> |--------|---------------|
> | `worker.ts` | Core task I/O (read, claim, heartbeat, result, scope check) + re-export router |
> | `worker-lifecycle.ts` | State machine, atomic write, SIGTERM shutdown, verify-delta, feedback loop |
> | `worker-verify.ts` | Build & test verification loops (`tsc`, vitest), coverage parse |
> | `worker-log.ts` | Structured log formatting & I/O |
> | `worker-rollback.ts` | Git-stash scope snapshot and rollback (Sprint 177) |
> | `core/file-lock.ts` | Lock acquire / release / check (delegated from worker.ts) |

### Core task I/O (`worker.ts`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `readTask` | `(root, taskId) → Task` | Read task JSON file |
| `claimTask` | `(root, taskId, workerId) → Task` | Mark task as CLAIMED |
| `writeTaskPlan` | `(root, plan: TaskPlan) → void` | Write `.plan` file (JSON) |
| `createHeartbeat` | `(workerId, taskId, status, action, ...) → Heartbeat` | Create heartbeat object |
| `writeHeartbeat` | `(root, heartbeat) → void` | Write `.hb` file + emit event |
| `writeResult` | `(root, result: TaskResult) → void` | Atomic `.result` write + update status |
| `verifyResultPersisted` | `(root, taskId) → { persisted, size }` | Post-write fsync verification |
| `updateTaskStatus` | `(root, taskId, status) → Task` | Update task status in JSON |
| `finalizeHeartbeat` | `(root, taskId, delayMs?) → void` | Remove `.hb` on task completion |
| `isWithinScope` | `(filePath, scope, root?) → boolean` | Check scope membership (symlink-safe) |
| `checkWorkerAuthority` | `(filePath, scope, root, taskId, ...) → boolean` | ADR-037 authority check + emit |
| `emitWorkerQuestion` | `(root, taskId, question, ...) → void` | Worker → Brain question event |
| `authHealthCheck` | `(root, taskId, ...) → AuthHealthCheckResult` | Pre-spawn Claude CLI auth check |
| `getSharedMemory` | `(root, ttlMs?) → SharedMemory` | Inter-worker shared memory |
| `setupTaskSnapshot` | `(root, taskId) → string \| null` | Git-stash pre-spawn snapshot |
| `calculateProgress` | `(heartbeat) → number` | 0–100 progress from heartbeat status |

### Lock operations (`core/file-lock.ts` via re-exports)

| Function | Signature | Description |
|----------|-----------|-------------|
| `acquireLock` | `(root, filePath, workerId, taskId) → LockInfo` | Acquire file lock (O_EXCL atomic) |
| `releaseLock` | `(root, filePath, workerId) → void` | Release specific lock |
| `checkLock` | `(root, filePath) → LockInfo \| null` | Read lock without acquiring |
| `releaseAllLocks` | `(root, workerId) → number` | Release all locks, returns count |

### Lifecycle state machine (`worker-lifecycle.ts` via re-exports)

| Export | Kind | Description |
|--------|------|-------------|
| `WorkerStateMachine` | class | Track and validate lifecycle state transitions |
| `VALID_TRANSITIONS` | const | Allowed next-states per current state |
| `STOPPABLE_STATES` | const | States where `docker stop` is needed |
| `TERMINAL_STATES` | const | States where worker has already exited |
| `atomicWriteFileSync` | fn | `tmp → fsync → rename` write guarantee |
| `createFeedbackLoop` | fn | Zero-initialized retry tracker |
| `computeVerifyDelta` | fn | Compare baseline vs end-state for honest assessment |

### Verification (`worker-verify.ts` via re-exports)

| Export | Kind | Description |
|--------|------|-------------|
| `enforceVerifyLoop` | fn | Async gate: `tsc` + `vitest` up to 3 attempts |
| `runCompilationLoop` | fn | Sync compilation retry loop with heartbeat updates |
| `runTestVerifyLoop` | fn | Sync test retry loop |
| `isDocOnlyScope` | fn | Returns `true` when scope has no source dirs → skip verify |
| `parseCoverageSummary` | fn | Parse `coverage-summary.json` for real coverage % |

### Log helpers (`worker-log.ts` via re-exports)

| Export | Kind | Description |
|--------|------|-------------|
| `readWorkerLog` | fn | Read tmux log file for a task |
| `appendWorkerLog` | fn | Append a structured log entry |
| `formatWorkerLog` | fn | Format log for display |

### Rollback (`worker-rollback.ts` via re-exports)

| Export | Kind | Description |
|--------|------|-------------|
| `snapshotWorkerScope` | fn | Git-stash current scope before work |
| `rollbackWorkerScope` | fn | Restore stash on NO_GO |
| `dropWorkerSnapshot` | fn | Drop stash on DONE/GO_WITH_TECH_DEBT |

---

## 17. File Format Reference

| File | Path | Creator | Consumer |
|------|------|---------|---------|
| Task definition | `.tasks/task-{id}.json` | Brain | Worker (read), Auditor (read) |
| Execution plan | `.tasks/task-{id}.plan` | Worker | Brain (evaluation) |
| Heartbeat | `.tasks/task-{id}.hb` | Worker | Auditor (every 30s) |
| Result | `.tasks/task-{id}.result` | Worker | Brain (required for eval) |
| tmux log | `.tasks/task-{id}.log` | tmux pipe-pane | Brain (diagnostics) |
| File lock | `.locks/{path__with__seps}.lock` | Worker | Auditor (stale detection) |

---

## 18. Worker Rules Summary

From `.claude/rules/worker-default.md` and Blueprint §5.3:

```
1.  Read task file FIRST (.tasks/task-XXX.json)
2.  Write heartbeat BEFORE starting any work
3.  Write execution plan (.tasks/task-XXX.plan) before coding
4.  Check locks before writing ANY file
5.  Update heartbeat on every significant action
6.  STAY within assigned scope — scope.directories + scope.filesWrite
7.  Run tsc --noEmit AND npx vitest run before marking done (max 3 each)
8.  Write result file — it is REQUIRED (.tasks/task-XXX.result)
9.  Release ALL locks when finished (success or failure)
10. Set selfAssessment honestly — pass Honest-Result Gate before "DONE"
```

**The cardinal rules:**
- Workers **never plan** — only Brain can plan sprints
- Workers **never spawn** other agents
- Workers **never write** to files outside their scope
- Workers **never leave** a result file unwritten
- Sprint is **NEVER** left incomplete

---

## References

- **Source:** `src/agents/worker.ts`
- **Rules:** `.claude/rules/worker-default.md`
- **Contract:** `docs/reference/api-surface.md`
- **RBAC:** ADR-037 (`.brain/exports/decisions.md`)
- **Types:** `src/core/task-types.ts` — `Task`, `TaskResult`, `TaskPlan`, `TaskScope`, `TaskStatus`; `src/core/monitoring-types.ts` — `Heartbeat`, `AgentStatus`, `LockInfo` (`src/core/types.ts` is a barrel re-export)
