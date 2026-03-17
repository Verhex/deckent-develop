# Deckent Programmatic API Reference

Deckent exposes a programmatic TypeScript API. Import from the main entry point or from individual submodule paths.

```ts
import { loadConfig, runSprint, readTask } from 'deckent';
// or granular imports:
import { loadConfig } from 'deckent/core';
import { runSprint } from 'deckent/orchestra';
import { readTask } from 'deckent/agents';
import { scanHeartbeats } from 'deckent/monitor';
```

---

## Table of Contents

1. [Core — Types](#1-core--types)
2. [Core — Constants](#2-core--constants)
3. [Core — Config](#3-core--config)
4. [Orchestra — Brain](#4-orchestra--brain)
5. [Orchestra — Tmux](#5-orchestra--tmux)
6. [Agents — Worker](#6-agents--worker)
7. [Monitor — Auditor](#7-monitor--auditor)
8. [MCP Server](#8-mcp-server)
9. [CLI Commands](#9-cli-commands)

---

## 1. Core — Types

**Source:** `src/core/types.ts`
**Exports:** `src/core/index.ts`

### Primitive Aliases

```ts
type ModelType  = 'opus' | 'sonnet' | 'haiku';
type TaskEffort = 'low' | 'normal' | 'high';
type TaskPriority = 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
type AgentRole    = 'brain' | 'auditor' | 'worker';
type PlanMode     = 'max_plan' | 'max5x_plan' | 'pro_plan' | 'api';
type SelfAssessment = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
type BoundaryViolationType =
  | 'file_outside_scope'
  | 'stale_heartbeat'
  | 'stale_lock'
  | 'circular_dependency'
  | 'usage_threshold_exceeded'
  | 'memory_budget_exceeded';
```

### Enums

#### `TaskStatus`
Task lifecycle states.

| Value | Description |
|---|---|
| `PENDING` | Task created, not yet claimed |
| `CLAIMED` | Worker has claimed the task |
| `EXECUTING` | Worker is actively coding |
| `TESTING` | Worker is running tests |
| `DOCUMENTING` | Worker is writing docs |
| `DONE` | Task completed successfully |
| `NO_GO` | Task failed evaluation |
| `PAUSED` | Task is paused |

#### `TaskEvaluation`
Brain's final verdict on a completed task.

| Value | Description |
|---|---|
| `DONE` | Fully accepted |
| `GO_WITH_TECH_DEBT` | Accepted with known tech debt |
| `NO_GO` | Rejected; fix task will be created |

#### `AgentStatus`
Real-time agent state written to heartbeat files.

Values: `IDLE`, `PLANNING`, `EXECUTING`, `EVALUATING`, `SCANNING`, `CODING`, `TESTING`, `DOCUMENTING`, `DONE`, `ERROR`, `PAUSED`

#### `AlertLevel`

Values: `INFO`, `WARNING`, `CRITICAL`

#### `SprintPhase`
Phases the brain moves through during a sprint.

Values: `DIRECTIVE`, `PLAN`, `SPAWN`, `EXECUTE`, `EVALUATE`, `FIX`, `RETRO`, `DECAY`, `TRANSITION`, `COMPLETE`

#### `SprintStatus`

Values: `PLANNING`, `ACTIVE`, `EVALUATING`, `FIXING`, `RETROSPECTIVE`, `COMPLETE`, `PAUSED`

#### `DebtPriority`

Values: `NORMAL`, `HIGH`, `CRITICAL`

---

### Interfaces

#### `TaskScope`
Defines the file-system boundary a worker may touch.

```ts
interface TaskScope {
  directories: string[];  // Permitted directories (e.g. "src/core/")
  filesRead:   string[];  // Files the worker may read (informational)
  filesWrite:  string[];  // Specific files the worker may write
}
```

#### `GoNoGoCriteria`
Acceptance criteria embedded in every task.

```ts
interface GoNoGoCriteria {
  goCriteria:         string;  // What constitutes success
  noGoCriteria:       string;  // What constitutes failure
  techDebtAcceptable: string;  // Acceptable tech debt conditions
}
```

#### `Task`
The central unit of work.

```ts
interface Task {
  id:              string;         // Format: "{sprintNumber}-{sequence}"
  title:           string;
  description:     string;
  model:           ModelType;
  effort:          TaskEffort;
  priority:        TaskPriority;
  reason:          string;         // Why this task exists
  scope:           TaskScope;
  dependencies:    string[];       // Task IDs that must complete first
  goNogo:          GoNoGoCriteria;
  status:          TaskStatus;
  sprintId?:       string;
  assignedWorker?: string;
  isPriorityFix?:  boolean;        // True for auto-generated fix tasks
  fixForTaskId?:   string;         // Points to the NO_GO task being fixed
  createdAt?:      string;         // ISO 8601
  updatedAt?:      string;         // ISO 8601
}
```

#### `TaskResult`
Written by the worker agent on task completion.

```ts
interface TaskResult {
  taskId:         string;
  workerId:       string;
  filesChanged:   string[];
  linesAdded:     number;
  linesRemoved:   number;
  testsPassed:    boolean;
  coverage:       number;          // Percentage, 0–100
  selfAssessment: SelfAssessment;
  notes:          string;
  completedAt?:   string;          // ISO 8601
  durationMs?:    number;
}
```

#### `TaskPlan`
Execution plan written before coding begins.

```ts
interface TaskPlan {
  taskId:               string;
  workerId:             string;
  filesToCreate:        string[];
  filesToModify:        string[];
  executionSteps:       string[];
  testStrategy:         string;
  documentationPlan:    string;
  estimatedDurationMin?: number;
}
```

#### `Sprint`

```ts
interface Sprint {
  id:          string;          // Format: "sprint-{number}"
  number:      number;
  status:      SprintStatus;
  phase:       SprintPhase;
  tasks:       Task[];
  workers:     string[];        // Worker IDs
  metrics?:    SprintMetrics;
  startedAt?:  string;          // ISO 8601
  completedAt?: string;         // ISO 8601
}
```

#### `SprintMetrics`

```ts
interface SprintMetrics {
  totalTasks:         number;
  completedTasks:     number;
  techDebtTasks:      number;
  noGoTasks:          number;
  durationMs:         number;
  coveragePercent:    number;
  noGoRate:           number;   // 0.0–1.0
  newDebtCount:       number;
  resolvedDebtCount:  number;
  totalOpenDebt:      number;
  boundaryViolations: number;
  crossAssignments:   number;
  contextLinesUsed:   number;
}
```

#### `DebtItem`

```ts
interface DebtItem {
  id:                  string;
  description:         string;
  originTaskId:        string;
  originSprintId:      string;
  priority:            DebtPriority;
  sprintsOpen:         number;    // Auto-incremented each sprint
  resolved:            boolean;
  resolvedInSprintId?: string;
  createdAt:           string;    // ISO 8601
}
```

#### `Heartbeat`
Written by workers every ~15 seconds to signal liveness.

```ts
interface Heartbeat {
  workerId:         string;
  taskId:           string;
  status:           AgentStatus;
  currentAction:    string;
  currentFile?:     string;
  timestamp:        string;       // ISO 8601
  filesChangedCount: number;
  sequence:         number;
}
```

#### `AgentInfo`
Snapshot of a running agent's state.

```ts
interface AgentInfo {
  id:            string;
  role:          AgentRole;
  status:        AgentStatus;
  model:         ModelType;
  tmuxWindow:    string;
  taskId?:       string;
  currentAction?: string;
  spawnedAt?:    string;
}
```

#### `Alert`

```ts
interface Alert {
  level:        AlertLevel;
  message:      string;
  source?:      string;
  timestamp:    string;
  acknowledged?: boolean;
}
```

#### `BoundaryViolation`

```ts
interface BoundaryViolation {
  type:      BoundaryViolationType;
  agentId:   string;
  detail:    string;
  timestamp: string;
}
```

#### `DashboardState`

```ts
interface DashboardState {
  sprint: {
    id:     string;
    number: number;
    phase:  SprintPhase;
    status: SprintStatus;
  };
  agents:   AgentInfo[];
  progress: { done: number; active: number; blocked: number; total: number };
  usage:    UsageMetrics;
  alerts:   Alert[];
  updatedAt: string;
}
```

#### `UsageMetrics`

```ts
interface UsageMetrics {
  fiveHourPercent: number;  // 0–100
  weeklyPercent:   number;  // 0–100
  measuredAt:      string;  // ISO 8601
}
```

#### `LockInfo`

```ts
interface LockInfo {
  filePath:      string;
  ownerWorkerId: string;
  acquiredAt:    string;   // ISO 8601
  taskId:        string;
}
```

#### `PlanModeConfig`

```ts
interface PlanModeConfig {
  max_workers:      number;
  brain_model:      ModelType;
  default_model:    ModelType;
  haiku_allowed:    boolean;
  usage_thresholds: { '5hr': number; weekly: number };  // 0.0–1.0
  budget_per_sprint?: number;  // USD, api mode only
  requires?:        string;    // Env var name, api mode only
}
```

#### `DeckentConfig`

```ts
interface DeckentConfig {
  mode:         PlanMode;
  modes:        Record<PlanMode, PlanModeConfig>;
  language?:    string;      // 'en' | 'tr'
  projectName?: string;
  version?:     string;
}
```

#### `ResolvedConfig`
Fully resolved config with all defaults applied.

```ts
interface ResolvedConfig {
  mode:             PlanMode;
  activeModeConfig: PlanModeConfig;
  modes:            Record<PlanMode, PlanModeConfig>;
  language:         string;
  projectName:      string;
  projectRoot:      string;   // Absolute path
  version:          string;
}
```

#### `DecayResult`

```ts
interface DecayResult {
  linesBefore:         number;
  linesAfter:          number;
  archivedSprints:     string[];
  removedDebtCount:    number;
  removedPatternCount: number;
}
```

#### `DoctorResult`

```ts
interface DoctorResult {
  ok: boolean;          // true only if all required checks pass
  checks: {
    name:     string;
    passed:   boolean;
    message:  string;
    required: boolean;
  }[];
}
```

#### `StartOptions`

```ts
interface StartOptions {
  autoApprove?: boolean;   // Pass --dangerously-skip-permissions to workers
  sandboxMode?: boolean;   // Reserved for Docker sandbox (not yet implemented)
}
```

---

## 2. Core — Constants

**Source:** `src/core/constants.ts`
**Exports:** `src/core/index.ts`

### Path Constants

```ts
const DECKENT_DIR     = '.deckent';
const BRAIN_DIR       = '.brain';
const TASKS_DIR       = '.tasks';
const LOCKS_DIR       = '.locks';
const DASHBOARD_FILE  = '.dashboard';

const PROJECT_CONFIG_PATH = '.deckent/config.json';
const GLOBAL_CONFIG_PATH  = '~/.deckent/config.json';  // resolved via homedir()
```

### Brain Memory Files (relative to `.brain/`)

```ts
const MEMORY_FILE    = 'MEMORY.md';
const DECISIONS_FILE = 'DECISIONS.md';
const DEBT_FILE      = 'DEBT.md';
const PATTERNS_FILE  = 'PATTERNS.md';
const RETRO_FILE     = 'RETRO.md';
const SPRINTS_DIR    = 'sprints';
const ARCHIVE_DIR    = 'archive';
```

### Timing

```ts
const AUDITOR_SCAN_INTERVAL_MS      = 30_000;   // 30 seconds
const HEARTBEAT_STALE_THRESHOLD_MS  = 120_000;  // 2 minutes
const HEARTBEAT_WRITE_INTERVAL_MS   = 15_000;   // 15 seconds
const LOCK_TIMEOUT_MS               = 30_000;   // 30 seconds
const LOCK_STALE_THRESHOLD_MS       = 300_000;  // 5 minutes
```

### Memory Limits

```ts
const MEMORY_MAX_LINES       = 100;
const PATTERNS_MAX_LINES     = 80;
const RETRO_MAX_LINES        = 60;
const SPRINT_LOG_MAX_LINES   = 50;
const BRAIN_TOTAL_LINE_BUDGET = 300;
const MEMORY_DECAY_SPRINTS   = 3;    // Unused entries decay after 3 sprints
const PATTERN_DECAY_SPRINTS  = 5;
```

### Debt Escalation

```ts
const DEBT_HIGH_PRIORITY_SPRINTS     = 2;  // Escalate to HIGH after 2 sprints open
const DEBT_CRITICAL_SPRINTS          = 3;  // Escalate to CRITICAL after 3 sprints open
```

### Defaults

```ts
const DEFAULT_LANGUAGE  = 'en';
const DEFAULT_MODE      = 'max_plan';
const DECKENT_VERSION   = '0.1.0';
const SUPPORTED_LANGUAGES = ['en', 'tr'];
```

### tmux Window Names

```ts
const TMUX_SESSION_NAME    = 'deckent';
const TMUX_BRAIN_WINDOW    = 'brain';
const TMUX_AUDITOR_WINDOW  = 'auditor';
const TMUX_DASHBOARD_WINDOW = 'dashboard';
const TMUX_WORKER_PREFIX   = 'w-';   // Worker windows: w-{taskId}
```

---

## 3. Core — Config

**Source:** `src/core/config.ts`
**Exports:** `src/core/index.ts`

### `loadConfig`

```ts
async function loadConfig(projectRoot?: string): Promise<ResolvedConfig>
```

Loads and merges global config (`~/.deckent/config.json`) and project config (`.deckent/config.json`), then validates the result.

**Parameters:**
- `projectRoot` — Project directory. Defaults to `process.cwd()`.

**Throws:** `ConfigValidationError` if the merged config is invalid, or if `api` mode is active but `ANTHROPIC_API_KEY` is not set.

**Example:**
```ts
import { loadConfig } from 'deckent';

const config = await loadConfig('/path/to/project');
console.log(config.mode);             // 'max_plan'
console.log(config.activeModeConfig.max_workers); // 8
```

---

### `validatePartialConfig`

```ts
function validatePartialConfig(partial: Partial<DeckentConfig>): void
```

Validates a partial config object by merging it with defaults before validation. Useful for validating user-supplied overrides before writing to disk.

**Parameters:**
- `partial` — Partial config to validate.

**Throws:** `ConfigValidationError` with an `errors: string[]` field listing all validation failures.

**Example:**
```ts
import { validatePartialConfig } from 'deckent';

validatePartialConfig({ mode: 'pro_plan', language: 'en' }); // OK
validatePartialConfig({ mode: 'invalid' as any });            // throws ConfigValidationError
```

---

### `getDefaultConfig`

```ts
function getDefaultConfig(): DeckentConfig
```

Returns a fresh copy of the factory default config (mode: `max_plan`, all mode configs at defaults).

---

### `getDefaultModes`

```ts
function getDefaultModes(): Record<PlanMode, PlanModeConfig>
```

Returns a deep clone of the default mode configuration map. Safe to mutate.

---

### `ConfigValidationError`

```ts
class ConfigValidationError extends Error {
  readonly errors: string[];
}
```

Thrown when config validation fails. The `errors` array contains one entry per violation.

---

## 4. Orchestra — Brain

**Source:** `src/orchestra/brain.ts`
**Exports:** `src/orchestra/index.ts`

### `runSprint`

```ts
async function runSprint(
  projectRoot: string,
  config: ResolvedConfig,
  opts?: { autoApprove?: boolean },
): Promise<Sprint>
```

Master orchestrator. Executes the full sprint lifecycle:
`PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP`

Each phase is wrapped in a try/catch so the sprint always reaches `COMPLETE`, even on partial failure.

**Parameters:**
- `projectRoot` — Absolute path to the project root.
- `config` — Resolved config (from `loadConfig`).
- `opts.autoApprove` — Pass `--dangerously-skip-permissions` to worker claude processes.

**Example:**
```ts
import { loadConfig, runSprint } from 'deckent';

const config = await loadConfig();
const sprint = await runSprint(process.cwd(), config, { autoApprove: true });
console.log(sprint.metrics?.noGoRate); // 0.0 if all tasks passed
```

---

### `readContext`

```ts
function readContext(projectRoot: string): BrainContext
```

Reads all brain files and the current task state into a single context object.

**Returns:** `BrainContext` with fields: `directives`, `memory`, `retro`, `debt`, `patterns`, `decisions`, `existingTasks`, `projectState`.

**Example:**
```ts
const ctx = readContext('/my/project');
console.log(ctx.debt.length); // number of open debt items
```

---

### `checkUsage`

```ts
function checkUsage(config: ResolvedConfig): UsageMetrics
```

Reads Claude API usage by running `claude -p /usage`. Returns safe defaults (50%/30%) if the command fails.

**Returns:** `UsageMetrics` with `fiveHourPercent`, `weeklyPercent`, and `measuredAt`.

---

### `adjustSprintSize`

```ts
function adjustSprintSize(
  config: ResolvedConfig,
  usage: UsageMetrics,
): SprintSizeRecommendation
```

Pure function. Compares usage against configured thresholds and returns a sprint size recommendation.

**Returns:** `SprintSizeRecommendation`:
```ts
interface SprintSizeRecommendation {
  size:            'full' | 'reduced' | 'minimal';
  maxWorkers:      number;
  modelConstraint: ModelType | null;  // null = no constraint
  reason:          string;
}
```

**Example:**
```ts
const usage = checkUsage(config);
const rec = adjustSprintSize(config, usage);
if (rec.size === 'minimal') {
  console.log('Usage critical — sprint will run with 1 worker');
}
```

---

### `planSprint`

```ts
function planSprint(
  projectRoot: string,
  config: ResolvedConfig,
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
): Sprint
```

Reads `DIRECTIVES.md`, creates `Task` objects, and writes `.tasks/task-{id}.json` files. Handles CRITICAL debt priority fixes by prepending fix tasks.

**Returns:** A `Sprint` in `PLANNING` status with all tasks populated.

---

### `evaluateResult`

```ts
function evaluateResult(result: TaskResult, task: Task): TaskEvaluation
```

Pure function. Evaluates a worker's result against go/no-go criteria.

**Rules:**
- `NO_GO` if `selfAssessment === 'NO_GO'` or `testsPassed === false`
- `GO_WITH_TECH_DEBT` if `coverage < 90`
- `DONE` otherwise

**Example:**
```ts
const evaluation = evaluateResult(result, task);
if (evaluation === TaskEvaluation.NO_GO) {
  console.log('Fix task will be auto-created');
}
```

---

### `runDecay`

```ts
function runDecay(
  projectRoot: string,
  sprintId: string,
  opts?: { force?: boolean },
): DecayResult
```

Compresses brain memory: removes resolved debt and patterns, archives old sprint logs, trims `MEMORY.md` and `RETRO.md` to their line budgets.

**Parameters:**
- `force` — Run decay even if the brain is under its line budget.

**Returns:** `DecayResult` with before/after line counts and removed item counts.

---

### `cleanup`

```ts
function cleanup(projectRoot: string, sprint: Sprint): void
```

Post-sprint cleanup: kills all tmux worker windows, releases all file locks, and removes `.hb` heartbeat files.

---

### `calculateMetrics`

```ts
function calculateMetrics(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  debt?: DebtItem[],
): SprintMetrics
```

Pure function. Computes all sprint metrics from evaluation results and task data.

---

### `escalateDebt`

```ts
function escalateDebt(projectRoot: string): void
```

Increments `sprintsOpen` on all unresolved debt items. Auto-escalates priority based on `DEBT_HIGH_PRIORITY_SPRINTS` and `DEBT_CRITICAL_SPRINTS` thresholds.

---

### `writeRetrospective`

```ts
function writeRetrospective(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  metrics: SprintMetrics,
): void
```

Writes `.brain/RETRO.md` (overwrite) and appends a summary to `.brain/MEMORY.md`.

---

### `writeSprintLog`

```ts
function writeSprintLog(
  projectRoot: string,
  sprint: Sprint,
  metrics: SprintMetrics,
): void
```

Writes `.brain/sprints/sprint-{id}.md` with the full sprint metrics and per-task summaries.

---

### `spawnWorkers`

```ts
function spawnWorkers(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: { autoApprove?: boolean },
): void
```

Ensures the tmux session exists, starts the auditor window, and creates one tmux window per task. Each window runs `claude` with the generated worker prompt.

---

### `waitForResults`

```ts
async function waitForResults(
  projectRoot: string,
  sprint: Sprint,
  timeoutMs?: number,
): Promise<TaskResult[]>
```

Polls `.tasks/task-{id}.result` files until all tasks complete or the timeout is reached. Missing results are synthesized as `NO_GO`.

**Parameters:**
- `timeoutMs` — Default: 30 minutes (1,800,000 ms).

---

### `createTask`

```ts
function createTask(params: CreateTaskParams, sequence: number): Task
```

Pure function. Creates a `Task` object with ID `{sprintNumber}-{sequence:03}`.

**Type `CreateTaskParams`:**
```ts
interface CreateTaskParams {
  title:         string;
  description:   string;
  model:         ModelType;
  effort:        TaskEffort;
  priority:      TaskPriority;
  reason:        string;
  scope:         TaskScope;
  dependencies:  string[];
  goNogo:        GoNoGoCriteria;
  sprintId:      string;
  isPriorityFix?: boolean;
  fixForTaskId?:  string;
}
```

---

### `parseStructuredDirectives`

```ts
function parseStructuredDirectives(content: string): ParsedDirectiveTask[]
```

Parses `DIRECTIVES.md` content that uses `## Task N:` or `## Görev N:` section headers into structured task objects.

**Type `ParsedDirectiveTask`:**
```ts
interface ParsedDirectiveTask {
  title:       string;
  description: string;
  scope:       TaskScope;
  testTarget?: string;
}
```

---

### `extractScopeFromDirective`

```ts
function extractScopeFromDirective(line: string): TaskScope
```

Pure function. Extracts `src/` and `tests/` directory paths and `.ts`/`.js` file paths from a single directive line.

---

### `BrainError`

```ts
class BrainError extends Error {
  readonly phase?: SprintPhase;
}
```

Thrown when a sprint phase fails unrecoverably. The `phase` field identifies which phase failed.

---

## 5. Orchestra — Tmux

**Source:** `src/orchestra/tmux.ts`
**Exports:** `src/orchestra/index.ts`

All tmux functions use `spawnSync('tmux', [...])` — safe against shell injection.

### `isSessionActive`

```ts
function isSessionActive(): boolean
```

Returns `true` if the `deckent` tmux session exists.

---

### `ensureSession`

```ts
function ensureSession(): void
```

Creates the `deckent` tmux session if it does not already exist. No-op if already active.

---

### `spawnWorker`

```ts
function spawnWorker(
  taskId: string,
  model: ModelType,
  prompt: string,
  projectDir: string,
  opts?: SpawnOptions,
): void
```

Creates a new tmux window named `w-{taskId}` inside the `deckent` session and sends the `claude` command.

**Type `SpawnOptions`:**
```ts
interface SpawnOptions {
  allowedTools?: string;   // Comma-separated list for --allowedTools
  autoApprove?:  boolean;  // Adds --dangerously-skip-permissions
}
```

**Example:**
```ts
spawnWorker('006-001', 'sonnet', 'Your task prompt...', '/project', {
  autoApprove: true,
});
```

---

### `killWorker`

```ts
function killWorker(taskId: string): void
```

Kills the tmux window `w-{taskId}`. Throws `TmuxError` if the window does not exist.

---

### `listWorkers`

```ts
function listWorkers(): string[]
```

Returns an array of active task IDs (window names with the `w-` prefix stripped). Returns `[]` if the session does not exist.

---

### `startAuditor`

```ts
function startAuditor(projectDir: string, opts?: SpawnOptions): void
```

Creates (or reuses) the `auditor` tmux window and starts the auditor claude process.

---

### `attach`

```ts
function attach(): void
```

Attaches the current terminal to the `deckent` tmux session (stdio inheritance).

---

### `destroy`

```ts
function destroy(): void
```

Kills the entire `deckent` tmux session. Silent no-op if the session does not exist.

---

### `sendKeys`

```ts
function sendKeys(target: string, keys: string): void
```

Sends a key sequence to a specific window within the `deckent` session.

**Parameters:**
- `target` — Window name (e.g. `'w-006-001'` or `'auditor'`).
- `keys` — Key string sent to `tmux send-keys` followed by `Enter`.

---

### `TmuxError`

```ts
class TmuxError extends Error {
  readonly command?: string;  // The failing tmux command string
}
```

---

## 6. Agents — Worker

**Source:** `src/agents/worker.ts`
**Exports:** `src/agents/index.ts`

### `readTask`

```ts
function readTask(projectRoot: string, taskId: string): Task
```

Reads `.tasks/task-{taskId}.json` and returns the parsed `Task`.

**Throws:** `Error` if the file does not exist or contains invalid JSON.

---

### `claimTask`

```ts
function claimTask(
  projectRoot: string,
  taskId: string,
  workerId: string,
): Task
```

Atomically claims a task: sets `status = CLAIMED` and `assignedWorker = workerId`, then writes back to disk.

**Throws:** `TaskClaimError` if the task is not `PENDING` or is already assigned.

**Example:**
```ts
import { claimTask } from 'deckent';

const task = claimTask('/project', '006-001', 'worker-abc');
console.log(task.assignedWorker); // 'worker-abc'
```

---

### `acquireLock`

```ts
function acquireLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
  taskId: string,
): LockInfo
```

Creates a lock file at `.locks/{filePath-as-lockname}.lock`. Idempotent if the same worker already holds the lock (returns existing `LockInfo`).

**Parameters:**
- `filePath` — Path to the file to lock (separators replaced with `__` in lock filename).

**Throws:** `LockError` if a different worker holds the lock.

**Example:**
```ts
const lock = acquireLock('/project', 'src/core/types.ts', 'worker-abc', '006-001');
```

---

### `releaseLock`

```ts
function releaseLock(
  projectRoot: string,
  filePath: string,
  workerId: string,
): void
```

Deletes the lock file for `filePath`. No-op if no lock exists.

**Throws:** `LockError` if the lock is held by a different worker.

---

### `releaseAllLocks`

```ts
function releaseAllLocks(projectRoot: string, workerId: string): number
```

Releases all lock files owned by `workerId`. Returns the count of locks released.

---

### `checkLock`

```ts
function checkLock(projectRoot: string, filePath: string): LockInfo | null
```

Returns the current `LockInfo` for `filePath`, or `null` if no lock exists or the lock file is corrupt.

---

### `createHeartbeat`

```ts
function createHeartbeat(
  workerId: string,
  taskId: string,
  status: AgentStatus,
  action: string,
  file?: string,
  sequence?: number,
): Heartbeat
```

Constructs a `Heartbeat` object with the current ISO timestamp. Does not write to disk.

---

### `writeHeartbeat`

```ts
function writeHeartbeat(projectRoot: string, heartbeat: Heartbeat): void
```

Writes the heartbeat to `.tasks/task-{taskId}.hb` (JSON format).

**Example:**
```ts
const hb = createHeartbeat('worker-abc', '006-001', AgentStatus.CODING, 'Writing types', 'src/core/types.ts', 1);
writeHeartbeat('/project', hb);
```

---

### `writeResult`

```ts
function writeResult(projectRoot: string, result: TaskResult): void
```

Writes the result to `.tasks/task-{taskId}.result` and updates the task status to `DONE` or `NO_GO` based on `result.selfAssessment`.

---

### `updateTaskStatus`

```ts
function updateTaskStatus(
  projectRoot: string,
  taskId: string,
  status: TaskStatus,
): Task
```

Read-modify-write: loads the task JSON, sets `status` and `updatedAt`, and writes back. Returns the updated `Task`.

---

### `isWithinScope`

```ts
function isWithinScope(filePath: string, scope: TaskScope): boolean
```

Returns `true` if `filePath` is within one of the scope's permitted directories or matches one of its `filesWrite` entries.

Path separators are normalized; trailing-slash prefix overlap is handled (e.g. `src/core-extra/` is **not** within `src/core/`).

**Example:**
```ts
const scope: TaskScope = { directories: ['src/core/'], filesRead: [], filesWrite: [] };
isWithinScope('src/core/types.ts', scope);      // true
isWithinScope('src/core-extra/foo.ts', scope);  // false
```

---

### Error Classes

```ts
class TaskClaimError extends Error {}

class LockError extends Error {
  readonly filePath: string;
}

class ScopeViolationError extends Error {
  readonly filePath: string;
  readonly scope: TaskScope;
}
```

---

## 7. Monitor — Auditor

**Source:** `src/monitor/auditor.ts`
**Exports:** `src/monitor/index.ts`

### `scanHeartbeats`

```ts
function scanHeartbeats(projectRoot: string): {
  heartbeats:  Heartbeat[];
  staleAgents: BoundaryViolation[];
  alerts:      Alert[];
}
```

Reads all `.tasks/*.hb` files and flags heartbeats older than `HEARTBEAT_STALE_THRESHOLD_MS` (120 s) as stale. Resilient to corrupt files (skips silently).

---

### `checkBoundaryViolations`

```ts
function checkBoundaryViolations(
  projectRoot: string,
  workerScopes: Map<string, TaskScope>,
): BoundaryViolation[]
```

Runs `git diff --stat` and cross-checks modified files against each worker's assigned scope. Files outside scope produce a `file_outside_scope` violation.

**Parameters:**
- `workerScopes` — Map of `workerId → TaskScope`. Build with `buildWorkerScopeMap`.

---

### `checkStaleLocks`

```ts
function checkStaleLocks(projectRoot: string): {
  locks:      LockInfo[];
  staleLocks: BoundaryViolation[];
  alerts:     Alert[];
}
```

Reads all `.locks/*.lock` files and flags locks held longer than `LOCK_STALE_THRESHOLD_MS` (300 s).

---

### `detectDeadlocks`

```ts
function detectDeadlocks(tasks: Task[]): BoundaryViolation[]
```

Uses Kahn's topological-sort algorithm to detect circular task dependencies. Returns a single `circular_dependency` violation listing all tasks in the cycle.

---

### `updateDashboard`

```ts
function updateDashboard(projectRoot: string, state: DashboardState): void
```

Writes the dashboard state to `.dashboard` (JSON format). The status CLI command reads this file.

**Example:**
```ts
updateDashboard('/project', {
  sprint: { id: 'sprint-1', number: 1, phase: SprintPhase.EXECUTE, status: SprintStatus.ACTIVE },
  agents: [],
  progress: { done: 2, active: 3, blocked: 0, total: 5 },
  usage: { fiveHourPercent: 40, weeklyPercent: 20, measuredAt: new Date().toISOString() },
  alerts: [],
  updatedAt: new Date().toISOString(),
});
```

---

### `detectPatterns`

```ts
function detectPatterns(
  projectRoot: string,
  violations: BoundaryViolation[],
  currentSprintId: string,
): void
```

Groups violations by type, updates or creates `PatternEntry` records in `.brain/PATTERNS.md`. Truncates the file if it exceeds `PATTERNS_MAX_LINES`.

---

### `buildWorkerScopeMap`

```ts
function buildWorkerScopeMap(projectRoot: string): Map<string, TaskScope>
```

Reads all `.tasks/task-*.json` files and returns a map of `assignedWorker → scope` for tasks with an assigned worker.

---

### `runScanCycle`

```ts
function runScanCycle(
  projectRoot: string,
  currentSprintId: string,
): {
  heartbeats: Heartbeat[];
  violations: BoundaryViolation[];
  alerts:     Alert[];
  locks:      LockInfo[];
}
```

Runs a complete scan: heartbeats + boundary violations + stale locks + deadlock detection + pattern detection. Resilient — returns empty arrays on any error.

---

### `startScanLoop`

```ts
function startScanLoop(
  projectRoot: string,
  currentSprintId: string,
  intervalMs?: number,
): ReturnType<typeof setInterval>
```

Starts an interval that calls `runScanCycle` repeatedly. Never throws.

**Parameters:**
- `intervalMs` — Default: `AUDITOR_SCAN_INTERVAL_MS` (30,000 ms).

**Returns:** The interval handle. Call `clearInterval` to stop.

---

### `createAlert`

```ts
function createAlert(level: AlertLevel, message: string, source?: string): Alert
```

Factory function for `Alert` objects. Stamps the current ISO timestamp automatically.

---

## 8. MCP Server

**Source:** `src/mcp/server.ts`

### `createServer`

```ts
function createServer(): McpServer
```

Creates and configures an MCP server named `'deckent'` (version from `DECKENT_VERSION`). Registers all 8 tools and 4 resources.

**Example:**
```ts
import { createServer } from 'deckent/mcp/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createServer();
await server.connect(new StdioServerTransport());
```

---

### Tools (8)

| Tool name | Description |
|---|---|
| `deckent_init` | Initialize `.deckent/` project structure, brain files, and MCP registration |
| `deckent_set_directives` | Set or replace the contents of `DIRECTIVES.md` |
| `deckent_plan` | Plan a sprint (read directives, write task files) without spawning workers |
| `deckent_start` | Run a full sprint lifecycle (plan → spawn → execute → evaluate → retro → cleanup) |
| `deckent_status` | Return the current dashboard state as JSON |
| `deckent_doctor` | Run all health checks (Node, git, tmux, Claude CLI, workspace, budget) |
| `deckent_retro` | Return the latest sprint retrospective (`RETRO.md`) |
| `deckent_history` | Return recent sprint log summaries |

#### `deckent_init` Input Schema
```ts
{
  projectName: string;
  mode?:     'max_plan' | 'max5x_plan' | 'pro_plan' | 'api';  // default: 'max_plan'
  language?: 'en' | 'tr';                                       // default: 'en'
}
```

#### `deckent_start` Input Schema
```ts
{
  autoApprove?: boolean;  // default: false
}
```

---

### Resources (4)

| Resource URI | Description |
|---|---|
| `deckent://dashboard` | Current `DashboardState` JSON |
| `deckent://directives` | Current contents of `DIRECTIVES.md` |
| `deckent://memory` | Current contents of `.brain/MEMORY.md` |
| `deckent://debt` | Current contents of `.brain/DEBT.md` |

---

## 9. CLI Commands

Run via `deckent <command>` (globally installed) or `npx deckent <command>`.

| Command | Description | Key Options |
|---|---|---|
| `init` | Initialize a new Deckent project (interactive wizard) | — |
| `start` | Start a new sprint (full lifecycle) | `--auto-approve`, `--sandbox-mode`, `--dry-run`, `--force` |
| `plan` | Plan a sprint without executing it | — |
| `status` | Show the current sprint dashboard | `--watch` (auto-refresh 2s), `--json` |
| `doctor` | Check system dependencies and health | — |
| `retro` | Show the latest sprint retrospective | — |
| `history` | Show recent sprint history | — |
| `spawn <taskId>` | Manually spawn a worker for a specific task | — |
| `attach` | Attach terminal to the tmux orchestra session | — |
| `kill <taskId>` | Kill a running worker window | — |
| `cleanup` | Clean up locks and heartbeats after a sprint | `--decay` (force memory decay) |
| `config` | Show project configuration | — |
| `config set <key> <value>` | Set a configuration value | — |
| `usage` | Show Claude API usage metrics | — |
| `upgrade` | Self-update deckent to the latest version | — |
| `plugin` | Manage plugins | — |
| `plugin install <name>` | Install a plugin | — |
| `plugin list` | List installed plugins | — |
| `onboard` | Run the first-time onboarding wizard | — |

### Examples

```sh
# Initialize a project
deckent init

# Run a sprint with auto-approved workers
deckent start --auto-approve

# Dry-run: plan tasks but don't spawn workers
deckent start --dry-run

# Watch the live dashboard
deckent status --watch

# Get raw JSON dashboard
deckent status --json

# Run health checks
deckent doctor

# Clean up and force memory decay
deckent cleanup --decay
```
