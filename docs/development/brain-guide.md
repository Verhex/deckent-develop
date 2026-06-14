# Brain Guide — Deckent Orchestrator Internals

> Reference: [Architecture](../architecture/architecture.md) | [ADRs](../adr-index.md) | [.claude/rules/brain.md](../../.claude/rules/brain.md)

---

## Overview

Brain is the sole orchestrator in the deckent system. After the god-object split (ADR-024/026), the orchestration logic lives in `src/orchestra/sprint-controller.ts`. The file `src/orchestra/brain.ts` is now a **slim re-export layer** that re-exports public symbols from sprint-controller and its supporting modules for backward compatibility.

Brain is the **only** module family that imports from tmux, auditor, and worker — all other modules are either pure utilities or limited to `core/` imports (ADR-008).

### Module Architecture

```
DIRECTIVES.md
    │
    ▼
sprint-controller.ts  ── reads ──→ Memory V2 (SQLite .brain/memory.db)
    │                               via MemoryStore.getByType()
    ├── sprint-planner.ts     — readContext, planSprint
    ├── sprint-spawner.ts     — spawnWorkers, respawnEligibleTasks
    ├── sprint-reporter.ts    — writeRetrospective, writeSprintLog
    ├── debt-manager.ts       — handleEvaluation, escalateDebt, runDecay
    ├── result-collector.ts   — waitForResults
    └── task-builder.ts       — buildWorkerPrompt, createTask
```

The canonical import entry point is still `src/orchestra/brain.ts`, but actual logic lives in the modules above.

---

## Planning Modes

Brain supports three planning modes, controlled by `brain_planning` in `.deckent/config.json`:

| Mode | Behavior |
|------|----------|
| `ai` | Always use AI planner (`planner.ts`). Throws `BrainError` if AI fails. |
| `structured` | Parse `DIRECTIVES.md` with structured task block format (`## Task N:`). |
| `auto` | Try AI first; fall back to structured if AI planner returns null. |

Default: `auto`.

### AI Planning (`planner.ts`)

- Called via `planSprint()` in `src/orchestra/sprint-planner.ts`
- Brain model is set via `activeModeConfig.brain_model` (typically `opus` or `sonnet`)
- Returns a `PlannerResult` with a list of `PlannerTask` objects (Zod-validated)
- Each task includes: title, description, model, effort, priority, scope, dependencies, goNogo criteria

### Structured Planning

- Parses DIRECTIVES.md for `## Task N:` blocks via `parseStructuredDirectives()`
- Each block → task with `extractScopeFromDirective()` and `inferModelFromDirective()`
- If no structured blocks found, falls back to line-by-line parsing

### Model Inference (`inferModelFromDirective`)

Used only in structured mode to assign a model per task:

| Signal | Model |
|--------|-------|
| Trivial keywords (rename, typo, config change) + ≤2 files | `haiku` |
| Cross-module / architecture keywords OR ≥6 files | `opus` |
| Everything else | `sonnet` |

Keywords that trigger `opus`: `mimari`, `architect`, `cross-cutting`, `refactor system`, `multiple module`, `brain.*worker`, `orchestrat`

---

## Sprint Lifecycle

```
readContext → planSprint → routeSprintTasks → spawnWorkers
    → startScanLoop → waitForResults → stopScanLoop
    → evaluateResult → handleEvaluation → handleCrossDependencies
    → writeRetrospective → writeSprintLog → escalateDebt
    → runDecay → updateLastSprintId
```

Each phase is wrapped in `try/catch` in `runSprint()`. **Sprints are never left incomplete** — errors are logged but execution continues to completion.

### Wave Execution (ADR-045, ADR-064)

When `dependency_pipeline_enabled: true` (default), `spawnWorkers()` builds dependency waves via Kahn's topological sort algorithm (`src/orchestra/sprint-spawner.ts`). Each wave runs in parallel; subsequent waves unblock only after all blocking tasks reach `DONE ∪ MANUAL_REVIEW_REQUIRED`.

### Key Functions

| Function | Module | Description |
|----------|--------|-------------|
| `readContext(root)` | sprint-planner | Loads DIRECTIVES + Memory V2 DB (ADR/memory/retro/pattern/debt entries via MemoryStore) |
| `planSprint(root, config, ctx, rec)` | sprint-planner | Creates task JSONs in `.tasks/`, routes v2, returns `Sprint` |
| `spawnWorkers(root, sprint, config)` | sprint-spawner | Spawns workers via configured backend (docker/tmux/subprocess) |
| `waitForResults(root, sprint, timeout)` | sprint-controller | Polls `.tasks/task-*.result` (default timeout: 30min) |
| `evaluateResult(result, task, vitestJson?, threshold?)` | sprint-controller | Pure: DONE / GO_WITH_TECH_DEBT / NO_GO |
| `handleEvaluation(root, task, eval, result)` | debt-manager | Writes debt to DB, creates fix tasks, updates task status |
| `handleCrossDependencies(root, sprint, evals)` | debt-manager | Creates cross-fix tasks for causal NO_GOs |
| `writeRetrospective(root, sprint, evals, metrics)` | sprint-reporter | Writes retro entry to memory.db + exports |
| `writeSprintLog(root, sprint, metrics)` | sprint-reporter | Writes `.brain/sprints/sprint-NNN.md` |
| `escalateDebt(root)` | debt-manager | Increments `sprintsOpen`; escalates NORMAL→HIGH→CRITICAL |
| `runDecay(root, sprintId, opts)` | debt-manager | Trims memory.db via `store.decay()` when over budget |

---

## Task Creation

Tasks are written as JSON to `.tasks/task-{sprintNum}-{seq}.json`. The task ID format is `{sprintNum}-{seq}` (e.g., `286-001`).

```json
{
  "id": "286-001",
  "title": "...",
  "model": "opus | sonnet | haiku",
  "effort": "low | normal | high",
  "priority": "CRITICAL | HIGH | NORMAL | LOW",
  "scope": {
    "directories": ["src/orchestra/"],
    "filesRead": [],
    "filesWrite": ["src/orchestra/sprint-controller.ts"]
  },
  "dependencies": [],
  "goNogo": {
    "goCriteria": "Tests pass",
    "noGoCriteria": "Build fails",
    "techDebtAcceptable": "Minor issues"
  },
  "status": "PENDING",
  "sprintId": "sprint-286"
}
```

See `docs/reference/api-surface.md` for the full schema.

---

## GO/NO-GO Evaluation

`evaluateResult()` is a **pure function** — no side effects:

```
selfAssessment === 'NO_GO'             → TaskEvaluation.NO_GO
selfAssessment === 'GO_WITH_TECH_DEBT' → TaskEvaluation.GO_WITH_TECH_DEBT
selfAssessment === 'DONE':
  testsPassed === false                → TaskEvaluation.NO_GO
  coverage < threshold (default 90)   → TaskEvaluation.GO_WITH_TECH_DEBT
  else                                → TaskEvaluation.DONE
```

### Evaluation Outcomes

| Outcome | Effect |
|---------|--------|
| `DONE` | Task status → DONE, worker locks released |
| `GO_WITH_TECH_DEBT` | Task status → DONE, debt entry added to memory.db |
| `NO_GO` | Task status → NO_GO, fix task created (`task-{id}-fix.json`) |

### Cross-Dependency Handling

If task B is NO_GO and task A (which B depends on) was DONE/DEBT, a cross-fix task is created for A. This handles the case where A's output caused B's failure.

---

## Debt Escalation

`escalateDebt()` runs at the end of every sprint:

- Increments `sprintsOpen` for all unresolved debt items in memory.db
- `sprintsOpen >= DEBT_HIGH_PRIORITY_SPRINTS` → escalates NORMAL → HIGH
- `sprintsOpen >= DEBT_CRITICAL_SPRINTS` → escalates HIGH → CRITICAL

CRITICAL debt items are automatically added as priority fix tasks at the **start** of the next sprint's `planSprint()` call.

---

## Memory V2 — DB-First Architecture (ADR-088)

All brain knowledge lives in **`.brain/memory.db`** (SQLite, `better-sqlite3`). Markdown files in `.brain/exports/` are generated snapshots used for git diff review.

### Schema

Five tables + one FTS5 virtual table:

| Table | Purpose |
|-------|---------|
| `entries` | Main knowledge store (type: adr, memory, sprint, debt, pattern, retro, identity) |
| `tags` | Normalized many-to-many tag association |
| `relations` | Cross-reference (references, supersedes, caused_by, resolves, blocks, depends_on) |
| `entry_history` | Field-level change tracking |
| `entries_fts` | FTS5 full-text search (dual-layer: original + `turkishNormalize()`) |
| `schema_version` | Migration safety |

### Reading Context

`readContext()` in `src/orchestra/sprint-planner.ts` loads context from the DB:

```typescript
const store = new MemoryStore(dbPath);
const memEntries   = store.getByType('memory');   // sprint learnings
const retroEntries = store.getByType('retro');     // retrospectives
const patternEntries = store.getByType('pattern'); // violation patterns
const adrEntries   = store.getByType('adr').filter(a => a.status === 'accepted');
const debtEntries  = store.getByType('debt').filter(d => d.status !== 'resolved');
store.close();
```

### Writing Results

Brain writes sprint results back to the DB:

```typescript
store.insert({ type: 'retro', sprint_id, body: retrospectiveText });
store.insert({ type: 'memory', sprint_id, body: learningText });
store.insert({ type: 'debt',   sprint_id, title, body, status: 'open' });
```

### Decay

`runDecay()` calls `store.decay(currentSprintNum, decayAfterSprints)` to evict old entries that exceed the memory budget. The budget is 900 lines in `.brain/` (excluding archive). After decay, `.brain/exports/` is regenerated via `deckent memory export`.

### Generated Exports (Read-Only)

| File | Content |
|------|---------|
| `.brain/exports/summary.md` | Active ADRs + recent learnings + debt — auto-loaded via @import |
| `.brain/exports/decisions.md` | Full ADR list for git diff review |
| `.brain/exports/memory.md` | Sprint learnings snapshot |
| `.brain/exports/debt.md` | Debt table snapshot |

**Do not edit these files directly** — they are regenerated every sprint.

---

## Worker Prompt Generation

`buildWorkerPrompt(task)` in `src/orchestra/task-builder.ts` generates the full prompt sent to each worker. The prompt includes:

- Task ID, title, description, scope
- Heartbeat file instructions (`.tasks/task-{id}.hb`)
- Result file format (`.tasks/task-{id}.result`)
- Injected ADR constraints (from memory.db `adr` entries with `status: 'accepted'`)
- Agent system prompt (from `.deckent/agents/{id}/PROMPT.md`)
- Skill prompts (from `.deckent/skills/{id}/skill.json`)
- Karpathy 4-Discipline anchor
- Test and coverage requirements

Workers must write a result file with `selfAssessment: "DONE" | "GO_WITH_TECH_DEBT" | "NO_GO"`.

---

## Config Reference

Key config fields relevant to Brain (from `src/core/config.ts`):

| Field | Description |
|-------|-------------|
| `brain_planning` | `'ai' \| 'structured' \| 'auto'` (default: `'auto'`) |
| `brain_model` | Model for Brain/Planner itself (default: `'opus'`) |
| `brain_tier` | Provider-agnostic tier for Brain (`premium_plus / premium / standard / economy`) |
| `worker_tier` | Provider-agnostic tier for workers |
| `max_workers` | Max concurrent workers (default: mode-dependent) |
| `spawn_backend` | Worker spawn mode: `'docker' \| 'tmux' \| 'subprocess'` (default: `'docker'`) |
| `dependency_pipeline_enabled` | Wave-based execution via Kahn's algorithm (default: `true`) |
| `memory.backend` | Memory backend: `'sqlite'` (default) |

See `docs/reference/config.md` for the full config schema.

---

## ADR Governance

Brain enforces ADR compliance in two ways:

1. **Compile-time lint** (`src/orchestra/authority-enforcer.ts`): checks import direction violations (ADR-008) and RBAC rules (ADR-037).
2. **Prompt injection**: accepted ADRs from `memory.db` are injected into every worker's prompt as mandatory constraints.

Workers that violate an accepted ADR must write `selfAssessment: "NO_GO"` and propose an amendment.

---

*Source: `src/orchestra/brain.ts`, `src/orchestra/sprint-controller.ts`, `src/orchestra/sprint-planner.ts`, `src/core/memory-store.ts`*
