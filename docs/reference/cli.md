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

### Sprint Workflow

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

# Sprint Workflow

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
| `--model <model>` | Model to use. Options: opus, sonnet, haiku, gpt-4.1, o3, o4-mini, gemini-2.5-pro, gemini-2.5-flash _(default: `sonnet`)_ |
| `--scope <dir>` | Worker scope directory _(default: `./`)_ |

**Examples:**

```bash
deckent run "Fix the login page redirect bug"
deckent run "Add input validation" --model opus --scope src/api/
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

## Command Index (auto-generated)

> **Source-parsed** — extracted from `src/cli/commands/*.ts` `.command(...)` registrations.
> Hand-curated sections above are produced by `scripts/generate-cli-docs.ts`; this block is maintained by `scripts/gen-reference-docs.mjs`.

<!-- AUTOGEN:START id="cli" -->
> 109 commands. Generated from `src/cli/commands/*.ts`.

| Command | Description |
|---------|-------------|
| `deckent accept <id>` | Accept a pending nervous system suggestion |
| `deckent add <path>` | Add a document to managed docs |
| `deckent agent` | Manage agent pool |
| `deckent analyze` | Analyze project stack, size, and recommended methodology |
| `deckent approve <sprintId> <phase>` | Approve a pending checkpoint |
| `deckent archive-debt` | Archive resolved debt items from .brain/DEBT.md |
| `deckent attach` | Attach to the tmux orchestra session |
| `deckent audit <sprint-id>` | Run Brain Self-Audit Gate for a sprint (tsc + vitest + honesty + observability) |
| `deckent auto` | Auto-detect mode from context |
| `deckent budget` | View or set cost budgets |
| `deckent checkpoint` | Manage human checkpoints — list, approve, or reject pending checkpoints |
| `deckent cleanup` | Clean up after a sprint |
| `deckent config` | Show or modify project configuration |
| `deckent cost` | User Safety Shield — cost management & estimation |
| `deckent create <name>` | Create a custom agent (use --prompt/--description for wizard-style setup) |
| `deckent create <name>` | Create a new plugin scaffold |
| `deckent create <name>` | Create a custom skill |
| `deckent dashboard` | Show terminal dashboard with auto-refresh (see also: deckent status --watch) |
| `deckent delete <name>` | Delete an agent from the pool |
| `deckent delete <name>` | Delete a skill |
| `deckent disable <name>` | Disable an agent |
| `deckent disable <name>` | Disable a skill |
| `deckent docs` | Manage user-defined documents |
| `deckent doctor` | Check system dependencies and health |
| `deckent edit <id>` | Modify and accept a pending suggestion |
| `deckent edit <name>` | Edit an agent configuration |
| `deckent enable <name>` | Enable an agent |
| `deckent enable <name>` | Enable a skill |
| `deckent explain` | Explain what the last sprint did in human-friendly language |
| `deckent export` | Export memory.db to .brain/exports/*.md |
| `deckent export [file]` | Export config to stdout or a file |
| `deckent features` | List features from .deckent/features-manifest.json by category |
| `deckent finalize` | Finalize a sprint: update MEMORY.md, RETRO.md, PROJECT-IDENTITY.md, config, run decay |
| `deckent get <key>` | Get a configuration value by key (supports dot notation) |
| `deckent global <style>` | Set global default (sprint\|task) |
| `deckent heartbeat` | Run proactive heartbeat tasks from .deckent/HEARTBEAT.md |
| `deckent help-info` | Show quick-reference help (localized) |
| `deckent history` | Show sprint history |
| `deckent history` | View nervous system action history |
| `deckent import <file>` | Import config from a JSON file |
| `deckent info <dir>` | Show plugin info (accepts absolute or relative path) |
| `deckent info <name>` | Show detailed agent information |
| `deckent info <name>` | Show skill details |
| `deckent init` | Initialize a new Deckent project |
| `deckent install <source>` | Install a plugin from npm, git URL, or local path |
| `deckent install <source>` | Install a skill from local path or git URL (supports version pinning: url#tag) |
| `deckent keys` | List all config parameter keys |
| `deckent kill [taskId]` | Kill a running worker |
| `deckent list` | List all agents in the pool |
| `deckent list` | List all checkpoints |
| `deckent list` | Show current authority matrix with all presets |
| `deckent list` | List all config parameters grouped by category |
| `deckent list` | List all managed documents |
| `deckent list` | List all relations in memory.db |
| `deckent list` | List installed plugins |
| `deckent list` | List all skills |
| `deckent log` | View raw nervous system log |
| `deckent memory` | Memory V2 management |
| `deckent migrate` | Migrate config.json to the latest full format (adds missing fields with defaults) |
| `deckent mode` | Get/set deckent_style (sprint\|task\|auto) |
| `deckent nervous` | Configure Nervous System authority mode and action overrides', ) .action(async () => { const root = resolveProjectRoot(); await handleInteractive(root); }); // deckent config nervous set mode &lt;preset&gt; nervousCmd .command('set |
| `deckent nervous` | Nervous System dashboard — monitor, accept, reject proactive suggestions |
| `deckent onboard` | Run the onboarding wizard |
| `deckent output <taskId>` | Show captured output for a specific worker task |
| `deckent override <actionId> <policy>` | Set a per-action policy override |
| `deckent plan` | Plan a sprint without executing it |
| `deckent plugin` | Manage plugins |
| `deckent publish <skillPath>` | Validate, sign (Ed25519) and publish a skill to the marketplace |
| `deckent rebuild` | Rebuild memory.db from .brain/exports/*.md files |
| `deckent recall <query>` | Search project memory — ADRs, sprint learnings, patterns, debt |
| `deckent recover <sprint-id>` | Recover from a crashed or stuck sprint (audit + cleanup + archive) |
| `deckent reject <id>` | Reject a pending nervous system suggestion |
| `deckent reject <sprintId> <phase>` | Reject a pending checkpoint |
| `deckent relations` | Manage memory relations |
| `deckent remember <note>` | Store a note in project memory |
| `deckent remove <name>` | Remove an installed plugin |
| `deckent remove <pathOrId>` | Remove a document from managed docs |
| `deckent reset` | Reset all action overrides to preset defaults |
| `deckent resume <sprintId>` | Resume a sprint from its latest checkpoint |
| `deckent retro` | Show the latest sprint retrospective |
| `deckent review` | Review pending relations from backfill preview |
| `deckent review` | Review sprint tasks with evaluations |
| `deckent run` | Run managed doc updates without a sprint |
| `deckent run <description>` | Run a single one-shot task without a sprint cycle |
| `deckent search <query>` | Search skills in the marketplace registry |
| `deckent serve` | Start HTTP API server with SSE support |
| `deckent set <key> <value>` | Set a configuration value |
| `deckent set-directives` | Write sprint goals to DIRECTIVES.md (content, file, or stdin) |
| `deckent show` | Display model pricing (read-only) |
| `deckent show` | Show current mode |
| `deckent skill` | Manage skill pool |
| `deckent spawn <taskId>` | Manually spawn a worker for a task |
| `deckent sprint` | Switch to sprint mode |
| `deckent start [description]` | Start a new sprint (optionally with a one-line description for zero-config mode) |
| `deckent stats` | Show memory.db statistics |
| `deckent stats <name>` | Show sprint-by-sprint performance for an agent |
| `deckent status` | Show the current sprint dashboard |
| `deckent sync` | Sync adapter files and detect out-of-band changes since last sprint |
| `deckent task` | Switch to task mode |
| `deckent test` | Run a test sprint (no retro, no memory update, no decay) |
| `deckent test <name>` | Test a plugin: validate manifest and entrypoint, run hooks if available |
| `deckent undo <action-id>` | Undo a recent reversible action |
| `deckent update` | Fetch latest pricing from LiteLLM + OpenRouter |
| `deckent update <name>` | Update an installed skill from its original source |
| `deckent update <pathOrId>` | Update rules for an existing managed doc |
| `deckent update <source>` | Update a plugin (remove existing and re-install from source) |
| `deckent upgrade` | Self-update deckent |
| `deckent watch` | Live tmux split view: dashboard + worker panes |
| `deckent web` | Start web dashboard with API server |
<!-- AUTOGEN:END id="cli" -->
