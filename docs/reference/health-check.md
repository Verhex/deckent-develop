# Deckent Health Check Reference

`deckent doctor` runs a set of checks against the local environment and project
workspace. This page documents every check, its required/optional status, and what
it means when it fails.

**Source files:**
- `src/cli/commands/doctor.ts` — `runDoctorChecks()`, all check functions
- `src/cli/commands/doctor-checks.ts` — pure check implementations (extracted for testability)

---

## Running the Health Check

```bash
# Standard output (human-readable)
deckent doctor

# JSON output (machine-readable, CI-friendly)
deckent doctor --json

# Force verbose mode
deckent doctor --verbose

# MCP equivalent
deckent_doctor { "root": "/path/to/project" }
```

The command exits with code `0` when all **required** checks pass; non-zero when any
required check fails. Optional checks that fail are reported as warnings but do not affect
the exit code.

---

## Check Catalog

`runDoctorChecks()` executes exactly **15 checks** in this order:

| # | Check | Required | What it verifies |
|---|-------|----------|-----------------|
| 1 | Platform | optional | macOS/Linux/WSL2 fully supported; Windows advisory (subprocess-only) |
| 2 | Node.js | **required** | Node is in PATH; version ≥ 24 |
| 3 | git | **required** | git is in PATH; needed for rollback, safety points, branch management |
| 4 | tmux | conditional | Not required when `spawn_backend` is `docker` or `subprocess` |
| 5 | Docker | conditional | Required when `spawn_backend = docker`; image `deckent-worker:latest` must exist |
| 6 | Claude CLI | **required** | `claude` is in PATH; auth check optional (via `--check-auth` flag) |
| 7 | Workspace | optional | `.deckent/` directory exists (project initialised) |
| 8 | Brain Dir | optional | `.brain/` directory exists with required export files |
| 9 | Directives | optional | `DIRECTIVES.md` exists and is non-empty |
| 10 | Brain Budget | optional | `.brain/` line count is within configured budget (default 900 lines) |
| 11 | Debt | optional | No CRITICAL-priority tech debt items open |
| 12 | Locks | optional | No stale lock files in `.locks/` (stale = older than 5 minutes) |
| 13 | .deck Security | optional | `.deck` secrets file is NOT tracked by git |
| 14 | Write Permissions | **required** | Write access to `.tasks/` and `.brain/` directories |
| 15 | Gitignore | optional | `memory.db` and related files are in `.gitignore` and not git-tracked |

---

## Check Details

### 1 · Platform

Detects the host OS and reports whether the platform is fully supported.

| Result | Meaning |
|--------|---------|
| `macOS (fully supported)` | All backends (docker, tmux, subprocess) available |
| `Linux (fully supported)` | All backends available |
| `WSL2/Linux (fully supported)` | Detected via `WSL_DISTRO_NAME` or `/proc/version` |
| `Windows UNSUPPORTED for tmux backend` | Only subprocess mode available; advisory warning |

**Required:** No. Fails do not block sprint start.

---

### 2 · Node.js

Runs `node --version` and parses the major version.

| Result | Meaning |
|--------|---------|
| `v24.x.x (>=24 required)` | Pass |
| `not found` | Node is not in PATH — install Node.js ≥ 24 |
| `v18.x.x found but >=24 required` | Upgrade Node.js |

**Required:** Yes. Sprint will not start if Node.js is missing or too old.

---

### 3 · git

Runs `git --version`.

| Result | Meaning |
|--------|---------|
| `v2.x.y` | Pass |
| `not found` | git is not in PATH — install git |

**Required:** Yes. Git is needed for rollback, safety points, and branch management.

---

### 4 · tmux

Runs `tmux -V`. Behaviour depends on the configured `spawn_backend`.

| Condition | Result |
|-----------|--------|
| `spawn_backend = docker` | `not required (docker backend)` — always passes |
| `spawn_backend = subprocess` | `not required (subprocess backend)` — always passes |
| `spawn_backend = tmux` or Claude provider active | required; fails if `tmux` not found |
| Codex/Gemini-only providers | advisory warning only |

**Required:** Conditional (only when tmux backend is active).

---

### 5 · Docker

Runs `docker info` and checks for the `deckent-worker:latest` image.

| Result | Meaning |
|--------|---------|
| `Docker available, deckent-worker:latest found` | Pass |
| `Docker available but deckent-worker image missing` | Build it: `docker build -f Dockerfile.worker -t deckent-worker:latest .` |
| `Docker not available` | Install Docker or switch to tmux/subprocess backend |
| `not required (tmux backend)` | Always passes when docker backend is not selected |

**Required:** Only when `spawn_backend = docker`.

---

### 6 · Claude CLI

Runs `claude --version`. Optionally checks authentication (`--check-auth`).

| Result | Meaning |
|--------|---------|
| `v1.x.y` | Pass |
| `not found` | Install Claude CLI: `npm install -g @anthropic-ai/claude-cli` |
| `v1.x.y — not authenticated` | Run: `claude login` |

**Required:** Yes. Claude CLI is the primary execution backend.

---

### 7 · Workspace

Checks that `.deckent/` directory exists in the project root.

| Result | Meaning |
|--------|---------|
| `.deckent/ found` | Pass — project is initialised |
| `.deckent/ missing` | Run `deckent init` to initialise the project |

**Required:** No. Warning only.

---

### 8 · Brain Dir

Checks `.brain/` directory and required export files
(`exports/summary.md`, `exports/decisions.md`, `exports/memory.md`).

| Result | Meaning |
|--------|---------|
| `All brain files present` | Pass |
| `.brain/ missing` | Run `deckent init` or `deckent memory export` |
| `Missing: exports/summary.md` | Run `deckent memory export` to regenerate |

**Note:** The primary store is the SQLite database (`.brain/memory.db`). Export files are
generated snapshots for git tracking and context injection; they are regenerated automatically
at the end of each sprint.

**Required:** No. Warning only.

---

### 9 · Directives

Checks that `DIRECTIVES.md` exists and contains content.

| Result | Meaning |
|--------|---------|
| `DIRECTIVES.md found` | Pass |
| `DIRECTIVES.md missing` | Create it or run `deckent init` |
| `DIRECTIVES.md is empty` | Add sprint goals using `## Task N: …` sections |
| `Cannot read DIRECTIVES.md` | Check file permissions |

**Required:** No. Warning only — `deckent start` will fail if absent.

---

### 10 · Brain Budget

Counts lines in `.brain/exports/*.md` files and compares to the configured budget
(default: 900 lines, set via `memory.budget` in `.deckent/config.json`).

| Result | Meaning |
|--------|---------|
| `Brain within budget (350 / 900 lines)` | Pass |
| `Brain over budget (950 / 900 lines) — run \`deckent memory export\`` | Warning; decay will trim on next sprint end |

**Required:** No. Warning only.

---

### 11 · Debt

Reads the active debt items from memory.db and flags any CRITICAL-priority items.

| Result | Meaning |
|--------|---------|
| `3 open debt items, no critical` | Pass |
| `1 CRITICAL debt item(s)` | Action required; resolve or downgrade before shipping |

**Required:** No. Warning only.

---

### 12 · Locks

Scans `.locks/` for stale lock files (last-modified > 5 minutes ago).

| Result | Meaning |
|--------|---------|
| `No lock files` | Pass — no active workers |
| `3 active lock(s)` | Pass — workers are running |
| `2 stale lock(s)` | Run `deckent cleanup` to remove stale locks |

**Required:** No. Warning only.

---

### 13 · .deck Security

Checks whether the `.deck` secrets file (if present) is tracked by git.

| Result | Meaning |
|--------|---------|
| `.deck file not found` | Pass — no secrets file |
| `.deck file exists and is NOT tracked by git (safe)` | Pass |
| `.deck file is tracked by git — secrets may be exposed!` | Add `.deck` to `.gitignore` immediately and run `git rm --cached .deck` |

**Required:** No. Warning only.

---

### 14 · Write Permissions

Uses `fs.accessSync` to verify write access to `.tasks/` and `.brain/`.

| Result | Meaning |
|--------|---------|
| `Write access OK (.tasks/, .brain/)` | Pass |
| `No write access to: .tasks/` | Fix directory permissions |

**Required:** Yes. Deckent cannot run sprints without write access to these directories.

---

### 15 · Gitignore

Reads `.gitignore` and checks that `memory.db`-related paths are excluded from git
tracking. Also runs `git check-ignore` to confirm the files are actually gitignored.

| Result | Meaning |
|--------|---------|
| `memory.db files properly gitignored` | Pass |
| `.gitignore not found` | Create `.gitignore` with the required entries |
| `Missing from .gitignore: .brain/memory.db` | Add the entry to `.gitignore` |
| `Tracked by git: .brain/memory.db` | Run: `git rm --cached .brain/memory.db` |

**Required:** No. Warning only — but ignoring this allows secrets stored in memory.db
(API keys, tokens from `.deck` imports) to be committed to git.

---

## Exit Code Reference

| Exit code | Meaning |
|-----------|---------|
| `0` | All required checks passed |
| `1` | One or more required checks failed |

Required checks are: **Node.js**, **git**, **Claude CLI**, **Write Permissions**.
Conditional required: **tmux** (when tmux backend active), **Docker** (when docker backend active).

---

## Pre-flight Health Check

`deckent start` automatically runs a lightweight pre-flight health check before spawning
workers. This is a subset of the full `deckent doctor` checks and is designed to catch
blocking issues without the full diagnostic output.

The pre-flight check runs `scripts/pre-flight-health-check.mjs` as a child process and
falls back to `runDoctorChecks()` if the script is not found.

To disable pre-flight (not recommended): set `preflight_health_check: false` in
`.deckent/config.json`.

---

## CI Usage

```bash
# In a CI step — exits non-zero if required checks fail
deckent doctor --json | tee doctor-report.json
```

For hermetic CI environments, the Docker backend is strongly recommended — it eliminates
the tmux check and provides consistent container isolation. See `docs/guide/docker-backend.md`.
