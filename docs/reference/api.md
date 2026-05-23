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
4. [Core — Analyzer](#4-core--analyzer)
5. [Orchestra — Brain](#5-orchestra--brain)
6. [Orchestra — Planner](#6-orchestra--planner)
7. [Orchestra — Tmux](#7-orchestra--tmux)
8. [Agents — Worker](#8-agents--worker)
9. [Monitor — Auditor](#9-monitor--auditor)
10. [MCP Server](#10-mcp-server)
11. [HTTP API](#11-http-api)
12. [CLI Commands](#12-cli-commands)

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
type PlanMode     = 'performance' | 'balanced' | 'economic' | 'api';
// Legacy aliases (still accepted): max_plan → performance, max5x_plan → balanced, pro_plan → economic
type SelfAssessment = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
type BoundaryViolationType =
  | 'file_outside_scope'
  | 'stale_heartbeat'
  | 'stale_lock'
  | 'circular_dependency'
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
  id:            string;          // Format: "sprint-{number}"
  number:        number;
  status:        SprintStatus;
  phase:         SprintPhase;
  tasks:         Task[];
  workers:       string[];        // Worker IDs
  metrics?:      SprintMetrics;
  reasoning?:    string;          // AI planner reasoning (when brain_planning = 'ai')
  planningMode?: BrainPlanningMode;  // Which planning mode was used
  startedAt?:    string;          // ISO 8601
  completedAt?:  string;          // ISO 8601
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
  agents:           AgentInfo[];
  progress:         { done: number; active: number; blocked: number; total: number };
  alerts:           Alert[];
  auditorLastScan?: string;    // ISO 8601 — when last scan cycle completed
  violations?:      number;    // Total boundary violation count
  updatedAt:        string;
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

#### `BrainPlanningMode`

```ts
type BrainPlanningMode = 'ai' | 'structured' | 'auto';
```

Brain planning strategy: `'ai'` uses AI planner with Zod validation, `'structured'` parses DIRECTIVES.md `## Task N:` blocks, `'auto'` (default) tries AI first then falls back to structured.

#### `PlanModeConfig`

```ts
interface PlanModeConfig {
  max_workers:      number;
  brain_model:      ModelType;
  default_model:    ModelType;
  haiku_allowed:    boolean;
  budget_per_sprint?: number;  // USD, api mode only
  requires?:        string;    // Env var name, api mode only
  brain_planning?:  BrainPlanningMode;  // Default: 'auto'
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

### Brain Memory V2 — DB-First (relative to `.brain/`)

Memory V2 stores all brain knowledge in a SQLite database (`memory.db`) as the
single source of truth. Markdown files under `.brain/exports/` are auto-generated
views regenerated after every sprint (see [Memory V2 Export Pipeline](#memory-v2-export-pipeline)).

```ts
// Primary storage — single source of truth (Memory V2 DB-first)
const MEMORY_DB        = 'memory.db';                  // SQLite FTS5

// Auto-generated views (read-only snapshots of the DB; auto-generated)
const EXPORTS_DIR      = 'exports';                    // .brain/exports/
const SUMMARY_EXPORT   = 'exports/summary.md';         // @-loaded context summary
const DECISIONS_EXPORT = 'exports/decisions.md';       // ADR list
const MEMORY_EXPORT    = 'exports/memory.md';          // sprint learnings
const DEBT_EXPORT      = 'exports/debt.md';            // technical debt table

// Legacy file (still file-based, NOT in DB)
const PATTERNS_FILE    = 'PATTERNS.md';
const SPRINTS_DIR      = 'sprints';
const ARCHIVE_DIR      = 'archive';
```

> **Memory V2 migration:** original `MEMORY.md`, `DECISIONS.md`, `DEBT.md` files
> were promoted into the DB and archived under `.brain/archive/pre-v2/`. Generated
> snapshots now live at `.brain/exports/memory.md` and `.brain/exports/debt.md` —
> regenerate them via `deckent memory export`.

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
const MEMORY_MAX_LINES       = 200;
const PATTERNS_MAX_LINES     = 80;
const RETRO_MAX_LINES        = 100;
const SPRINT_LOG_MAX_LINES   = 80;
const BRAIN_TOTAL_LINE_BUDGET = 600;
const MEMORY_DECAY_SPRINTS   = 5;    // Unused entries decay after 5 sprints
const PATTERN_DECAY_SPRINTS  = 8;
```

### Debt Escalation

```ts
const DEBT_HIGH_PRIORITY_SPRINTS     = 2;  // Escalate to HIGH after 2 sprints open
const DEBT_CRITICAL_SPRINTS          = 3;  // Escalate to CRITICAL after 3 sprints open
```

### Defaults

```ts
const DEFAULT_LANGUAGE  = 'en';
const DEFAULT_MODE      = 'performance';  // Legacy alias: 'max_plan'
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

## 2.b Core — Memory V2 (DB-First)

**Source:** `src/core/memory-store.ts`, `src/core/memory-query.ts`,
`src/core/memory-types.ts`, `src/core/memory-export.ts`
**Storage:** SQLite (`better-sqlite3`) — `memory.db` is the single source of
truth for all brain knowledge (ADR, memory, sprint, debt, pattern, retro, identity).

### MemoryStore — Type-Specific Queries

`MemoryStore` exposes a typed CRUD + query surface over `memory.db`. Common
patterns:

```ts
import { MemoryStore } from 'deckent/core/memory-store';

const store = new MemoryStore('.brain/memory.db');

// Type-specific list (Memory V2 native — never parse .md files)
const adrs        = store.getByType('adr');         // type='adr'
const learnings   = store.getByType('memory');      // type='memory'
const debtItems   = store.getByType('debt');        // type='debt'
const patterns    = store.getByType('pattern');     // type='pattern'

// Insert / upsert
store.insert({ type: 'memory', sprint_id: 'sprint-190', title: '...', body: '...' });
store.upsert({ type: 'retro',  sprint_id: 'sprint-190', body: '...' });
```

### `searchMemory` — FTS5 Full-Text Search

`searchMemory` is the Memory V2 query entry point. It hits the FTS5 virtual
table with a dual-layer Turkish-normalize index (original + `turkishNormalize`)
so TR / EN / DE queries all reach %100 recall.

```ts
import { searchMemory } from 'deckent/core/memory-query';

const results = searchMemory(store, {
  text: 'docker heartbeat',               // FTS5 query
  type: ['adr', 'memory'],                // filter by entry type
  status: ['accepted'],                   // filter by status
  sprint_range: { min: 135 },             // filter by sprint number
  tags_contain: ['security'],             // entries must have ALL tags
  limit: 5,                               // max results
});
```

### Memory V2 Export Pipeline

Markdown files under `.brain/exports/` are auto-generated read-only snapshots of
`memory.db`. They are regenerated on every sprint finalize and can also be
rebuilt manually:

| Export path | Source query |
|---|---|
| `.brain/exports/summary.md` | aggregated context view (loaded via `@` references) |
| `.brain/exports/decisions.md` | `store.getByType('adr')` |
| `.brain/exports/memory.md` | `store.getByType('memory')` |
| `.brain/exports/debt.md` | `store.getByType('debt')` |

```bash
# Regenerate all .brain/exports/*.md snapshots from the DB
deckent memory export
```

> The legacy flat-file mirrors of memory / debt / decisions under `.brain/` have
> been retired — they are no longer read by any runtime code. Existing copies
> are archived under `.brain/archive/pre-v2/`.

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
console.log(config.mode);             // 'performance'
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

validatePartialConfig({ mode: 'economic', language: 'en' }); // OK
validatePartialConfig({ mode: 'invalid' as any });            // throws ConfigValidationError
```

---

### `getDefaultConfig`

```ts
function getDefaultConfig(): DeckentConfig
```

Returns a fresh copy of the factory default config (mode: `performance`, all mode configs at defaults).

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

## 4. Core — Analyzer

**Source:** `src/core/analyzer.ts`
**Exports:** `src/core/index.ts`

### `analyzeProject`

```ts
function analyzeProject(root: string): ProjectAnalysis
```

Analyzes a project directory and returns detected stack, size classification, and methodology recommendation.

**Returns:** `ProjectAnalysis`:
```ts
interface ProjectAnalysis {
  framework:      string | null;   // 'react' | 'next' | 'express' | 'nestjs' | 'vue' | 'angular' | 'svelte' | null
  language:       string;          // 'typescript' | 'javascript' | 'python' | 'rust' | 'mixed'
  testFramework:  string | null;   // 'vitest' | 'jest' | 'mocha' | 'pytest' | null
  buildTool:      string | null;   // 'tsc' | 'vite' | 'webpack' | 'esbuild' | 'turbo' | null
  ci:             string | null;   // 'github-actions' | 'gitlab-ci' | 'circleci' | null
  size:           ProjectSize;
  methodology:    MethodologyRecommendation;
}

interface ProjectSize {
  files:          number;
  lines:          number;
  classification: 'small' | 'medium' | 'large' | 'enterprise';
}

interface MethodologyRecommendation {
  maxWorkers:     number;
  defaultModel:   ModelType;
  brainModel:     ModelType;
  reasoning:      string;
}
```

---

## 5. Orchestra — Brain

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

### `planSprint`

```ts
function planSprint(
  projectRoot: string,
  config: ResolvedConfig,
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  options?: { mode?: BrainPlanningMode; asDraft?: boolean },
): Sprint
```

Reads `DIRECTIVES.md`, creates `Task` objects, and writes `.tasks/task-{id}.json` files. Handles CRITICAL debt priority fixes by prepending fix tasks.

**Parameters:**
- `options.mode` — Planning mode override (`'ai'`, `'structured'`, `'auto'`). Default from config.
- `options.asDraft` — If `true`, tasks are created in `DRAFT` status (requires `confirmDraftTasks` before spawning).

**Returns:** A `Sprint` in `PLANNING` status with all tasks populated.

---

### `confirmDraftTasks`

```ts
function confirmDraftTasks(projectRoot: string, sprint: Sprint): void
```

Transitions all DRAFT tasks in a sprint to PENDING status. Called after operator confirms the sprint plan when `asDraft: true` was used.

---

### `resolveDebt`

```ts
function resolveDebt(
  projectRoot: string,
  debtId: string,
  resolvedInSprintId: string,
): boolean
```

Marks a debt item as resolved. Returns `true` if the debt was found and updated, `false` otherwise.

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

Writes the `retro` entry into `.brain/memory.db` (upsert) and triggers a refresh
of `.brain/exports/memory.md` (auto-generated snapshot of `type='memory'` entries).

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

Ensures the tmux session exists and creates one tmux window per task. Each window runs `claude` with the generated worker prompt.

**Note:** As of Sprint 14, `spawnWorkers` no longer calls `startAuditor()`. The auditor scan loop runs in-process within `runSprint`. The worker prompt (via `buildWorkerPrompt`) includes instructions for creating and updating `.tasks/task-{id}.hb` heartbeat files.

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

## 6. Orchestra — Planner

**Source:** `src/orchestra/planner.ts`
**Exports:** `src/orchestra/index.ts`

Planner imports ONLY from `core/` (types, constants) — never from brain.ts (ADR-008).

### `buildPlanPrompt`

```ts
function buildPlanPrompt(
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  projectName: string,
): string
```

Constructs the AI prompt sent to the LLM for task planning. Includes context from directives, memory, debt, patterns, and the sprint size recommendation.

---

### `parsePlannerResponse`

```ts
function parsePlannerResponse(raw: string): PlannerResult | null
```

Parses and validates a raw AI response string into a `PlannerResult` using Zod schemas. Returns `null` if the response is invalid or cannot be parsed.

**Type `PlannerResult`:**
```ts
interface PlannerResult {
  tasks: PlannerTask[];
  reasoning: string;
}

interface PlannerTask {
  title:       string;
  description: string;
  model:       ModelType;
  effort:      TaskEffort;
  priority:    TaskPriority;
  reason:      string;
  scope:       TaskScope;
  dependencies: string[];
  goNogo:      GoNoGoCriteria;
}
```

---

### `callBrainPlanner`

```ts
function callBrainPlanner(
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  model: ModelType,
  projectName: string,
): PlannerResult | null
```

Spawns `claude` CLI with the plan prompt, parses the response, and returns a validated `PlannerResult`. Returns `null` on any failure (timeout, invalid response, etc.).

**Parameters:**
- `model` — Which model to use for planning (typically `opus` or `sonnet`).

---

## 7. Orchestra — Tmux

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

## 8. Agents — Worker

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

## 9. Monitor — Auditor

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
  onScanComplete?: (result: ScanResult) => void,
): ReturnType<typeof setInterval>
```

Starts an interval that calls `runScanCycle` repeatedly. Never throws. Called by Brain in Phase 2.5 of `runSprint`.

**Parameters:**
- `intervalMs` — Default: `AUDITOR_SCAN_INTERVAL_MS` (30,000 ms).
- `onScanComplete` — Optional callback invoked after each scan cycle. Errors in the callback do not kill the loop.

**Returns:** The interval handle. Call `clearInterval` to stop (Brain does this in Phase 3.5).

---

### `writeScanToDashboard`

```ts
function writeScanToDashboard(
  projectRoot: string,
  sprintInfo: { id: string; number: number; phase: SprintPhase; status: SprintStatus },
  scanResult: ScanResult,
): void
```

Merges scan results into the existing dashboard state. Reads the current `.dashboard` file, merges new alerts (keeps last 50), updates agent statuses from heartbeats, and overwrites. Used as the `onScanComplete` callback in `startScanLoop`.

---

### `createAlert`

```ts
function createAlert(level: AlertLevel, message: string, source?: string): Alert
```

Factory function for `Alert` objects. Stamps the current ISO timestamp automatically.

---

## 10. MCP Server

**Source:** `src/mcp/server.ts`

### `createServer`

```ts
function createServer(): McpServer
```

Creates and configures an MCP server named `'deckent'` (version from `DECKENT_VERSION`). Registers all 19 tools and 8 resources.

**Example:**
```ts
import { createServer } from 'deckent/mcp/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createServer();
await server.connect(new StdioServerTransport());
```

---

### Tools (21)

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
| `deckent_analyze_project` | Analyze project stack, size, and methodology recommendation |
| `deckent_sync` | Sync adapter files (CLAUDE.md, AGENTS.md) with @DECKENT.md reference |
| `deckent_config` | Read or update project configuration |
| `deckent_review` | Evaluate sprint results: GO / NO_GO / GO_WITH_TECH_DEBT |
| `deckent_run` | Run a single task in the background |
| `deckent_kill` | Kill active sprint or specific workers |
| `deckent_cleanup` | Archive task files, release locks, close sessions |
| `deckent_help` | Show runtime capabilities, project status, and usage guide |
| `deckent_agent_list` | List registered agents (built-in and temp) |
| `deckent_skill_list` | List registered skills (manifest and AST sandbox info) |
| `deckent_checkpoint` | Approve or reject human checkpoints |
| `deckent_docs` | Manage user-defined documents in sprint lifecycle |
| `deckent_explain` | Explain sprint history and results |

#### `deckent_plan` Input Schema
```ts
{
  dryRun?: boolean;  // default: false
  mode?:   'ai' | 'structured' | 'auto';  // default: from config (brain_planning)
}
```

#### `deckent_init` Input Schema
```ts
{
  projectName: string;
  mode?:     'performance' | 'balanced' | 'economic' | 'api';  // default: 'performance'
  // Legacy aliases: max_plan → performance, max5x_plan → balanced, pro_plan → economic
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

### Resources (8)

Resources provide read-only context that MCP hosts can inject into the AI's context window.

| Resource URI | MIME Type | Description |
|---|---|---|
| `deckent://dashboard` | application/json | Current `DashboardState` with sprint progress, agents, alerts |
| `deckent://directives` | text/markdown | Current contents of `DIRECTIVES.md` |
| `deckent://memory` | text/markdown | Auto-generated snapshot of `type='memory'` entries from `memory.db`, served as `.brain/exports/memory.md` (Memory V2) |
| `deckent://debt` | text/markdown | Auto-generated snapshot of `type='debt'` entries from `memory.db`, served as `.brain/exports/debt.md` (Memory V2) |
| `deckent://config` | application/json | Current project config from `.deckent/config.json` |
| `deckent://retro` | text/markdown | Latest sprint retrospective report |
| `deckent://tasks` | application/json | Current sprint task list and statuses |
| `deckent://agents` | application/json | Registered agent pool, stats, usage rates |

### MCP Registration

Register the Deckent MCP server with Claude Code:

```bash
claude mcp add deckent -- npx deckent-mcp
```

Or let `deckent init` handle registration automatically. The MCP server is registered in `.claude/settings.json`:

```json
{
  "mcpServers": {
    "deckent": {
      "command": "deckent-mcp",
      "args": []
    }
  }
}
```

### Authentication

No authentication is required for the MCP server when running locally. It is intended for local development use only. The HTTP API supports optional Bearer token authentication for POST endpoints — see [Section 11](#11-http-api) for details.

---

## 11. HTTP API

**Source:** `src/api/server.ts`, `src/api/watcher.ts`

Start the server with `deckent serve` (API only) or `deckent web` (API + web dashboard). Default port: **3100**. The server binds to `127.0.0.1` (localhost only) and is intended for local development use.

---

### Authentication

POST endpoints are protected by an optional Bearer token. GET endpoints (including `/api/events`) do **not** require authentication.

**Enabling auth:** Set the token via environment variable or project config:

```bash
# Environment variable (takes precedence)
export DECKENT_API_TOKEN=your-secret-token

# Or in .deckent/config.json
{ "api_token": "your-secret-token" }
```

If no token is configured, auth is disabled and a warning is printed to stderr:

```
[deckent:warn] API server running without authentication. Set DECKENT_API_TOKEN or config.api_token to enable auth.
```

**Request header for protected routes:**

```
Authorization: Bearer <token>
```

**Auth error response (401):**

```json
{ "error": "Unauthorized — provide Authorization: Bearer <token>" }
```

Token comparison uses SHA-256 + `timingSafeEqual` to prevent timing side-channel attacks. Tokens with incorrect scheme (not `Bearer`) are rejected.

---

### `createHttpServer`

```ts
function createHttpServer(projectRoot: string, opts?: HttpServerOptions): HttpApi

interface HttpServerOptions {
  port?: number;       // Default: 3100
  staticDir?: string;  // Serve static files from this directory (deckent web)
  apiToken?: string;   // Bearer token for POST endpoints
  host?: string;       // Bind address. Default: '127.0.0.1'
}

interface HttpApi {
  server: Server;
  close(): Promise<void>;
}
```

Creates an HTTP server with all API routes and optional static file serving for the web dashboard. Returns an object with the raw Node.js `Server` and a `close()` method that shuts down the server and terminates all active SSE connections.

---

### CORS

All responses include `Access-Control-Allow-Origin` restricted to `http://localhost:*` and `http://127.0.0.1:*`. Cross-origin requests from external hosts are blocked. Preflight (`OPTIONS`) requests are handled automatically.

---

### Error Response Format

All error responses use HTTP status codes and return JSON:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| `400` | Bad request — invalid JSON body or failed schema validation |
| `401` | Unauthorized — missing or invalid Bearer token on a POST route |
| `403` | Forbidden — path traversal attempt on static file serving |
| `404` | Not found — resource does not exist (no active sprint, missing file, etc.) |
| `405` | Method not allowed — HTTP method not supported for this route |
| `409` | Conflict — sprint already running when `POST /api/start` is called |
| `500` | Internal server error — unexpected failure |

---

### GET Endpoints

#### `GET /api/status`

Returns the current dashboard state from the `.dashboard` file.

**Authentication:** Not required.

**Response `200`:**

```json
{
  "sprint": {
    "id": "sprint-037",
    "number": 37,
    "phase": "EXECUTE",
    "status": "ACTIVE"
  },
  "agents": [...],
  "alerts": [...],
  "metrics": { ... }
}
```

**Error `404`:** `{ "error": "No active sprint" }` — returned when no `.dashboard` file exists.

```bash
curl http://localhost:3100/api/status
```

---

#### `GET /api/sprint`

Returns the latest sprint log parsed from `.brain/sprints/sprint-NNN.md`.

**Authentication:** Not required.

**Response `200`:**

```json
{
  "id": "sprint-037",
  "metrics": {
    "tasks": "11",
    "completed": "11",
    "noGoRate": "0%",
    "coverage": "92%",
    "duration": "47m"
  },
  "tasks": [
    "001 Extract sprint-controller.ts — DONE",
    "002 Extract result-evaluator.ts — DONE"
  ]
}
```

**Error `404`:** `{ "error": "No sprint logs found" }` — returned when no sprint log files exist.

```bash
curl http://localhost:3100/api/sprint
```

---

#### `GET /api/history`

Returns all sprint logs as an array, sorted oldest-first.

**Authentication:** Not required.

**Response `200`:** Array of sprint log objects (same shape as `/api/sprint` metrics, plus `id` field). Returns `[]` if no sprint logs exist.

```bash
curl http://localhost:3100/api/history
```

---

#### `GET /api/config`

Returns the project configuration from `.deckent/config.json`.

**Authentication:** Not required.

**Response `200`:**

```json
{
  "mode": "performance",
  "language": "en",
  "brain_planning": "ai",
  "performance": { "max_workers": 8, "model": "opus" },
  "economic": { "max_workers": 4, "model": "sonnet" }
}
```

**Error `404`:** `{ "error": "Config not found" }` — returned when `.deckent/config.json` does not exist.

```bash
curl http://localhost:3100/api/config
```

---

#### `GET /api/doctor`

Runs system health checks and returns results.

**Authentication:** Not required.

**Response `200`:**

```json
{
  "ok": true,
  "checks": [
    { "name": "tmux", "passed": true, "message": "tmux 3.3a found", "required": true },
    { "name": "claude", "passed": true, "message": "claude CLI found", "required": true },
    { "name": "node", "passed": true, "message": "Node.js v24.x found", "required": true }
  ]
}
```

`ok` is `true` only when all checks with `required: true` pass.

```bash
curl http://localhost:3100/api/doctor
```

---

#### `GET /api/memory`

Returns the content of the Memory V2 export at `.brain/exports/memory.md` as a
JSON-wrapped string. The export is auto-generated from `memory.db` (single source
of truth — see [Memory V2 Export Pipeline](#memory-v2-export-pipeline)). To refresh
the snapshot programmatically use `deckent memory export` or call the underlying
exporter (`exports/memory.md` is rewritten after every sprint finalize).

**Authentication:** Not required.

**Response `200`:**

```json
{ "content": "## Sprint 036 Learnings\n- brain.ts split: 1312 → 58 lines\n..." }
```

**Error `404`:** `{ "error": "Memory export file not found — run \"deckent memory export\"" }`.

```bash
curl http://localhost:3100/api/memory
```

---

#### `GET /api/debt`

Returns the content of the Memory V2 export at `.brain/exports/debt.md` as a
JSON-wrapped string. The export is auto-generated from `memory.db` (single source
of truth — see [Memory V2 Export Pipeline](#memory-v2-export-pipeline)). To refresh
the snapshot programmatically use `deckent memory export`.

**Authentication:** Not required.

**Response `200`:**

```json
{ "content": "| ID | Description | Priority | Sprint |\n|---|---|---|---|\n| D-001 | ... |" }
```

**Error `404`:** `{ "error": "Debt export file not found — run \"deckent memory export\"" }`.

```bash
curl http://localhost:3100/api/debt
```

---

#### `GET /api/job/:jobId`

Returns the status of an async sprint job started via `POST /api/start`.

**Authentication:** Not required.

**Path parameter:** `jobId` — the job ID returned by `POST /api/start` (format: `job-<timestamp>`).

**Response `200`:**

```json
{
  "id": "job-1710768000000",
  "status": "running"
}
```

```json
{
  "id": "job-1710768000000",
  "status": "completed",
  "result": { ... }
}
```

```json
{
  "id": "job-1710768000000",
  "status": "failed",
  "error": "Sprint failed: no tasks found in DIRECTIVES.md"
}
```

`status` values: `"running"` | `"completed"` | `"failed"`

**Error `404`:** `{ "error": "Job not found" }` — returned when the job ID does not match the current active job.

```bash
curl http://localhost:3100/api/job/job-1710768000000
```

---

#### `GET /api/worker/:taskId/log`

Returns the task JSON and terminal log output for a specific worker.

**Authentication:** Not required.

**Path parameter:** `taskId` — task identifier (e.g. `001-001`).

**Response `200`:**

```json
{
  "taskId": "001-001",
  "log": "Worker started...\ntsc --noEmit passed\nvitest run: 42 tests passed",
  "task": {
    "id": "001-001",
    "title": "Extract sprint-controller.ts",
    "status": "DONE",
    "model": "opus",
    "effort": "high"
  }
}
```

`log` may be `null` if no log file exists yet. `task` is the parsed `.tasks/task-{taskId}.json`.

**Error `400`:** `{ "error": "Missing taskId" }`.

**Error `404`:** `{ "error": "Task not found" }` — task JSON file does not exist.

```bash
curl http://localhost:3100/api/worker/001-001/log
```

---

#### `GET /api/events`

Opens a Server-Sent Events (SSE) stream. The server pushes a `data:` line containing the full dashboard state as JSON whenever the `.dashboard` file changes. Changes are debounced at 500ms.

**Authentication:** Not required.

**Response headers:**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event format:**

Each event is a bare `data:` line (no named event type) followed by a blank line:

```
data: {"sprint":{"id":"sprint-037","number":37,"phase":"EXECUTE","status":"ACTIVE"},...}

data: {"sprint":{"id":"sprint-037","number":37,"phase":"EVALUATE","status":"EVALUATING"},...}
```

The watcher is initialized lazily on the first SSE client connection. When a client connects, any existing dashboard state is sent immediately. When the client disconnects, it is removed from the broadcast set.

**Connection setup (JavaScript):**

```js
const es = new EventSource('http://localhost:3100/api/events');
es.onmessage = (event) => {
  const state = JSON.parse(event.data);
  console.log(state.sprint.phase);
};
es.onerror = () => console.error('SSE connection lost');
```

```bash
# Stream events (Ctrl-C to stop)
curl -N http://localhost:3100/api/events
```

---

### POST Endpoints

All POST endpoints require `Content-Type: application/json`. If an `api_token` is configured, all POST endpoints also require `Authorization: Bearer <token>`.

---

#### `POST /api/start`

Starts a sprint asynchronously. Returns a `jobId` immediately (HTTP 202). Poll `GET /api/job/:jobId` to track progress.

**Authentication:** Required if `api_token` is configured.

**Request body:**

```json
{ "autoApprove": true }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `autoApprove` | `boolean` | No | Pass `--dangerously-skip-permissions` to workers |

**Response `202`:**

```json
{ "jobId": "job-1710768000000", "status": "started" }
```

**Error `400`:** Body failed schema validation.

**Error `409`:** `{ "error": "Sprint already running" }` — a job with `status: "running"` already exists.

```bash
# Start with manual approval (default)
curl -X POST http://localhost:3100/api/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{}'

# Start with auto-approve
curl -X POST http://localhost:3100/api/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"autoApprove": true}'
```

---

#### `POST /api/plan`

Generates a sprint plan from `DIRECTIVES.md` and returns the task list synchronously. Does **not** spawn workers.

**Authentication:** Required if `api_token` is configured.

**Request body:**

```json
{ "mode": "ai" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mode` | `"ai" \| "structured" \| "auto"` | No | Planning mode override. Defaults to the project config value. |

**Response `200`:** The generated sprint plan object (array of task drafts with id, title, model, effort, scope, go/no-go criteria).

**Error `400`:** Body failed schema validation (e.g. `mode` value not in allowed enum).

**Error `500`:** Planning failed (e.g. AI planner returned invalid output).

```bash
curl -X POST http://localhost:3100/api/plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"mode": "ai"}'
```

---

#### `POST /api/kill/:workerId`

Kills a running worker tmux window by worker ID.

**Authentication:** Required if `api_token` is configured.

**Path parameter:** `workerId` — must match `[a-zA-Z0-9-]+`.

**Response `200`:**

```json
{ "success": true }
```

**Error `400`:** Missing or invalid `workerId` format.

**Error `500`:** Kill command failed.

```bash
curl -X POST http://localhost:3100/api/kill/001-002 \
  -H "Authorization: Bearer your-secret-token"
```

---

#### `POST /api/set-directives`

Overwrites `DIRECTIVES.md` with the provided content. Also returns a count of `## Task` blocks found in the content.

**Authentication:** Required if `api_token` is configured.

**Request body:**

```json
{ "content": "# DIRECTIVES — Sprint 038\n\n## Task 1: Fix login bug\n..." }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | `string` | Yes | Full file content. Must be non-empty. |

**Response `200`:**

```json
{ "success": true, "taskCount": 5 }
```

`taskCount` is the number of `## Task` headings found (lines matching `^## Task`).

**Error `400`:** `{ "error": "Missing content field" }` — `content` is missing or empty.

**Error `500`:** File write failed.

```bash
curl -X POST http://localhost:3100/api/set-directives \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"content": "# DIRECTIVES — Sprint 038\n\n## Task 1: Fix the login bug\n- Description: ...\n"}'
```

---

#### `POST /api/config`

Merges the provided fields into the project config (`/.deckent/config.json`) and returns the full merged result. Unknown keys are preserved.

**Authentication:** Required if `api_token` is configured.

**Request body:** Any JSON object. Keys are merged with the existing config using shallow merge (`{ ...existing, ...body }`).

```json
{ "mode": "economic", "language": "en" }
```

**Response `200`:** The full merged config object after writing to disk.

```json
{
  "mode": "economic",
  "language": "en",
  "brain_planning": "ai",
  "performance": { "max_workers": 8, "model": "opus" }
}
```

**Error `400`:** Body is not a valid JSON object.

**Error `500`:** File write failed.

```bash
curl -X POST http://localhost:3100/api/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"mode": "economic"}'
```

---

### `watchDashboard`

```ts
function watchDashboard(
  filePath: string,
  onChange: () => void,
): DashboardWatcher

interface DashboardWatcher {
  close(): void;
}
```

Watches the `.dashboard` file for changes using `fs.watch` and calls `onChange` with a 500ms debounce. The returned object has a `close()` method that cancels any pending debounce timer and closes the underlying file watcher.

---

## 12. CLI Commands

Run via `deckent <command>` (globally installed) or `npx deckent <command>`.

| Command | Description | Key Options |
|---|---|---|
| `init` | Initialize a new Deckent project (interactive wizard) | — |
| `start` | Start a new sprint (full lifecycle) | `--auto-approve`, `--sandbox-mode`, `--dry-run`, `--force`, `--watch` |
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
| `upgrade` | Self-update deckent to the latest version | — |
| `plugin` | Manage plugins | — |
| `plugin install <name>` | Install a plugin | — |
| `plugin list` | List installed plugins | — |
| `onboard` | Run the first-time onboarding wizard | — |
| `analyze` | Analyze project stack, size, methodology | — |
| `archive-debt` | Archive resolved technical debt | — |
| `dashboard` | Terminal TUI dashboard (rich mode) | — |
| `serve` | Start HTTP API server (SSE) | `--port` |
| `web` | Web dashboard + API server | `--port` |
| `sync` | Sync adapter files (CLAUDE.md, AGENTS.md) with DECKENT.md reference | — |
| `watch` | Live tmux split view: dashboard + worker panes | `--follow <taskId>` |

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
