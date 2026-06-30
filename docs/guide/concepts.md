# Core Concepts

> Understanding how Deckent orchestrates AI agents to build software.

---

## Sprint

A **sprint** is one cycle of planning, executing, and evaluating work. Each sprint has a unique ID (e.g., `sprint-001`) and follows a fixed lifecycle:

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → COMPLETE
```

1. **PLAN** -- Brain reads your `DIRECTIVES.md` and creates task JSON files in `.tasks/`
2. **SPAWN** -- Brain launches worker agents (one per task, in parallel); when `dependency_pipeline_enabled` is true (the default), tasks are sorted into dependency waves via Kahn's topological algorithm and each wave runs in parallel before the next is unblocked
3. **EXECUTE** -- Workers write code, run tests, produce `.result` files
4. **EVALUATE** -- Brain reviews each result: DONE, GO_WITH_TECH_DEBT, or NO_GO
5. **FIX** -- Failed tasks are retried (configurable timeout); Brain enriches the retry prompt with failure context
6. **RETRO** -- Brain writes a retrospective to the memory DB and updates project learnings
7. **DECAY** -- Old memory entries are pruned to stay within the sprint budget
8. **COMPLETE** -- Cleanup operations run (task files archived, file locks released); the sprint is marked complete

Sprints are never left incomplete. If a worker stalls, the auditor detects it and Brain handles the failure.

---

## Task

A **task** is a single unit of work assigned to one worker. Tasks are defined in your `DIRECTIVES.md` and stored as JSON files in `.tasks/`:

```json
{
  "id": "001-001",
  "title": "User Authentication",
  "model": "sonnet",
  "effort": "normal",
  "priority": "HIGH",
  "scope": {
    "directories": ["src/auth/", "tests/auth/"],
    "filesWrite": ["src/auth/index.ts", "tests/auth/auth.test.ts"]
  },
  "status": "PENDING"
}
```

Key properties:

- **model** -- Which AI model runs the task (`opus`, `sonnet`, or `haiku`)
- **effort** -- Expected complexity (`low`, `normal`, `high`)
- **scope** -- Directories and files the worker may access
- **status** -- Lifecycle state: DRAFT → PENDING → CLAIMED → EXECUTING → TESTING → DOCUMENTING → DONE (terminal success); NO_GO (terminal failure); PAUSED (blocked by a failed dependency); MANUAL_REVIEW_REQUIRED (result evidence exists but no `.result` file)

### Task Results

Every completed task produces a `.result` file:

- **DONE** -- All GO criteria met, tests pass
- **GO_WITH_TECH_DEBT** -- Functional but with known shortcuts (logged in the memory DB, exported to `.brain/exports/debt.md`)
- **NO_GO** -- Failed to meet criteria; Brain logs the reason for the next sprint

---

## Agent

An **agent** is an AI process that performs a specific role. Deckent uses three types of agents:

### Brain

The **Brain** is the orchestrator. There is exactly one Brain per sprint. It:

- Reads your directives and project context
- Plans tasks using AI or structured mode
- Spawns worker agents
- Evaluates results
- Writes retrospectives and updates memory

Brain and its orchestration layer are the only components that import worker-execution modules (tmux, auditor, worker). Workers and the auditor do not import Brain.

### Worker

A **Worker** is a scoped execution agent. Each task gets its own worker. Workers:

- Read their assigned task file
- Write code within their allowed scope
- Run `tsc --noEmit` and tests before marking done
- Produce a `.result` file for Brain to evaluate
- Update heartbeat files (`.hb`) so the auditor can track them

Workers run in parallel -- one tmux window (or subprocess) per worker. They cannot see or modify each other's files.

### Auditor

The **Auditor** is the monitoring agent. It runs in-process alongside Brain and:

- Scans every 30 seconds for stale workers (no heartbeat > 2 minutes)
- Detects boundary violations via `git diff --stat`
- Checks for stale file locks
- Monitors usage thresholds
- Updates the dashboard state

The auditor never writes source code. It only observes and reports.

---

## Skill

A **skill** is a specialized capability injected into a worker agent's prompt, providing domain-specific knowledge and best practices. Deckent ships 21 built-in skills:

| Skill | Domain |
|-------|--------|
| `typescript-expert` | TypeScript type system, ESM, generics |
| `testing-expert` | Vitest/Jest, mocks, coverage strategy |
| `documentation-writer` | Markdown, JSDoc, API docs |
| `security-specialist` | OWASP, input validation, cryptography |
| `performance-optimizer` | Async optimization, profiling |
| `react-specialist` | React, Vite, Tailwind, components |
| `system-architect` | System design, ADRs, scalability |
| `docker-expert` | Dockerfile, compose, container ops |
| `git-expert` | Branching, merge strategy |
| `api-builder` | REST design, OpenAPI spec |

Skills are assigned per task in `DIRECTIVES.md` via the `- Skills:` field, and Deckent's routing engine automatically selects the best match based on task scope and project stack. Workers without an explicit skill assignment receive the most relevant built-in skills for their task type.

Skill selection is tunable through the `skill_routing` block in `.deckent/config.json` — it controls scoring weights, the minimum activation threshold, and the per-task skill budget the router uses when matching skills to a task.

---

## Scope

**Scope** defines the boundaries of what a worker can access. Every task specifies:

- `directories` -- Folders the worker may read from and write to
- `filesRead` -- Additional files the worker may read (outside directories)
- `filesWrite` -- Specific files the worker may create or modify

```json
{
  "scope": {
    "directories": ["src/auth/", "tests/auth/"],
    "filesRead": ["src/types.ts", "package.json"],
    "filesWrite": ["src/auth/index.ts", "tests/auth/auth.test.ts"]
  }
}
```

The auditor enforces scope boundaries. If a worker modifies a file outside its scope, the violation is flagged and the task may receive a NO_GO evaluation.

---

## Memory

Deckent has a persistent **Memory V2** system backed by SQLite (`.brain/memory.db`). This is the single source of truth for all project knowledge: ADRs, sprint learnings, debt records, patterns, and retrospectives.

**Key facts:**

- **Storage:** `.brain/memory.db` — SQLite with FTS5 full-text search (dual-layer Turkish/English normalization for 100% recall across both languages)
- **Exports:** `.brain/exports/summary.md`, `decisions.md`, `memory.md`, `debt.md` — auto-generated after each sprint for git tracking and agent context
- **Schema:** 5 tables (`entries`, `tags`, `relations`, `entry_history`, `schema_version`) plus an FTS5 virtual table
- **Decay:** Old entries are pruned automatically after a configurable number of sprints (`decay_after_sprints`, default: 20), keeping Brain focused on recent context
- **CLI:** `deckent recall "<query>"` searches memory; `deckent remember "<note>"` saves a note; `deckent memory stats` shows DB health

Search memory from the command line:

```bash
deckent recall "docker heartbeat"
```

View exports:

```bash
cat .brain/exports/memory.md    # sprint learnings
cat .brain/exports/debt.md      # technical debt log
cat .brain/exports/decisions.md # architecture decision records
```

---

## Directives

**Directives** (`DIRECTIVES.md`) are your instructions to Brain. They define:

- The sprint goal
- Individual tasks with scope, model, and effort
- GO/NO-GO criteria
- Test requirements

Directives are the primary input to every sprint. Write them clearly, and Brain handles the rest.

```markdown
# DIRECTIVES -- Sprint 3: API Hardening

## Goal: Add rate limiting and input validation to all endpoints.

## Task 1: Rate Limiter
- Model: sonnet
- Effort: normal
- Files: src/api/rate-limiter.ts (new)
- Scope: src/api/

### Description
Implement token bucket rate limiting middleware.
```

---

## Configuration

Deckent is configured via `.deckent/config.json`. Key categories:

| Category | Examples |
|----------|----------|
| **Provider** | `brain_provider`, `worker_provider`, `fallback_provider` |
| **Sprint** | `max_workers`, `brain_planning`, `fix_phase_enabled` |
| **Memory** | `memory_budget`, `decay_after_sprints` |
| **Auditor** | `scan_interval`, `heartbeat_timeout` |
| **Output** | `output_mode`, `output_theme` |

See the full [Config Reference](/reference/config) for all parameters and their defaults.

---

## How It All Fits Together

```
You write DIRECTIVES.md
        ↓
   Brain reads it
        ↓
   Brain plans tasks (.tasks/)
        ↓
   Workers spawn (tmux/subprocess)
        ↓
   Workers code + test in parallel
        ↓
   Auditor monitors boundaries
        ↓
   Brain evaluates results
        ↓
   Memory + Retro updated
        ↓
   Ready for next sprint
```

Each sprint builds on the previous one. Brain remembers what worked, what failed, and what debt was accumulated. Over time, the system learns your project's patterns and becomes more effective.

---

## Next Steps

- [Getting Started](/guide/getting-started) — Install and run your first sprint
- [Your First Sprint](/guide/first-sprint) — Step-by-step walkthrough
- [Config Reference](/reference/config) — Customize every parameter
- [API Reference](/reference/api) — Programmatic API and HTTP surface
