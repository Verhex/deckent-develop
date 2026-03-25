# Core Concepts

> Understanding how Deckent orchestrates AI agents to build software.

---

## Sprint

A **sprint** is one cycle of planning, executing, and evaluating work. Each sprint has a unique ID (e.g., `sprint-001`) and follows a fixed lifecycle:

```
PLAN → SPAWN → EXECUTE → EVALUATE → RETRO → DECAY
```

1. **PLAN** -- Brain reads your `DIRECTIVES.md` and creates task files
2. **SPAWN** -- Brain launches worker agents (one per task, in parallel)
3. **EXECUTE** -- Workers write code, run tests, produce results
4. **EVALUATE** -- Brain reviews each result: DONE, GO_WITH_TECH_DEBT, or NO_GO
5. **RETRO** -- Brain writes a retrospective and updates project memory
6. **DECAY** -- Old memories are pruned to stay within budget

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
- **status** -- Lifecycle state: PENDING → CLAIMED → EXECUTING → TESTING → DONE

### Task Results

Every completed task produces a `.result` file:

- **DONE** -- All GO criteria met, tests pass
- **GO_WITH_TECH_DEBT** -- Functional but with known shortcuts (logged in `.brain/DEBT.md`)
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

Brain is the only agent that imports from all other modules. It is the single point of coordination.

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

A **skill** is a specialized capability that workers can use. Skills provide domain-specific knowledge and tools:

- **design** -- UI/UX patterns and component architecture
- **testing** -- Test strategies and coverage optimization
- **docs** -- Documentation generation and formatting
- **default** -- General-purpose coding

Skills are configured via `skill_routing` in `config.json`:

```json
{
  "skill_routing": {
    "design": "opus",
    "testing": "sonnet",
    "docs": "haiku",
    "default": "sonnet"
  }
}
```

Each skill maps to a model, so the right level of AI capability is used for each type of work.

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

Deckent has a persistent **memory system** in `.brain/`:

| File | Purpose | Limit |
|------|---------|-------|
| `MEMORY.md` | Sprint learnings and patterns | 600 lines |
| `DEBT.md` | Technical debt log | No hard limit |
| `RETRO.md` | Latest retrospective | 100 lines |
| `DECISIONS.md` | Architecture decision records | No hard limit |
| `PATTERNS.md` | Recognized code patterns | No hard limit |
| `sprints/` | Per-sprint logs | 80 lines each |

Memory **decays** automatically. After a configurable number of sprints (default: 5), old entries are pruned to stay within budget. This keeps Brain focused on recent, relevant context.

The `PROJECT-IDENTITY.md` file is the exception -- it is permanent and never decayed.

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

- [Getting Started](/guide/getting-started) -- Install and run your first sprint
- [Your First Sprint](/guide/first-sprint) -- Step-by-step walkthrough
- [Config Reference](/reference/config) -- Customize every parameter
- [Architecture](/guide/architecture) -- Deep dive into internals
