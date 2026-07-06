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
- [`deckent models`](#models) — Browse and manage model catalog (list/refresh/tier lookup)

### Skills & Agents

- [`deckent skill`](#skill) — Manage the skill pool (
- [`deckent agent`](#agent) — Manage the agent pool (

### Plugins

- [`deckent plugin`](#plugin) — Manage plugins (

### Server & Dashboard

- [`deckent serve`](#serve) — Start the HTTP API server with SSE support
- [`deckent web`](#web) — Start the web dashboard with API server

### Analytics

- [`deckent kpi`](#kpi) — Show KPI scorecard for the current or a specific sprint

### Connectors & Integrations

- [`deckent gateway`](#gateway) — Manage the connector gateway daemon (listen/start/stop/status/pair)

### Docker Image

- [`deckent image`](#image) — Worker Docker image management

### Process Mode

- [`deckent process`](#process) — Process-mode execution surface — submit tasks and poll status

### Autonomous Missions

- [`deckent autonomous-mission`](#autonomous-mission) — Manage autonomous v2 missions (create-list/create-goal/list)

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
| `--upgrade` | Update existing files while preserving user customizations (merge strategy) |
| `--force` | Force overwrite of existing env files without warning |
| `--repair` | Show which init steps failed and how to fix them |
| `-y, --yes` | Install all missing prerequisites without prompting (CI/non-interactive) |
| `--no-install` | Detect missing prerequisites but never install them (hint-only) |
| `--no-image` | Skip the opt-in worker Docker image build offer (no prompt) |

**Examples:**

```bash
deckent init
deckent init --auto
deckent init --env codex,cursor
deckent init --all-envs
deckent init -y --no-image
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
| `--sandbox-mode` | Run in sandbox mode (git stash + restore) |
| `--sandbox` | Use sandbox spawn backend (memory-cap + path-jail isolation, no Docker required) |
| `--dry-run` | Plan sprint without spawning workers |
| `--force` | Skip doctor pre-flight checks |
| `--watch` | Automatically open watch mode after sprint spawns workers |
| `--timeout <ms>` | Sprint timeout in milliseconds _(default: 30 minutes)_ |
| `--force-directives` | Override existing DIRECTIVES.md in zero-config mode |

**Examples:**

```bash
deckent start
deckent start "Add JWT authentication to the Express API"
deckent start --dry-run
deckent start --force --watch
deckent start "Fix login bug" --timeout 600000
```

---

## `plan`

Plan the next sprint without executing it. Reads DIRECTIVES.md, checks usage, and generates task files in .tasks/. Prompts for confirmation before writing.

**Usage:** `deckent plan`

**Options:**

| Flag | Description |
|------|-------------|
| `--no-confirm` | Skip confirmation, auto-approve plan |
| `-y, --yes` | Non-interactive: auto-approve the plan (DRAFT → PENDING) without prompting |
| `--structured` | Force structured parsing (skip AI planner) |
| `--dry-run` | Show plan without writing task files to disk |
| `--interrogate` | Challenge directives with structural questions before planning |

**Examples:**

```bash
deckent plan
deckent plan --no-confirm
deckent plan --structured
deckent plan --interrogate
deckent plan --dry-run
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

Finalize a sprint: upsert the sprint's `retro` and `memory` entries in `memory.db`, refresh managed-docs (`.deckent/workspace/IDENTITY.md`, `CLAUDE.md`, …), regenerate `.brain/exports/*.md` snapshots, update config metadata, and optionally run memory decay.

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
| `--model-effort <level>` | Native model reasoning-effort (claude: low\|medium\|high\|xhigh\|max, codex: minimal\|low\|medium\|high). Opt-in; unsupported/invalid levels are ignored |
| `--scope <dir>` | Worker scope directory _(default: `./`)_ |
| `--timeout <ms>` | Maximum wait time in milliseconds _(default: `300000`)_ |
| `--keep` | Keep task files after completion (skip cleanup) |
| `--auto-approve` | Pass auto-approve flag to the worker |
| `--verbose` | Stream worker log output to stdout in real-time |

**Examples:**

```bash
deckent run "Fix the login page redirect bug"
deckent run "Add input validation" --model opus --scope src/api/
deckent run "Refactor auth module" --model-effort high --verbose
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

## `models`

Browse and manage the model catalog. Lists all available models grouped by provider and tier.

**Usage:** `deckent models`

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `list` | List all models from the catalog (default) |
| `refresh` | Refresh the model catalog from provider APIs |
| `tier <name>` | Look up a model by tier name |

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--provider <name>` | Filter by provider (claude, codex, gemini) |

**Examples:**

```bash
deckent models
deckent models list --provider claude
deckent models tier standard
deckent models --json
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
| `--dev` | Enable dev proxy mode — expects Vite dev server on --dev-port |
| `--dev-port <number>` | Vite dev server port for --dev proxy mode _(default: `5173`)_ |
| `--host <addr>` | Bind address for the server _(default: `127.0.0.1`)_ |
| `--no-terminal` | Disable the embedded web terminal |

**Examples:**

```bash
deckent serve
deckent serve --port 8080
deckent serve --dev --dev-port 5173
deckent serve --host 0.0.0.0
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

# Analytics

## `kpi`

Show the KPI scorecard for the current (or a specific) sprint. Displays pass/fail status for each registered KPI definition against actual sprint metrics.

**Usage:** `deckent kpi`

**Options:**

| Flag | Description |
|------|-------------|
| `--sprint <id>` | Sprint ID to score _(defaults to the current sprint)_ |
| `--trend <kpiId>` | Show trend series for a specific KPI across sprints |
| `-n, --n <count>` | Number of sprints to include in the trend _(default: `10`)_ |
| `--json` | Output raw JSON |

**Examples:**

```bash
deckent kpi
deckent kpi --sprint sprint-340
deckent kpi --trend success_rate -n 20
deckent kpi --json
```

---

# Connectors & Integrations

## `gateway`

Manage the connector gateway daemon — the bridge between external messaging adapters (Telegram, Discord, WhatsApp) and deckent projects.

**Usage:** `deckent gateway <subcommand>`

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `listen` | Print queued inbound messages from the gateway daemon |
| `start` | Start the gateway daemon process in the background |
| `stop` | Stop the running gateway daemon |
| `status` | Show gateway daemon status (running/stopped, PID) |
| `pair list` | List pending pairing requests |
| `pair approve <code> <project>` | Approve a pairing request and bind it to a project |
| `pair reject <code>` | Reject a pairing request |

All subcommands accept `--lang <code>` for language override (`en`\|`tr`).

**Examples:**

```bash
deckent gateway start
deckent gateway status
deckent gateway pair list
deckent gateway pair approve ABC123 /my/project
deckent gateway stop
```

---

# Docker Image

## `image`

Worker Docker image management.

**Usage:** `deckent image <subcommand>`

#### `build`

Build the deckent-worker Docker image from the packaged Dockerfile.worker.

**Usage:** `deckent image build`

**Options:**

| Flag | Description |
|------|-------------|
| `--tag <tag>` | Docker image tag to build _(default: `deckent-worker`)_ |
| `--dry-run` | Print the resolved Dockerfile path + build plan without building |
| `--with-codex` | Install Codex CLI in the image (`INSTALL_CODEX=true` build-arg) |
| `--with-gemini` | Install Gemini CLI in the image (`INSTALL_GEMINI=true` build-arg) |
| `--with-ollama` | Install Ollama CLI in the image (`INSTALL_OLLAMA=true` build-arg) |

**Examples:**

```bash
deckent image build
deckent image build --tag my-worker:latest --with-codex
deckent image build --dry-run
```

---

# Process Mode

## `process`

Process-mode execution surface — submit tasks/capabilities and poll their status (ADR-022 CLI/MCP parity). Submissions are policy-gated: read-only tasks auto-run; side-effecting tasks park for approval.

**Usage:** `deckent process <subcommand>`

#### `submit <description>`

Submit an ExecutionRequest.

**Options:**

| Flag | Description |
|------|-------------|
| `--kind <kind>` | Execution kind: `task` (default), `sprint`, `capability` |
| `--scope-dir <dir>` | Scope directory for a code task (drives risk classification) |
| `--provider <provider>` | Provider override |
| `--model <model>` | Model override |
| `--root <path>` | Project root override |

#### `status <executionId>`

Poll the status of a prior submission by executionId.

#### `result <executionId>`

Show the full result of a submission (status + lastResult).

**Examples:**

```bash
deckent process submit "Add OAuth2 to the API" --kind task
deckent process status exec-abc123
deckent process result exec-abc123
```

---

# Autonomous Missions (v2)

## `autonomous-mission`

Manage autonomous v2 missions — structured work bundles that run under an authority-bounded loop. Distinct from `deckent autonomous` (continuous loop) — missions are discrete, goal-oriented execution units.

**Usage:** `deckent autonomous-mission <subcommand>`

#### `create-list <title>`

Create a Type-1 list mission from N explicit work items.

**Options:**

| Flag | Description |
|------|-------------|
| `--items-file <path>` | JSON file containing an array of `{kind, spec?, id?}` items |
| `--id <id>` | Mission ID _(auto-generated if omitted)_ |
| `--tenant <tenant>` | Tenant identifier |
| `--deliver-to <channel>` | Delivery channel for settlement notification |

#### `create-goal <goal>`

Create a Type-2 goal mission that runs until the goal is reached.

**Options:**

| Flag | Description |
|------|-------------|
| `--accept <criteria>` | Acceptance criteria string |
| `--title <title>` | Mission title _(defaults to goal text)_ |
| `--id <id>` | Mission ID _(auto-generated if omitted)_ |
| `--tenant <tenant>` | Tenant identifier |
| `--deliver-to <channel>` | Delivery channel for settlement notification |

#### `list`

List all missions in a summary table.

**Options:**

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--tenant <tenant>` | Filter by tenant |

**Examples:**

```bash
deckent autonomous-mission create-list "Q3 Backlog" --items-file items.json
deckent autonomous-mission create-goal "Migrate auth to OAuth2" --accept "all tests pass"
deckent autonomous-mission list
deckent autonomous-mission list --json
```

---

## Command Index (auto-generated)

> **Source-parsed** — extracted from `src/cli/commands/*.ts` `.command(...)` registrations.
> Hand-curated sections above are produced by `scripts/generate-cli-docs.ts`; this block is maintained by `scripts/gen-reference-docs.mjs`.

<!-- AUTOGEN:START id="cli" -->
> 176 commands. Generated from `src/cli/commands/*.ts`.

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
| `deckent approve <sprintId> <phase>` | Approve a pending checkpoint |
| `deckent approve <triggerId>` | Approve a parked trigger — resolves the running loop\'s gate |
| `deckent archive-debt` | Report tech-debt status (DB-first; resolved debt is auto-managed in memory.db) |
| `deckent attach` | Attach to the tmux orchestra session |
| `deckent audit [sprint-id]` | Run Brain Self-Audit Gate for a sprint, or query/export/retain audit log events (query \| compliance \| forward \| retention) |
| `deckent audit-verify` | Verify the audit HMAC chain (I4 invariant — tamper-evident audit log) |
| `deckent auto` | Auto-detect mode from context |
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
| `deckent create <name>` | Create a custom agent (use --prompt/--description for wizard-style setup) |
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
| `deckent finalize` | Finalize a sprint: update MEMORY.md, RETRO.md, IDENTITY.md, config, run decay |
| `deckent flow` | Manage scheduled flows (process mode) |
| `deckent get <key>` | Get a configuration value by key (supports dot notation) |
| `deckent get <name>` | Show details for an MCP server (from merged view) |
| `deckent global <style>` | Set global default (sprint\|task) |
| `deckent grant <user> <role>` | Assign a role to a user |
| `deckent heartbeat` | Run proactive heartbeat tasks from .deckent/HEARTBEAT.md |
| `deckent help-info` | Show quick-reference help (localized) |
| `deckent history` | Show sprint history |
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
| `deckent mode` | Get/set deckent_style (sprint\|task\|process\|auto) |
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
| `deckent process` | Switch to process mode (continuous request-handling \u2014 ERP / automation via MCP + REST) |
| `deckent process` | Process-mode execution surface — submit tasks/capabilities and poll their status (ADR-022 CLI/MCP parity) |
| `deckent publish <skillPath>` | Validate, sign (Ed25519) and publish a skill to the marketplace |
| `deckent rbac` | Role-based access control — check permissions and list roles |
| `deckent rebuild` | Rebuild memory.db from .brain/exports/*.md files |
| `deckent recall <query>` | Search project memory — ADRs, sprint learnings, patterns, debt |
| `deckent reclassify` | Reclassify a recorded task outcome (delta-applies agent/skill stats) |
| `deckent recommendations` | View the Brain inbox — nervous proposals awaiting disposition (ADR-037) |
| `deckent recover <sprint-id>` | Recover from a crashed or stuck sprint (audit + cleanup + archive) |
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
| `deckent run <description>` | Run a single one-shot task without a sprint cycle |
| `deckent scan` | Hash + timestamp + rank all docs; write front-matter; sync memory.db |
| `deckent search <query>` | Search skills in the marketplace registry |
| `deckent serve` | Start HTTP API server with SSE support |
| `deckent set` | Set a nervous system configuration value |
| `deckent set <key> <value>` | Set a configuration value |
| `deckent set-directives` | Write sprint goals to DIRECTIVES.md (content, file, or stdin) |
| `deckent show` | Display model pricing (read-only) |
| `deckent show` | Show current mode |
| `deckent skill` | Manage skill pool |
| `deckent sprint` | Switch to sprint mode |
| `deckent start` | Start the autonomous loop (default-deny + human-approval gate) |
| `deckent start [description]` | Start a new sprint (optionally with a one-line description for zero-config mode) |
| `deckent stats` | Show memory.db statistics |
| `deckent stats <name>` | Show sprint-by-sprint performance for an agent |
| `deckent status` | Show autonomous runtime summary (pending + last audit events) |
| `deckent status` | Show whether the bot daemon is running |
| `deckent status` | Report tracked docs by rank + stale state |
| `deckent status` | Show the current sprint dashboard |
| `deckent status <executionId>` | Poll the status of a prior submission by executionId |
| `deckent stop` | Signal the autonomous loop to stop cleanly |
| `deckent stop` | Stop the bot daemon |
| `deckent submit <description>` | Submit an ExecutionRequest (policy-gated: read-only auto-runs, side-effecting parks for approval) |
| `deckent sync` | Update memory.db only (no front-matter writes) |
| `deckent sync` | Sync adapter files and detect out-of-band changes since last sprint |
| `deckent task` | Switch to task mode |
| `deckent test` | Run a test sprint (no retro, no memory update, no decay) |
| `deckent test <name>` | Test a plugin: validate manifest and entrypoint, run hooks if available |
| `deckent tier <model>` | Look up the tier of a specific model by ID or API ID |
| `deckent track` | Track doc freshness (hash + DCR + stale) |
| `deckent undo <action-id>` | Undo a recent reversible action |
| `deckent update` | Fetch latest pricing from LiteLLM + OpenRouter |
| `deckent update <name>` | Update an installed skill from its original source |
| `deckent update <pathOrId>` | Update rules for an existing managed doc |
| `deckent update <source>` | Update a plugin (remove existing and re-install from source) |
| `deckent upgrade` | Self-update deckent |
| `deckent usage` | Show token/limit consumption from Claude Code transcripts |
| `deckent watch` | Follow a live worker (docker logs / tmux pane / subprocess log) with --follow &lt;taskId&gt;, or open the tmux dashboard split |
| `deckent web` | Start web dashboard with API server (deprecated — use `deckent serve |
<!-- AUTOGEN:END id="cli" -->
