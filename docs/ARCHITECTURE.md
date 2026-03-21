# Deckent Architecture — Comprehensive Reference

> **Version:** Sprint 30 | **Language:** TypeScript (ESM) | **Runtime:** Node.js ≥18
>
> This document is the single comprehensive architectural reference for the Deckent system.
> For the primary system specification, see [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md).

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Module Map](#2-module-map)
3. [Module Responsibilities & Boundaries](#3-module-responsibilities--boundaries)
4. [Import Rules (ADR-008)](#4-import-rules-adr-008)
5. [Data Flow Diagrams](#5-data-flow-diagrams)
6. [Config Layers](#6-config-layers)
7. [Memory System](#7-memory-system)
8. [Plugin System](#8-plugin-system)
9. [Security Model](#9-security-model)
10. [File Structure Reference](#10-file-structure-reference)
11. [Sprint Lifecycle](#11-sprint-lifecycle)
12. [HTTP API & Web Dashboard](#12-http-api--web-dashboard)

---

## 1. System Overview

Deckent is an **AI agent orchestration CLI** that manages multiple Claude Code agents working in parallel on a single codebase. A human operator writes `DIRECTIVES.md`, and Deckent translates those directives into coordinated agent work via a Brain-Worker-Auditor model.

```
┌─────────────────────────────────────────────────────────────────────┐
│  OPERATOR (Human)                                                   │
│  Writes DIRECTIVES.md — the source of all sprint intent             │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DECKENT CLI  (src/cli/)                                            │
│  deckent start | deckent plan | deckent status | deckent web        │
└────────────────────────┬────────────────────────────────────────────┘
                         │
         ┌───────────────┴────────────────────┐
         ▼                                    ▼
┌─────────────────────┐           ┌───────────────────────┐
│  BRAIN + PLANNER    │           │  AUDITOR (in-process) │
│  src/orchestra/     │◄──────────│  src/monitor/         │
│  brain.ts           │  scan     │  auditor.ts           │
│  planner.ts         │  results  │  30-second scan loop  │
└─────────┬───────────┘           └───────────────────────┘
          │ spawns via SpawnBackend (tmux or subprocess)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  WORKER POOL  (dynamic, via tmux or subprocess)                      │
│  Each worker: Claude Code with scoped --allowedTools                │
│  Lifecycle: CLAIM → PLAN → CODE → TEST → DOCUMENT → REPORT         │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  HTTP API + WEB DASHBOARD                                           │
│  src/api/ (16 endpoints + SSE)  |  src/dashboard/ (React+Vite)     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

| Principle | Description |
|-----------|-------------|
| **Single orchestrator** | Brain is the only module that coordinates the system. Workers never plan. |
| **Scope isolation** | Every worker operates in a declared file/directory sandbox. |
| **Observer independence** | Auditor runs in-process but never modifies source code or creates tasks. |
| **Memory budget** | `.brain/` directory capped at 300 lines; automatic decay maintains the budget. |
| **Import discipline** | Module dependency graph is an explicit security boundary (ADR-008). |
| **Sprint completeness** | Every sprint always runs to completion — errors never leave a sprint incomplete. |

---

## 2. Module Map

```
src/
├── core/                    ← Shared types, config, utilities
│   ├── types.ts             ← All shared TypeScript interfaces and enums
│   ├── constants.ts         ← App-wide constants (timeouts, budgets, limits)
│   ├── config.ts            ← 3-layer config loader (global → project → env)
│   ├── utils.ts             ← Shared utilities (countBrainLines, parseDebtTable, etc.)
│   ├── analyzer.ts          ← Project stack, size, and methodology detection
│   ├── system-profile.ts    ← CPU, RAM, recommended-worker-count detection
│   ├── subscription.ts      ← Claude plan detection (max_20x/max_5x/pro/api/unknown)
│   ├── plugin.ts            ← Plugin manifest validation, load, install, remove
│   └── plugin-hooks.ts      ← Plugin hook execution (beforeSprint/afterSprint/etc.)
│
├── orchestra/               ← Sprint orchestration
│   ├── brain.ts             ← ONLY orchestration entry point — imports everything
│   ├── planner.ts           ← AI task planning with Zod validation
│   ├── tmux.ts              ← tmux session and window management
│   ├── sprint-estimator.ts  ← Sprint duration and effort estimation
│   └── task-retry.ts        ← NO_GO task retry and priority-fix logic
│
├── agents/                  ← Worker agent runtime
│   └── worker.ts            ← Worker lifecycle, heartbeat, result writing
│
├── monitor/                 ← Observability and boundary enforcement
│   └── auditor.ts           ← Scan loop, boundary detection, alert writing
│
├── cli/                     ← Command-line interface
│   ├── auto-setup.ts        ← Setup wizard (generateSetupRecommendation)
│   ├── commands/            ← 28 CLI commands (one file per command)
│   │   ├── init.ts          ← deckent init — project initialization
│   │   ├── start.ts         ← deckent start — sprint execution
│   │   ├── plan.ts          ← deckent plan — dry-run planning
│   │   ├── status.ts        ← deckent status [--watch] [--json]
│   │   ├── doctor.ts        ← deckent doctor [--profile]
│   │   ├── spawn.ts         ← deckent spawn — manual worker spawn
│   │   ├── attach.ts        ← deckent attach — tmux attach
│   │   ├── kill.ts          ← deckent kill — stop workers
│   │   ├── cleanup.ts       ← deckent cleanup — remove task artifacts
│   │   ├── onboard.ts       ← deckent onboard — guided setup
│   │   ├── plugin.ts        ← deckent plugin [install|remove|list|toggle]
│   │   ├── retro.ts         ← deckent retro — retrospective
│   │   ├── history.ts       ← deckent history — sprint history
│   │   ├── sync.ts          ← deckent sync — memory sync
│   │   ├── analyze.ts       ← deckent analyze — project analysis
│   │   ├── upgrade.ts       ← deckent upgrade — self-update
│   │   ├── usage.ts         ← deckent usage — token/cost report
│   │   ├── config.ts        ← deckent config — config management
│   │   ├── archive-debt.ts  ← deckent archive-debt
│   │   ├── run.ts           ← deckent run — task runner
│   │   ├── serve.ts         ← deckent serve — API server only
│   │   ├── web.ts           ← deckent web — API + dashboard
│   │   ├── dashboard.ts     ← deckent dashboard — dashboard redirect
│   │   ├── test-run.ts      ← deckent test — run test suite
│   │   ├── watch.ts         ← deckent watch — file watcher
│   │   └── ...              ← additional command files
│   └── helpers/
│       ├── hints.ts         ← Phase-based contextual hints (tr/en)
│       └── messages.ts      ← Localized message system (getMessage)
│
├── mcp/                     ← Model Context Protocol integration
│   ├── tools/               ← 10 MCP tool handlers
│   │   ├── index.ts         ← Tool registration
│   │   ├── analyze.ts       ← deckent_analyze_project
│   │   ├── directives.ts    ← deckent_set_directives
│   │   ├── doctor.ts        ← deckent_doctor [includeProfile]
│   │   ├── history.ts       ← deckent_history
│   │   ├── init.ts          ← deckent_init
│   │   ├── job-runner.ts    ← background job execution
│   │   ├── plan.ts          ← deckent_plan
│   │   ├── retro.ts         ← deckent_retro
│   │   ├── start.ts         ← deckent_start
│   │   ├── status.ts        ← deckent_status
│   │   └── sync.ts          ← deckent_sync
│   ├── resources/           ← 5 MCP resource handlers
│   │   └── memory.ts        ← deckent://memory, deckent://memory/patterns
│   └── helpers/
│       └── enrich.ts        ← enrichResponse() — _enriched meta injection
│
├── api/                     ← HTTP REST API
│   └── server.ts            ← Express server, 16 endpoints + SSE stream
│
└── dashboard/               ← Web Dashboard
    └── ...                  ← React + Vite + Tailwind (4 pages)
```

### providers/ — Provider Adapters (Sprint 27)

| File | Lines | Responsibility |
|------|-------|---------------|
| `src/core/provider.ts` | ~200 | ProviderAdapter interface, ProviderRegistry singleton, error types |
| `src/core/spawn-backend.ts` | ~265 | SpawnBackend interface, TmuxBackend, SubprocessBackend, SpawnBackendFactory |
| `src/providers/claude.ts` | ~180 | ClaudeAdapter — wraps tmux.ts behind ProviderAdapter |
| `src/providers/subprocess.ts` | ~250 | SubprocessSpawnBackend — child_process based worker spawning |
| `src/providers/sandbox.ts` | ~170 | SandboxSpawnBackend — isolated subprocess with memory/fs limits |
| `src/core/usage-tracker.ts` | ~165 | UsageTracker — sprint-based token/call counting |
| `src/core/credentials.ts` | ~210 | CredentialManager — secure key storage (~/.deckent/credentials/) |
| `src/core/global-config.ts` | ~100 | Global config utilities (ensureGlobalDir, readGlobalConfig, writeGlobalConfig) |
| `src/orchestra/coverage-validator.ts` | ~310 | Coverage parsing (vitest JSON) and validation |
| `src/orchestra/rollback.ts` | ~290 | Git safety points, rollback mechanism, dirty tree detection |
| `src/agents/worker-ipc.ts` | ~350 | WorkerChannel, ChannelRegistry — process.send IPC for subprocess workers |
| `src/cli/commands/quick-start.ts` | ~85 | Zero-config mode — single-line natural language sprint start |
| `src/orchestra/doc-updaters/metrics-updater.ts` | ~80 | Sprint metrics README updater |

---

## 3. Module Responsibilities & Boundaries

### 3.1 `core/` — Foundation Layer

The `core/` module is the **only module that may be imported by all other modules**. It has zero dependencies on `orchestra/`, `agents/`, `monitor/`, `cli/`, `mcp/`, or `api/`.

| File | Responsibility | Key Exports |
|------|---------------|-------------|
| `types.ts` | All shared TypeScript types, interfaces, and enums | `Task`, `TaskStatus`, `TaskResult`, `TaskScope`, `ModelType`, `DeckentConfig` |
| `constants.ts` | Runtime constants — never import from other modules | `AUDITOR_SCAN_INTERVAL_MS`, `HEARTBEAT_STALE_THRESHOLD_MS`, `BRAIN_TOTAL_LINE_BUDGET` |
| `config.ts` | 3-layer config merge (global → project → env) | `loadConfig()`, `resolveConfig()`, `DEFAULT_MODES` |
| `utils.ts` | Pure utility functions | `countBrainLines()`, `parseDebtTable()`, `generateDebtTable()`, `shouldRemoveResolvedDebt()` |
| `analyzer.ts` | Project analysis (stack detection, size estimation) | `analyzeProject()` |
| `system-profile.ts` | System resource detection | `getSystemProfile()`, `recommendWorkerCount()` |
| `subscription.ts` | Claude plan detection from model usage | `detectSubscription()` |
| `plugin.ts` | Plugin manifest validation, install/remove lifecycle | `validateManifest()`, `loadPlugin()`, `installPlugin()` |
| `plugin-hooks.ts` | Plugin hook invocation | `runPluginHooks()` |

**Boundary:** `core/` modules must **never** import from `orchestra/`, `agents/`, `monitor/`, `cli/`, or `mcp/`.

---

### 3.2 `orchestra/` — Orchestration Layer

The orchestration layer coordinates the entire sprint lifecycle. `brain.ts` is the **sole entry point** — all external code that needs orchestration imports `brain.ts`, never the sub-modules directly.

| File | Responsibility | Key Exports |
|------|---------------|-------------|
| `brain.ts` | Sprint lifecycle, task evaluation, memory updates, decay | `runSprint()`, `planSprint()`, `evaluateResult()`, `runDecay()`, `resolveTaskModel()` |
| `planner.ts` | AI task planning with Zod schema validation | `planWithAI()`, `parseStructuredDirectives()`, `inferModelFromDirective()` |
| `tmux.ts` | tmux session/window creation, worker spawning | `spawnWorker()`, `killWorker()`, `listWindows()`, `attachSession()` |
| `sprint-estimator.ts` | Sprint duration and effort estimation | `estimateSprint()` |
| `task-retry.ts` | NO_GO task retry and priority-fix scheduling | `scheduleRetry()`, `buildPriorityFix()` |

**Key Design:** `brain.ts` is the **only** module in the system that imports from `tmux.ts`, `auditor.ts`, and `worker.ts`. This prevents circular dependencies and ensures the orchestration boundary is clear.

#### Brain Planning Modes

| Mode | Behavior |
|------|----------|
| `'ai'` | Uses Claude API with Zod-validated JSON schema for task generation. Falls back only on API error. |
| `'structured'` | Pure text parsing of DIRECTIVES.md sections (no API call). Fast but less flexible. |
| `'auto'` | Tries AI first; if the AI result has fewer tasks than the directive count, triggers structured fallback. |

#### Post-Validation Fallback (Sprint 23)

After AI planning, `brain.ts` compares the number of returned tasks against the directive task count. If the AI planner returns fewer tasks than expected **and** `brain_planning !== 'ai'`, it discards the AI result and re-runs with structured planning:

```typescript
// src/orchestra/brain.ts
if (plannerResult && brain_planning !== 'ai') {
  const directiveCount = parseStructuredDirectives(directivesContent).length;
  if (plannerResult.tasks.length < directiveCount) {
    plannerResult = null; // trigger structured fallback
  }
}
```

---

### 3.3 `agents/` — Worker Execution Layer

Workers are the **builder agents** — they read a task, implement it, run tests, and write results.

| File | Responsibility |
|------|---------------|
| `worker.ts` | Worker lifecycle management: claim task, write heartbeat, execute, write result |

**Worker Lifecycle:**
```
PENDING → CLAIMED → EXECUTING → TESTING → DOCUMENTING → DONE / NO_GO
```

Workers are spawned as separate `tmux` windows running `claude -p` with scoped `--allowedTools`, or as child processes via the subprocess backend (Sprint 27). The subprocess backend (`SubprocessSpawnBackend`) provides an alternative to tmux, enabling support for environments where tmux is unavailable (e.g., Windows without WSL2). `SpawnBackendFactory` selects the appropriate backend based on configuration and environment detection. Workers never import from `brain.ts` or `auditor.ts`. All data exchange is through the filesystem:
- **Input:** `.tasks/task-{id}.json`
- **Plan:** `.tasks/task-{id}.plan`
- **Heartbeat:** `.tasks/task-{id}.hb` (updated periodically)
- **Output:** `.tasks/task-{id}.result`

---

### 3.4 `monitor/` — Observability Layer

The Auditor observes the system state and enforces boundaries. It **never writes source code** and **never creates tasks**.

| File | Responsibility |
|------|---------------|
| `auditor.ts` | 30-second scan loop, boundary detection, alert generation, dashboard writes |

**Auditor Scan Cycle (every 30s):**
1. Read all `.tasks/*.hb` files → detect stale heartbeats (>2 min)
2. Run `git diff --stat` → detect boundary violations
3. Scan `.locks/*.lock` → detect stale locks (>5 min)
4. Build dependency graph → run Kahn's algorithm → detect circular dependencies
5. Overwrite `.dashboard` with merged state
6. Append new patterns to `.brain/PATTERNS.md`

**Auditor Outputs:**
- `.dashboard` — overwritten every scan cycle (never appended)
- `.brain/PATTERNS.md` — append-only (new patterns added, never removed by auditor)
- `.tasks/ALERT` — critical alert files

---

### 3.5 `cli/` — Command-Line Interface Layer

The CLI layer exposes Deckent's functionality to the operator via terminal commands. Each command is registered via the `register<Name>(program: Command): void` pattern (ADR-012).

**Single runtime dependency:** `commander.js` (ADR-010). No chalk, inquirer, or picocolors.

**Interactive prompts:** `node:readline/promises` built-in (ADR-011).

| Command Group | Commands |
|--------------|----------|
| **Sprint** | `start`, `plan`, `status`, `spawn`, `attach`, `kill` |
| **Project** | `init`, `onboard`, `doctor`, `analyze`, `upgrade` |
| **Memory** | `retro`, `history`, `sync`, `archive-debt`, `usage` |
| **Config** | `config`, `cleanup`, `run` |
| **Web** | `web`, `serve`, `dashboard`, `watch` |
| **Plugin** | `plugin install`, `plugin remove`, `plugin list`, `plugin toggle` |

**Contextual Hints System (`hints.ts`):**
Provides phase-based hints to guide operator actions. Hints are localized (tr/en) and returned per phase: `COMPLETE`, `EXECUTE`, `PLAN`, `IDLE`.

**Message Localization (`messages.ts`):**
`getMessage(key, lang?)` returns a localized string. Falls back to `'en'` if the key is missing in the requested language.

---

### 3.6 `api/` — HTTP API Layer

The HTTP API exposes Deckent state and control via REST endpoints. Used by the Web Dashboard and external integrations.

| Category | Count | Examples |
|----------|-------|---------|
| Status endpoints | 4 | `GET /status`, `GET /tasks`, `GET /dashboard`, `GET /health` |
| Control endpoints | 6 | `POST /start`, `POST /stop`, `POST /kill`, `POST /plan`, `POST /cleanup`, `POST /sync` |
| Memory endpoints | 4 | `GET /memory`, `GET /retro`, `GET /history`, `GET /patterns` |
| Streaming | 1 | `GET /events` (SSE — real-time dashboard updates) |
| Config endpoint | 1 | `GET/POST /config` |

**SSE Stream:** The `/events` endpoint watches the `.dashboard` file using `fs.watch()`. When `.dashboard` changes (Auditor overwrites), all connected SSE clients receive the updated state as a JSON event.

---

### 3.7 `mcp/` — Model Context Protocol Layer

The MCP layer exposes Deckent capabilities as Claude Code tools and resources, enabling operators to control Deckent directly from within Claude Code conversations.

**Tools (10):**

| Tool | MCP Name | Description |
|------|----------|-------------|
| `analyze.ts` | `deckent_analyze_project` | Analyze project stack and suggest config |
| `directives.ts` | `deckent_set_directives` | Read/write DIRECTIVES.md |
| `doctor.ts` | `deckent_doctor` | Health check (optional `includeProfile` for system info) |
| `history.ts` | `deckent_history` | Sprint history and trend data |
| `init.ts` | `deckent_init` | Initialize Deckent in the project |
| `plan.ts` | `deckent_plan` | Dry-run sprint planning |
| `retro.ts` | `deckent_retro` | Retrospective summary |
| `start.ts` | `deckent_start` | Execute a sprint |
| `status.ts` | `deckent_status` | Real-time system status |
| `sync.ts` | `deckent_sync` | Sync memory and config |

**Resources (5):**

| URI | Description |
|-----|-------------|
| `deckent://memory` | Current `MEMORY.md` content |
| `deckent://memory/patterns` | `PATTERNS.md` (JSON array) |
| `deckent://config` | Current resolved config |
| `deckent://debt` | `DEBT.md` tech debt ledger |
| `deckent://retro` | Latest retrospective |

**MCP Enrichment (`enrich.ts`):**
All MCP tool responses are enriched via `enrichResponse()`, which appends a `_enriched` metadata object without modifying existing response fields:

```typescript
// src/mcp/helpers/enrich.ts
export function enrichResponse<T extends object>(
  response: T,
  meta: Partial<EnrichedMeta>
): T & { _enriched: EnrichedMeta }
```

The `_enriched` object contains: `timestamp`, `locale`, `hints`, and domain-specific fields (e.g., `recommendations` for doctor, `nextSteps` for init, `trend` for history).

---

## 4. Import Rules (ADR-008)

The module import graph is an explicit **security and architecture boundary**. Circular dependencies are forbidden and enforced by `tsc --noEmit`.

### Allowed Import Graph

```
core/          ← imported by ALL modules
   ↑
orchestra/     ← imports core/ only (except brain.ts)
   brain.ts    ← imports core/, orchestra/*, agents/, monitor/
   planner.ts  ← imports core/ ONLY (never brain.ts)
   tmux.ts     ← imports core/ only
   ↑
agents/        ← imports core/ only (reads tasks from disk)
   ↑
monitor/       ← imports core/ only (reads tasks from disk)
   ↑
cli/           ← imports core/, orchestra/brain.ts
   ↑
mcp/           ← imports core/, orchestra/brain.ts, cli/ helpers
   ↑
api/           ← imports core/, orchestra/brain.ts
```

### Forbidden Imports

| Module | Cannot Import | Reason |
|--------|--------------|--------|
| `planner.ts` | `brain.ts`, `tmux.ts`, `auditor.ts`, `worker.ts` | Planner must be independently testable and never access execution context |
| `auditor.ts` | `brain.ts`, `worker.ts`, `planner.ts` | Auditor independence prevents it from being manipulated by execution state |
| `worker.ts` | `brain.ts`, `auditor.ts`, `planner.ts` | Worker isolation prevents scope escalation |
| `core/*` | Any `orchestra/`, `agents/`, `monitor/`, `cli/`, `mcp/`, `api/` module | Core must have zero upward dependencies |
| Any module | Circular self-import chains | `tsc --noEmit` detects these at compile time |

### Enforcement Mechanism

```
tsc --noEmit → detects import errors at compile time
Code review  → enforces architectural intent
ADR-008      → documents the rule permanently in DECISIONS.md
```

---

## 5. Data Flow Diagrams

### 5.1 Sprint Execution Flow

```
OPERATOR writes DIRECTIVES.md
        │
        ▼
brain.ts: runSprint()
        │
        ├─► checkUsage() ──► abort if threshold exceeded
        │
        ├─► readContext()
        │     reads: MEMORY.md, RETRO.md, DEBT.md, PATTERNS.md
        │
        ├─► planSprint()
        │     mode=ai  → planner.ts: planWithAI() → Zod validation
        │     mode=str → planner.ts: parseStructuredDirectives()
        │     mode=auto→ try AI, compare count, fallback if needed
        │     output: .tasks/task-{sprint}-{N}.json (one per task)
        │
        ├─► spawnWorkers()
        │     SpawnBackendFactory selects tmux or subprocess backend
        │     tmux: new-window per task | subprocess: child_process.spawn per task
        │     each worker: claude -p --allowedTools "..."
        │
        ├─► startScanLoop()  ◄─────────────────────────────────┐
        │     auditor.ts: setInterval(30s)                     │
        │     scans heartbeats, boundaries, locks, deadlocks   │
        │     writes .dashboard, appends PATTERNS.md           │
        │                                                      │
        ├─► waitForResults()                                   │
        │     polls .tasks/*.result files                      │
        │     reads worker heartbeats                          │
        │     timeout → syntheticResult(NO_GO)                 │
        │                                                      │
        ├─► stopScanLoop() ────────────────────────────────────┘
        │     clearInterval()
        │
        ├─► evaluateResults()
        │     DONE / GO_WITH_TECH_DEBT / NO_GO per task
        │     testsPassed=false → NO_GO override
        │     coverage<80 → GO_WITH_TECH_DEBT override
        │
        ├─► handleNoGo()
        │     spawn priority-fix workers for NO_GO tasks
        │     cross-dependency aware: fix root cause first
        │
        ├─► updateMemory()
        │     append to .brain/MEMORY.md
        │     overwrite .brain/RETRO.md
        │     append to .brain/DECISIONS.md if new ADRs
        │     write .brain/sprints/sprint-NNN.md
        │
        └─► runDecay()
              if countBrainLines() > 300: compress
              step1: remove resolved PATTERNS
              step2: remove resolved DEBT rows
              step3: archive oldest sprint logs
              step4: trim old MEMORY sections
              step5: hard-truncate if still over budget
```

### 5.2 Worker Task Flow

```
Brain spawns worker via SpawnBackend (tmux new-window or subprocess)
        │
        ▼
worker reads .tasks/task-{id}.json
        │
        ├─► writes .tasks/task-{id}.hb  {"status": "CLAIMED", ...}
        │
        ├─► writes .tasks/task-{id}.plan (implementation plan)
        │
        ├─► checks .locks/ before every file write
        │     lock exists → wait / skip
        │     no lock → create .locks/{path__encoded}.lock
        │
        ├─► implements changes (CODE phase)
        │     stays within scope.directories + scope.filesWrite
        │     updates .hb periodically (timestamp refresh)
        │
        ├─► runs tsc --noEmit (TESTING phase)
        ├─► runs npx vitest run
        │
        ├─► documents changes (DOCUMENTING phase)
        │
        └─► writes .tasks/task-{id}.result
              {selfAssessment: "DONE"|"GO_WITH_TECH_DEBT"|"NO_GO", ...}
              releases .locks/
```

### 5.3 Auditor Scan Flow

```
startScanLoop() → setInterval(30_000ms)
        │
        ▼ (every 30 seconds)
readHeartbeats()
  for each .tasks/*.hb:
    if (now - hb.timestamp > 120_000ms) → CRITICAL alert
        │
        ▼
checkBoundaries()
  git diff --stat → modified file list
  for each file:
    find owning task by scope
    isFileInScope(file, scope) ? OK : BoundaryViolation
        │
        ▼
checkStaleLocks()
  for each .locks/*.lock:
    if (now - lock.acquiredAt > 300_000ms) → WARNING alert
        │
        ▼
checkDeadlocks()
  build adjacency list from task.dependencies
  Kahn's algorithm (BFS topological sort)
  if processed < totalNodes → CircularDependency alert
        │
        ▼
writeScanToDashboard()
  merge scan results → DashboardState
  writeFileSync(.dashboard, JSON.stringify(state))
  ← SSE server detects file change → pushes to browser
        │
        ▼
appendPatterns()
  new patterns → append to .brain/PATTERNS.md
  dedup by pattern id (never overwrite)
```

### 5.4 MCP Tool Call Flow

```
Claude Code (operator) calls MCP tool
        │
        ▼
mcp/tools/{tool}.ts handler()
        │
        ├─► validate input parameters
        │
        ├─► call core or orchestra function
        │     (e.g., brain.runSprint(), config.loadConfig())
        │
        ├─► build response object
        │
        └─► enrichResponse(response, { hints, locale, ... })
              appends _enriched: { timestamp, locale, hints, ... }
              returns enriched response to Claude Code
```

---

## 6. Config Layers

Deckent uses a **4-layer config resolution** system. Lower layers override higher ones.

```
Layer 1: Plan Mode Defaults (lowest priority)
Layer 2: Global Config (~/.deckent/config.json)
Layer 3: Project Config (.deckent/config.json)
Layer 4: Environment Variables (highest priority)
```

### Layer 1 — Plan Mode Defaults

Defaults per subscription tier, defined in `src/core/config.ts`:

| Plan | `max_workers` | `brain_model` | `default_model` | `haiku_allowed` |
|------|:------------:|:-------------:|:---------------:|:---------------:|
| `max_plan` (Max 20x) | 8 | opus | opus | true |
| `max5x_plan` (Max 5x) | 5 | sonnet | opus | true |
| `pro_plan` (Pro) | 3 | sonnet | sonnet | false |
| `api` (API key) | 2 | haiku | haiku | true |

### Layer 2 — Global Config

File: `~/.deckent/config.json`

Contains user-wide preferences (language, preferred model, default workspace path). Not tracked in project git.

```json
{
  "language": "en",
  "preferred_model": "sonnet"
}
```

### Layer 3 — Project Config

File: `.deckent/config.json`

The primary project-level config. Written by `deckent init`, updated by `deckent config`. Tracked in `.gitignore`.

```json
{
  "mode": "max_plan",
  "brain_planning": "auto",
  "max_workers": 8,
  "brain_model": "opus",
  "default_model": "opus",
  "haiku_allowed": true,
  "last_sprint_id": 25,
  "language": "en",
  "workspace": ".",
  "auto_docs": {
    "tier1": true,
    "tier2": false,
    "tier3": false
  },
  "usage_thresholds": {
    "5hr": 0.8,
    "weekly": 0.6
  }
}
```

### Layer 4 — Environment Variables

| Variable | Override | Example |
|----------|----------|---------|
| `DECKENT_LANGUAGE` | `config.language` | `DECKENT_LANGUAGE=tr` |
| `DECKENT_MODEL` | `config.default_model` | `DECKENT_MODEL=haiku` |
| `DECKENT_MAX_WORKERS` | `config.max_workers` | `DECKENT_MAX_WORKERS=4` |
| `DECKENT_BRAIN_PLANNING` | `config.brain_planning` | `DECKENT_BRAIN_PLANNING=structured` |
| `DECKENT_WORKSPACE` | `config.workspace` | `DECKENT_WORKSPACE=/path/to/project` |

### Config Resolution Flow

```typescript
// src/core/config.ts
async function resolveConfig(projectRoot: string): Promise<ResolvedConfig> {
  const modeDefaults = DEFAULT_MODES[plan.mode];   // Layer 1
  const globalCfg    = await loadGlobalConfig();   // Layer 2
  const projectCfg   = await loadProjectConfig();  // Layer 3
  const envOverrides = readEnvOverrides();         // Layer 4

  return merge(modeDefaults, globalCfg, projectCfg, envOverrides);
}
```

### `brain_planning` Config Field

Controls AI planner behavior at runtime:

| Value | Behavior |
|-------|----------|
| `'ai'` | Always use AI planner. Never fall back to structured. |
| `'structured'` | Always use text parsing. No API call for planning. |
| `'auto'` | Try AI; fall back to structured if task count mismatch detected. |

---

## 7. Memory System

Deckent's memory system is a **3-tier, file-based knowledge store** in `.brain/`. Every sprint reads from and writes to this system, making the orchestrator progressively smarter.

### Directory Structure

```
.brain/
├── MEMORY.md          ← Tier 1: Short-term (always loaded, max 100 lines)
├── PATTERNS.md        ← Tier 2: Long-term patterns (JSON array, max 80 lines)
├── DECISIONS.md       ← Tier 3: Permanent ADRs (never decayed)
├── DEBT.md            ← Tech debt ledger (markdown table, 9 columns)
├── RETRO.md           ← Latest retrospective (overwritten each sprint, max 60 lines)
├── sprints/           ← Per-sprint logs (max 50 lines each)
│   ├── sprint-001.md
│   └── sprint-NNN.md
└── archive/           ← Archived sprint logs (deep history, no limit)
    └── sprint-001.md
```

### Tier 1 — MEMORY.md (Short-Term Memory)

- **Max lines:** 100 (`MEMORY_MAX_LINES`)
- **Written:** After every sprint retrospective
- **Loaded:** Into Brain context at the start of every sprint via `@import`
- **Content:** Recent learnings, wave summaries, sprint-to-sprint patterns

**Decay Rule:** Sections with sprint number ≥ 3 sprints behind current are removed. If budget is still exceeded, hard-truncate to 50 lines.

### Tier 2 — PATTERNS.md (Long-Term Patterns)

- **Max lines:** 80 (`PATTERNS_MAX_LINES`)
- **Written:** Auditor appends new patterns (never overwrites)
- **Format:** JSON array of `PatternEntry` objects
- **Decay Rule:** `resolved: true` entries removed first on budget exceeded

```json
[
  {
    "id": "pattern-001",
    "description": "Circular import between brain.ts and auditor.ts",
    "severity": "critical",
    "firstSeenSprintId": "sprint-003",
    "resolved": false,
    "resolvedInSprintId": null,
    "tags": ["architecture", "imports"]
  }
]
```

### Tier 3 — DECISIONS.md (Permanent ADRs)

- **No line limit** — grows indefinitely
- **Never decayed**
- **Format:** `## ADR-NNN: Title` + Decision / Context / Consequence

Current ADRs (Sprint 25):

| ADR | Subject |
|-----|---------|
| ADR-001 | TypeScript + ESM |
| ADR-002 | Node16 Module Resolution |
| ADR-003 | vitest over Jest |
| ADR-004 | 3-Layer Config Merge |
| ADR-005 | Synchronous I/O in Brain |
| ADR-006 | spawnSync Security Pattern |
| ADR-007 | SpawnOptions Interface |
| ADR-008 | Brain Merkezi Import (Central Import Rule) |
| ADR-009 | DEBT.md Markdown Table Format |
| ADR-010 | Single Runtime Dependency (commander.js) |
| ADR-011 | node:readline/promises Built-in Prompt |
| ADR-012 | register\<Name\>(program) Pattern |
| ADR-013 | DECKENT.md Adapter Pattern |

### Memory Budget

| File | Max Lines | Decay Strategy |
|------|:---------:|----------------|
| `MEMORY.md` | 100 | Remove sections ≥ 3 sprints old; hard-truncate to 50 as last resort |
| `PATTERNS.md` | 80 | Remove `resolved: true` entries when budget exceeded |
| `DECISIONS.md` | ∞ | Never decayed |
| `RETRO.md` | 60 | Overwritten every sprint |
| `DEBT.md` | ∞ | Remove resolved rows when budget exceeded |
| `sprints/sprint-NNN.md` | 50 | Archive oldest (keep last 2 active) |
| **Total `.brain/` budget** | **300** | `BRAIN_TOTAL_LINE_BUDGET` in `constants.ts` |

### Decay Cycle

```typescript
// src/orchestra/brain.ts
function runDecay(projectRoot: string, sprintId: string, opts?: { force?: boolean }): DecayResult {
  if (!opts?.force && countBrainLines(projectRoot) <= BRAIN_TOTAL_LINE_BUDGET) {
    return earlyReturn(); // no-op if under budget
  }

  // Step 1: Remove resolved patterns from PATTERNS.md
  // Step 2: Remove resolved debt rows from DEBT.md
  // Step 3: Archive oldest sprint logs (keep last 2)
  // Step 4: Trim old MEMORY.md sections (>= 3 sprints old)
  // Step 5: Hard-truncate MEMORY.md to 50 lines (last resort)
}
```

### MCP Resources for Memory

| URI | File | Description |
|-----|------|-------------|
| `deckent://memory` | `MEMORY.md` | Current active short-term memory |
| `deckent://memory/patterns` | `PATTERNS.md` | Detected patterns (JSON) |

---

## 8. Plugin System

Deckent supports an extensible plugin system that allows adding custom behaviors via lifecycle hooks.

### Plugin Directory

```
.deckent/
└── plugins/
    ├── .gitkeep                  ← tracked; individual plugins are gitignored
    └── my-plugin/
        ├── plugin.json           ← manifest (required)
        └── index.js / index.ts  ← entrypoint
```

### Plugin Manifest (`plugin.json`)

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Custom plugin description",
  "entrypoint": "index.js",
  "triggers": ["beforeSprint", "afterTask"],
  "permissions": ["read:tasks", "write:memory"],
  "hooks": {
    "beforeSprint": "onBeforeSprint",
    "afterSprint": "onAfterSprint",
    "beforeTask": "onBeforeTask",
    "afterTask": "onAfterTask"
  },
  "model": "haiku",
  "enabled": true,
  "dependencies": []
}
```

### Required Manifest Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique plugin identifier (non-empty) |
| `version` | string | Semver version string |
| `description` | string | Human-readable plugin description |
| `entrypoint` | string | Path to plugin entry file (relative to plugin dir) |

### Optional Manifest Fields

| Field | Type | Description |
|-------|------|-------------|
| `triggers` | string[] | Events that activate this plugin |
| `permissions` | string[] | Declared permissions (informational) |
| `hooks` | object | Function names for each lifecycle hook |
| `model` | `'opus'|'sonnet'|'haiku'` | Model preference for plugin tasks |
| `enabled` | boolean | Whether plugin is active (default: true) |
| `dependencies` | string[] | Other plugin names this plugin depends on |

### Plugin Lifecycle Hooks

Hooks are invoked by `src/core/plugin-hooks.ts` at specific points in the sprint lifecycle:

| Hook | When Called | Context |
|------|------------|---------|
| `beforeSprint` | Before Brain plans tasks | Sprint ID, directive summary |
| `afterSprint` | After all results evaluated | Sprint results, RETRO summary |
| `beforeTask` | Before a worker is spawned | Task JSON |
| `afterTask` | After a worker writes result | Task result, self-assessment |

### Plugin Commands

```
deckent plugin install <name-or-path>  ← install from npm or local path
deckent plugin remove <name>           ← remove plugin directory
deckent plugin list                    ← list installed plugins with status
deckent plugin toggle <name>           ← enable/disable without removing
```

### Plugin Security

- Plugins run in the same process as the CLI (no sandbox)
- `permissions` field is declarative only — not enforced at runtime
- Plugins can only be installed by the Operator
- Disabled plugins (`enabled: false`) have hooks skipped entirely
- Plugin entrypoint validation occurs at install time via `validateManifest()`

---

## 9. Security Model

Deckent enforces a **4-level trust hierarchy** for all agents in the system.

### Trust Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│  OPERATOR (Level 1 — full trust)                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  BRAIN (Level 2 — elevated trust)                     │  │
│  │  ┌──────────────────┐  ┌─────────────────────────┐   │  │
│  │  │  AUDITOR         │  │  WORKERS (x N)          │   │  │
│  │  │  (Level 3)       │  │  (Level 4 — scoped)     │   │  │
│  │  │  read-heavy      │  │  scope.directories only  │   │  │
│  │  └──────────────────┘  └─────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Permission Matrix

| Capability | Operator | Brain | Auditor | Worker |
|-----------|:--------:|:-----:|:-------:|:------:|
| Read all files | ✓ | ✓ | ✓ | Scoped |
| Write source code | ✓ | ✗ | ✗ | Scoped |
| Write `.tasks/` | ✓ | ✓ | ✗ | Own only |
| Write `.brain/` | ✓ | ✓ | PATTERNS only | ✗ |
| Write `.dashboard` | ✓ | ✓ | ✓ | ✗ |
| Spawn workers | ✓ | ✓ | ✗ | ✗ |
| Kill workers | ✓ | ✓ | Alert only | ✗ |
| Modify `DIRECTIVES.md` | ✓ | ✗ | ✗ | ✗ |
| Modify `.deckent/config.json` | ✓ | ✗ | ✗ | ✗ |
| Git operations | ✓ | Commit/push | diff/log | add only |

### Scope Enforcement

Every task declares a `scope` that defines the worker's write sandbox:

```json
{
  "scope": {
    "directories": ["src/core/", "src/monitor/"],
    "filesRead": ["AGENTS.md", ".contracts/api-surface.md"],
    "filesWrite": ["docs/SECURITY.md"]
  }
}
```

**Enforcement rules:**
- Trailing `/` on directories prevents prefix overlap (`src/core/` cannot match `src/core-extra/`)
- Path normalization prevents traversal attacks (`../` etc.)
- Auditor detects violations via `git diff --stat` comparison against scope map
- `isFileInScope()` checks both `directories` (prefix match) and `filesWrite` (exact match)

### Lock Mechanism

File-based mutex prevents concurrent write conflicts between parallel workers:

```
Worker wants to write file F:
  → check .locks/{F-with-__-separators}.lock
  → exists? wait or skip
  → no lock? create lock file, write file, delete lock file

Lock format: .locks/src__core__types.ts.lock
  {
    "filePath": "src/core/types.ts",
    "ownerWorkerId": "w-007-002",
    "acquiredAt": "2026-03-18T09:00:00.000Z",
    "taskId": "007-002"
  }
```

Locks held >5 minutes generate a `WARNING` alert from the Auditor.

### Threat Model Summary

| Threat | Mitigation |
|--------|-----------|
| Worker scope creep | Auditor boundary detection via `git diff --stat` |
| Stale/zombie worker | Heartbeat staleness detection (>2 min = CRITICAL alert) |
| Concurrent write conflict | File-based lock mutex in `.locks/` |
| Deadlocked task graph | Kahn's algorithm circular dependency detection |
| Brain overreach | `--allowedTools` excludes DIRECTIVES and config paths |
| Memory budget overflow | `runDecay()` triggered at sprint end when >300 lines |
| Sprint abandonment | `runSprint()` wraps all phases in try/catch; always reaches COMPLETE |

### Operating Modes

| Mode | Command | Risk Level |
|------|---------|-----------|
| Normal | `deckent start` | Low — Claude Code prompts for each tool use |
| Auto-approve | `deckent start --auto-approve` | High — bypasses permission prompts |
| Dry-run | `deckent start --dry-run` | None — plans only, no worker spawn |

---

## 10. File Structure Reference

```
project/
├── AGENTS.md                   ← @DECKENT.md adapter (for non-Claude agents)
├── CLAUDE.md                   ← @DECKENT.md adapter (for Claude Code)
├── DECKENT.md                  ← Single source of truth (agent config)
├── DIRECTIVES.md               ← Operator sprint instructions
│
├── .deckent/                   ← Deckent runtime directory
│   ├── config.json             ← Project config (Layer 3)
│   ├── workspace/
│   │   ├── IDENTITY.md         ← Project identity (name, type, language)
│   │   └── BOOT.md             ← Boot sequence reference
│   ├── i18n/
│   │   ├── en.json             ← English strings
│   │   └── tr.json             ← Turkish strings
│   └── plugins/
│       ├── .gitkeep
│       └── {plugin-name}/      ← Plugin directories (gitignored)
│
├── .brain/                     ← Memory system (3 tiers)
│   ├── MEMORY.md               ← Tier 1: Short-term (max 100 lines)
│   ├── PATTERNS.md             ← Tier 2: Long-term patterns (JSON)
│   ├── DECISIONS.md            ← Tier 3: Permanent ADRs
│   ├── DEBT.md                 ← Tech debt ledger (markdown table)
│   ├── RETRO.md                ← Latest retrospective (max 60 lines)
│   ├── sprints/                ← Per-sprint logs (max 50 lines each)
│   │   └── sprint-NNN.md
│   └── archive/                ← Archived sprint logs
│       └── sprint-NNN.md
│
├── .contracts/
│   └── api-surface.md          ← Inter-agent contracts (task format, scope rules)
│
├── .tasks/                     ← Ephemeral task files (auto-cleaned after sprint)
│   ├── task-{sprint}-{n}.json  ← Task definition
│   ├── task-{sprint}-{n}.plan  ← Worker implementation plan
│   ├── task-{sprint}-{n}.hb   ← Worker heartbeat (updated periodically)
│   ├── task-{sprint}-{n}.result← Worker result
│   └── ALERT                   ← Auditor critical alerts
│
├── .locks/                     ← File locks (runtime, auto-released)
│   └── {path__encoded}.lock    ← Lock files
│
├── .dashboard                  ← Live system state (Auditor overwrites)
│
├── .claude/
│   └── rules/                  ← Path-scoped agent rules
│       ├── brain.md
│       ├── auditor.md
│       └── worker-default.md
│
├── src/                        ← Source code (TypeScript ESM)
├── tests/                      ← Test files (vitest)
└── docs/                       ← Documentation
```

---

## 11. Sprint Lifecycle

```
DIRECTIVE → PLAN → SPAWN → AUDIT_START → EXECUTE → AUDIT_STOP → EVALUATE → FIX → RETRO → DECAY → TRANSITION
```

| Phase | Actor | Action | Output |
|-------|-------|--------|--------|
| **DIRECTIVE** | Operator | Write/update `DIRECTIVES.md` | Updated directives |
| **PLAN** | Brain | Read context, check usage, create task JSONs | `.tasks/task-{id}.json` × N |
| **SPAWN** | Brain | Spawn workers via tmux | N tmux windows |
| **AUDIT_START** | Brain | Start auditor scan loop (in-process) | Running scan interval |
| **EXECUTE** | Workers | Code, test, document, report | `.tasks/task-{id}.result` × N |
| **AUDIT_STOP** | Brain | Stop scan loop after all results collected | Cleared interval |
| **EVALUATE** | Brain | Grade each result: DONE / GO_DEBT / NO_GO | Evaluation records |
| **FIX** | Brain | Spawn priority-fix workers for NO_GO tasks | Fixed tasks (or recorded as debt) |
| **RETRO** | Brain | Update MEMORY, RETRO, DECISIONS, sprint log | Updated `.brain/` files |
| **DECAY** | Brain | Compress if `.brain/` > 300 lines | Cleaned `.brain/` |
| **TRANSITION** | Brain | More directives? Loop. Done? Report. | Sprint complete |

**Invariant:** Sprints are **never** left incomplete. Every phase is wrapped in try/catch, and the sprint always reaches the COMPLETE state even if individual tasks fail.

---

## 12. HTTP API & Web Dashboard

### API Endpoints

The HTTP API runs on port 3100 (default). Started via `deckent web` or `deckent serve`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check — returns `{ok: true}` |
| `GET` | `/status` | Current sprint status and agent states |
| `GET` | `/tasks` | All active task JSONs |
| `GET` | `/dashboard` | Full dashboard state (same as `.dashboard` file) |
| `GET` | `/events` | SSE stream — real-time dashboard updates |
| `GET` | `/memory` | Current `MEMORY.md` content |
| `GET` | `/patterns` | `PATTERNS.md` content (JSON array) |
| `GET` | `/retro` | Latest retrospective |
| `GET` | `/history` | Sprint history list |
| `GET` | `/config` | Current resolved config |
| `POST` | `/start` | Start a sprint |
| `POST` | `/stop` | Stop current sprint |
| `POST` | `/kill` | Kill a specific worker |
| `POST` | `/plan` | Dry-run plan (no spawn) |
| `POST` | `/cleanup` | Clean task artifacts |
| `POST` | `/sync` | Sync memory |

### SSE Real-Time Updates

The `/events` endpoint uses Server-Sent Events (SSE) to push dashboard updates to the browser in real-time:

```
Browser ──GET /events──► API Server
                          │
                          │ fs.watch('.dashboard')
                          │   ◄── Auditor overwrites .dashboard every 30s
                          │
                          └──► event: update
                               data: {dashboard JSON}
```

### Web Dashboard

The React dashboard (`src/dashboard/`) provides 4 pages:

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/` | Live agent status, progress, alerts, sprint info |
| Settings | `/settings` | Config editor, plan mode selector |
| History | `/history` | Sprint history, GO/NO-GO rates, test trends |
| Memory | `/memory` | Browse MEMORY.md, PATTERNS.md, DECISIONS.md |

---

## Related Documentation

| Document | Description |
|----------|-------------|
| [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md) | Primary system specification |
| [SECURITY.md](SECURITY.md) | Security model detail |
| [MEMORY-SYSTEM.md](MEMORY-SYSTEM.md) | Memory system detail |
| [BRAIN-GUIDE.md](BRAIN-GUIDE.md) | Brain operational guide |
| [WORKER-GUIDE.md](WORKER-GUIDE.md) | Worker operational guide |
| [DASHBOARD-GUIDE.md](DASHBOARD-GUIDE.md) | Dashboard guide |
| [MCP-GUIDE.md](MCP-GUIDE.md) | MCP integration guide |
| [CONFIG-REFERENCE.md](CONFIG-REFERENCE.md) | Full config reference |
| [SPRINT-LIFECYCLE.md](SPRINT-LIFECYCLE.md) | Sprint lifecycle detail |
| `.contracts/api-surface.md` | Inter-agent contracts |

---

*Generated for Sprint 25 — deckent v2.x — March 2026*
