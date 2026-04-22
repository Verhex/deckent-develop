# CLI Command Inventory

> Complete inventory of all Deckent CLI commands. Auto-generated reference for Sprint 151.
> **Total:** 45 top-level commands + 59 subcommands = 104 command endpoints

## Quick Reference

| # | Command | Description | MCP Tool |
|---|---------|-------------|----------|
| 1 | `init` | Initialize a new Deckent project | `deckent_init` |
| 2 | `start` | Start a new sprint | `deckent_start` |
| 3 | `plan` | Plan sprint without executing | `deckent_plan` |
| 4 | `status` | Show current sprint dashboard | `deckent_status` |
| 5 | `attach` | Attach to tmux orchestra session | — |
| 6 | `spawn` | Manually spawn worker for task | — |
| 7 | `kill` | Kill a running worker | `deckent_kill` |
| 8 | `retro` | Show sprint retrospective | `deckent_retro` |
| 9 | `cleanup` | Clean up after a sprint | `deckent_cleanup` |
| 10 | `doctor` | Check system dependencies and health | `deckent_doctor` |
| 11 | `config` | Show/modify project configuration | `deckent_config` |
| 12 | `history` | Show sprint history | `deckent_history` |
| 13 | `plugin` | Manage plugins | — |
| 14 | `upgrade` | Self-update deckent | — |
| 15 | `onboard` | Run onboarding wizard | — |
| 16 | `analyze` | Analyze project stack and size | `deckent_analyze_project` |
| 17 | `archive-debt` | Archive resolved debt items | — |
| 18 | `dashboard` | Terminal dashboard with auto-refresh | — |
| 19 | `serve` | Start HTTP API server with SSE | — |
| 20 | `web` | Start web dashboard with API server | — |
| 21 | `sync` | Sync adapter files | `deckent_sync` |
| 22 | `watch` | Live tmux split view | — |
| 23 | `run` | Run a single one-shot task | `deckent_run` |
| 24 | `test` | Run a test sprint (no retro) | — |
| 25 | `agent` | Manage agent pool | `deckent_agent_list` |
| 26 | `skill` | Manage skill pool | `deckent_skill_list` |
| 27 | `review` | Review sprint tasks with evaluations | `deckent_review` |
| 28 | `finalize` | Finalize a sprint (update MEMORY) | — |
| 29 | `explain` | Explain what the last sprint did | `deckent_explain` |
| 30 | `set-directives` | Write sprint goals to DIRECTIVES.md | `deckent_set_directives` |
| 31 | `heartbeat` | Run proactive heartbeat tasks | — |
| 32 | `checkpoint` | Manage human checkpoints | `deckent_checkpoint` |
| 33 | `docs` | Manage user-defined documents | `deckent_docs` |
| 34 | `output` | Show captured worker task output | — |
| 35 | `cost` | Cost management and estimation | — |
| 36 | `recall` | Search project memory | `deckent_memory_query` |
| 37 | `remember` | Store a note in project memory | — |
| 38 | `memory` | Memory V2 management | — |
| 39 | `resume` | Resume sprint from checkpoint | — |
| 40 | `nervous` | Nervous System dashboard | — |
| — | `config nervous` | Configure nervous mode settings (subcommand of config) | — |
| 42 | `mode` | Get/set deckent_style | — |
| 43 | `features` | List feature flags and capabilities | — |
| 44 | `audit` | Run Brain Self-Audit Gate | — |
| 45 | `recover` | Recover from crashed/stuck sprint | — |
| — | `help-info` | Show quick-reference help (alias: `info`) | `deckent_help` |

---

## Project Setup

### `deckent init`

Initialize a new Deckent project in the current directory.

| Option | Description |
|--------|-------------|
| `--auto` | Auto-detect system, subscription, and project to generate recommendations |
| `--manual` | Skip auto-detection, use interactive prompts only |
| `--cursor` | Configure for Cursor IDE environment |
| `--claude-code` | Configure for Claude Code environment (default) |
| `--env <envs>` | Comma-separated environments to configure (codex,cursor,gemini,vscode,shell) |
| `--all-envs` | Configure ALL environment configs |
| `--upgrade` | Update existing files while preserving user customizations (merge strategy) |
| `--force` | Force overwrite of existing env files without warning |
| `--repair` | Show which init steps failed and how to fix them |

**Example:**
```bash
deckent init --auto
deckent init --env codex,cursor --force
```

**MCP:** `deckent_init`

---

### `deckent onboard`

Run the interactive onboarding wizard.

| Option | Description |
|--------|-------------|
| `--non-interactive` | Skip interactive prompts, use defaults |
| `--force` | Re-run onboarding even if already initialized |

**Example:**
```bash
deckent onboard
deckent onboard --non-interactive
```

---

### `deckent upgrade`

Self-update deckent via npm.

| Option | Description |
|--------|-------------|
| `--check` | Only check for updates, do not install |
| `--changelog` | Show changelog for the latest version and exit |
| `--canary` | Install from canary channel (pre-release) |
| `--beta` | Install from beta channel (pre-release) |
| `--rollback` | Roll back to the previous version |
| `--local <path>` | Install from a local .tgz file (beta development) |

**Example:**
```bash
deckent upgrade --check
deckent upgrade --beta
```

---

## Sprint Workflow

### `deckent start [description]`

Start a new sprint (optionally with a one-line description for zero-config mode).

| Option | Description |
|--------|-------------|
| `--auto-approve` | Auto-approve worker actions (--dangerously-skip-permissions) |
| `--sandbox-mode` | Run in sandbox mode (git stash + restore) |
| `--dry-run` | Plan sprint without spawning workers |
| `--force` | Skip doctor pre-flight checks |
| `--watch` | Automatically open watch mode after sprint spawns workers |
| `--timeout <ms>` | Sprint timeout in milliseconds (default: 30 minutes) |
| `--force-directives` | Override existing DIRECTIVES.md in zero-config mode |

**Example:**
```bash
deckent start
deckent start "Fix authentication bug" --timeout 600000
deckent start --dry-run --sandbox-mode
```

**MCP:** `deckent_start`

---

### `deckent plan`

Plan a sprint without executing it.

| Option | Description |
|--------|-------------|
| `--no-confirm` | Skip confirmation, auto-approve plan |
| `--structured` | Force structured parsing (skip AI) |
| `--dry-run` | Show plan without writing task files to disk |

**Example:**
```bash
deckent plan --structured
deckent plan --dry-run
```

**MCP:** `deckent_plan`

---

### `deckent test`

Run a test sprint (no retro, no memory update, no decay).

| Option | Description |
|--------|-------------|
| `--keep` | Skip cleanup — leave task files in place |
| `--timeout <ms>` | Maximum sprint duration in milliseconds |
| `--directives <file>` | Path to a custom directives file (overrides DIRECTIVES.md) |
| `--sandbox` | Stash working tree changes before running, restore after (git stash) |
| `--model <model>` | Force all tasks to use a specific model |
| `--reporter <format>` | Output format: default, junit, tap |
| `--min-coverage <percent>` | Fail if coverage falls below this percentage (0-100) |

**Example:**
```bash
deckent test --sandbox --model haiku
deckent test --directives my-directives.md --reporter junit
```

---

### `deckent finalize`

Finalize a sprint: update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md, config, run decay.

| Option | Description |
|--------|-------------|
| `--sprint <id>` | Specific sprint ID to finalize (e.g. sprint-063) |
| `--skip-decay` | Skip memory/debt decay phase |
| `--skip-hooks` | Skip plugin afterSprint hooks |
| `--force` | Force finalize even if tasks are still in-progress |

**Example:**
```bash
deckent finalize
deckent finalize --sprint sprint-151 --skip-decay
```

---

### `deckent cleanup`

Clean up after a sprint.

| Option | Description |
|--------|-------------|
| `--decay` | Force run memory decay (compress .brain/ files) |
| `--dry-run` | Preview what would be deleted without actually deleting |

**Example:**
```bash
deckent cleanup --dry-run
deckent cleanup --decay
```

**MCP:** `deckent_cleanup`

---

### `deckent review`

Review sprint tasks with evaluations.

| Option | Description |
|--------|-------------|
| `--auto` | Auto-approve/reject based on task results |
| `--json` | Output review state as JSON |
| `--approve-all` | Approve all pending tasks |
| `--reject-all` | Reject all pending tasks |

**Example:**
```bash
deckent review --auto
deckent review --json
```

**MCP:** `deckent_review`

---

### `deckent resume`

Resume a sprint from its latest checkpoint.

| Option | Description |
|--------|-------------|
| `--auto-approve` | Auto-approve all worker actions |
| `--dry-run` | Show what would be resumed without actually running |
| `--root <path>` | Project root directory (defaults to cwd) |

**Example:**
```bash
deckent resume
deckent resume --dry-run
```

---

### `deckent recover`

Recover from a crashed or stuck sprint (audit + cleanup + archive).

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview what would be cleaned without making changes |
| `--force` | Skip interactive confirmation |
| `--skip-audit` | Skip the audit step |

**Example:**
```bash
deckent recover --dry-run
deckent recover --force
```

---

## Monitoring & Analysis

### `deckent status`

Show the current sprint dashboard.

| Option | Description |
|--------|-------------|
| `--watch` | Auto-refresh every 2 seconds |
| `-f, --follow` | Follow mode: snapshot + live event tail |
| `--json` | Output raw JSON instead of formatted dashboard |
| `--raw` | Show legacy raw dashboard (box format) |
| `--verbose` | Show detailed agent and skill assignment info |
| `--no-color` | Disable colored output |
| `--graph` | Display dependency graph as Mermaid diagram |
| `--mode <mode>` | Output render mode: explainatory, standart, verbose, json |

**Example:**
```bash
deckent status --watch
deckent status --follow --verbose
deckent status --graph
```

**MCP:** `deckent_status`

---

### `deckent dashboard`

Show terminal dashboard with auto-refresh.

| Option | Description |
|--------|-------------|
| `--interval <ms>` | Refresh interval in milliseconds |
| `--no-color` | Disable ANSI colors |
| `--json` | Output dashboard state as raw JSON and exit |

**Example:**
```bash
deckent dashboard
deckent dashboard --interval 5000
```

---

### `deckent retro`

Show the latest sprint retrospective.

| Option | Description |
|--------|-------------|
| `--raw` | Show raw RETRO.md content without formatting |
| `--compare` | Show delta comparison with previous sprint |
| `--json` | Output results as JSON |
| `--perf` | Show agent/skill performance tables |
| `--trend [n]` | Show success rate trend across last N sprints (default: 5) |

**Example:**
```bash
deckent retro --perf
deckent retro --trend 10
```

**MCP:** `deckent_retro`

---

### `deckent explain`

Explain what the last sprint did in human-friendly language.

| Option | Description |
|--------|-------------|
| `--sprint <id>` | Show a specific sprint by ID (e.g. 042) |
| `--task <taskId>` | Show routing decision log for a specific task |
| `--json` | Output results as JSON |
| `--verbose` | Show all learnings and full task details |

**Example:**
```bash
deckent explain
deckent explain --sprint 150 --verbose
deckent explain --task 151-001
```

**MCP:** `deckent_explain`

---

### `deckent history`

Show sprint history.

| Option | Description |
|--------|-------------|
| `--agent <name>` | Filter by agent name |
| `--skill <name>` | Filter by skill name |
| `--json` | Output as JSON |
| `--last <n>` | Show only last N sprints |
| `--trend` | Show success rate/coverage trend analysis |

**Example:**
```bash
deckent history --last 10
deckent history --agent architect --trend
```

**MCP:** `deckent_history`

---

### `deckent analyze`

Analyze project stack, size, and recommended methodology.

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON |

**Example:**
```bash
deckent analyze --json
```

**MCP:** `deckent_analyze_project`

---

### `deckent doctor`

Check system dependencies and health.

| Option | Description |
|--------|-------------|
| `--profile` | Show system profile information |
| `--legacy` | Use legacy output format |
| `--json` | Output results as JSON |
| `--pre-flight` | Run pre-flight health check before sprint spawn |

**Example:**
```bash
deckent doctor
deckent doctor --pre-flight --json
```

**MCP:** `deckent_doctor`

---

### `deckent audit`

Run Brain Self-Audit Gate for a sprint (tsc + vitest + honesty + observability).

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON only |

**Example:**
```bash
deckent audit
deckent audit --json
```

---

### `deckent features`

List feature flags and capabilities from `.deckent/features-manifest.json`.

| Option | Description |
|--------|-------------|
| `-c, --category <category>` | Filter by category: active, lightly_used, dormant, dead, all |
| `--json` | Output as JSON |
| `--id <featureId>` | Show details for a specific feature |

**Example:**
```bash
deckent features --category active
deckent features --id memory-v2
```

---

## Workers & Tasks

### `deckent run <description>`

Run a single one-shot task without a sprint cycle.

| Option | Description |
|--------|-------------|
| `--model <model>` | Model to use (default: sonnet) |
| `--scope <dir>` | Worker scope directory (default: ./) |
| `--timeout <ms>` | Maximum wait time (default: 300000) |
| `--keep` | Keep task files after completion |
| `--auto-approve` | Pass auto-approve flag to the worker |
| `--verbose` | Stream worker log output to stdout in real-time |

**Example:**
```bash
deckent run "Add input validation to user API" --model opus
deckent run "Write tests for auth module" --scope src/auth/ --verbose
```

**MCP:** `deckent_run`

---

### `deckent spawn <taskId>`

Manually spawn a worker for a task.

| Option | Description |
|--------|-------------|
| `--force` | Force respawn even if task is DONE or NO_GO |
| `--auto-approve` | Enable auto-approve mode for the worker |

**Example:**
```bash
deckent spawn 151-003 --auto-approve
```

---

### `deckent kill <taskId>`

Kill a running worker.

| Option | Description |
|--------|-------------|
| `--all` | Kill all active workers |
| `--force` | Force kill (bypass panic guard) |
| `--user-explicit` | Explicit user confirmation for panic kill override |

**Example:**
```bash
deckent kill 151-003
deckent kill --all --force --user-explicit
```

**MCP:** `deckent_kill`

---

### `deckent output <taskId>`

Show captured output for a specific worker task.

| Option | Description |
|--------|-------------|
| `--tail <n>` | Show last N lines (default: 50) |
| `--follow` | Follow output file (poll every 2 seconds) |
| `--sprint-id <sprintId>` | Sprint ID to read from |
| `--json` | Output raw JSON |

**Example:**
```bash
deckent output 151-001 --tail 100
deckent output 151-003 --follow
```

---

### `deckent heartbeat`

Run proactive heartbeat tasks from .deckent/HEARTBEAT.md.

| Option | Description |
|--------|-------------|
| `--daemon` | Run in daemon mode (keeps running in foreground) |
| `--interval <minutes>` | Heartbeat interval in minutes (default: 30) |
| `--stop` | Stop a running heartbeat daemon |

**Example:**
```bash
deckent heartbeat --daemon --interval 15
deckent heartbeat --stop
```

---

### `deckent attach`

Attach to the tmux orchestra session.

| Option | Description |
|--------|-------------|
| `--list` | List all tmux windows without attaching |

**Example:**
```bash
deckent attach
deckent attach --list
```

---

### `deckent watch`

Live tmux split view: dashboard + worker panes.

| Option | Description |
|--------|-------------|
| `--follow <taskId>` | Attach to a specific worker pane |

**Example:**
```bash
deckent watch
deckent watch --follow 151-003
```

---

### `deckent checkpoint`

Manage human checkpoints — list, approve, or reject pending checkpoints.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `checkpoint list` | List all checkpoints (`--pending`, `--json`) |
| `checkpoint approve <id>` | Approve a pending checkpoint |
| `checkpoint reject <id>` | Reject a pending checkpoint |

**Example:**
```bash
deckent checkpoint list --pending
deckent checkpoint approve chk-001
deckent checkpoint reject chk-002
```

**MCP:** `deckent_checkpoint`

---

## Configuration

### `deckent config`

Show or modify project configuration.

| Option | Description |
|--------|-------------|
| `--raw` | Show raw project config without merging defaults |

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `config set <key> <value>` | Set a configuration value |
| `config get <key>` | Get a configuration value (supports dot notation) |
| `config export [file]` | Export config to stdout or a file |
| `config import <file>` | Import config from a JSON file |
| `config list` | List all config parameters grouped by category |
| `config keys` | List all config parameter keys |
| `config migrate` | Migrate config.json to latest format (`--dry-run`) |
| `config nervous` | Configure Nervous System authority mode |

**Example:**
```bash
deckent config
deckent config set max_workers 4
deckent config get brain_provider
deckent config list
deckent config migrate --dry-run
```

**MCP:** `deckent_config`

---

### `deckent set-directives`

Write sprint goals to DIRECTIVES.md (content, file, or stdin).

| Option | Description |
|--------|-------------|
| `--content <string>` | Directive content to write directly |
| `--file <path>` | Read content from a file |

**Example:**
```bash
deckent set-directives --content "# Sprint 152\n## Task 1: ..."
deckent set-directives --file my-directives.md
```

**MCP:** `deckent_set_directives`

---

### `deckent sync`

Sync adapter files and detect out-of-band changes since last sprint.

| Option | Description |
|--------|-------------|
| `--git-only` | Only detect git changes (skip adapter file sync) |
| `--adapters-only` | Only sync adapter files (skip git change detection) |
| `--dry-run` | Preview changes without writing anything |
| `--json` | Output result as JSON |

**Example:**
```bash
deckent sync
deckent sync --dry-run --json
```

**MCP:** `deckent_sync`

---

### `deckent mode`

Get/set deckent_style (sprint | task | auto).

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `mode show` | Show current mode |
| `mode sprint` | Switch to sprint mode |
| `mode task` | Switch to task mode |
| `mode auto` | Auto-detect mode from context |
| `mode global` | Set global default (sprint\|task) |

**Example:**
```bash
deckent mode show
deckent mode task
deckent mode global sprint
```

---

## Memory & Knowledge

### `deckent recall <query>`

Search project memory — ADRs, sprint learnings, patterns, debt.

| Option | Description |
|--------|-------------|
| `-t, --type <types>` | Filter by type (comma-separated: adr,memory,sprint,debt,pattern) |
| `-n, --limit <n>` | Max results |
| `--sprint-min <n>` | Minimum sprint number |
| `-m, --mode <mode>` | FTS5 token join mode: or (default) \| and |

**Example:**
```bash
deckent recall "docker heartbeat"
deckent recall "security" --type adr --limit 5
deckent recall "routing" --sprint-min 140 --mode and
```

**MCP:** `deckent_memory_query`

---

### `deckent remember <note>`

Store a note in project memory.

| Option | Description |
|--------|-------------|
| `-t, --type <type>` | Entry type (default: memory) |
| `--tags <tags>` | Comma-separated tags |
| `--title <title>` | Entry title (default: first 60 chars of note) |

**Example:**
```bash
deckent remember "Docker OOM needs 15s grace period"
deckent remember "New API versioning scheme" --type adr --tags api,versioning
```

---

### `deckent memory`

Memory V2 management.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `memory rebuild` | Rebuild memory.db from .brain/exports/*.md files |
| `memory export` | Export memory.db to .brain/exports/*.md |
| `memory stats` | Show memory.db statistics |
| `memory relations` | Manage memory relations |

**Example:**
```bash
deckent memory stats
deckent memory export
deckent memory rebuild
```

---

## Agents & Skills

### `deckent agent`

Manage agent pool.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `agent list` | List all agents (`--json`) |
| `agent create <name>` | Create a custom agent (`--model`, `--triggers`, `--prompt`, `--description`) |
| `agent stats <name>` | Show sprint-by-sprint performance (`--json`) |
| `agent enable <name>` | Enable an agent |
| `agent disable <name>` | Disable an agent |
| `agent delete <name>` | Delete an agent from the pool |
| `agent edit <name>` | Edit agent config (`--model`, `--description`, `--triggers`, `--sync-prompt`) |
| `agent info <name>` | Show detailed agent information |

**Example:**
```bash
deckent agent list
deckent agent create my-agent --model sonnet --triggers "custom,special"
deckent agent stats architect
deckent agent info security-auditor
```

**MCP:** `deckent_agent_list`

---

### `deckent skill`

Manage skill pool.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `skill list` | List all skills (`--json`, `--category`) |
| `skill create <name>` | Create a custom skill |
| `skill install <source>` | Install from local/git (`--force`) |
| `skill update <name>` | Update from original source |
| `skill enable <name>` | Enable a skill |
| `skill disable <name>` | Disable a skill |
| `skill delete <name>` | Delete a skill |
| `skill info <name>` | Show skill details (`--stats`) |
| `skill search <query>` | Search marketplace (`--category`, `--json`, `--limit`) |
| `skill publish <path>` | Validate, sign (Ed25519) and publish (`--dry-run`, `--key-dir`, `--no-sign`) |

**Example:**
```bash
deckent skill list --category testing
deckent skill install ./my-skill
deckent skill publish . --dry-run
deckent skill search "react" --limit 20
```

**MCP:** `deckent_skill_list`

---

## Plugins

### `deckent plugin`

Manage plugins.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `plugin install <source>` | Install from npm, git URL, or local path (`--force`) |
| `plugin remove <name>` | Remove an installed plugin |
| `plugin update <name>` | Update a plugin |
| `plugin list` | List installed plugins (`--json`) |
| `plugin info <path>` | Show plugin info |
| `plugin test <path>` | Test a plugin: validate manifest and entrypoint |
| `plugin create <name>` | Create a new plugin scaffold |

**Example:**
```bash
deckent plugin list
deckent plugin install deckent-plugin-slack
deckent plugin create my-plugin
deckent plugin test ./my-plugin
```

---

## Documents

### `deckent docs`

Manage user-defined documents (managed-docs system).

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `docs add <path>` | Add a document (`--auto`, `--protect`, `--skills`, `--max-lines`) |
| `docs remove <path>` | Remove a document |
| `docs list` | List all managed documents |
| `docs update <path>` | Update rules (`--add-auto`, `--add-protect`, `--remove-auto`, `--max-lines`) |
| `docs run` | Run managed doc updates without a sprint (`--no-cache`) |

**Example:**
```bash
deckent docs list
deckent docs add ARCHITECTURE.md --auto "## Overview,## Modules"
deckent docs run --no-cache
```

**MCP:** `deckent_docs`

---

## Cost & Budget

### `deckent cost`

User Safety Shield — cost management and estimation.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `cost show` | Display model pricing (`--provider`, `--model`) |
| `cost update` | Fetch latest pricing (`--provider`, `--dry-run`, `--skip-validation`) |
| `cost budget` | View or set budgets (`--set`, `--daily`, `--monthly`) |

**Example:**
```bash
deckent cost show --provider anthropic
deckent cost budget --set 50 --monthly 500
deckent cost update --dry-run
```

---

## Nervous System

### `deckent nervous`

Nervous System dashboard — monitor, accept, reject proactive suggestions.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `nervous accept <id>` | Accept a pending suggestion |
| `nervous reject <id>` | Reject a suggestion (`--reason`) |
| `nervous edit <id>` | Modify and accept a suggestion |
| `nervous undo <id>` | Undo a recent reversible action |
| `nervous history` | View action history (`--limit`, `--since`) |
| `nervous log` | View raw log (`--follow`) |

**Example:**
```bash
deckent nervous
deckent nervous accept ns-001
deckent nervous history --since 1d
deckent nervous log --follow
```

---

## Server & Dashboard

### `deckent serve`

Start HTTP API server with SSE support.

| Option | Description |
|--------|-------------|
| `--port <number>` | Port to listen on |
| `--dev` | Enable dev proxy mode (expects Vite dev server) |
| `--dev-port <number>` | Vite dev server port for --dev proxy mode |

**Example:**
```bash
deckent serve --port 3000
deckent serve --dev --dev-port 5173
```

---

### `deckent web`

Start web dashboard with API server.

| Option | Description |
|--------|-------------|
| `--port <number>` | Port to listen on |
| `--dev` | Development mode — use Vite dev server for frontend |

**Example:**
```bash
deckent web --port 8080
deckent web --dev
```

---

## Miscellaneous

### `deckent archive-debt`

Archive resolved debt items from .brain/DEBT.md.

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview what would be archived |
| `--count` | Show count of items and exit |
| `--before <sprint>` | Only archive items before this sprint ID |
| `--max-archive-size <bytes>` | Max archive file size before rotation |

**Example:**
```bash
deckent archive-debt --dry-run
deckent archive-debt --before sprint-140
```

---

### `deckent help-info`

Show quick-reference help (localized). Alias: `info`.

| Option | Description |
|--------|-------------|
| `--lang <lang>` | Language override: en or tr |

**Example:**
```bash
deckent help-info
deckent info --lang tr
```

**MCP:** `deckent_help`

---

## MCP Tool Parity Summary (ADR-022-V2)

| CLI Command | MCP Tool | Parity |
|-------------|----------|--------|
| `init` | `deckent_init` | Full |
| `start` | `deckent_start` | Full |
| `plan` | `deckent_plan` | Full |
| `status` | `deckent_status` | Full |
| `doctor` | `deckent_doctor` | Full |
| `retro` | `deckent_retro` | Full |
| `history` | `deckent_history` | Full |
| `analyze` | `deckent_analyze_project` | Full |
| `sync` | `deckent_sync` | Full |
| `config` | `deckent_config` | Full |
| `review` | `deckent_review` | Full |
| `run` | `deckent_run` | Full |
| `kill` | `deckent_kill` | Full |
| `cleanup` | `deckent_cleanup` | Full |
| `help-info` | `deckent_help` | Full |
| `agent` | `deckent_agent_list` | Partial (list only) |
| `skill` | `deckent_skill_list` | Partial (list only) |
| `checkpoint` | `deckent_checkpoint` | Full |
| `docs` | `deckent_docs` | Full |
| `explain` | `deckent_explain` | Full |
| `recall` | `deckent_memory_query` | Full |
| `set-directives` | `deckent_set_directives` | Full |
| `attach` | — | CLI only |
| `spawn` | — | CLI only |
| `dashboard` | — | CLI only |
| `serve` | — | CLI only |
| `web` | — | CLI only |
| `watch` | — | CLI only |
| `test` | — | CLI only |
| `finalize` | — | CLI only |
| `heartbeat` | — | CLI only |
| `output` | — | CLI only |
| `cost` | — | CLI only |
| `remember` | — | CLI only |
| `memory` | — | CLI only |
| `resume` | — | CLI only |
| `nervous` | — | CLI only |
| `config nervous` | — | CLI only (subcommand) |
| `mode` | — | CLI only |
| `features` | — | CLI only |
| `audit` | — | CLI only |
| `recover` | — | CLI only |
| `archive-debt` | — | CLI only |
| `onboard` | — | CLI only |
| `upgrade` | — | CLI only |
| `plugin` | — | CLI only |

**Coverage:** 22/45 commands have MCP tool counterparts (49% parity).

---

_Generated: 2026-04-22 | Sprint 151 | Deckent v1.0.0-beta.1_
