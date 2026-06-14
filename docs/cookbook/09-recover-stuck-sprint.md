# Recipe 09: Recover a Stuck Sprint

If a sprint stalls — workers stop responding, heartbeats go stale, or a task never writes a result — follow this recovery chain in order. Start from the step that matches your failure mode and continue down until the sprint resumes.

## Manual Recovery Chain

```bash
# Step 1: Kill all active workers (requires confirmation unless --force)
deckent kill --all

# Step 2: Clean up task files and release locks
deckent cleanup

# Step 3: Recover orphan state for the stuck sprint
deckent recover <sprint-id>

# Step 4: Re-run a specific failed task
deckent spawn <task-id> --force

# Step 5: Start the sprint again to spawn remaining pending tasks
deckent start
```

Replace `<sprint-id>` with the actual sprint identifier (e.g., `sprint-286`). Replace `<task-id>` with the specific task that failed (e.g., `286-003`).

`deckent kill --all` prompts for confirmation in an interactive terminal. Pass `--force` to skip the prompt in scripts:

```bash
deckent kill --all --force
```

## MCP Equivalent

```
deckent_kill    → { target: "all" }
deckent_cleanup → { root: "." }
deckent_recover → { root: "." }
deckent_run     → { taskId: "<task-id>" }
```

Note: `deckent_run` (MCP) accepts a task ID directly. The CLI equivalent for re-running an existing task by ID is `deckent spawn <task-id> --force`.

## When to Use Each Step

| Step | Command | When |
|------|---------|------|
| 1 | `deckent kill --all` | Workers are running but unresponsive or heartbeats are stale |
| 2 | `deckent cleanup` | Task files from the stuck sprint are stale or locks are held |
| 3 | `deckent recover <sprint-id>` | Partial results exist; stale IPC dirs or orphan lock files need clearing |
| 4 | `deckent spawn <task-id> --force` | One specific task failed (NO_GO) and needs a targeted retry |
| 5 | `deckent start` | Remaining tasks are still PENDING; re-launching the sprint spawns them |

You do not need to run all five steps every time. If `deckent status` shows that only one task is stuck, jump directly to step 4.

## What `deckent recover` Does

`deckent recover <sprint-id>` runs in order:

1. **Audit gate** — runs the Brain Self-Audit to evaluate partial results
2. **Orphan IPC cleanup** — removes `.deckent/sprint-*-ipc/` directories whose PID is dead
3. **Stale lock cleanup** — clears `.locks/*.lock` and `.locks/*.spawnlock` files older than 5 minutes
4. **Terminal task archive** — archives DONE/NO_GO task files, preserves PENDING/EXECUTING tasks

Preview what `recover` would do without making changes:

```bash
deckent recover <sprint-id> --dry-run
```

Skip the audit step (faster when you know it is safe):

```bash
deckent recover <sprint-id> --skip-audit
```

## Diagnose Before Recovering

Check the sprint state before deciding which step to start from:

```bash
# Current sprint state, worker heartbeats, alerts
deckent status

# Stale heartbeat or boundary violation alerts
deckent status --verbose

# Codebase health check
deckent doctor
```

If `deckent status` shows workers in EXECUTING state with timestamps more than 2 minutes old, their heartbeats are stale — start from step 1.

## See Also

- `deckent status` — inspect current sprint state before deciding which step to start from
- `deckent doctor` — run a health check on the codebase and config
- `deckent history` — view past sprint outcomes to understand what failed
