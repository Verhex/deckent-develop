# Recipe 09: Recover a Stuck Sprint

If a sprint stalls — workers stop responding, heartbeats go stale, or a task never writes a result — follow this recovery chain in order.

## Manual Recovery Chain

```bash
# Step 1: Kill active workers
deckent kill --all

# Step 2: Cleanup task files
deckent cleanup

# Step 3: Recover orphan state (re-evaluates partial results)
deckent recover

# Step 4: Re-run a specific task manually
deckent run <task-id>

# Step 5: Spawn remaining tasks (auto-approve)
deckent spawn --auto-approve
```

## MCP Equivalent

```
deckent_kill    → { target: "all" }
deckent_cleanup → { root: "." }
deckent_recover → { root: "." }
deckent_run     → { taskId: "<task-id>" }
```

## When to Use Each Step

| Step | When |
|------|------|
| `kill --all` | Workers are running but unresponsive |
| `cleanup` | Task files from the previous sprint are stale or corrupted |
| `recover` | Partial results exist; Brain needs to re-evaluate them |
| `run <task-id>` | One specific task failed and needs a targeted retry |
| `spawn --auto-approve` | Remaining tasks exist but were never spawned |

You do not need to run all five steps every time — start from the step that matches the failure mode and continue down the chain until the sprint resumes.

## See Also

- `deckent status` — inspect current sprint state before deciding which step to start from
- `deckent doctor` — run a health check on the codebase and config
