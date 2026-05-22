# Deckent Troubleshooting Guide

*Reference: DECKENT-MASTER-BLUEPRINT.md §3.4, §5, §10, §16, §21*
*Last updated: Sprint 065 (2026-03-26)*

---

## Table of Contents

1. [Installation Issues](#1-installation-issues)
2. [Sprint Execution Issues](#2-sprint-execution-issues)
3. [MCP Issues](#3-mcp-issues)
4. [tmux Issues](#4-tmux-issues)
5. [Dashboard Issues](#5-dashboard-issues)
6. [Quick Reference: `deckent doctor` Checks](#6-quick-reference-deckent-doctor-checks)

---

## 1. Installation Issues

### 1.1 `deckent: command not found` after `npm install -g deckent`

**Symptom:** Running `deckent` after global install gives "command not found".

**Cause:** npm global bin directory is not in your `PATH`.

**Solution:**
```bash
# Find the npm global bin directory
npm bin -g

# Add to your shell profile (~/.bashrc, ~/.zshrc, ~/.profile)
export PATH="$(npm bin -g):$PATH"

# Reload shell
source ~/.bashrc
```

---

### 1.2 Node.js version too old — `deckent doctor` fails with "Node.js: v16.x (>=18 required)"

**Symptom:**
```
✗ Node.js  v16.x.x (>=18 required)
```

**Cause:** Deckent requires Node.js ≥ 18 for `structuredClone`, `node:readline/promises`, and ESM support.

**Solution:**
```bash
# Using nvm
nvm install 22
nvm use 22

# Using system package manager (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # should be v22.x or >=v18.x
```

---

### 1.3 `.deckent/ missing — run deckent init` on `deckent doctor`

**Symptom:**
```
○ Workspace  .deckent/ missing — run `deckent init`
```

**Cause:** Deckent workspace has not been initialized in this project directory.

**Solution:**
```bash
cd /path/to/your-project
deckent init

# Or use the full onboarding wizard
deckent onboard
```

---

### 1.4 `DIRECTIVES.md missing` or `DIRECTIVES.md is empty`

**Symptom:**
```
○ Directives  DIRECTIVES.md missing
```
or
```
○ Directives  DIRECTIVES.md is empty
```

**Cause:** Deckent needs a `DIRECTIVES.md` file at the project root describing sprint goals.

**Solution:**
```bash
# Create DIRECTIVES.md with your sprint goals
cat > DIRECTIVES.md << 'EOF'
# DIRECTIVES — Sprint 1

## Goal
Add user authentication to the API.

## Task 1: JWT middleware
...
EOF
```

---

### 1.5 `Claude CLI: not found` on `deckent doctor`

**Symptom:**
```
✗ Claude CLI  not found
```

**Cause:** Claude Code CLI is not installed or not in `PATH`.

**Solution:**
```bash
# Install Claude Code CLI globally
npm install -g @anthropic-ai/claude-code

# Verify
claude --version

# If still not found, check PATH
which claude
```

---

## 2. Sprint Execution Issues

### 2.1 Pre-flight failed — Sprint won't start

**Symptom:**
```
Pre-flight failed: Node.js: v16.x (>=18 required); tmux: not found
Use --force to skip pre-flight checks.
```

**Cause:** `deckent start` runs `deckent doctor` before spawning workers. Any required check failure blocks the sprint.

**Solution:**
```bash
# Option 1: Fix the underlying issue (recommended)
nvm install 22 && brew install tmux

# Option 2: Skip pre-flight (use with caution)
deckent start --force
```

Doctor required checks: Node.js ≥ 18, git, tmux, Claude CLI.

---

### 2.2 Sprint stuck — workers spawned but no results

**Symptom:** Workers appear in tmux windows but `.tasks/task-*.result` files are never written.

**Cause:** Worker timed out, crashed, or the task prompt is malformed.

**Solution:**
```bash
# Check worker heartbeats
ls .tasks/*.hb

# Check worker logs (captured via pipe-pane)
cat .tasks/task-XXX.log

# Check tmux windows
tmux list-windows -t deckent

# If stuck, kill and re-run individual worker
deckent kill task-XXX
deckent spawn task-XXX

# Or clean up and restart
deckent cleanup
deckent start
```

---

### 2.3 `BrainError: Sprint failed at phase PLAN`

**Symptom:**
```
Sprint failed at phase PLAN: Cannot read DIRECTIVES.md
```

**Cause:** Brain could not read `DIRECTIVES.md` or AI planning returned invalid output.

**Solution:**
```bash
# Check DIRECTIVES.md exists and is readable
cat DIRECTIVES.md

# Try dry-run to see the plan without spawning
deckent start --dry-run

# Use structured planning mode (bypasses AI planner)
deckent plan --mode structured
```

---

### 2.4 Brain Budget over 600 lines — `deckent doctor` warning

**Symptom:**
```
○ Brain Budget  612/600 lines — OVER BUDGET, run cleanup --decay
```

**Cause:** `.brain/` files have accumulated beyond the 600-line memory budget.

**Solution:**
```bash
# Run decay/compression
deckent cleanup --decay

# Or force decay even if under budget
deckent cleanup --force

# Check new line count
deckent doctor
```

---

### 2.5 Critical tech debt blocking sprint

**Symptom:**
```
○ Debt  2 CRITICAL debt item(s)
```

**Cause:** `DEBT.md` has `CRITICAL` items. These must be resolved before or during the sprint.

**Solution:**
```bash
# View current debt
cat .brain/DEBT.md

# Archive resolved debt
deckent archive-debt

# See sprint history for context
deckent history
```

---

### 2.6 Stale locks blocking workers

**Symptom:**
```
○ Locks  3 stale lock(s)
```

Worker cannot acquire a file lock and stalls.

**Cause:** A previous worker crashed without releasing its file locks in `.locks/`. Locks are considered stale after 5 minutes.

**Solution:**
```bash
# List stale locks
ls .locks/

# Remove all locks (safe if no sprint is running)
rm .locks/*.lock

# Or run cleanup
deckent cleanup
```

---

### 2.7 `deckent plan --dry-run` shows 0 tasks

**Symptom:**
```
Sprint 5 (sprint-005) planned — 0 tasks
```

**Cause:** DIRECTIVES.md may be empty, malformed, or the AI planner returned no tasks.

**Solution:**
```bash
# Check DIRECTIVES.md content
cat DIRECTIVES.md

# Try structured mode
deckent plan --mode structured

# Check that DIRECTIVES has at least one "## Task" or "## Görev" section
```

---

## 3. MCP Issues

### 3.1 MCP server not appearing in Claude Code

**Symptom:** Deckent tools (`deckent_start`, `deckent_plan`, etc.) are not available in Claude Code.

**Cause:** MCP server is not registered in Claude Code settings.

**Solution:**
```bash
# Check Claude Code MCP config
cat ~/.claude/settings.json | grep deckent

# Register MCP server (add to settings.json)
# In ~/.claude/settings.json:
{
  "mcpServers": {
    "deckent": {
      "command": "deckent",
      "args": ["mcp"]
    }
  }
}

# Restart Claude Code after changes
```

---

### 3.2 MCP tool call times out — background job not completing

**Symptom:** Calling `deckent_start` via MCP returns immediately but the sprint never starts.

**Cause:** Long-running MCP calls use `child_process.fork()` to prevent MCP timeout. The job state is tracked in `.deckent/jobs/{jobId}.json`.

**Solution:**
```bash
# Check job state files
ls .deckent/jobs/
cat .deckent/jobs/<job-id>.json

# Check MCP server logs
# The server writes errors to stderr (visible in Claude Code MCP logs)

# Restart the MCP server
# (Restart Claude Code or the Claude Code session)
```

---

### 3.3 `deckent_doctor` MCP tool returns errors

**Symptom:** Calling `deckent_doctor` tool in Claude Code returns multiple check failures.

**Cause:** System dependencies missing or workspace not initialized.

**Solution:**
```bash
# Run deckent doctor directly in terminal to see formatted output
deckent doctor

# Then fix each failing check (see sections 1.x above)
```

---

### 3.4 MCP resource `deckent://memory` returns empty or stale data

**Symptom:** The `deckent://memory` MCP resource returns empty content.

**Cause:** `.brain/MEMORY.md` is missing or empty.

**Solution:**
```bash
# Check if MEMORY.md exists
ls .brain/MEMORY.md

# If missing, initialize workspace
deckent init

# If empty, run a sprint — Brain populates MEMORY.md after retro
```

---

### 3.5 MCP server crashes on startup — `deckent-mcp error: ...`

**Symptom:** MCP server writes error to stderr and exits immediately.

**Cause:** Invalid project state or dependency issue.

**Solution:**
```bash
# Test MCP server startup manually
deckent-mcp

# Check for TypeScript build issues
tsc --noEmit

# Reinstall if needed
npm install -g deckent@latest
```

---

## 4. tmux Issues

### 4.1 `tmux: not found` — doctor check fails

**Symptom:**
```
✗ tmux  not found
```

**Cause:** tmux is not installed on the system.

**Solution:**
```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install -y tmux

# Fedora/RHEL
sudo dnf install -y tmux

# Arch Linux
sudo pacman -S tmux

# Verify
tmux -V
```

---

### 4.2 Workers not appearing in tmux session

**Symptom:** `deckent start` runs but no tmux windows appear for workers.

**Cause:** tmux session `deckent` was not created, or workers were killed before you could attach.

**Solution:**
```bash
# Check if deckent tmux session exists
tmux list-sessions | grep deckent

# Attach to the session
deckent attach
# or
tmux attach -t deckent

# List all windows
tmux list-windows -t deckent
```

---

### 4.3 tmux session already exists — sprint fails to start

**Symptom:**
```
duplicate session: deckent
```

**Cause:** A previous sprint session was not cleaned up.

**Solution:**
```bash
# Kill the existing session
tmux kill-session -t deckent

# Or clean up and restart
deckent cleanup
deckent start
```

---

### 4.4 Worker logs not captured in `.tasks/*.log`

**Symptom:** `.tasks/task-XXX.log` is empty even though the worker is running.

**Cause:** tmux `pipe-pane` log capture may not have started, or the log path is incorrect.

**Solution:**
```bash
# Check if pipe-pane is active
tmux show-options -t "deckent:w-task-XXX" | grep remain-on-exit

# Manually attach to see live output
tmux attach -t "deckent:w-task-XXX"

# Check log file existence
ls -la .tasks/*.log
```

---

### 4.5 `deckent watch` — watch mode not working on WSL2

**Symptom:** `deckent start --watch` or `deckent watch` does not open split pane on WSL2.

**Cause:** tmux split panes may behave differently in WSL2 terminal emulators.

**Solution:**
```bash
# Start tmux manually first
tmux new-session -d -s deckent

# Then run deckent with watch
deckent start --watch

# Or use dashboard instead
deckent status --watch
```

---

## 5. Dashboard Issues

### 5.1 `deckent status` shows no data / empty dashboard

**Symptom:** `deckent status` prints nothing or shows all fields as empty.

**Cause:** `.dashboard` file is missing or no sprint is running.

**Solution:**
```bash
# Check if dashboard file exists
cat .dashboard

# Check if a sprint is active
ls .tasks/*.json 2>/dev/null | wc -l

# Refresh by running a sprint or serve command
deckent serve  # starts HTTP API + file watcher
```

---

### 5.2 `deckent web` — web dashboard not loading at localhost:3100

**Symptom:** Browser shows connection refused when opening `http://localhost:3100`.

**Cause:** The HTTP API server is not running or port 3100 is already in use.

**Solution:**
```bash
# Check if port 3100 is in use
lsof -i :3100

# Start the web server manually
deckent serve

# Or use the combined web command
deckent web

# If port is busy, kill the occupying process
kill $(lsof -t -i:3100)
deckent web
```

---

### 5.3 Dashboard shows stale data / old sprint info

**Symptom:** `deckent status` or web dashboard shows data from a previous sprint.

**Cause:** Auditor writes `.dashboard` every 30 seconds during a sprint. After sprint completion, `.dashboard` reflects the last scan.

**Solution:**
```bash
# Run cleanup to reset state
deckent cleanup

# Or manually delete the dashboard file to reset
rm .dashboard

# Then check status again
deckent status
```

---

### 5.4 SSE stream not receiving events in web dashboard

**Symptom:** Web dashboard loads but real-time updates don't appear.

**Cause:** SSE (Server-Sent Events) connection failed or HTTP API server is not running.

**Solution:**
```bash
# Check API server is running
curl http://localhost:3100/api/status

# Check SSE endpoint directly
curl -N http://localhost:3100/api/events

# Restart the server
deckent web
```

---

### 5.5 `deckent dashboard` TUI shows garbled characters

**Symptom:** Terminal dashboard shows broken box-drawing characters (e.g., `?` instead of `═`, `╔`).

**Cause:** Terminal does not support Unicode or UTF-8 locale is not set.

**Solution:**
```bash
# Set UTF-8 locale
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Verify terminal supports Unicode
echo "╔═══╗"

# Use a Unicode-capable terminal (iTerm2, Alacritty, Windows Terminal, etc.)
```

---

## 6. Quick Reference: `deckent doctor` Checks

Run `deckent doctor` to get a system health report. All required checks must pass for `deckent start` to work.

| Check | Required | Pass Condition | Fix Command |
|-------|----------|----------------|-------------|
| Node.js | ✅ Yes | version ≥ 18 | `nvm install 22` |
| git | ✅ Yes | git installed | `apt install git` / `brew install git` |
| tmux | ✅ Yes | tmux installed | `apt install tmux` / `brew install tmux` |
| Claude CLI | ✅ Yes | `claude` in PATH | `npm install -g @anthropic-ai/claude-code` |
| Workspace | ○ No | `.deckent/` exists | `deckent init` |
| Brain Dir | ○ No | `.brain/` with all files | `deckent init` |
| Directives | ○ No | `DIRECTIVES.md` non-empty | Create `DIRECTIVES.md` |
| Brain Budget | ○ No | ≤ 600 lines | `deckent cleanup --decay` |
| Debt | ○ No | No CRITICAL items | `deckent archive-debt` |
| Locks | ○ No | No stale locks (>5min) | `rm .locks/*.lock` |

**Override required failures:**
```bash
deckent start --force  # skip pre-flight checks
```

---

## Additional Resources

- **Architecture:** See `DECKENT-MASTER-BLUEPRINT.md` for complete system design
- **Config Reference:** `.deckent/config.json` and `deckent config`
- **Memory System:** `.brain/MEMORY.md`, `.brain/DECISIONS.md`, `.brain/DEBT.md`
- **Agent Rules:** `.claude/rules/brain.md`, `.claude/rules/worker-default.md`, `.claude/rules/auditor.md`
- **API Contract:** `.contracts/api-surface.md`

For bug reports, open an issue in the project repository.
