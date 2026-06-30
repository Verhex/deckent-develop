# CLI Command Inventory

> Complete inventory of all Deckent CLI commands. Last updated Sprint 346.
> **Total:** 57+ top-level commands + subcommands

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
| 44 | `audit` | Run Self-Audit Gate, audit-chain query/compliance/forward | `deckent_audit` |
| 45 | `recover` | Recover from crashed/stuck sprint | — |
| 46 | `models` | Browse and manage model catalog (list/refresh/tier) | `deckent_models` |
| 47 | `autonomous` | Autonomous runtime loop, backlog, approvals | `deckent_autonomous` |
| 48 | `resources` | Show worker resource usage (CPU, memory, I/O) — live snapshot or historical analysis | — |
| 49 | `usage` | Show transcript-based token and limit usage accounting | — |
| 50 | `chat` | Start a conversational session with Deckent (native REPL or host CLI) | — |
| 51 | `audit-verify` | Verify the audit HMAC chain (tamper-evident audit log) | — |
| 52 | `flow` | Manage scheduled flows (F3 process mode) | — |
| 53 | `rbac` | Role-based access control — check permissions and manage roles | — |
| 54 | `evolve` | Evolution analysis — cross-sprint trends and prompt suggestions | — |
| 55 | `bot` | Manage external bot connectors (Discord, Telegram) | — |
| 56 | `mcp` | Manage MCP servers (Claude-parity add/list/remove/get) | — |
| 57 | `gateway` | Manage the connector gateway daemon (listen/start/stop/status/pair) | — |
| 58 | `kpi` | Show the KPI scorecard for the current or a specific sprint | — |
| 59 | `image` | Worker Docker image management (build subcommand) | — |
| 60 | `process` | Process-mode execution surface — submit tasks and poll status | — |
| 61 | `autonomous-mission` | Manage autonomous v2 missions (create-list/create-goal/list) | — |
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
| `-y, --yes` | Install all missing prerequisites without prompting (CI/non-interactive) |
| `--no-install` | Detect missing prerequisites but never install them (hint-only) |
| `--no-image` | Skip the opt-in worker Docker image build offer (no prompt) |

**Example:**
```bash
deckent init --auto
deckent init --env codex,cursor --force
deckent init -y --no-image
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
| `--sandbox` | Use sandbox spawn backend (memory-cap + path-jail isolation, no Docker required) |
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
| `--interrogate` | Pre-plan interrogation: challenge DIRECTIVES with 5 structural questions (pain-vs-feature, narrowest wedge, hidden capabilities, premises, effort alternatives), suggest revisions before PLAN phase. Optional: skipped silently with `--no-confirm` or in non-interactive mode. |
| `--no-confirm` | Skip confirmation, auto-approve plan |
| `-y, --yes` | Non-interactive: auto-approve the plan (DRAFT → PENDING) without prompting |
| `--structured` | Force structured parsing (skip AI) |
| `--dry-run` | Show plan without writing task files to disk |

**Example:**
```bash
deckent plan --interrogate
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

Finalize a sprint: upsert the sprint's `retro` and `memory` entries in `memory.db`, refresh managed-docs (`.deckent/workspace/IDENTITY.md`, `CLAUDE.md`, …), regenerate `.brain/exports/*.md` snapshots, update config, and run decay.

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
| `--json` | Output recovery result as JSON |

**Example:**
```bash
deckent recover --dry-run
deckent recover --force
deckent recover --json
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
| `--providers` | Show detailed provider diagnostics (binary, version, auth) for Claude/Codex/Gemini |
| `--memory` | Show host RAM detection (/proc/meminfo first, os.totalmem fallback) and suggested max_workers |
| `--ram-experiment` | Show 6-worker × 2g RAM scenario verdict (Safe/Risky) based on current config and host RAM |
| `--fix-image` | Enable interactive worker image rebuild (consent-based, ADR-063) |

**Provider Auth Probing:**
Doctor now probes configured provider auth status (logged in, logged out, or unknown) and displays warnings when a CLI is present but not logged in.

**Worker Resources Section:**
Doctor displays worker memory limits, max worker count, and calculated RAM ceiling — useful for capacity planning. Warns if worker RAM usage exceeds a configurable threshold (default 60% of host memory). Related: `deckent resources` for live monitoring and historical analysis.

**Example:**
```bash
deckent doctor
deckent doctor --pre-flight --json
deckent doctor --fix-image
```

**MCP:** `deckent_doctor`

---

### `deckent resources`

Monitor worker resource usage — CPU, memory, I/O. Requires `resource_monitor.enabled: true` in config (default-off).

| Option | Description |
|--------|-------------|
| `--log [path]` | Analyze historical resource log (JSONL format). Shows per-task peak/avg memory, peak CPU. Optional path overrides `.deckent/resource-log.jsonl` default. |
| `--json` | Output raw JSON (both snapshot and log modes). Useful for integration with monitoring tools. |

**Modes:**

1. **Default (live snapshot):** Display current resource usage via `docker stats` — container name, assigned task ID, memory usage/limit/%, CPU%. Shows system totals and configured limits.
2. **`--log` mode:** Parse and summarize a historical resource log. Shows per-task statistics and sprint-wide concurrent peak memory.

**Example:**
```bash
deckent resources                          # Live docker stats snapshot
deckent resources --log                    # Summarize .deckent/resource-log.jsonl
deckent resources --log /custom/log.jsonl  # Custom log path
deckent resources --json                   # JSON output for both modes
```

**Requirements:**

- Docker daemon running and accessible (`docker stats` command must work)
- `resource_monitor.enabled: true` in `.deckent/config.json` enables background sampling during sprints

---

### `deckent audit`

Run Brain Self-Audit Gate for a sprint (tsc + vitest + honesty + observability), or read/export/retain the ENT-3 audit chain via the `query`, `compliance`, `forward`, and `retention` subcommands.

**Usage forms:**

| Form | Description |
|------|-------------|
| `deckent audit <sprint-id>` | Run the Self-Audit Gate; writes `.deckent/<sprint-id>-gate.json` |
| `deckent audit compliance` | Compliance report over the full retained audit trail — retention archive + live chain (chain integrity + RBAC/tenant control flags) |
| `deckent audit forward` | Forward the audit chain to a SIEM — HTTP(S) endpoint, syslog collector, or NDJSON file |
| `deckent audit query` | Filter raw audit events (`--tenant`, `--action`, `--since`, `--role`) |
| `deckent audit retention` | Plan (dry-run) or apply audit-log retention (`--keep-days`, `--keep-count`, `--apply`) |

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON only |
| `--sprint <id>` | Sprint ID for the `query`/`compliance`/`forward`/`retention` subcommands (default: `sprint-001`) |
| `--url <url>` | `forward`: POST audit records to an HTTP(S) SIEM endpoint (takes precedence over `--syslog` and `--out`) |
| `--syslog <host[:port]>` | `forward`: send audit records to a syslog collector, RFC 5424 (takes precedence over `--out`; default port `514`) |
| `--syslog-protocol <protocol>` | `forward`: syslog wire protocol — `udp`\|`tcp` (default: `udp`) |
| `--out <path>` | `forward`: output file for the NDJSON file transport (default: `.deckent/siem-export.jsonl`) |
| `--keep-days <n>` | `retention`: prune audit events older than `n` days |
| `--keep-count <n>` | `retention`: archive audit events beyond the most recent `n` |
| `--apply` | `retention`: apply the plan — without it the run is a dry-run |
| `--lang <code>` | Language override (`en`\|`tr`) |

**Forward precedence:** `--url` (HTTP) > `--syslog` (RFC 5424 syslog) > `--out` (NDJSON file) — the highest-precedence flag present wins; the others are ignored. Invalid syslog targets/protocols are rejected before any forwarding (exit `2`).

**Retention semantics:** without `--apply` the run is a dry-run — it prints the plan (`scanned`/`keep`/`archive`/`prune`) and performs zero writes. With `--apply`, the `archive` partition is appended to `.deckent/<sprint-id>-events-archive.jsonl` **before** the stream is touched (no-data-loss ordering), `prune` events are dropped, and the event stream is rewritten atomically (tmp file + rename) preserving all non-audit events and the `keep` partition in original order. When the plan drops nothing, the stream file is not touched at all.

**Archive-aware compliance:** after a `retention --apply`, `audit compliance` verifies the chain over the retention archive prepended to the live stream — the live stream alone is a truncated chain. Honest limit: `prune`d records are permanently deleted, not archived; if HMAC'd records were pruned, the surviving chain reports broken **by design** — true deletion is the GDPR-style tradeoff against tamper-evidence.

**Exit codes:** gate form — `0` PASS, `1` gate failure; `audit compliance` — `0` chain intact, `1` broken audit chain; `audit forward` / `audit retention` — `0` success (dry-run or apply), `2` invalid target/policy or execution error; `2` on execution error (gate/compliance).

**Example:**
```bash
deckent audit sprint-264 --json
deckent audit compliance --sprint sprint-264
deckent audit forward --sprint sprint-264 --url https://siem.example.com/ingest
deckent audit forward --sprint sprint-264 --syslog logs.example.com:6514 --syslog-protocol tcp
deckent audit forward --sprint sprint-264 --out ./siem/export.jsonl
deckent audit retention --sprint sprint-264 --keep-days 30 --keep-count 500   # dry-run — zero writes
deckent audit retention --sprint sprint-264 --keep-days 30 --apply            # archive first, then atomic rewrite
```

**MCP:** `deckent_audit` (Self-Audit Gate form only)

---

### `deckent audit-verify`

Verify the audit HMAC chain integrity (I4 invariant — tamper-evident audit log). Reads the audit event stream for the current project and validates that each event's HMAC chain is unbroken.

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON only |

**Exit codes:**
- `0` — Chain intact (all HMACs valid)
- `1` — Chain broken (tampered or truncated records detected)

**Example:**
```bash
deckent audit-verify
deckent audit-verify --json
```

---

### `deckent usage`

Show transcript-based token and limit usage accounting (real ground-truth ledger, not worker self-estimates).

| Option | Description |
|--------|-------------|
| `--sprint <N>` | Show per-task breakdown for a specific sprint (task name, model, calls, output tokens, cache write, bootstrap cache write, $-cost). Default: 7-day rolling window aggregated by model. |
| `--since <ISO>` | Start date for usage window (ISO 8601 format, e.g. `2026-06-01`). Default: 7 days ago. |
| `--until <ISO>` | End date for usage window (ISO 8601 format). Default: today. |
| `--json` | Output raw JSON (array of usage records) for integration with monitoring tools. |

**Modes:**

1. **Default (7-day window):** Display model-level table with aggregate usage:
   - Model name, number of calls, input/output tokens, cache read/write, **limit-cost** (cost-equivalent using token prices), cache hit-rate (%).
   - Optional footer: "Weekly budget reference ~$650-eqv" (from config `usage.weekly_budget_equiv`, or hidden if not set).

2. **`--sprint <N>` mode:** Display per-task breakdown for a single sprint:
   - Task ID, model, calls, output tokens, cache write, bootstrap cache write (first call), $-cost, hit-rate.
   - Bottom row: sprint totals and bootstrap share %.
   - **Cache gate row (F1-TOK):** "Cache gate: PASS/FAIL (warm-share %X, warmer: &lt;taskId&gt;)" — evaluates whether followers' first calls benefited from the warmer's cache-write (pass threshold ≥80%). Added by Sprint 274.

**Accounting:**
Uses the real transcript ledger (`.claude/projects/**/*.jsonl` message-usage fields) instead of worker self-estimates. Cost-equivalent unit: `in·$in + out·$out + cacheWrite·1.25·$in` (calibrated against observed token spend). Cache read has zero weight.

**Example:**
```bash
deckent usage                          # 7-day model-level table
deckent usage --sprint 273             # Sprint 273 per-task breakdown
deckent usage --since 2026-06-01       # Specific date range
deckent usage --json                   # Raw JSON for monitoring
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

### `deckent models`

Browse and manage the model catalog — list available models by provider and tier, refresh cached catalog, or look up a model's tier.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `models list` | List available models (`--provider`, `--offline`, `--json`) |
| `models refresh` | Force-refresh the model catalog (invalidates 24h cache) |
| `models tier <model>` | Look up the tier of a model by ID or API ID (`--offline`, `--json`) |

**`models list` options:**

| Option | Description |
|--------|-------------|
| `--provider <name>` | Filter by provider: `claude`, `codex`, `gemini`, `ollama` |
| `--offline` | Use cached or bundled catalog without network |
| `--json` | Output as JSON |

**Example:**
```bash
deckent models list
deckent models list --provider claude
deckent models tier claude-sonnet-4-6
deckent models refresh
```

**MCP:** `deckent_models`

---

## Workers & Tasks

### `deckent run <description>`

Run a single one-shot task without a sprint cycle.

| Option | Description |
|--------|-------------|
| `--model <model>` | Model to use (default: sonnet) |
| `--model-effort <level>` | Native model reasoning-effort (claude: low\|medium\|high\|xhigh\|max, codex: minimal\|low\|medium\|high). Opt-in; unsupported/invalid levels are ignored |
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

Live tmux split view: dashboard + worker panes. For docker-backend workers, `--follow` streams live output via `docker logs -f` (async PTY, non-blocking event loop).

| Option | Description |
|--------|-------------|
| `--follow <taskId>` | Attach to a specific worker pane; for docker backend, streams live output via `docker logs -f` |

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
| `--json` | Output results as JSON |

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

### `deckent evolve`

Evolution analysis — inspect cross-sprint agent/skill performance trends and surface prompt improvement suggestions from outcome data.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `evolve report` | Show cross-sprint agent/skill trend report (`-n/--sprints <n>`, `--json`) |

**Example:**
```bash
deckent evolve report
deckent evolve report --sprints 20
deckent evolve report --json
```

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

## Autonomous Runtime

### `deckent autonomous`

Authority-bounded autonomous runtime loop — backlog-driven continuous execution with a default-deny approval gate (ADR-040). Flag-gated: the loop refuses to start unless `autonomous.enabled` is `true` in `.deckent/config.json`.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `autonomous start` | Start the loop (`--interval-ms`, `--max-iterations`) |
| `autonomous status` | Runtime summary: backlog counts, pending approvals, recent audit events |
| `autonomous stop` | Signal the running loop to stop cleanly (stop marker) |
| `autonomous pending` | List parked approvals awaiting human accept/reject |
| `autonomous approve <triggerId>` | Approve a parked trigger (`--reason`) |
| `autonomous reject <triggerId>` | Reject a parked trigger (`--reason`) |
| `autonomous backlog add` | Add a backlog entry (options below) |
| `autonomous backlog list` | List backlog entries |
| `autonomous backlog remove [id]` | Remove a backlog entry (positional id or `--id`) |

**`backlog add` options:**

| Option | Description |
|--------|-------------|
| `--id <id>` | Unique entry id (required) |
| `--title <title>` | Human-readable title (required) |
| `--kind <kind>` | Entry kind: `task` (default), `sprint`, or `capability` |
| `--description <text>` | Task description or directives ref |
| `--policy <policy>` | Execution policy: `auto` (default), `approval-required`, or `risk-tagged` |
| `--cron <expr>` | 5-field cron expression — entry recurs at this cadence (omit for one-off; malformed cron is rejected at intake) |
| `--capability <verb>` | `--kind capability`: dotted verb to invoke (e.g. `fs.read`, `db.query`) — required for capability entries |
| `--args <json>` | `--kind capability`: JSON object of handler args (malformed JSON is rejected at intake) |
| `--connector <id>` | `--kind capability`: preferred backend/connector id (e.g. `odoo`, `imap`) |
| `--root <path>` | Project root override |
| `--lang <code>` | Language override (`en`\|`tr`) |

**Example:**
```bash
deckent autonomous start --max-iterations 10
deckent autonomous backlog add --id nightly --title "Nightly debt sweep" --cron "0 3 * * *"
deckent autonomous backlog add --id read-pkg --title "Read package.json" \
  --kind capability --capability fs.read --args '{"path":"package.json"}'
deckent autonomous approve trigger-001 --reason "reviewed"
```

**MCP:** `deckent_autonomous`

---

## Server & Dashboard

### `deckent serve`

Start HTTP API server with SSE support.

| Option | Description |
|--------|-------------|
| `--port <number>` | Port to listen on |
| `--dev` | Enable dev proxy mode (expects Vite dev server on --dev-port) |
| `--dev-port <number>` | Vite dev server port for --dev proxy mode (default: 5173) |
| `--host <addr>` | Bind address for the server (default: 127.0.0.1) |
| `--no-terminal` | Disable the embedded web terminal |

**First-Run Output:**
On startup, `deckent serve` displays a user-friendly banner showing:
- Dashboard URL and token status (API token auto-injected for localhost)
- Terminal mode status
- Stop hints (Ctrl+C)
- Port and host configuration tips

**Rate Limiting:**
By default, loopback requests (localhost, 127.0.0.1, ::1) are exempt from rate limiting (configurable via the `rateLimitExemptLoopback` serve option).

**Example:**
```bash
deckent serve --port 3000
deckent serve --dev --dev-port 5173
deckent serve
# Outputs dashboard URL + token + terminal mode + shutdown hints
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

Report tech-debt status and archive resolved debt items from memory.db.

| Option | Description |
|--------|-------------|
| `--count` | Show only the open/resolved counts |
| `--before <sprint>` | Also report resolved items originating before this sprint ID |

**Example:**
```bash
deckent archive-debt
deckent archive-debt --before sprint-140
deckent archive-debt --count
```

---

### `deckent chat`

Start a conversational session with Deckent. Without `--native`, launches the configured host AI CLI (claude, codex, gemini). With `--native`, uses the built-in Ink REPL with tool-use support (same as running `deckent` with no subcommand).

| Option | Description |
|--------|-------------|
| `--tool <name>` | AI CLI to launch: `claude` \| `codex` \| `gemini` |
| `--native` | Use native Ink REPL with tool-use loop (default when `deckent` run without args) |
| `--local` | Use a local LLM via Ollama |
| `--check-mcp` | Verify Deckent MCP server is attached before starting |
| `--resume <sessionId>` | Resume a previous chat session — prints recent turns |
| `--resume-limit <n>` | Number of prior turns to show with `--resume` |
| `--once` | Single-turn mode: send one message and exit (with `--native`) |
| `--message <text>` | Message text for single-turn mode (implies `--native --once`) |

**Example:**
```bash
deckent chat
deckent chat --native
deckent chat --tool claude --check-mcp
deckent chat --message "List recent sprints" --once
```

---

### `deckent flow`

Manage scheduled flows (F3 process mode — enterprise scheduled automation). Flows run on a cron cadence and trigger deckent tasks automatically.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `flow list` | List all scheduled flows (`--tenant`, `--json`) |
| `flow add <cron> <action>` | Add a scheduled flow (`--tenant`) |
| `flow run` | Run the flow-runtime tick once (`--once`) or start the daemon (`--tenant`) |

**Example:**
```bash
deckent flow list
deckent flow add "0 3 * * *" "nightly-debt-sweep" --tenant default
deckent flow run --once
```

---

### `deckent rbac`

Role-based access control — check permissions and manage role assignments (enterprise, ADR-069).

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `rbac check <role> <action>` | Check whether a role has permission (`--tenant`) |
| `rbac roles` | List all roles and effective permissions |
| `rbac grant <user> <role>` | Assign a role to a user |
| `rbac revoke <user>` | Remove the role assignment for a user |

**Example:**
```bash
deckent rbac check admin sprint.start
deckent rbac roles
deckent rbac grant alice operator
deckent rbac revoke bob
```

---

### `deckent bot`

Manage external bot connectors (Discord, Telegram). Connects deckent to messaging platforms so users can trigger sprints and check status from chat.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `bot listen` | Start listening for bot messages (foreground) |
| `bot start` | Start the bot as a daemon |
| `bot stop` | Stop the running bot daemon |
| `bot status` | Show whether the bot daemon is running |

**Options (all subcommands):**

| Option | Description |
|--------|-------------|
| `--root <path>` | Project root override |
| `--lang <code>` | Language override: `en` \| `tr` |

**Example:**
```bash
deckent bot start
deckent bot status
deckent bot listen
deckent bot stop
```

---

### `deckent mcp`

Manage MCP (Model Context Protocol) servers — add, list, remove, and inspect server registrations. Matches Claude Code's `claude mcp` parity.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `mcp add <name> <cmd\|url> [args...]` | Add an MCP server (stdio or http; `--scope`, `--transport`, `--header`, `--env`) |
| `mcp list` | List registered MCP servers — merged local > project > user (`--json`) |
| `mcp remove <name>` | Remove an MCP server (`--scope`) |
| `mcp get <name>` | Show details for a registered server (`--json`) |

**Example:**
```bash
deckent mcp list
deckent mcp add deckent -- npx deckent-mcp
deckent mcp add my-http-server https://mcp.example.com --transport http
deckent mcp remove my-old-server
deckent mcp get deckent --json
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

## REPL Slash Commands

The interactive REPL (`deckent`) provides shorthand slash commands for quick access to common operations without exiting the shell.

### `/usage [--sprint N] [--since ISO] [--until ISO]`

Show transcript-based token and limit usage accounting from the REPL.

| Option | Description |
|--------|-------------|
| `--sprint <N>` | Show per-task breakdown for a specific sprint. Default: 7-day rolling window aggregated by model. |
| `--since <ISO>` | Start date for usage window (ISO 8601 format). Default: 7 days ago. |
| `--until <ISO>` | End date for usage window (ISO 8601 format). Default: today. |

**Example:**
```
/usage
/usage --sprint 275
/usage --since 2026-06-01
```

**MCP Tool:** `deckent_usage`

---

### `/interrogate`

Pre-plan interrogation from the REPL: inspect current DIRECTIVES.md and generate 5 structural questions challenging the sprint goals.

Provides:
- **Pain-vs-feature:** Is this solving a real pain or an aspirational request?
- **Narrowest wedge:** What is the smallest shippable value?
- **Hidden capabilities:** What existing features could solve this partially?
- **Premise assumptions:** What could invalidate the sprint goal?
- **Effort alternatives:** Are there faster approaches?

Questions are displayed in the REPL with a header prompt. DIRECTIVES.md is never modified by the slash command — use `/interrogate` to explore, then manually update DIRECTIVES.md and run `deckent plan --interrogate` to apply the full flow (questions + answer collection + draft suggestions).

**Example:**
```
/interrogate
```

This command displays the current DIRECTIVES.md's goal and tasks, then lists 5 structured interrogation questions. No arguments or flags.

---

### `/resources [--log [path]]`

Show worker resource usage (CPU, memory, I/O) from the REPL.

| Option | Description |
|--------|-------------|
| `--log [path]` | Analyze historical resource log (JSONL format). Optional path overrides `.deckent/resource-log.jsonl` default. Omit path for live snapshot. |

**Modes:**

1. **Default (no args):** Display current resource usage via `docker stats` snapshot.
2. **`--log` (no path):** Summarize `.deckent/resource-log.jsonl`.
3. **`--log <path>`:** Summarize a custom historical log.

**Example:**
```
/resources
/resources --log
/resources --log /custom/resource-log.jsonl
```

**MCP Tool:** _none_ (no `deckent_resources` tool — `/resources` is a REPL/CLI surface only)

---

## Connectors & Integrations

### `deckent gateway`

Manage the connector gateway daemon — the bridge between external messaging adapters (Telegram, Discord, WhatsApp) and deckent projects.

| Subcommand | Description |
|------------|-------------|
| `listen` | Print queued inbound messages from the gateway daemon |
| `start` | Start the gateway daemon process in the background |
| `stop` | Stop the running gateway daemon |
| `status` | Show gateway daemon status (running/stopped, PID) |
| `pair list` | List pending pairing requests |
| `pair approve <code> <project>` | Approve a pairing request and bind it to a project |
| `pair reject <code>` | Reject a pairing request |

All subcommands accept `--lang <code>` for language override (en\|tr).

**Example:**
```bash
deckent gateway start
deckent gateway status
deckent gateway pair list
deckent gateway pair approve ABC123 /my/project
```

---

## Analytics

### `deckent kpi`

Show the KPI scorecard for the current (or a specific) sprint. Displays pass/fail status for each registered KPI definition against actual sprint metrics.

| Option | Description |
|--------|-------------|
| `--sprint <id>` | Sprint ID to score (defaults to the current sprint) |
| `--trend <kpiId>` | Show trend series for a specific KPI across sprints |
| `-n, --n <count>` | Number of sprints to include in the trend (default: 10) |
| `--json` | Output raw JSON |

**Example:**
```bash
deckent kpi
deckent kpi --sprint sprint-340
deckent kpi --trend success_rate -n 20
deckent kpi --json
```

---

## Docker Image Management

### `deckent image`

Worker Docker image management.

#### `deckent image build`

Build the deckent-worker Docker image from the packaged Dockerfile.worker.

| Option | Description |
|--------|-------------|
| `--tag <tag>` | Docker image tag to build (default: deckent-worker) |
| `--dry-run` | Print the resolved Dockerfile path + build plan without building |
| `--with-codex` | Install Codex CLI in the image (INSTALL_CODEX=true build-arg) |
| `--with-gemini` | Install Gemini CLI in the image (INSTALL_GEMINI=true build-arg) |
| `--with-ollama` | Install Ollama CLI in the image (INSTALL_OLLAMA=true build-arg) |

**Example:**
```bash
deckent image build
deckent image build --tag my-worker:latest --with-codex
deckent image build --dry-run
```

---

## Process Mode

### `deckent process`

Process-mode execution surface — submit tasks/capabilities and poll their status (ADR-022 CLI/MCP parity). Submissions are policy-gated: read-only tasks auto-run; side-effecting tasks park for approval.

#### `deckent process submit <description>`

Submit an ExecutionRequest.

| Option | Description |
|--------|-------------|
| `--kind <kind>` | Execution kind: task (default), sprint, capability |
| `--scope-dir <dir>` | Scope directory for a code task (drives risk classification) |
| `--provider <provider>` | Provider override |
| `--model <model>` | Model override |
| `--root <path>` | Project root override |

#### `deckent process status <executionId>`

Poll the status of a prior submission.

| Option | Description |
|--------|-------------|
| `--root <path>` | Project root override |

#### `deckent process result <executionId>`

Show the full result of a submission (status + lastResult).

| Option | Description |
|--------|-------------|
| `--root <path>` | Project root override |

**Example:**
```bash
deckent process submit "Add OAuth2 to the API" --kind task
deckent process status exec-abc123
deckent process result exec-abc123
```

---

## Autonomous Missions (v2)

### `deckent autonomous-mission`

Manage autonomous v2 missions — structured work bundles that run under an authority-bounded loop. Distinct from `deckent autonomous` (continuous loop) — missions are discrete, goal-oriented execution units.

#### `deckent autonomous-mission create-list <title>`

Create a Type-1 list mission from N explicit work items.

| Option | Description |
|--------|-------------|
| `--items-file <path>` | JSON file containing an array of `{kind, spec?, id?}` items |
| `--id <id>` | Mission ID (auto-generated if omitted) |
| `--tenant <tenant>` | Tenant identifier |
| `--deliver-to <channel>` | Delivery channel for settlement notification |

#### `deckent autonomous-mission create-goal <goal>`

Create a Type-2 goal mission that runs until the goal is reached.

| Option | Description |
|--------|-------------|
| `--accept <criteria>` | Acceptance criteria string |
| `--title <title>` | Mission title (defaults to goal text) |
| `--id <id>` | Mission ID (auto-generated if omitted) |
| `--tenant <tenant>` | Tenant identifier |
| `--deliver-to <channel>` | Delivery channel for settlement notification |

#### `deckent autonomous-mission list`

List all missions in a summary table.

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |
| `--tenant <tenant>` | Filter by tenant |

**Example:**
```bash
deckent autonomous-mission create-list "Q3 Backlog" --items-file items.json
deckent autonomous-mission create-goal "Migrate auth to OAuth2" --accept "all tests pass"
deckent autonomous-mission list
deckent autonomous-mission list --json
```

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
| `audit` | `deckent_audit` | Partial (Self-Audit Gate only — query/compliance/forward are CLI-only) |
| `autonomous` | `deckent_autonomous` | Partial (backlog/approvals full; loop process launches via CLI) |
| `models` | `deckent_models` | Full |
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
| `recover` | — | CLI only |
| `archive-debt` | — | CLI only |
| `onboard` | — | CLI only |
| `upgrade` | — | CLI only |
| `plugin` | — | CLI only |
| `chat` | — | CLI only |
| `usage` | `deckent_usage` | Both |
| `audit-verify` | — | CLI only |
| `flow` | — | CLI only |
| `rbac` | — | CLI only |
| `evolve` | — | CLI only |
| `bot` | — | CLI only |
| `mcp` | — | CLI only |
| `gateway` | — | CLI only |
| `kpi` | — | CLI only |
| `image` | — | CLI only |
| `process` | — | CLI only |
| `autonomous-mission` | — | CLI only |

**Coverage:** 25/62 commands have MCP tool counterparts (40% parity).

---

_Updated: 2026-06-28 | Sprint 346 | Deckent v1.0.0-beta.1_
