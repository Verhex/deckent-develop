# WORKER-GUIDE.md — Worker Davranış Kılavuzu

> **Deckent Master Blueprint §5.3 — Worker Agent**
> Workers are the builders of the Deckent system: they receive tasks from Brain, plan execution, write code within assigned scope, run tests, and report results. This guide covers the complete lifecycle from task claim to result submission.

---

## Table of Contents

1. [Worker Role Overview](#1-worker-role-overview)
2. [Worker Lifecycle — End to End](#2-worker-lifecycle--end-to-end)
3. [Step 1: Task Reading (CLAIM)](#3-step-1-task-reading-claim)
4. [Step 2: Heartbeat Initialization](#4-step-2-heartbeat-initialization)
5. [Step 3: Plan Writing](#5-step-3-plan-writing)
6. [Step 4: Lock Management](#6-step-4-lock-management)
7. [Step 5: Code Execution (Within Scope)](#7-step-5-code-execution-within-scope)
8. [Step 6: Scope Rules](#8-step-6-scope-rules)
9. [Step 7: Test Execution](#9-step-7-test-execution)
10. [Step 8: Result Writing](#10-step-8-result-writing)
11. [Task Status Transitions](#11-task-status-transitions)
12. [Error Classes & Handling](#12-error-classes--handling)
13. [Worker API Reference](#13-worker-api-reference)
14. [File Format Reference](#14-file-format-reference)
15. [Worker Rules Summary](#15-worker-rules-summary)

---

## 1. Worker Role Overview

**Blueprint Reference:** §5.3 — Worker Agent

Workers are ephemeral, scoped execution agents. Each worker:

- Is spawned by Brain inside a dedicated **tmux window**
- Receives exactly one task (identified by `taskId`)
- Operates as a Claude Code session in **headless mode** (`claude -p`)
- Has strict **scope restrictions** enforced by the Auditor
- Cannot plan, orchestrate, or spawn other agents

```
Brain spawns worker via tmux
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

## 2. Worker Lifecycle — End to End

```
PENDING ──► CLAIMED ──► EXECUTING ──► TESTING ──► DOCUMENTING ──► DONE
                                                                    │
                                                                    └──► NO_GO
```

| Phase | Status | What Happens |
|-------|--------|--------------|
| 1. Claim | `PENDING → CLAIMED` | Read task file, mark as claimed |
| 2. Heartbeat | `EXECUTING` | Write initial `.hb` file before any work |
| 3. Plan | `EXECUTING` | Write `.plan` file with execution strategy |
| 4. Lock | — | Acquire file locks before writing |
| 5. Code | `CODING` | Implement within scope, update heartbeat |
| 6. Test | `TESTING` | Run `tsc --noEmit` and `npx vitest run` |
| 7. Document | `DOCUMENTING` | Update docs, write final notes |
| 8. Result | `DONE` or `NO_GO` | Write `.result` file, release all locks |

---

## 3. Step 1: Task Reading (CLAIM)

### Reading the Task File

Every worker starts by reading its assigned task from `.tasks/task-{id}.json`:

```typescript
// src/agents/worker.ts — readTask()
export function readTask(projectRoot: string, taskId: string): Task {
  const path = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content) as Task;
}
```

**File location:** `.tasks/task-{id}.json`

### Claiming the Task

```typescript
// src/agents/worker.ts — claimTask()
export function claimTask(projectRoot: string, taskId: string, workerId: string): Task
```

- Verifies task status is `PENDING` — throws `TaskClaimError` if not
- Verifies no `assignedWorker` exists — throws `TaskClaimError` if already assigned
- Sets `status = 'CLAIMED'` and `assignedWorker = workerId`
- Writes back to `.tasks/task-{id}.json`

**Task JSON structure:**

```json
{
  "id": "018-001",
  "title": "Feature: Implement auth module",
  "description": "Add JWT-based authentication...",
  "model": "sonnet",
  "effort": "normal",
  "priority": "HIGH",
  "reason": "Required for secure API access",
  "scope": {
    "directories": ["src/auth/"],
    "filesRead": ["src/core/types.ts", ".contracts/api-surface.md"],
    "filesWrite": ["src/auth/index.ts", "src/auth/jwt.ts"]
  },
  "dependencies": [],
  "goNogo": {
    "goCriteria": "All tests pass, coverage >= 90%",
    "noGoCriteria": "Auth bypass possible, tests fail",
    "techDebtAcceptable": "Missing refresh token support"
  },
  "status": "PENDING",
  "sprintId": "sprint-018",
  "createdAt": "2026-03-18T09:00:00.000Z"
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
| `model` | Model assigned for this task (informational) |

---

## 4. Step 2: Heartbeat Initialization

**Blueprint Reference:** §5.3 — `buildWorkerPrompt` heartbeat instruction

The heartbeat file **MUST** be created before any work begins. The Auditor monitors heartbeat files to detect stale agents (>2 min without update = alert).

### Initial Heartbeat (sequence: 0)

```typescript
// src/agents/worker.ts — createHeartbeat() + writeHeartbeat()
const hb = createHeartbeat(
  workerId,         // e.g. "w-018-001"
  taskId,           // e.g. "018-001"
  AgentStatus.EXECUTING,
  "Starting task",
  undefined,        // currentFile — not set initially
  0                 // sequence
);
writeHeartbeat(projectRoot, hb);
```

**File path:** `.tasks/task-{id}.hb`

**Heartbeat JSON format:**

```json
{
  "workerId": "w-018-001",
  "taskId": "018-001",
  "status": "EXECUTING",
  "currentAction": "Starting task",
  "currentFile": "src/auth/jwt.ts",
  "timestamp": "2026-03-18T09:01:00.000Z",
  "filesChangedCount": 0,
  "sequence": 0
}
```

### Heartbeat Update Rules

Workers must update the heartbeat file **on every significant action**:

```typescript
// Example: updating heartbeat during coding
writeHeartbeat(projectRoot, {
  workerId: "w-018-001",
  taskId: "018-001",
  status: AgentStatus.CODING,
  currentAction: "Writing src/auth/jwt.ts",
  currentFile: "src/auth/jwt.ts",
  timestamp: new Date().toISOString(),
  filesChangedCount: 2,
  sequence: 5  // increment each time
});
```

**Status transitions during heartbeats:**

| Phase | `status` value |
|-------|----------------|
| Starting | `EXECUTING` |
| Writing code | `CODING` |
| Running tests | `TESTING` |
| Writing docs | `DOCUMENTING` |
| Finished | `DONE` |

**Stale detection threshold:** Auditor alerts if `now - timestamp > 2 minutes`

---

## 5. Step 3: Plan Writing

Before writing any code, workers must document their execution plan in `.tasks/task-{id}.plan`.

```typescript
// src/agents/worker.ts — writeTaskPlan()
export function writeTaskPlan(projectRoot: string, plan: TaskPlan): void
```

**Plan JSON format:**

```json
{
  "taskId": "018-001",
  "workerId": "w-018-001",
  "filesToCreate": [
    "src/auth/index.ts",
    "src/auth/jwt.ts",
    "src/auth/jwt.test.ts"
  ],
  "filesToModify": [
    "src/core/types.ts"
  ],
  "executionSteps": [
    "1. Read existing types.ts to understand Task/Agent interfaces",
    "2. Create src/auth/jwt.ts with JWT sign/verify functions",
    "3. Create src/auth/index.ts as barrel export",
    "4. Write unit tests in src/auth/jwt.test.ts",
    "5. Run tsc --noEmit to verify types",
    "6. Run npx vitest run to verify tests pass",
    "7. Update docs if needed"
  ],
  "testStrategy": "Unit tests for sign/verify, edge cases for expiry and invalid tokens",
  "documentationPlan": "Update README auth section if it exists",
  "estimatedDurationMin": 20
}
```

**Why write a plan first?**

1. Forces the worker to think before coding
2. Auditor can detect plan-vs-execution divergences
3. Brain can review plan files in evaluation phase
4. Provides traceability for post-sprint analysis

---

## 6. Step 4: Lock Management

Workers must check and acquire locks before writing to any file. Locks prevent concurrent modification of the same file by multiple workers.

**Blueprint Reference:** §15 — Security & Permissions (lock mechanism)

### Lock File Naming

Lock files are stored in `.locks/` with path separators replaced by `__`:

```
src/auth/jwt.ts  →  .locks/src__auth__jwt.ts.lock
```

### Acquiring a Lock

```typescript
// src/agents/worker.ts — acquireLock()
export function acquireLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
  taskId: string
): LockInfo
```

**Behavior:**
- If no lock exists → creates lock file, returns `LockInfo`
- If same worker holds lock → idempotent, returns existing `LockInfo`
- If different worker holds lock → throws `LockError`

**Lock file format** (`.locks/src__auth__jwt.ts.lock`):

```json
{
  "filePath": "src/auth/jwt.ts",
  "ownerWorkerId": "w-018-001",
  "acquiredAt": "2026-03-18T09:02:00.000Z",
  "taskId": "018-001"
}
```

### Checking Locks

```typescript
// Before writing — check if file is already locked
const lock = checkLock(projectRoot, 'src/auth/jwt.ts');
if (lock && lock.ownerWorkerId !== myWorkerId) {
  // Another worker holds this lock — wait or skip
  throw new LockError(`File locked by ${lock.ownerWorkerId}`, 'src/auth/jwt.ts');
}
```

### Releasing Locks

```typescript
// Release individual lock after writing
releaseLock(projectRoot, 'src/auth/jwt.ts', workerId);

// Release ALL locks held by this worker (use in cleanup/finally)
const releasedCount = releaseAllLocks(projectRoot, workerId);
```

**Critical rule:** Always release locks in a `finally` block. Stale locks (>5 min) are detected by Auditor and escalated.

### Stale Lock Detection

| Threshold | Auditor Action |
|-----------|----------------|
| > 5 minutes | WARNING alert |
| > 15 minutes | CRITICAL alert, Brain notified |

---

## 7. Step 5: Code Execution (Within Scope)

During code execution, workers must:

1. Update heartbeat to `CODING` status
2. Update `currentFile` and increment `sequence` on every file write
3. Update `filesChangedCount`
4. Stay strictly within assigned scope (see §8)

### Recommended Pattern

```typescript
// Pseudocode — worker execution loop
for (const file of plan.filesToCreate) {
  // 1. Acquire lock
  acquireLock(projectRoot, file, workerId, taskId);

  // 2. Update heartbeat
  writeHeartbeat(projectRoot, {
    ...baseHb,
    status: AgentStatus.CODING,
    currentAction: `Writing ${file}`,
    currentFile: file,
    timestamp: new Date().toISOString(),
    filesChangedCount: ++changedCount,
    sequence: ++seq,
  });

  // 3. Write file (within scope!)
  writeFileSync(file, content);

  // 4. Release lock
  releaseLock(projectRoot, file, workerId);
}
```

---

## 8. Step 6: Scope Rules

**Blueprint Reference:** §15 — Security & Permissions, §5.3 — Worker

Scope enforcement is the primary security boundary in Deckent. Workers that write outside their assigned scope are detected by Auditor via `git diff --stat`.

### Scope Definition (in task JSON)

```json
"scope": {
  "directories": ["src/auth/"],
  "filesRead": ["src/core/types.ts", ".contracts/api-surface.md"],
  "filesWrite": ["src/auth/index.ts"]
}
```

| Field | Meaning |
|-------|---------|
| `directories` | Worker may write to ANY file under these directories |
| `filesRead` | Worker may READ these specific files (outside directories) |
| `filesWrite` | Worker may WRITE these specific files (outside directories) |

### `isWithinScope()` Function

```typescript
// src/agents/worker.ts — isWithinScope()
export function isWithinScope(filePath: string, scope: TaskScope): boolean
```

**Logic:**
1. Normalize path (handle OS-specific separators)
2. Check if `filePath` starts with any directory in `scope.directories` (with trailing `/` protection to prevent prefix overlap: `src/core/` does NOT match `src/core-extra/`)
3. Check if `filePath` exactly matches any entry in `scope.filesWrite`
4. Return `true` only if either check passes

**Example:**

```typescript
const scope: TaskScope = {
  directories: ["src/auth/"],
  filesRead: ["src/core/types.ts"],
  filesWrite: ["docs/AUTH.md"]
};

isWithinScope("src/auth/jwt.ts", scope)    // true  (in directory)
isWithinScope("src/auth-extra/x.ts", scope) // false (prefix protection)
isWithinScope("docs/AUTH.md", scope)        // true  (in filesWrite)
isWithinScope("src/core/types.ts", scope)   // false (filesRead only, NOT write)
isWithinScope("src/api/index.ts", scope)    // false (out of scope)
```

### Scope Violation Consequences

```
Worker writes out-of-scope file
  → Auditor detects via git diff --stat
  → ScopeViolationError logged
  → CRITICAL alert in dashboard
  → Brain notified in next evaluation cycle
```

**Golden rule:** When in doubt, do NOT write the file. Read-only access to `scope.filesRead` is always permitted.

---

## 9. Step 7: Test Execution

Before writing the result file, workers MUST run both checks:

```bash
# 1. TypeScript type check (must pass with zero errors)
tsc --noEmit

# 2. Full test suite
npx vitest run
```

### Test Requirements

| Check | Minimum Bar | Blocks Result? |
|-------|-------------|----------------|
| `tsc --noEmit` | Zero type errors | Yes — fix before submitting |
| `npx vitest run` | All tests pass | Yes — fix or explain in notes |
| Coverage | ≥ 80% (default), ≥ 90% (high effort) | NO_GO if below threshold |

### Heartbeat During Testing

```typescript
writeHeartbeat(projectRoot, {
  ...baseHb,
  status: AgentStatus.TESTING,
  currentAction: "Running tsc --noEmit",
  timestamp: new Date().toISOString(),
  sequence: ++seq,
});
```

### GO/NO-GO Evaluation (post-test)

The Brain evaluates results using `evaluateResult()`:

```
testsPassed = false   → NO_GO (override, regardless of self_assessment)
coverage < 90%        → GO_WITH_TECH_DEBT (if high effort task)
coverage >= 90%       → DONE
All criteria met      → GO
```

---

## 10. Step 8: Result Writing

The result file is **required**. Without it, Brain cannot evaluate the task and will generate a synthetic NO_GO result after timeout.

```typescript
// src/agents/worker.ts — writeResult()
export function writeResult(projectRoot: string, result: TaskResult): void
```

`writeResult()` also calls `updateTaskStatus()` internally — setting the task to `DONE` or `NO_GO` based on `selfAssessment`.

### Result JSON Format

```json
{
  "taskId": "018-001",
  "workerId": "w-018-001",
  "filesChanged": [
    "src/auth/index.ts",
    "src/auth/jwt.ts",
    "src/auth/jwt.test.ts"
  ],
  "linesAdded": 187,
  "linesRemoved": 12,
  "testsPassed": true,
  "coverage": 94.2,
  "selfAssessment": "DONE",
  "notes": "JWT sign/verify implemented. Refresh token support deferred (see DEBT.md).",
  "completedAt": "2026-03-18T09:45:00.000Z",
  "durationMs": 2700000
}
```

### `selfAssessment` Values

| Value | Meaning | Brain Evaluation |
|-------|---------|-----------------|
| `"DONE"` | All criteria met, tests pass | GO (if coverage OK) |
| `"GO_WITH_TECH_DEBT"` | Feature works, known debt | GO_WITH_TECH_DEBT |
| `"NO_GO"` | Blocking issue, incomplete | NO_GO → priority fix |

### Writing the Result

After writing the result, update the heartbeat to `DONE` and release all locks:

```typescript
writeResult(projectRoot, result);

// Final heartbeat
writeHeartbeat(projectRoot, {
  workerId,
  taskId,
  status: AgentStatus.DONE,
  currentAction: "Task complete",
  timestamp: new Date().toISOString(),
  filesChangedCount: totalChanged,
  sequence: ++seq,
});

// Release all locks
releaseAllLocks(projectRoot, workerId);
```

---

## 11. Task Status Transitions

```
DRAFT ──► PENDING ──► CLAIMED ──► EXECUTING ──► TESTING ──► DOCUMENTING ──► DONE
                                                                              │
                                                                              └──► NO_GO
                        │
                        └──► PAUSED (Brain command)
```

**Status update function:**

```typescript
// src/agents/worker.ts — updateTaskStatus()
export function updateTaskStatus(
  projectRoot: string,
  taskId: string,
  status: TaskStatus
): Task
```

Workers typically only set statuses `CLAIMED`, `EXECUTING`, `TESTING`, `DOCUMENTING`, `DONE`, and `NO_GO`. The `writeResult()` function handles the final transition automatically.

---

## 12. Error Classes & Handling

Three error classes are defined in `src/agents/worker.ts`:

### `TaskClaimError`

```typescript
throw new TaskClaimError(`Cannot claim task ${taskId}: status is ${task.status}`);
```

**Causes:**
- Task is not `PENDING` (already claimed, done, or paused)
- Task already has an `assignedWorker`

**Response:** Log the error, do not retry without Brain intervention.

### `LockError`

```typescript
throw new LockError(`File ${filePath} is locked by ${existing.ownerWorkerId}`, filePath);
```

**Causes:**
- Another worker holds a lock on the file
- Lock exists but is unreadable (corrupted)

**Response:** Wait and retry (with backoff), or skip the file and note in result.

### `ScopeViolationError`

```typescript
throw new ScopeViolationError(
  `File ${filePath} is outside task scope`,
  filePath,
  scope
);
```

**Causes:**
- Worker attempts to write a file not in `scope.directories` or `scope.filesWrite`

**Response:** Never suppress this error. Report in result notes. Set `selfAssessment: "NO_GO"` if it blocks completion.

---

## 13. Worker API Reference

All functions are exported from `src/agents/worker.ts`:

| Function | Signature | Description |
|----------|-----------|-------------|
| `readTask` | `(root, taskId) → Task` | Read task JSON file |
| `claimTask` | `(root, taskId, workerId) → Task` | Mark task as CLAIMED |
| `writeTaskPlan` | `(root, plan: TaskPlan) → void` | Write `.plan` file |
| `createHeartbeat` | `(workerId, taskId, status, action, file?, seq?) → Heartbeat` | Create heartbeat object |
| `writeHeartbeat` | `(root, heartbeat) → void` | Write `.hb` file |
| `acquireLock` | `(root, filePath, workerId, taskId) → LockInfo` | Acquire file lock |
| `releaseLock` | `(root, filePath, workerId) → void` | Release specific lock |
| `checkLock` | `(root, filePath) → LockInfo \| null` | Read lock without acquiring |
| `releaseAllLocks` | `(root, workerId) → number` | Release all locks, returns count |
| `writeResult` | `(root, result: TaskResult) → void` | Write `.result` + update status |
| `updateTaskStatus` | `(root, taskId, status) → Task` | Update task status in JSON |
| `isWithinScope` | `(filePath, scope) → boolean` | Check scope membership |
| `readWorkerLog` | `(root, taskId) → string \| null` | Read tmux log file |

---

## 14. File Format Reference

### `.tasks/task-{id}.json` — Task Definition

Created by Brain, read by Worker. Workers update `status`, `assignedWorker`, `updatedAt`.

### `.tasks/task-{id}.plan` — Execution Plan

Created by Worker. Contains `TaskPlan` JSON. Read by Brain during evaluation.

### `.tasks/task-{id}.hb` — Heartbeat

Overwritten by Worker periodically. Contains `Heartbeat` JSON. Read by Auditor every 30s.

### `.tasks/task-{id}.result` — Completion Report

Created by Worker when finished. Contains `TaskResult` JSON. **Required for evaluation.**

### `.tasks/task-{id}.log` — tmux Log

Created by tmux pipe-pane log capture. Raw text output from the worker's claude session. Read via `readWorkerLog()`.

### `.locks/{path__with__separators}.lock` — File Lock

Created/deleted by Worker. Contains `LockInfo` JSON. Auditor monitors for staleness.

---

## 15. Worker Rules Summary

From `.claude/rules/worker-default.md` and Blueprint §5.3:

```
1. Read task file FIRST (.tasks/task-XXX.json)
2. Write heartbeat BEFORE starting any work
3. Write execution plan (.tasks/task-XXX.plan) before coding
4. Check locks before writing ANY file
5. Update heartbeat on every significant action
6. STAY within assigned scope — scope.directories + scope.filesWrite
7. Run tsc --noEmit AND npx vitest run before marking done
8. Write result file — it is REQUIRED (.tasks/task-XXX.result)
9. Release ALL locks when finished (success or failure)
10. Set selfAssessment honestly — Brain depends on accurate self-reporting
```

**The cardinal rules:**
- Workers **never plan** — only Brain can plan sprints
- Workers **never spawn** other agents
- Workers **never write** to files outside their scope
- Workers **never leave** a result file unwritten
- Sprint is **NEVER** left incomplete

---

## References

- **Blueprint §5** — Agent System (Brain, Auditor, Worker)
- **Blueprint §5.3** — Worker lifecycle, scope rules, heartbeat format
- **Blueprint §8** — GO / NO-GO / Tech Debt Protocol
- **Blueprint §15** — Security & Permissions (scope, locks, 4-level system)
- **Source:** `src/agents/worker.ts`
- **Rules:** `.claude/rules/worker-default.md`
- **Contract:** `.contracts/api-surface.md`
- **Types:** `src/core/types.ts` — `Task`, `TaskResult`, `TaskPlan`, `Heartbeat`, `LockInfo`, `TaskScope`
