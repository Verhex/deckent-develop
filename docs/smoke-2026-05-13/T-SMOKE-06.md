# T-SMOKE-06: `deckent_cleanup` MCP Tool

## Overview

`deckent_cleanup` is the sprint finalization tool that safely tears down all runtime artifacts produced during a sprint. It removes temporary task files, releases file locks, archives analysis artifacts, rotates sprint metrics, and optionally trims the memory database. Running cleanup is mandatory before starting a new sprint — skipping it leaves stale locks, orphan heartbeat files, and bloated `.tasks/` directories that confuse the next planning phase.

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `decay` | boolean | `false` | Run memory decay on `.brain/` after cleanup; trims entries older than `decay_after_sprints` (default 8) |
| `dryRun` | boolean | `false` | Preview mode — lists what would be deleted without making changes |

## MCP Usage

```typescript
// Standard cleanup after sprint ends
await callTool("deckent_cleanup", {});

// Cleanup + memory decay
await callTool("deckent_cleanup", { decay: true });

// Preview only — no deletions
await callTool("deckent_cleanup", { dryRun: true });
```

## What Cleanup Does (9 Phases)

### 1. Worker Termination
Kills all active tmux workers for the current sprint. For non-tmux providers (Docker, subprocess), calls the respective adapter's `kill()` method. Workers that have already exited are silently skipped.

### 2. Lock Release (`.locks/`)
Deletes every `.lock` file from the `.locks/` directory via `releaseAllLocks()`. Lock files are per-file exclusive locks acquired by workers before writing. Releasing them unblocks any file that was locked during execution and allows the next sprint to acquire fresh locks without stale-lock warnings.

### 3. Task File Deletion (`.tasks/`)
Removes all runtime task artifacts from `.tasks/`:

- `task-*.json` — task definitions
- `task-*.plan` — worker execution plans
- `task-*.hb` — heartbeat files
- `task-*.result` — worker result files
- `task-*.paused`, `task-*.log`, `task-*.timeout` — state files

This is the primary cleanup target. A fresh `.tasks/` directory is required for the planner to create unambiguous task IDs for the next sprint.

### 4. Prompt File Archiving
Moves `.prompt-*.txt` analysis files to `.tasks/archive/sprint-{id}/`. These files hold the full worker prompt context and are useful for debugging false NO_GO evaluations. Retention policy keeps the last 5 sprint archives (configurable via `prompt_archive_retention`) — older archives are deleted automatically.

### 5. Archive Directory Retention
Enforces a `keep_last_n` limit (default 5) on `.tasks/archive/`. Archive directories for the oldest sprints are removed to prevent unbounded disk growth.

### 6. Sprint File Retention (`sprint-file-retention.ts`)
Three-part rotation of sprint-level files:

- **Counter cleanup** — deletes `{sprintId}-seq` and `{sprintId}-checkpoint-seq` files that track worker execution order
- **Forensic migration** — moves forensic audit files to `docs/audits/` for long-term archival
- **Enforcement** — applies `keep_last_n` (default 10) and optional `size_cap` limits across all sprint file directories; returns `bytesFreed` in the response

### 7. Tmux Session Termination
Kills the project-specific tmux session (read from `.deckent/config.json` → `tmux_session`). Non-fatal if the session has already exited.

### 8. Decision Trail Cleanup
Removes `decision-*.json` files from `.deckent/decisions/`. These are Sprint Decision Log (SDL) entries written during task routing — tactical, audit-trail records that should not persist across sprints.

### 9. Memory Decay (optional, `--decay`)
If `decay: true`, calls `runDecay()` which:

1. Reads `memory_budget` (default 900 entries) from config
2. If total DB entries exceed budget, calls `store.decay(currentSprintNum, decaySprints)`
3. Removes pattern and sprint entries older than `decay_after_sprints` (default 8 sprints)
4. Returns `{ linesBefore, linesAfter, archivedSprints, removedDebtCount, removedPatternCount }`

## Sprint-End Discipline

Cleanup enforces the invariant that no sprint can start while another sprint's artifacts are present. The `releaseSprintLock()` call at the end of cleanup is the gate that allows `deckent_plan` to proceed. Running cleanup immediately after `deckent_retro` is the recommended workflow:

```
deckent_plan → deckent_start → deckent_status → deckent_retro → deckent_cleanup
```

If workers are still running when cleanup is called, they are terminated first. Cleanup is therefore safe to call at any sprint phase — including mid-sprint if a sprint needs to be aborted.

## Configuration

Relevant keys in `.deckent/config.json`:

```jsonc
{
  "memory_budget": 900,            // decay threshold (entries)
  "decay_after_sprints": 8,        // retain N sprint entries
  "prompt_archive_retention": 5,   // keep N prompt archives
  "cleanup_delay_ms": 0,           // optional delay before deletion
  "tmux_session": "deckent",       // session name to terminate
  "sprint_file_retention": {
    "keep_last_n": 10,             // sprint file retention count
    "size_cap": 52428800           // 50 MB per directory (optional)
  }
}
```

## Response Fields

```typescript
{
  success: boolean;
  taskFilesRemoved: number;       // count of deleted task files
  lockFilesRemoved: number;       // count of deleted lock files
  promptFilesArchived: number;    // count of moved .prompt-* files
  archiveDirsRemoved: number;     // old sprint archives purged
  bytesFreed: number;             // from sprint-file-retention
  decayResult?: {                  // only when decay: true
    linesBefore: number;
    linesAfter: number;
    archivedSprints: number;
    removedDebtCount: number;
    removedPatternCount: number;
  };
  message: string;
}
```

## Error Handling

- **Active workers detected** — logged as warnings; workers are killed before file deletion proceeds
- **Tmux session not found** — non-fatal; cleanup continues
- **Lock files missing** — silently skipped; directory may already be clean
- **Memory DB inaccessible** — decay is skipped with a warning; other cleanup phases still run

## Related Tools

| Tool | Relationship |
|------|-------------|
| `deckent_retro` | Run before cleanup to capture sprint learnings |
| `deckent_kill` | Targeted worker kill; cleanup kills all workers automatically |
| `deckent_recover` | Use when cleanup was interrupted and sprint is in an inconsistent state |
| `deckent_doctor` | Run after cleanup to verify environment is ready for next sprint |
