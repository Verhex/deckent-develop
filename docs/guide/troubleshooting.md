# Troubleshooting Guide

## Sprint Stuck / Workers Not Responding

Workers stop writing heartbeats (`.tasks/task-NNN.hb`) when they crash, are OOM-killed,
or their backend container exits unexpectedly.

### Diagnosis

```bash
# Check active sprint and worker status
deckent status

# List heartbeat files and their timestamps
ls -lt .tasks/*.hb

# Check Docker containers (if spawn_backend = docker)
docker ps -a | grep deckent
```

### Recovery Chain

Run these steps in order — stop when the sprint resumes:

```bash
# Step 1: Kill all active workers
deckent kill --all

# Step 2: Archive task files, release locks
deckent cleanup

# Step 3: Recover orphan state (re-evaluate partial results)
deckent recover <sprint-id>

# Step 4: Re-spawn a specific task (add --force if it is DONE/NO_GO)
deckent spawn <taskId> --force

# Step 5: Spawn remaining pending tasks one by one (spawn takes a single taskId)
deckent spawn <taskId>
```

See [Config Recovery Guide](./config-recovery.md) for a detailed breakdown of each step.

---

## Docker Issues

### Workers exit immediately (exit code 137)

Exit code 137 = SIGKILL (OOM). The Docker container ran out of memory.

**Fix:**

```bash
# Reduce parallel workers (lowers total memory pressure — the reliable fix)
deckent config set max_workers 2

# Per-worker container memory is 4g by default; tune per task-kind via
# worker_memory_limit_by_kind in .deckent/config.json if needed.
```

### Docker daemon not running

```bash
# Verify Docker is running
docker info

# Start Docker (macOS)
open -a Docker

# Start Docker (Linux)
sudo systemctl start docker
```

### Container cannot access project files

The Docker backend mounts the project root into the container. If you see file-not-found
errors inside workers:

```bash
# Check the project root is correctly set
deckent config read | grep root

# Verify the mount path resolves
docker run --rm -v "$(pwd):/workspace" alpine ls /workspace
```

---

## Workers Not Starting

### Check config

```bash
deckent config read
# Verify spawn_backend is set correctly: docker, tmux, or subprocess
```

### Check backend health

```bash
# Docker backend
docker info

# Subprocess backend — no daemon required, always available
# tmux backend
tmux -V
```

### Run doctor

```bash
deckent doctor
```

`deckent doctor` checks: Node version (≥24), Docker availability, project structure
(`.deckent/`, `.tasks/`, `.brain/`), config validity, and MCP server registration.

---

## Stale Heartbeat / False NO_GO

A worker may have finished its work but failed to write the `.result` file before being
killed (e.g. OOM). Brain detects a stale heartbeat and marks the task NO_GO.

### Diagnosis

```bash
# Check the last heartbeat timestamp
cat .tasks/task-NNN.hb

# Check if a partial result exists
ls .tasks/task-NNN.partial-result

# Check git diff for any file changes the worker made
git diff --stat
```

### Recovery

```bash
# Re-run the specific task
deckent run <task-id>

# Or recover the sprint (re-evaluates any partial results)
deckent recover <sprint-id>
```

---

## Config Lost / Corrupted

When `.deckent/config.json` is missing or corrupted, deckent falls back to defaults.
All values are still accessible:

```bash
# Show current (merged) config
deckent config read

# Restore a specific key to default
deckent config set spawn_backend docker
deckent config set brain_tier standard
```

For full config recovery (merge with template defaults), see
[Config Recovery Guide](./config-recovery.md).

---

## Build Failures (TypeScript)

```bash
# Check for type errors
npx tsc --noEmit

# Common causes:
# - .js extension missing on ESM imports (ADR-002: Node16 resolution)
# - New type not exported from core/types.ts
# - Circular import (ADR-008: Brain-central import rule)
```

Fix the error, then re-run `npx tsc --noEmit` until clean.

---

## Test Failures

```bash
# Run a single test file (targeted — do NOT run full suite)
npx vitest run tests/path/to/failing.test.ts

# Check if the test needs hermetic isolation (ADR-087)
# Tests must NOT read .deckent/config.json, .brain/memory.db, or ~/.deckent
# All file I/O must use os.tmpdir() fixtures

# Reproduce CI conditions
npm run test:ci-sim
```

Known pre-existing failures: ~67 tests in the full suite depend on stale model-id
expectations or live provider connections. Run only targeted tests for your changed files.

---

## MCP Server Caching Stale Code

After a `tsc` rebuild, the long-lived MCP process still runs the old compiled code
from its cache.

```bash
# Rebuild the TypeScript output
npm run build

# Then restart the MCP server in Claude Code
# /mcp restart
# Or restart Claude Code entirely
```

---

## Dashboard Not Loading

```bash
# Rebuild the dashboard bundle
npm run build:all

# Restart the serve process
deckent serve --port 3000
```

If individual pages (Evolution, Nervous, Workers, etc.) are missing or show wrong content,
the bundle is stale. Always run `npm run build:all` after pulling changes that affect
`src/dashboard/`.

---

## Spawn Lock Deadlock

If `deckent start` hangs indefinitely with no output:

```bash
# Check for stale spawn locks
ls .locks/*.spawnlock

# Clear them manually
rm .locks/*.spawnlock

# Then retry
deckent start
```

Stale spawn locks are also cleared by `deckent cleanup`.

---

## Nervous System Blocking Sprint Start

The Nervous System (ADR-040) runs detectors before each sprint. If a panic-gate fires
and the sprint hangs at SPAWN:

```bash
# Check nervous system status
deckent nervous status

# Accept or reject pending proposals
deckent nervous accept <proposal-id>
deckent nervous reject <proposal-id>

# Or disable nervous for this sprint (temporary)
deckent config set nervous_system.enabled false
deckent start
deckent config set nervous_system.enabled true
```

---

## Worker `.result` File Not Written

If a worker completes but Brain marks the task NO_GO with "no result file":

1. Check if the worker is still running: `deckent status`
2. Check the tmux session (if `spawn_backend: tmux`): `tmux ls`, `tmux attach -t deckent-NNN`
3. Check Docker container logs: `docker logs <container-id>`
4. Re-run the task: `deckent run <task-id>`

---

## Spawn Backend Options

| Backend | When to use | Requirements |
|---------|-------------|--------------|
| `docker` | Default — isolated containers, consistent env | Docker daemon running |
| `subprocess` | Windows / no Docker / lightweight | Node ≥24, no daemon |
| `tmux` | Interactive debugging, view worker output live | tmux installed |

Change backend:

```bash
deckent config set spawn_backend subprocess
```
