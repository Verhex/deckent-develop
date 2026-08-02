# CLI Reference

> Auto-generated from Deckent CLI source. Run `npm run docs:generate-cli` to regenerate.

## Overview

Deckent CLI (`deckent`) orchestrates AI agents for your development workflow.

```bash
deckent <command> [options]
```

## Command Index

### Project Setup

- [`deckent init`](#init) — Initialize a new Deckent project in the current directory
- [`deckent onboard`](#onboard) — Run the interactive onboarding wizard
- [`deckent upgrade`](#upgrade) — Self-update deckent to the latest version via npm

### Run Workflow

- [`deckent start [description]`](#start) — Start a new sprint
- [`deckent plan`](#plan) — Plan the next sprint without executing it
- [`deckent test`](#test) — Run a test sprint — no retro, no memory update, no decay
- [`deckent finalize`](#finalize) — Finalize a sprint: update MEMORY
- [`deckent cleanup`](#cleanup) — Clean up after a sprint
- [`deckent review`](#review) — Review sprint tasks with evaluations
- [`deckent retro`](#retro) — Show the latest sprint retrospective from 
- [`deckent explain`](#explain) — Explain what the last sprint did in human-friendly language

### Monitoring

- [`deckent status`](#status) — Show the current sprint dashboard
- [`deckent watch`](#watch) — Open a live tmux split view: dashboard pane + worker panes
- [`deckent dashboard`](#dashboard) — Show a terminal dashboard with auto-refresh (CLI rendering, no browser)
- [`deckent history`](#history) — Show sprint history from 
- [`deckent usage`](#usage) — Show usage metrics (model calls, token counts, estimated cost for API mode)
- [`deckent analyze`](#analyze) — Analyze project stack, size, and recommended methodology

### Workers & Tasks

- [`deckent spawn <taskId>`](#spawn) — Manually spawn a tmux worker for a specific task ID
- [`deckent kill <taskId>`](#kill) — Kill a running worker by task ID
- [`deckent attach`](#attach) — Attach to the active tmux orchestra session
- [`deckent run <description>`](#run) — Run a single one-shot task without a sprint cycle
- [`deckent sync`](#sync) — Sync adapter files (CLAUDE

### Configuration

- [`deckent config`](#config) — Show or modify project configuration (
- [`deckent archive-debt`](#archive-debt) — Archive resolved debt items from 
- [`deckent doctor`](#doctor) — Check system dependencies and health

### Skills & Agents

- [`deckent skill`](#skill) — Manage the skill pool (
- [`deckent agent`](#agent) — Manage the agent pool (

### Plugins

- [`deckent plugin`](#plugin) — Manage plugins (

### Server & Dashboard

- [`deckent serve`](#serve) — Start the HTTP API server with SSE support
- [`deckent web`](#web) — Start the web dashboard with API server

---

# Project Setup

## `init`

Initialize a new Deckent project in the current directory. Creates .deckent/, .brain/, agent rules, DIRECTIVES.md, and optional IDE-specific config files.

**Usage:** `deckent init`

**Options:**

| Flag | Description |
|------|-------------|
| `--auto` | Auto-detect system, subscription, and project to generate recommendations |
| `--manual` | Skip auto-detection, use interactive prompts only |
| `--cursor` | Configure for Cursor IDE environment |
| `--claude-code` | Configure for Claude Code environment (default) |
| `--env <envs>` | Comma-separated environments to configure (codex,cursor,gemini,vscode,shell) |
| `--all-envs` | Configure ALL environment configs |

**Examples:**

```bash
deckent init
deckent init --auto
deckent init --env codex,cursor
deckent init --all-envs
```

---

## `onboard`

Run the interactive onboarding wizard. Guides new users through provider setup, project configuration, and first-sprint preparation.

**Usage:** `deckent onboard`

**Options:**

| Flag | Description |
|------|-------------|
| `--non-interactive` | Skip interactive prompts, use defaults |

**Examples:**

```bash
deckent onboard
deckent onboard --non-interactive
```

---

## `upgrade`

Self-update deckent to the latest version via npm.

**Usage:** `deckent upgrade`

**Options:**

| Flag | Description |
|------|-------------|
| `--check` | Only check for updates, do not install |

**Examples:**

```bash
deckent upgrade
deckent upgrade --check
```

---

# Run Workflow

## `start [description]`

Start a new sprint. Optionally pass a one-line description for zero-config mode — Deckent creates a temporary DIRECTIVES.md and starts immediately.

**Usage:** `deckent start [description]`

**Options:**

| Flag | Description |
|------|-------------|
| `--auto-approve` | Auto-approve worker actions (--dangerously-skip-permissions) |
| `--sandbox-mode` | Run in sandbox mode (Docker) |
| `--dry-run` | Plan sprint without spawning workers |
| `--force` | Skip doctor pre-flight checks |
| `--watch` | Automatically open watch mode after sprint spawns workers |

**Examples:**

```bash
deckent start
deckent start "Add JWT authentication to the Express API"
deckent start --dry-run
deckent start --force --watch
```

---

## `plan`

Plan the next sprint without executing it. Reads DIRECTIVES.md, checks usage, and generates task files in .tasks/. Prompts for confirmation before writing.

**Usage:** `deckent plan`

**Options:**

| Flag | Description |
|------|-------------|
| `--no-confirm` | Skip confirmation, auto-approve plan |
| `--structured` | Force structured parsing (skip AI planner) |

**Examples:**

```bash
deckent plan
deckent plan --no-confirm
deckent plan --structured
```

---

## `test`

Run a test sprint — no retro, no memory update, no decay. Useful for validating DIRECTIVES.md before committing to a full sprint.

**Usage:** `deckent test`

**Options:**

| Flag | Description |
|------|-------------|
| `--keep` | Skip cleanup — leave task files in place after test |
| `--timeout <ms>` | Maximum sprint duration in milliseconds _(default: `300000`)_ |

**Examples:**

```bash
deckent test
deckent test --keep
deckent test --timeout 60000
```

---

## `finalize`

Finalize a sprint: update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md, config metadata, and optionally run memory decay.

**Usage:** `deckent finalize`

**Options:**

| Flag | Description |
|------|-------------|
| `--skip-decay` | Skip memory/debt decay phase |
| `--skip-hooks` | Skip plugin afterSprint hooks |

**Examples:**

```bash
deckent finalize
deckent finalize --skip-decay
```

---

## `cleanup`

Clean up after a sprint. Removes task files, heartbeat files, and lock files. Optionally runs memory decay.

**Usage:** `deckent cleanup`

**Options:**

| Flag | Description |
|------|-------------|
| `--decay` | Force run memory decay (compress .brain/ files) |

**Examples:**

```bash
deckent cleanup
deckent cleanup --decay
```

---

## `review`

Review sprint tasks with evaluations. Shows task results, self-assessments, and lets you approve or reject outcomes.

**Usage:** `deckent review`

**Options:**

| Flag | Description |
|------|-------------|
| `--auto` | Auto-approve/reject based on task results |
| `--json` | Output review state as JSON |

**Examples:**

```bash
deckent review
deckent review --auto
deckent review --json
```

---

## `retro`

Show the latest sprint retrospective from .brain/RETRO.md.

**Usage:** `deckent retro`

**Options:**

| Flag | Description |
|------|-------------|
| `--raw` | Show raw RETRO.md content without formatting |
| `--compare` | Show delta comparison with previous sprint |

**Examples:**

```bash
deckent retro
deckent retro --compare
```

---

## `explain`

Explain what the last sprint did in human-friendly language. Reads sprint logs, task results, and retro to produce a plain-English summary.

**Usage:** `deckent explain`

**Examples:**

```bash
deckent explain
```

---

# Monitoring

## `status`

Show the current sprint dashboard. Displays worker status, task progress, and phase information.

**Usage:** `deckent status`

**Options:**

| Flag | Description |
|------|-------------|
| `--watch` | Auto-refresh every 2 seconds |
| `--json` | Output raw JSON instead of formatted dashboard |
| `--raw` | Show legacy raw dashboard (box format) |
| `--verbose` | Show detailed agent and skill assignment info |

**Examples:**

```bash
deckent status
deckent status --watch
deckent status --json
deckent status --verbose
```

---

## `watch`

Open a live tmux split view: dashboard pane + worker panes. Requires an active tmux session.

**Usage:** `deckent watch`

**Options:**

| Flag | Description |
|------|-------------|
| `--follow <taskId>` | Attach to a specific worker pane by task ID |

**Examples:**

```bash
deckent watch
deckent watch --follow 001-003
```

---

## `dashboard`

Show a terminal dashboard with auto-refresh (CLI rendering, no browser).

**Usage:** `deckent dashboard`

**Options:**

| Flag | Description |
|------|-------------|
| `--interval <ms>` | Refresh interval in milliseconds _(default: `2000`)_ |

**Examples:**

```bash
deckent dashboard
deckent dashboard --interval 5000
```

---

## `history`

Show sprint history from .brain/sprints/. Displays a table of sprints with task counts, coverage, and duration.

**Usage:** `deckent history`

**Options:**

| Flag | Description |
|------|-------------|
| `--agent <name>` | Filter by agent name |
| `--skill <name>` | Filter by skill name |

**Examples:**

```bash
deckent history
deckent history --agent brain
```

---

## `usage`

Show usage metrics (model calls, token counts, estimated cost for API mode).

**Usage:** `deckent usage`

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--sprint <id>` | Filter by sprint ID |

**Examples:**

```bash
deckent usage
deckent usage --sprint sprint-042
deckent usage --json
```

---

## `analyze`

Analyze project stack, size, and recommended methodology. Detects framework, language, test framework, and build tool from the project.

**Usage:** `deckent analyze`

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output raw JSON |

**Examples:**

```bash
deckent analyze
deckent analyze --json
```

---

# Workers & Tasks

## `spawn <taskId>`

Manually spawn a tmux worker for a specific task ID. The task JSON must already exist in .tasks/.

**Usage:** `deckent spawn <taskId>`

**Examples:**

```bash
deckent spawn 001-003
```

---

## `kill <taskId>`

Kill a running worker by task ID. Terminates the tmux pane associated with the task.

**Usage:** `deckent kill <taskId>`

**Examples:**

```bash
deckent kill 001-003
```

---

## `attach`

Attach to the active tmux orchestra session. Equivalent to `tmux attach -t deckent`.

**Usage:** `deckent attach`

**Examples:**

```bash
deckent attach
```

---

## `run <description>`

Run a single one-shot task without a sprint cycle. Creates a minimal task, spawns one worker, waits for the result.

**Usage:** `deckent run <description>`

**Options:**

| Flag | Description |
|------|-------------|
| `--model <model>` | Canonical provider API model ID. Registered options: claude-fable-5, claude-opus-4-8, claude-opus-5, claude-sonnet-5, claude-haiku-4-5-20251001, o3, gpt-5.5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini, gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash, gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna _(default: `claude-sonnet-5`)_ |
| `--scope <dir>` | Worker scope directory _(default: `./`)_ |

**Examples:**

```bash
deckent run "Fix the login page redirect bug"
deckent run "Add input validation" --model claude-sonnet-5 --scope src/api/
```

---

## `sync`

Sync adapter files (CLAUDE.md, AGENTS.md) and detect out-of-band changes since the last sprint.

**Usage:** `deckent sync`

**Options:**

| Flag | Description |
|------|-------------|
| `--git-only` | Only detect git changes (skip adapter file sync) |
| `--adapters-only` | Only sync adapter files (skip git change detection) |

**Examples:**

```bash
deckent sync
deckent sync --git-only
```

---

# Configuration

## `config`

Show or modify project configuration (.deckent/config.json).

**Usage:** `deckent config`

**Subcommands:**

#### `set <key> <value>`

Set a configuration value by key.

**Usage:** `deckent config set <key> <value>`

**Examples:**

```bash
deckent config set brain_provider claude
deckent config set max_workers 5
```

#### `export [file]`

Export config to stdout or a file (strips comments, validates JSON).

**Usage:** `deckent config export [file]`

**Examples:**

```bash
deckent config export
deckent config export config-backup.json
```

#### `import <file>`

Import config from a JSON file, merging over existing config.

**Usage:** `deckent config import <file>`

**Examples:**

```bash
deckent config import config-backup.json
```

**Examples:**

```bash
deckent config
deckent config set max_workers 8
deckent config export
deckent config import my-config.json
```

---

## `archive-debt`

Archive resolved debt items from .brain/DEBT.md to .brain/archive/.

**Usage:** `deckent archive-debt`

**Examples:**

```bash
deckent archive-debt
```

---

## `doctor`

Check system dependencies and health. Verifies Node.js version, Claude CLI, tmux, and project configuration.

**Usage:** `deckent doctor`

**Options:**

| Flag | Description |
|------|-------------|
| `--profile` | Show system profile information |
| `--legacy` | Use legacy output format |

**Examples:**

```bash
deckent doctor
deckent doctor --profile
```

---

# Skills & Agents

## `skill`

Manage the skill pool (.deckent/skills/).

**Usage:** `deckent skill`

**Subcommands:**

#### `list`

List all installed skills.

**Usage:** `deckent skill list`

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--category <cat>` | Filter by category |

**Examples:**

```bash
deckent skill list
deckent skill list --category testing
```

#### `create <name>`

Create a new custom skill scaffold.

**Usage:** `deckent skill create <name>`

**Examples:**

```bash
deckent skill create my-skill
```

#### `install <source>`

Install a skill from a local path or git URL.

**Usage:** `deckent skill install <source>`

**Options:**

| Flag | Description |
|------|-------------|
| `--force` | Overwrite existing skill |

**Examples:**

```bash
deckent skill install ./path/to/skill
deckent skill install https://github.com/org/skill
```

#### `search <query>`

Search skills in the marketplace registry.

**Usage:** `deckent skill search <query>`

**Options:**

| Flag | Description |
|------|-------------|
| `--category <cat>` | Filter by category |
| `--json` | Output as JSON |
| `--limit <n>` | Max results per page _(default: `20`)_ |

**Examples:**

```bash
deckent skill search "react testing"
deckent skill search api --category backend
```

#### `publish`

Publish a skill to the marketplace registry.

**Usage:** `deckent skill publish`

**Options:**

| Flag | Description |
|------|-------------|
| `--dry-run` | Validate without publishing |

**Examples:**

```bash
deckent skill publish
deckent skill publish --dry-run
```

**Examples:**

```bash
deckent skill list
deckent skill create my-skill
deckent skill install ./my-skill
```

---

## `agent`

Manage the agent pool (.deckent/agents/).

**Usage:** `deckent agent`

**Subcommands:**

#### `list`

List all agents in the pool.

**Usage:** `deckent agent list`

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

**Examples:**

```bash
deckent agent list
```

#### `create <name>`

Create a new custom agent.

**Usage:** `deckent agent create <name>`

**Examples:**

```bash
deckent agent create my-agent
```

#### `enable <name>`

Enable a disabled agent.

**Usage:** `deckent agent enable <name>`

**Examples:**

```bash
deckent agent enable my-agent
```

#### `disable <name>`

Disable an active agent.

**Usage:** `deckent agent disable <name>`

**Examples:**

```bash
deckent agent disable my-agent
```

**Examples:**

```bash
deckent agent list
deckent agent create my-agent
deckent agent enable my-agent
```

---

# Plugins

## `plugin`

Manage plugins (.deckent/plugins/).

**Usage:** `deckent plugin`

**Subcommands:**

#### `install <source>`

Install a plugin from npm, git URL, or local path.

**Usage:** `deckent plugin install <source>`

**Examples:**

```bash
deckent plugin install deckent-plugin-slack
deckent plugin install ./my-plugin
```

#### `list`

List all installed plugins.

**Usage:** `deckent plugin list`

**Examples:**

```bash
deckent plugin list
```

#### `info <dir>`

Show plugin info from a directory.

**Usage:** `deckent plugin info <dir>`

**Examples:**

```bash
deckent plugin info .deckent/plugins/slack
```

#### `create <name>`

Create a new plugin scaffold.

**Usage:** `deckent plugin create <name>`

**Examples:**

```bash
deckent plugin create my-plugin
```

**Examples:**

```bash
deckent plugin list
deckent plugin install deckent-plugin-slack
deckent plugin create my-plugin
```

---

# Server & Dashboard

## `serve`

Start the HTTP API server with SSE support. Exposes REST endpoints for dashboard and external integrations.

**Usage:** `deckent serve`

**Options:**

| Flag | Description |
|------|-------------|
| `--port <number>` | Port to listen on _(default: `3100`)_ |

**Examples:**

```bash
deckent serve
deckent serve --port 8080
```

---

## `web`

Start the web dashboard with API server. Serves the built React dashboard alongside the API.

**Usage:** `deckent web`

**Options:**

| Flag | Description |
|------|-------------|
| `--port <number>` | Port to listen on _(default: `3100`)_ |
| `--dev` | Development mode — use Vite dev server for frontend |

**Examples:**

```bash
deckent web
deckent web --port 8080
deckent web --dev
```

---

---

# CLI Command Index

> **Auto-generated** — do not edit AUTOGEN block by hand. Run `npm run docs:ref` to regenerate.
> **Source-parsed** — extracted from `src/cli/commands/*.ts` `.command(...)` registrations.

<!-- AUTOGEN:START id="cli-en" -->
> 165 commands. Generated from `src/cli/commands/*.ts`.

| Command | Description |
|---------|-------------|
| `deckent accept <id>` | Accept a pending nervous system suggestion |
| `deckent accept-panic <task-id>` | Approve a PanicGuard-blocked worker kill (writes IPC marker) |
| `deckent add` | Add a new entry to the autonomous backlog |
| `deckent add <cron> <action>` | Add a new scheduled flow (cron: 5-field expression, e.g. "* * * * * |
| `deckent add <name> <cmdOrUrl> [args...]` | Add an MCP server (stdio or http) — writes to .mcp.json by scope |
| `deckent add <path>` | Add a document to managed docs |
| `deckent agent` | Manage agent pool |
| `deckent analyze` | Analyze project stack, size, and recommended methodology |
| `deckent approve <id>` | Approve a pending event-triggered flow dispatch so it can proceed |
| `deckent approve <sprintId> <phase>` | Approve a pending checkpoint |
| `deckent approve <triggerId>` | Approve a parked trigger — resolves the running loop\'s gate |
| `deckent archive-debt` | Report tech-debt status (DB-first; resolved debt is auto-managed in memory.db) |
| `deckent attach` | Attach to the tmux orchestra session |
| `deckent audit [sprint-id]` | Run Brain Self-Audit Gate for a sprint, or query/export/retain audit log events (query \| compliance \| forward \| retention) |
| `deckent audit-verify` | Verify the audit HMAC chain (I4 invariant — tamper-evident audit log) |
| `deckent autonomous` | Autonomous runtime — authority-bounded continuous loop |
| `deckent autonomous-mission` | Manage autonomous v2 missions — list missions, goal missions |
| `deckent backlog` | Manage the autonomous backlog (add / list / remove entries) |
| `deckent baseline-refresh` | Refresh directives_protection baseline to current DIRECTIVES.md content |
| `deckent budget` | View or set cost budgets |
| `deckent build` | Build the deckent-worker Docker image from the packaged Dockerfile.worker |
| `deckent chat` | Start a conversational session with Deckent. Uses your installed AI CLI. |
| `deckent check <role> <action>` | Check whether a role has permission to perform an action |
| `deckent checkpoint` | Manage human checkpoints — list, approve, or reject pending checkpoints |
| `deckent cleanup` | Sweep stray autonomous run-artifacts (task-run-*, _*.pid) from .tasks/ |
| `deckent cleanup` | Clean up after a sprint |
| `deckent config` | Show or modify project configuration |
| `deckent connect` | Diagnose provider/MCP/IDE/shell connection status (read-only — no changes are made) |
| `deckent cost` | User Safety Shield — cost management & estimation |
| `deckent create <name>` | Create a new plugin scaffold |
| `deckent create <name>` | Create a custom skill |
| `deckent create-goal <goal>` | Create a Type-2 goal mission (runs until the goal is reached) |
| `deckent create-list <title>` | Create a Type-1 list mission from N work-items |
| `deckent cu-status` | Show computer-use (TOOL-CU) status: flag state + per-capability availability |
| `deckent dashboard` | Show terminal dashboard with auto-refresh (see also: deckent status --watch) |
| `deckent delete <name>` | Delete an agent from the pool |
| `deckent delete <name>` | Delete a skill |
| `deckent disable <name>` | Disable an agent |
| `deckent disable <name>` | Disable a skill |
| `deckent do <goal>` | Golden-flow: turn a goal into a sprint plan (dry-run preview by default; --run to actually start it) |
| `deckent docs` | Manage user-defined documents |
| `deckent doctor` | Check system dependencies and health |
| `deckent edit <id>` | Modify and accept a pending suggestion |
| `deckent edit <name>` | Edit an agent configuration |
| `deckent enable` | Enable autonomous mode (one command instead of editing config; default stays OFF) |
| `deckent enable` | Enable the Nervous System (one command; default stays OFF, human-approval preserved) |
| `deckent enable <name>` | Enable an agent |
| `deckent enable <name>` | Enable a skill |
| `deckent evolve` | Evolution analysis — cross-sprint trends and prompt suggestions |
| `deckent explain` | Explain what the last sprint did in human-friendly language |
| `deckent export` | Export memory.db to .brain/exports/*.md |
| `deckent export [file]` | Export config to stdout or a file |
| `deckent features` | List features from .deckent/settings/features-manifest.json by category |
| `deckent flow` | Manage scheduled flows (process mode) |
| `deckent get <key>` | Get a configuration value by key (supports dot notation) |
| `deckent get <name>` | Show details for an MCP server (from merged view) |
| `deckent grant <user> <role>` | Assign a role to a user |
| `deckent heartbeat` | Run proactive heartbeat tasks from .deckent/HEARTBEAT.md |
| `deckent help-info` | Show quick-reference help (localized) |
| `deckent history` | View nervous system action history |
| `deckent image` | Worker Docker image management |
| `deckent import <file>` | Import config from a JSON file |
| `deckent info <dir>` | Show plugin info (accepts absolute or relative path) |
| `deckent info <name>` | Show detailed agent information |
| `deckent info <name>` | Show skill details |
| `deckent init` | Initialize a new Deckent project |
| `deckent install <source>` | Install a plugin from npm, git URL, or local path |
| `deckent install <source>` | Install a skill from local path or git URL (supports version pinning: url#tag) |
| `deckent keys` | List all config parameter keys |
| `deckent kill [taskId]` | Kill a running worker |
| `deckent kpi` | Show the KPI scorecard for the current (or a specific) sprint |
| `deckent limits` | Check live subscription-window usage (session/week) and the configured start-gate thresholds |
| `deckent lint` | Lint the agent catalog: reachability, coverage gaps, capability overlaps (V3) |
| `deckent list` | List all agents in the pool |
| `deckent list` | List all missions (summary table) |
| `deckent list` | List autonomous backlog entries |
| `deckent list` | List all checkpoints |
| `deckent list` | Show current authority matrix with all presets |
| `deckent list` | List all config parameters grouped by category |
| `deckent list` | List all managed documents |
| `deckent list` | List all scheduled flows |
| `deckent list` | List registered MCP servers (merged: local > project > user) |
| `deckent list` | List all relations in memory.db |
| `deckent list` | List available models from the catalog |
| `deckent list` | List installed plugins |
| `deckent list` | List all skills |
| `deckent log` | View raw nervous system log |
| `deckent mcp` | Manage MCP servers (Claude-parity) |
| `deckent memory` | Memory V2 management |
| `deckent migrate` | Migrate config.json to the latest full format (adds missing fields with defaults) |
| `deckent models` | Manage and browse the model catalog |
| `deckent nervous` | Configure Nervous System authority mode and action overrides', ) .option('--lang &lt;code&gt;', 'Language override (en\|tr) |
| `deckent nervous` | Nervous System dashboard — monitor, accept, reject proactive suggestions |
| `deckent onboard` | Run the onboarding wizard |
| `deckent openrouter-probe` | Live-probe OpenRouter free models via $DECK:OPENROUTER_API_KEY and refresh the local cache |
| `deckent output <taskId>` | Show captured output for a specific worker task |
| `deckent override <actionId> <policy>` | Set a per-action policy override |
| `deckent pending` | List parked approvals awaiting human accept/reject |
| `deckent plan` | Plan a sprint without executing it |
| `deckent plan <goal>` | Decompose a high-level goal into a lightweight autonomous backlog (Phase 1) |
| `deckent plan-nl` | Turn a free-form goal into a DIRECTIVES.md scaffold (single-task template; preview by default) |
| `deckent plugin` | Manage plugins |
| `deckent process` | Process-mode execution surface — submit tasks/capabilities and poll their status (ADR-022 CLI/MCP parity) |
| `deckent publish <skillPath>` | Validate, sign (Ed25519) and publish a skill to the marketplace |
| `deckent rbac` | Role-based access control — check permissions and list roles |
| `deckent rebuild` | Rebuild memory.db from .brain/exports/*.md files |
| `deckent recall <query>` | Search project memory — ADRs, sprint learnings, patterns, debt |
| `deckent reclassify` | Reclassify a recorded task outcome (delta-applies agent/skill stats) |
| `deckent recommendations` | View the Brain inbox — nervous proposals awaiting disposition (ADR-037) |
| `deckent refresh` | Force-refresh the model catalog (invalidates 24h cache) |
| `deckent reject <id>` | Reject a pending nervous system suggestion |
| `deckent reject <sprintId> <phase>` | Reject a pending checkpoint |
| `deckent reject <triggerId>` | Reject a parked trigger — resolves the running loop\'s gate |
| `deckent relations` | Manage memory relations |
| `deckent remember <note>` | Store a note in project memory |
| `deckent remove [id]` | Remove an entry from the autonomous backlog (positional id or --id) |
| `deckent remove <name>` | Remove an MCP server (searches all scopes if --scope omitted) |
| `deckent remove <name>` | Remove an installed plugin |
| `deckent remove <pathOrId>` | Remove a document from managed docs |
| `deckent report` | Show cross-sprint agent/skill trend report |
| `deckent reset` | Reset all action overrides to preset defaults |
| `deckent resources` | Show live docker worker resource usage or analyze resource log |
| `deckent result <executionId>` | Show the full result of a submission (status + lastResult) |
| `deckent resume <sprintId>` | Resume a sprint from its latest checkpoint |
| `deckent retro` | Show the latest sprint retrospective |
| `deckent review` | Review pending relations from backfill preview |
| `deckent review` | Review sprint tasks with evaluations |
| `deckent revoke <user>` | Remove the role assignment for a user |
| `deckent roles` | List all roles and their effective permissions |
| `deckent run` | Run managed doc updates without a sprint |
| `deckent run` | Run the flow-runtime tick once (--once) or start the daemon |
| `deckent runs` | List run-flows (the multi-flow inbox) — plus per-run decide: --approve/--reject/--start |
| `deckent scan` | Hash + timestamp + rank all docs; write front-matter; sync memory.db |
| `deckent search <query>` | Search skills in the marketplace registry |
| `deckent serve` | Start HTTP API server with SSE support |
| `deckent set` | Set a nervous system configuration value |
| `deckent set <key> <value>` | Set a configuration value |
| `deckent set-directives` | Write sprint goals to DIRECTIVES.md (content, file, or stdin) |
| `deckent show` | Display model pricing (read-only) |
| `deckent skill` | Manage skill pool |
| `deckent start` | Start the autonomous loop (default-deny + human-approval gate) |
| `deckent start [description]` | Start a new sprint (optionally with a one-line description for zero-config mode) |
| `deckent stats` | Show memory.db statistics |
| `deckent stats <name>` | Show sprint-by-sprint performance for an agent |
| `deckent status` | Show autonomous runtime summary (pending + last audit events) |
| `deckent status` | Report tracked docs by rank + stale state |
| `deckent status <executionId>` | Poll the status of a prior submission by executionId |
| `deckent stop` | Signal the autonomous loop to stop cleanly |
| `deckent submit <description>` | Submit an ExecutionRequest (policy-gated: read-only auto-runs, side-effecting parks for approval) |
| `deckent sync` | Update memory.db only (no front-matter writes) |
| `deckent sync` | Sync adapter files and detect out-of-band changes since last sprint |
| `deckent test` | Run a test sprint (no retro, no memory update, no decay) |
| `deckent test <name>` | Test a plugin: validate manifest and entrypoint, run hooks if available |
| `deckent tier <model>` | Look up the tier of a specific model by ID or API ID |
| `deckent track` | Track doc freshness (hash + DCR + stale) |
| `deckent truth` | Resolve the 4-level feature truth-chain (code → wired → enabled → proof) for manifest truth-blocks |
| `deckent undo <action-id>` | Undo a recent reversible action |
| `deckent update` | Fetch latest pricing from LiteLLM + OpenRouter |
| `deckent update <name>` | Update an installed skill from its original source |
| `deckent update <pathOrId>` | Update rules for an existing managed doc |
| `deckent update <source>` | Update a plugin (remove existing and re-install from source) |
| `deckent upgrade` | Self-update deckent |
| `deckent usage` | Show token/limit consumption from Claude Code transcripts |
| `deckent watch` | Follow a live worker (docker logs / tmux pane / subprocess log) with --follow &lt;taskId&gt;, or open the tmux dashboard split |
| `deckent web` | Start web dashboard with API server (deprecated — use `deckent serve |
<!-- AUTOGEN:END id="cli-en" -->
