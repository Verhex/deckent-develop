# Your First Sprint

> A detailed walkthrough of running your first Deckent sprint from start to finish.

If you have not installed Deckent yet, see [Getting Started](/guide/getting-started) first.

---

## Overview

A sprint is one cycle of AI-driven development. You write goals, Deckent's Brain plans and assigns tasks to worker agents, and each worker independently writes, tests, and documents code. At the end, Brain evaluates every result.

This guide walks through a realistic example: adding a health check endpoint and a config page to a web app.

---

## 1. Set Up Your Directives

Create or edit `DIRECTIVES.md` in your project root:

```markdown
# DIRECTIVES -- Sprint 1: Health Check + Config Page

## Goal: Add a /health endpoint and a settings page to the dashboard.

## Task 1: Health Check Endpoint
- Model: claude-sonnet-5
- Effort: low
- Files: src/api/health.ts (new), tests/api/health.test.ts (new)
- Scope: src/api/, tests/api/

### Description
Add a GET /health endpoint that returns system status.
- Return JSON with uptime, version, and dependency checks
- 200 if healthy, 503 if degraded
- Write at least 3 tests

## Task 2: Settings Page
- Model: claude-opus-4-8
- Effort: normal
- Files: src/pages/settings.tsx (new), tests/pages/settings.test.tsx (new)
- Scope: src/pages/, tests/pages/, src/components/

### Description
Build a settings page for the dashboard.
- Load current config from GET /api/config
- Allow editing provider and notification settings
- Save with POST /api/config
- Show validation errors inline
- Write at least 5 tests
```

### Directive Tips

- **Model selection**: Use exact registered API IDs in `Model` fields. The current Claude examples are `claude-opus-4-8` for complex work, `claude-sonnet-5` for standard work, and `claude-haiku-4-5-20251001` for simple work. Run `deckent models list` for the current catalog; provider-agnostic policy should select a tier and let the registry resolve it.
- **Effort levels**: `low` (< 50 lines), `normal` (50-200 lines), `high` (200+ lines). Brain uses this to estimate time and parallelism.
- **Scope**: List all directories a worker may read from or write to. The auditor flags boundary violations.

---

## 2. Preview the Plan

```bash
deckent plan
```

Output:

```
Sprint 001 -- 2 tasks planned

  ID        TITLE                  MODEL    PRIORITY   EFFORT
  001-001   Health Check Endpoint  claude-sonnet-5   NORMAL     low
  001-002   Settings Page          claude-opus-4-8   HIGH       normal

Max workers: 8 (performance)
Planning mode: ai
```

If the plan looks right, proceed. If not, edit your directives and run `deckent plan` again.

---

## 3. Start the Sprint

```bash
deckent start
```

What happens under the hood:

1. **PLAN phase** -- Brain reads directives, creates `.tasks/task-001-001.json` and `.tasks/task-001-002.json`
2. **SPAWN phase** -- Brain launches each ready task on its resolved backend. Fresh config defaults to Docker; init explicitly persists `subprocess` when Docker cannot be prepared. `spawn_backend: auto` resolves to subprocess on native Windows and Docker elsewhere, with no silent runtime fallback chain. Explicit tmux selection is deprecated. When `dependency_pipeline_enabled: true` (the default), tasks are sorted into dependency waves via Kahn's topological algorithm so independent tasks run in parallel and dependent tasks unblock only when their dependencies are done
3. **EXECUTE phase** -- Workers read their task files, write code, run tests, produce `.result` files; heartbeat files (`.hb`) are written periodically so the Auditor can detect stale workers
4. **EVALUATE phase** -- Brain reads each `.result`, assigns GO / NO-GO / GO_WITH_TECH_DEBT
5. **FIX phase** -- Failed tasks are retried with enriched prompts (optional, configurable timeout)
6. **RETRO phase** -- Brain writes a retrospective to the memory DB, updates sprint learnings
7. **DECAY phase** -- Old memory entries are pruned to stay within the budget
8. **COMPLETE phase** -- Cleanup operations run (task files archived, file locks released); the sprint is marked complete

### Watching Workers Live

Monitor progress on every backend with `deckent status --watch`. For a
Docker-backed task, follow its container logs with:

```bash
deckent watch --follow 001-001
```

If you explicitly selected the deprecated tmux backend, you may instead attach
with `tmux attach -t deckent`. For subprocess workers, `deckent status --watch`
is the portable path today; fully unified live-log following remains tracked
backend-parity work.

### Monitoring Progress

In another terminal:

```bash
deckent status --watch
```

This refreshes every 2 seconds:

```
Sprint sprint-001 -- EXECUTE phase

  TASK        STATUS      MODEL    LAST HEARTBEAT
  001-001     DONE        claude-sonnet-5   12s ago
  001-002     EXECUTING   claude-opus-4-8   3s ago

Progress: 1/2 done  |  0 failed  |  1 running

No alerts.
```

---

## 4. Review Results

When the sprint finishes:

```bash
deckent status
```

```
Sprint sprint-001 -- COMPLETE

  TASK        STATUS   MODEL    ASSESSMENT
  001-001     DONE     claude-sonnet-5   DONE
  001-002     DONE     claude-opus-4-8   DONE

Progress: 2/2 done  |  0 failed

Sprint completed in 4m 32s
```

### Inspect Individual Results

```bash
cat .tasks/task-001-001.result
```

```json
{
  "taskId": "001-001",
  "filesChanged": ["src/api/health.ts", "tests/api/health.test.ts"],
  "linesAdded": 45,
  "linesRemoved": 0,
  "testsPassed": true,
  "coverage": 100,
  "selfAssessment": "DONE",
  "notes": "GET /health endpoint with uptime, version, and dep checks"
}
```

### Check the Retrospective

Brain writes what it learned:

```bash
deckent retro
```

### Review Technical Debt

If any task was marked `GO_WITH_TECH_DEBT`, Brain logs it in the memory DB. View the exported file:

```bash
cat .brain/exports/debt.md
```

---

## 5. Iterate

Edit `DIRECTIVES.md` with your next goals and run another sprint:

```bash
deckent start
```

Brain remembers what it learned. Each sprint builds on the last -- memory persists, patterns are recognized, and debt is tracked.

### Useful Commands Between Sprints

| Command | Description |
|---------|-------------|
| `deckent status` | Current sprint status |
| `deckent history` | Past sprint summaries |
| `deckent retro` | Latest retrospective |
| `deckent doctor` | Health check |
| `deckent config` | Current configuration (add `--raw` for unmerged project config) |

---

## Common Scenarios

### A Task Gets NO_GO

If a task fails, Brain logs the reason. Check the result file:

```bash
cat .tasks/task-001-002.result
```

Fix the underlying issue (often a missing dependency or unclear directive), update `DIRECTIVES.md`, and run the next sprint.

### Workers Are Slow

- Check `deckent status --watch` for stale heartbeats
- Reduce task complexity by splitting into smaller tasks
- Use an exact economy model ID such as `claude-haiku-4-5-20251001` for simple tasks when policy and reachability allow it

### Want to Use Multiple Providers

Configure different providers for Brain and workers:

```json
{
  "providers": {
    "brain": "claude",
    "worker": "codex"
  },
  "provider_fallback": {
    "brain": ["codex", "gemini"],
    "worker": ["claude", "gemini"],
    "auditor_provider": "codex",
    "auditor": ["claude", "gemini"],
    "unattended": false
  }
}
```

This is candidate order, not availability proof. Dispatch still requires valid
auth, backend/model reachability, limit evidence, and execution-budget admission.

See the [Multi-Provider Guide](/reference/multi-provider) for details.

---

## Next Steps

- [Core Concepts](/guide/concepts) — Deep dive into how Deckent works
- [Config Reference](/reference/config) — Tune every parameter
- [FAQ](/guide/faq) — Common questions answered
