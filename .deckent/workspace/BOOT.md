# Boot Sequence
1. Brain reads `DIRECTIVES.md`
2. Brain checks context (MEMORY, RETRO, DEBT, PATTERNS from `.brain/memory.db`)
3. Brain plans sprint — AI mode (`deckent_plan mode:ai`) with Zod validation
4. Workers spawned via configured backend (tmux/subprocess/Docker), auditor scan loop starts (in-process)
5. Workers execute tasks, write heartbeats (`.hb` files), update progress
6. Brain waits for `.result` files, evaluates GO / NO_GO / GO_WITH_TECH_DEBT
7. Retrospective written to DB → memory update → decay → sprint complete

## Manual Recovery Chain

If a sprint stalls, follow this chain in order:

```bash
# Step 1: Kill active workers
deckent kill --all

# Step 2: Cleanup task files
deckent cleanup

# Step 3: Recover orphan state (re-evaluates partial results)
deckent recover

# Step 4: Re-run specific task manually
deckent run <task-id>

# Step 5: Spawn remaining tasks (auto-approve)
deckent spawn --auto-approve
```

**MCP equivalent:**
```
deckent_kill    → { target: "all" }
deckent_cleanup → { root: "." }
deckent_recover → { root: "." }
deckent_run     → { taskId: "<task-id>" }
```
