# Brain Guide — Deckent Orchestrator Internals

> Reference: [ARCHITECTURE.md](ARCHITECTURE.md) | [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md) | [.claude/rules/brain.md](../.claude/rules/brain.md)

---

## Overview

The Brain (`src/orchestra/brain.ts`) is the sole orchestrator in the Deckent system. It is the **only** module that imports from tmux, auditor, and worker — all other modules are either pure utilities or limited to `core/` imports (see ADR-008 in `.brain/DECISIONS.md`).

```
DIRECTIVES.md
    │
    ▼
  Brain ──── reads ──→ MEMORY, RETRO, DEBT, PATTERNS, DECISIONS
    │
    ├── Planner (AI or structured)
    ├── tmux (worker spawn/kill)
    ├── Auditor (scan loop)
    └── Worker utils (task status, locks)
```

---

## Planning Modes

Brain supports three planning modes, controlled by `brain_planning` in `.deckent/config.json`:

| Mode | Behavior |
|------|----------|
| `ai` | Always use AI planner (`planner.ts`). Throws `BrainError` if AI fails. |
| `structured` | Parse `DIRECTIVES.md` with structured task block format (`## Görev N:`). |
| `auto` | Try AI first; fall back to structured if AI planner returns null. |

Default: `auto`.

### AI Planning (`planner.ts`)

- Calls `callBrainPlanner(context, recommendation, brainModel, projectName)`
- Brain model is set via `activeModeConfig.brain_model` (typically `opus` or `sonnet`)
- Returns a `PlannerResult` with a list of `PlannerTask` objects (Zod-validated)
- Each task includes: title, description, model, effort, priority, scope, dependencies, goNogo criteria

### Structured Planning

- Parses DIRECTIVES.md for `## Görev N:` or `## Task N:` blocks via `parseStructuredDirectives()`
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
readContext → planSprint → spawnWorkers
    → startScanLoop → waitForResults → stopScanLoop
    → evaluateResult → handleEvaluation → handleCrossDependencies
    → writeRetrospective → writeSprintLog → escalateDebt
    → runDecay → updateLastSprintId
```

Each phase is wrapped in `try/catch` in `runSprint()`. **Sprints are never left incomplete** — errors are logged but execution continues to COMPLETE.

### Key Functions

| Function | Description |
|----------|-------------|
| `readContext(root)` | Loads DIRECTIVES, MEMORY, RETRO, DEBT, PATTERNS, DECISIONS + git state |
| `planSprint(root, config, ctx, rec)` | Creates task JSONs in `.tasks/`, returns `Sprint` |
| `spawnWorkers(root, sprint, config)` | Spawns tmux windows via `spawnWorker()` |
| `waitForResults(root, sprint, timeout)` | Polls `.tasks/task-*.result` every 15s (default timeout: 30min) |
| `evaluateResult(result, task)` | Pure: DONE / GO_WITH_TECH_DEBT / NO_GO |
| `handleEvaluation(root, task, eval, result)` | Writes debt, fix tasks, updates task status |
| `handleCrossDependencies(root, sprint, evals)` | Creates cross-fix tasks for causal NO_GOs |
| `writeRetrospective(root, sprint, evals, metrics)` | Writes RETRO.md + appends to MEMORY.md |
| `writeSprintLog(root, sprint, metrics)` | Writes `.brain/sprints/sprint-NNN.md` |
| `escalateDebt(root)` | Increments `sprintsOpen`; escalates NORMAL→HIGH→CRITICAL |
| `runDecay(root, sprintId, opts)` | Compresses `.brain/` if over 900-line budget |

---

## Task Creation

Tasks are written as JSON to `.tasks/task-{sprintNum}-{seq}.json`. The task ID format is `{sprintNum}-{seq}` (e.g., `019-001`).

```json
{
  "id": "019-001",
  "title": "...",
  "model": "opus | sonnet | haiku",
  "effort": "low | normal | high",
  "priority": "CRITICAL | HIGH | NORMAL | LOW",
  "scope": {
    "directories": ["src/orchestra/"],
    "filesRead": [],
    "filesWrite": ["src/orchestra/brain.ts"]
  },
  "dependencies": [],
  "goNogo": {
    "goCriteria": "Tests pass",
    "noGoCriteria": "Build fails",
    "techDebtAcceptable": "Minor issues"
  },
  "status": "PENDING",
  "sprintId": "sprint-019"
}
```

See `.contracts/api-surface.md` for the full schema.

---

## GO/NO-GO Evaluation

`evaluateResult()` is a **pure function** — no side effects:

```
selfAssessment === 'NO_GO'           → TaskEvaluation.NO_GO
selfAssessment === 'GO_WITH_TECH_DEBT' → TaskEvaluation.GO_WITH_TECH_DEBT
selfAssessment === 'DONE':
  testsPassed === false              → TaskEvaluation.NO_GO
  coverage < 90                     → TaskEvaluation.GO_WITH_TECH_DEBT
  else                              → TaskEvaluation.DONE
```

### Evaluation Outcomes

| Outcome | Effect |
|---------|--------|
| `DONE` | Task status → DONE, worker locks released |
| `GO_WITH_TECH_DEBT` | Task status → DONE, debt entry added to `.brain/DEBT.md` |
| `NO_GO` | Task status → NO_GO, fix task created (`task-{id}-fix.json`) |

### Cross-Dependency Handling

If task B is NO_GO and task A (which B depends on) was DONE/DEBT, a cross-fix task is created for A. This handles the case where A's output caused B's failure.

---

## Debt Escalation

`escalateDebt()` runs at the end of every sprint:

- Increments `sprintsOpen` for all unresolved debt items
- `sprintsOpen >= DEBT_HIGH_PRIORITY_SPRINTS` → escalates NORMAL → HIGH
- `sprintsOpen >= DEBT_CRITICAL_SPRINTS` → escalates HIGH → CRITICAL

CRITICAL debt items are automatically added as priority fix tasks at the **start** of the next sprint's `planSprint()` call.

---

## Memory Management

### 3-Tier Memory System

| Tier | File | Max Lines | Loaded When | Decay |
|------|------|-----------|-------------|-------|
| 1 | `.brain/MEMORY.md` | 300 | Always (via @import) | Trimmed when budget exceeded |
| 2 | `.brain/sprints/sprint-NNN.md` | 80 each | Brain reads last 2 | Archived after 2 sprints |
| 3 | `.brain/archive/` | Unlimited | On-demand grep | Never |

Total `.brain/` budget: **900 lines** (excluding archive).

### Decay (`runDecay`)

Runs at sprint end when `.brain/` exceeds 900 lines (or with `force: true`):

1. Remove resolved patterns from `PATTERNS.md`
2. Remove resolved debt from `DEBT.md`
3. Archive old sprint logs (keep last 2) → `.brain/archive/`
4. Trim MEMORY.md to `MEMORY_MAX_LINES` (300)

`runDecay()` returns a `DecayResult` with counts of what was removed/archived.

---

## Worker Prompt Generation

`buildWorkerPrompt(task)` generates the full Claude prompt sent to each worker tmux window. The prompt includes:

- Task ID, title, description, scope
- Heartbeat file instructions (`.tasks/task-{id}.hb`)
- Result file format (`.tasks/task-{id}.result`)
- Test and coverage requirements

Workers must write a result file with `selfAssessment: "DONE" | "GO_WITH_TECH_DEBT" | "NO_GO"`.

---

## Config Reference

Key `activeModeConfig` fields relevant to Brain:

| Field | Description |
|-------|-------------|
| `brain_planning` | `'ai' \| 'structured' \| 'auto'` (default: `'auto'`) |
| `brain_model` | Model for Brain/Planner itself (default: `'opus'`) |
| `default_model` | Default model for workers when not inferred |
| `max_workers` | Max concurrent workers |
| `haiku_allowed` | Whether haiku is allowed in minimal usage mode |

See [CONFIG-REFERENCE.md](CONFIG-REFERENCE.md) for the full config schema.

---

*Source: `src/orchestra/brain.ts` | Blueprint Sections 5, 8, 10*
