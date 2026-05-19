<p align="center">
  <img src="docs/assets/logo.png" width="140" alt="Deckent — circuit kraken emblem" />
</p>

# deckent

**The AI orchestrator for developers who want discipline.**

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-16697%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-172%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v1.0.0--beta.1-orange)](https://github.com/VerhexIO/deckent)
<!-- AUTOGEN:END id="badges" -->

Deckent is an AI agent orchestration CLI with two modes: **Sprint Mode** for structured multi-agent development sprints, and **Task Mode** for one-shot life assistant tasks. Write your goals, and Deckent plans tasks, assigns parallel AI workers, monitors quality, and delivers results — all with discipline.

> **AST-sandboxed skills • Nervous System • Memory V2 (SQLite FTS5) • 3 backends • 3 providers • cross-platform**

<!-- AUTOGEN:START id="stat-counts" -->
- **31 MCP tools** + **8 MCP resources**
- **15 built-in agents** (+2 custom)
- **21 built-in skills**
- **7 dashboard pages**
<!-- AUTOGEN:END id="stat-counts" -->

<!-- ![demo](docs/assets/demo.gif) -->

---

## Quick Start

```bash
# No global install needed:
npx deckent@latest init          # detects + (with consent) installs missing CLIs
# or: npm install -g deckent && deckent init

# Developer workflow (Sprint Mode)
deckent mode sprint
# Edit DIRECTIVES.md with your goals, then:
deckent start
deckent web                      # open the web dashboard at http://localhost:3100

# Life assistant (Task Mode)
deckent mode task
deckent run "Remind me to review the PR before end of day"
```

---

## Highlights

- **Brain Self-Update Hook Architecture (ADR-046)** — post-finalize hook chain (memoryExport → adrInsert → ruleRegen → updateProjectDocs) is formally specified and enforced.
- **Data integrity** — debt rows carry `sprint_id`, sprint memory entries are restored, and a 3-layer doc-sync ground-truth check blocks agent-count drift.

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

---

## Dual Mode: Sprint + Task

Deckent operates in two distinct modes, switchable with a single command:

| Mode | Command | Use Case |
|------|---------|----------|
| **Sprint** | `deckent mode sprint` | Structured multi-agent development: PLAN→SPAWN→EXECUTE→EVALUATE→RETRO |
| **Task** | `deckent mode task` | One-shot life assistant: single task, immediate execution, no sprint overhead |

```bash
deckent mode show      # Show current mode
deckent mode sprint    # Switch to sprint mode (developer workflow)
deckent mode task      # Switch to task mode (life assistant)
deckent mode auto      # Auto-detect from context (git + DIRECTIVES.md → sprint)
deckent mode global task  # Set global default
```

The `deckent_style` config key persists your choice across sessions. Task Mode brings a full life-assistant experience — one-shot tasks, idle detection, and connector notifications.

---

## How It Works

### Sprint Mode

```
                    DIRECTIVES.md
                         |
                    [ Brain: Plan ]
                    /    |    \
              Worker1  Worker2  Worker3   (parallel, scoped)
                    \    |    /
                    [ Brain: Evaluate ]
                         |
                  GO / NO-GO / TECH_DEBT
```

1. **Describe** — Write goals in `DIRECTIVES.md`
2. **Plan** — Brain reads goals, creates scoped prioritized tasks
3. **Execute** — Parallel AI workers build, test, and report results
4. **Evaluate** — Every task gets GO / NO-GO / TECH_DEBT verdict

### Task Mode

```
  User Input → [ Task Runner ] → Worker → Result
```

Single-task execution. No PLAN/SPAWN phases. Ideal for quick commands, reminders, and life-assistant use cases.

---

## Architecture

```
+------------------------------------------------------------------+
|                         deckent CLI                               |
+------------------------------------------------------------------+
|                                                                  |
|   +----------+     +----------+     +----------+                 |
|   |  Brain   |---->| Worker 1 |     | Auditor  |                 |
|   | (plans,  |---->| Worker 2 |     | (scans,  |                 |
|   | evaluates|---->| Worker N |     |  alerts) |                 |
|   +----------+     +----------+     +----------+                 |
|        |                                   |                     |
|   .brain/            .tasks/          .dashboard                 |
|   (memory DB,        (task JSON,      (live status)              |
|    decisions,         results,                                   |
|    patterns)          heartbeats)                                |
+------------------------------------------------------------------+
|         Nervous System — Proactive Meta-Orchestrator             |
+------------------------------------------------------------------+
```

- **Brain** — Plans tasks, assigns models, evaluates results, learns across sprints
- **Workers** — Execute tasks in parallel (tmux, subprocess, or Docker), each with plan-code-test-report cycle
- **Auditor** — Monitors heartbeats, detects boundary violations, enforces quality
- **Nervous System** — Proactive meta-orchestrator: detects anomalies, idle states, routing patterns, and emits contextual notifications

---

## Key Features

### Core Orchestration
- **Sprint Lifecycle** — 8-phase structured cycle: PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, CLEANUP
- **Dual Mode** — `deckent_style: 'sprint' | 'task'` — developer orchestration or one-shot life assistant
- **Multi-Worker Parallel Execution** — Up to 10 AI workers simultaneously, each in isolated scope
- **GO / NO-GO Evaluation** — Every task result evaluated against defined criteria; NO-GO tasks logged and optionally retried
- **Auditor Quality Gate** — Stale heartbeat detection, boundary violation scanning, deadlock detection via Kahn's algorithm

### Security & Safety
- **AST Sandbox** — All skills run through AST validation before execution. No arbitrary code injection. Compared to OpenClaw's 13K+ skill hub with ~20% flagged as malicious, Deckent's sandbox validates every skill before it runs
- **Scope Enforcement** — Workers may only touch files in their assigned `scope.filesWrite` — Auditor enforces this via `git diff --stat`
- **RBAC Protocol** — ADR-037 Brain-Auditor-Worker authority matrix; strict role boundaries
- **`.deck` Secret Interpolation** — Reference secrets in config as `$DECK:MY_TOKEN` — secrets loaded from encrypted `.deck` file at runtime, never committed

### Intelligence & Memory
- **Nervous System** — Proactive meta-orchestrator (ADR-040): idle detection, routing anomaly alerts, agent health monitoring, contextual notifications
- **Memory V2 DB-First** — SQLite + FTS5 full-text search, dual-layer Turkish/English normalize, 96% context reduction vs raw markdown. `deckent recall "docker heartbeat"` finds relevant ADRs and sprint learnings instantly
- **Brain Auto-Query** — Task DNA → relevant ADRs/patterns/learnings auto-queried at PLAN, SPAWN, EVALUATE phases
- **Self-Learning** — Brain generates config suggestions from sprint results (NO_GO rate, coverage, duration)

### Agents & Skills
- **15 Built-in Agents** — security-auditor, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist
- **21 Built-in Skills** — typescript-expert, testing-expert, react-specialist, security-specialist, docker-expert, and 16 more
- **Temp Agent & Skill Generation** — Auto-generates project-specific agents and skills from your codebase conventions
- **Agent Evolution Pipeline** — Promotion from temp to permanent based on performance; demotion on failure

### Infrastructure
- **3 Backends** — tmux (Linux/macOS), subprocess (all platforms including native Windows), Docker (isolated containers)
- **3 Providers** — each integrated via its own CLI: Claude (`claude`, default), OpenAI Codex (`codex`, integration in development), Google Gemini (`gemini` — works via **both the Gemini CLI and the Google Generative AI API**) — 13 models, 4 tiers
- **Tier-Based Routing** — `brain_tier: 'premium'` instead of model names; ModelRegistry resolves best model per provider
- **Configurable Timeouts** — Per-task and per-sprint timeout, `sprint_timeout_minutes: 0` for unlimited
- **Human Checkpoints** — Configurable approval gates at plan, evaluate, fix phases
- **MCP Integration** — 31 tools + 8 resources for Claude Code IDE integration
- **Web Dashboard** — React + Vite + Tailwind, 7 pages, SSE real-time updates, TR/EN language switcher

### Cross-Platform
- **Linux** — Full (Ubuntu 20+, Debian 11+, Fedora 38+, Arch)
- **macOS** — Full (12+)
- **Windows WSL2** — Full (recommended for tmux workflows)
- **Native Windows** — Full (subprocess backend, `shell:true`, UTF-8 support)

---

## Comparison

See the [full competitive analysis](docs/analysis/competitive-analysis.md) for detailed head-to-head breakdowns.

> ⚠️ The comparison table may contain errors or omissions and competitors evolve fast. If you spot an inaccuracy, please [let us know](https://github.com/VerhexIO/deckent/issues) so we can update it.

| Feature | **deckent** | Cursor Agents | Devin | OpenClaw | Claude Code | Hermes Agency |
|---------|-------------|--------------|-------|----------|-------------|---------------|
| Sprint lifecycle (8-phase) | **Yes** | No | Partial | No | No | — |
| Multi-agent parallel execution | **Yes** (10 workers) | Limited | Yes | Yes (100+ AgentSkill) | No | — |
| Automatic task planning from goals | **Yes** (AI + structured) | No | Yes | No | No | — |
| AST sandbox for skills | **Yes** | No | No | No | No | — |
| Quality auditor with boundary enforcement | **Yes** | No | No | No | No | — |
| Nervous System (proactive meta-orchestrator) | **Yes** | No | No | No | No | — |
| Memory V2 (SQLite FTS5, cross-sprint learning) | **Yes** | No | No | 3rd party | No | — |
| Dual mode (sprint + task) | **Yes** | No | No | No | No | — |
| `.deck` secret interpolation | **Yes** | No | No | No | No | — |
| GO/NO-GO evaluation per task | **Yes** | No | No | No | No | — |
| Open source | **Yes** (MIT) | No | No | Yes (OSS) | No | — |
| MCP integration | **Yes** (31 tools, 8 resources) | Partial | No | Limited | Native | — |
| Web dashboard | **Yes** (7 pages) | Built-in | Built-in | No | No | — |
| Multi-provider (Claude, Codex, Gemini) | **Yes** | No | No | Limited | No | — |
| Built-in agents | **15** | — | — | 100+ | — | — |
| Built-in skills | **21** | — | — | 13K+ (hub, ~20% flagged) | — | — |
| Test coverage | **High** (≈95% target; not a hard gate) | — | — | — | — | — |
| Price | **Free (MIT)** | Paid | Paid | Free | Free | — |

---

## Requirements

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | >= 18 | `node --version` |
| git | any | `git --version` |
| Claude Code CLI | any | `claude --version` |
| tmux | any (optional, Linux/macOS) | `tmux -V` |
| OpenAI Codex CLI | any (optional, integration in development) | `codex --version` |
| Google Gemini CLI | any (optional) | `gemini --version` |

**Claude Subscription:** Pro, Max 5x, Max 20x, or API key (pay-as-you-go). Codex and Gemini are integrated through their own CLIs (`codex`, `gemini`); Gemini additionally needs `GOOGLE_API_KEY` and can also run via the Google Generative AI API. The Codex CLI integration is still in development.

**Zero-setup:** `deckent init` detects everything above and, with your per-tool consent, installs the missing provider CLIs (claude/codex/gemini). Use `--yes` to install all without prompting (CI), or `--no-install` for detection only. OS packages (tmux) / Node / Docker are surfaced as instructions, never auto-installed (ADR-062).

---

## Installation

```bash
npx deckent@latest init      # recommended — no global install
# or
npm install -g deckent && deckent init
```

Verify and open the dashboard:

```bash
deckent --version    # 1.0.0-beta.1
deckent doctor       # pre-flight health gate
deckent web          # web dashboard at http://localhost:3100
```

---

## CLI Usage

### Initialize a Project

```bash
cd my-project
deckent init
```

```
  Welcome to Deckent!

  ? Select your plan:
    > Performance -- 8 workers, premium model brain
      Balanced    -- 5 workers, standard model brain
      Economic    -- 3 workers, standard model only
      API (pay-as-you-go) -- 10 workers, any model

  Detected stack: TypeScript + Vitest + React
  ? Project name: my-project

  Next: Edit DIRECTIVES.md with your first goals, then run `deckent start`
```

### Set Your Mode

```bash
deckent mode sprint   # Developer orchestration (default)
deckent mode task     # Life assistant (one-shot tasks)
deckent mode auto     # Auto-detect from context
```

### Start a Sprint (Sprint Mode)

```bash
# Edit DIRECTIVES.md with your goals, then:
deckent start

# Preview plan without executing:
deckent start --dry-run

# Auto-approve all worker tool permissions:
deckent start --auto-approve
```

### Run a One-Shot Task (Task Mode)

```bash
deckent mode task
deckent run "Organize my downloads folder by file type"
deckent run "Draft a reply to the GitHub issue about memory leaks"
```

### Check Status

```bash
deckent status
deckent status --watch   # Auto-refresh every 2s
deckent status --json    # Machine-readable output
```

```
Sprint sprint-149 -- EXECUTE phase

  TASK        STATUS      MODEL    LAST HEARTBEAT
  149-001     EXECUTING   sonnet   5s ago
  149-002     DONE        haiku    42s ago

Progress: 1/2 done  |  0 failed  |  1 running
```

### Query Memory

```bash
deckent recall "docker heartbeat"         # Cross-source FTS5 search
deckent recall "ADR-037 RBAC"             # Find architecture decisions
deckent remember "Deploy freeze until Friday"  # Save a note
deckent memory stats                       # Memory DB stats
deckent memory export                      # Export DB → .md snapshots
```

### Health Check

```bash
deckent doctor
```

```
  node_version   v20.11.0 (>=18 required)     [pass]
  git            git 2.43.0                    [pass]
  tmux           tmux 3.3a                     [pass]
  claude_cli     claude 1.2.3                  [pass]
  workspace      .deckent/ found               [pass]
```

### All Commands

| Command | Description |
|---------|-------------|
| `deckent init` | Interactive setup wizard |
| `deckent mode [show\|sprint\|task\|auto\|global]` | Get/set runtime mode |
| `deckent start` | Run the full sprint lifecycle |
| `deckent plan` | Plan the next sprint (plan mode only) |
| `deckent status` | Show live dashboard |
| `deckent run <cmd>` | Run a task (one-shot in task mode, queued in sprint mode) |
| `deckent attach` | Attach to the tmux session |
| `deckent spawn <id>` | Manually spawn a worker |
| `deckent kill <id>` | Kill a specific worker |
| `deckent retro` | Read sprint retrospective |
| `deckent cleanup` | Archive sprint files and kill workers |
| `deckent doctor` | Check system health |
| `deckent audit <sprint-id>` | Run Brain Self-Audit Gate for a sprint |
| `deckent recover <sprint-id>` | Recover a crashed or incomplete sprint |
| `deckent config` | Show/edit configuration |
| `deckent config set <key> <value>` | Set a config value |
| `deckent history` | Show sprint history and metrics |
| `deckent analyze` | Analyze project stack and size |
| `deckent dashboard` | Terminal TUI dashboard |
| `deckent serve` | Start HTTP API server |
| `deckent web` | Web dashboard + API server (localhost:3100) |
| `deckent recall <query>` | Search project memory (ADRs, learnings, debt) |
| `deckent remember <note>` | Save a note to memory |
| `deckent memory [rebuild\|export\|stats]` | Memory DB management |
| `deckent skill` | List or manage installed skills |
| `deckent skill publish <path>` | Publish a skill to DeckentHub (Ed25519 signed) |
| `deckent features [--category]` | List feature manifest (active\|dormant\|dead\|all) |
| `deckent agent` | Manage agent pool (list, inspect, reset) |
| `deckent review` | Review last sprint results |
| `deckent upgrade` | Self-update (`--local <path.tgz>` for beta installs) |
| `deckent sync` | Sync adapter files with DECKENT.md |
| `deckent explain <topic>` | Explain a concept or command |
| `deckent heartbeat` | One-shot heartbeat check (`--daemon` for background) |
| `deckent checkpoint` | Approve/reject human checkpoints |
| `deckent onboard` | Guided first-run onboarding walkthrough |
| `deckent set-directives` | Write sprint goals to `DIRECTIVES.md` |
| `deckent finalize` | Finalize a sprint (retro, memory export, decay) |
| `deckent resume` | Resume a paused or long-running sprint from a checkpoint |
| `deckent watch` | Stream sprint events in real time |
| `deckent nervous` | Nervous System TUI, status, and detector config (`nervous config\|set\|list`) |
| `deckent plugin` | Manage plugins (create, install, list, enable/disable) |
| `deckent archive-debt` | Archive resolved technical-debt entries |
| `deckent cost` | Show token usage and cost breakdown |
| `deckent output` | Show captured per-task worker output |
| `deckent docs` | Manage and serve built-in documentation |
| `deckent test` | Run the project test suite |
| `deckent help-info` | Runtime capabilities, state info, and usage guide |

---

## MCP Integration

Deckent integrates with Claude Code via the Model Context Protocol:

```bash
claude mcp add deckent -- npx deckent mcp
```

Or let `deckent init` auto-register it.

### MCP Tools (31)

| Tool | Description |
|------|-------------|
| `deckent_init` | Initialize project structure |
| `deckent_set_directives` | Write sprint goals to DIRECTIVES.md |
| `deckent_plan` | Preview the sprint plan |
| `deckent_start` | Start a sprint in the background |
| `deckent_status` | Get current sprint status |
| `deckent_doctor` | Run health checks |
| `deckent_retro` | Read last retrospective |
| `deckent_history` | View sprint history |
| `deckent_analyze_project` | Analyze project stack |
| `deckent_sync` | Sync adapter files |
| `deckent_config` | Show or update configuration |
| `deckent_review` | Review last sprint results |
| `deckent_run` | Run an arbitrary command in project context |
| `deckent_kill` | Kill a specific worker |
| `deckent_cleanup` | Archive sprint files and clean up workers |
| `deckent_help` | Runtime capabilities, state info, and workflow guidance |
| `deckent_agent_list` | List registered agents (built-in and temporary) |
| `deckent_skill_list` | List registered skills with manifest info |
| `deckent_checkpoint` | Approve/reject human checkpoints |
| `deckent_docs` | Manage and serve built-in documentation |
| `deckent_explain` | Explain sprint history and results |
| `deckent_memory_query` | Cross-source memory search (ADR, sprint, debt, pattern) |
| `deckent_audit` | Run Brain Self-Audit Gate for any sprint (READ-ONLY) |
| `deckent_recover` | Recover from crashed or stuck sprint (DESTRUCTIVE) |
| `deckent_feature_query` | Query feature manifest (active/dormant/dead/all) |
| `deckent_watch` | Stream sprint events in real-time |
| `deckent_nervous_subscribe` | Subscribe to Nervous System notifications |
| `deckent_nervous_accept` | Accept pending nervous notification |
| `deckent_nervous_reject` | Reject pending nervous notification |
| `deckent_nervous_status` | Nervous System current status |
| `deckent_nervous_config` | Configure nervous detectors |

### MCP Resources (8)

| Resource URI | Contents |
|--------------|---------|
| `deckent://dashboard` | Live sprint dashboard |
| `deckent://directives` | Current DIRECTIVES.md |
| `deckent://memory` | Learned patterns from past sprints |
| `deckent://debt` | Technical debt items |
| `deckent://config` | Project configuration |
| `deckent://retro` | Last sprint retrospective |
| `deckent://tasks` | Active task list and statuses |
| `deckent://agents` | Agent pool and performance stats |

---

## Configuration

Configuration lives in `.deckent/config.json` (project) and `~/.deckent/config.json` (global). Project config overrides global.

### Key Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `deckent_style` | string | `"sprint"` | Runtime mode: `sprint` (developer) or `task` (life assistant) |
| `mode` | string | `"performance"` | Plan tier: `performance`, `balanced`, `economic`, `api` |
| `language` | string | `"en"` | Output language: `en`, `tr` |
| `brain_planning` | string | `"auto"` | Planning mode: `ai`, `structured`, `auto` |
| `brain_provider` | string | `"claude"` | Provider for Brain: `claude`, `codex`, `gemini` |
| `worker_provider` | string | `"claude"` | Provider for workers: `claude`, `codex`, `gemini` |
| `fallback_provider` | string | — | Fallback provider on failure |
| `spawn_backend` | string | `"tmux"` | Worker backend: `tmux`, `subprocess`, `docker` |
| `sprint_timeout_minutes` | number | `60` | Hard sprint timeout; `0` for unlimited |

### Plan Tiers

| Tier | Max Workers | Brain Model | Default Model |
|------|-------------|-------------|---------------|
| `performance` | 8 | opus | opus |
| `balanced` | 5 | sonnet | opus |
| `economic` | 3 | sonnet | sonnet |
| `api` | 10 | opus | sonnet |

### Multi-Provider Support

| Provider | CLI | Models | Auth |
|----------|-----|--------|------|
| Claude (default) | `claude` | opus, sonnet, haiku | Session auth or `ANTHROPIC_API_KEY` |
| Codex (OpenAI) | `codex` *(integration in development)* | o3, gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini | `OPENAI_API_KEY` |
| Gemini (Google) | `gemini` | gemini-3.1-pro-preview, gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash | `GOOGLE_API_KEY` |

**13 models across 3 providers.** Each provider is driven through its own CLI (`claude` / `codex` / `gemini`). Gemini works via **both the Gemini CLI and the Google Generative AI API** (CLI is primary). The Codex CLI integration is **in development**. Tier equivalence: `premium_plus` (o3, gemini-3.1-pro-preview), `premium` (opus, gpt-5, gemini-2.5-pro), `standard` (sonnet, gpt-4.1, o4-mini, gemini-2.5-flash), `economy` (haiku, gpt-5-mini, gpt-4.1-mini, gemini-2.0-flash).

See [docs/reference/multi-provider.md](docs/reference/multi-provider.md) for the full guide.

### `.deck` Secret Interpolation

Reference secrets in your config without committing them:

```json
{
  "connectors": {
    "discord": { "enabled": true, "token": "$DECK:DISCORD_TOKEN" },
    "telegram": { "enabled": true, "token": "$DECK:TELEGRAM_TOKEN" }
  }
}
```

Secrets are loaded from the `.deck` file at runtime. The `.deck` file is gitignored by default.

See [docs/reference/config-reference.md](docs/reference/config-reference.md) for the full reference.

---

## Docker Backend (Isolated Workers)

Workers run in isolated Docker containers — no cross-worker file conflicts.

```bash
docker build -f Dockerfile -t deckent-worker:latest .
npx deckent config set spawn_backend docker
```

- Project mounted read-only (`/workspace`)
- `.tasks/` mounted read-write (results, heartbeats)
- Non-root execution (`deckent` user)
- Configurable timeout: `npx deckent config set docker_timeout 1800` (default: 1200s)

See [docs/guide/docker-backend.md](docs/guide/docker-backend.md) for the full guide.

---

## Nervous System

The Nervous System is a proactive meta-orchestrator that runs alongside sprints:

<!-- ![deckent nervous TUI](docs/assets/nervous-tui.png) -->
> Run `deckent nervous` for the live TUI.

- **Detectors** — Pluggable detectors for stale tasks, idle state (task mode), routing anomalies, agent health
- **Notifications** — Contextual alerts via event bus; Discord/Telegram connectors included
- **Task Mode Idle** — In task mode, notifies after 5 minutes of inactivity
- **Proactive** — No polling required; detectors run on cron events and sprint lifecycle events

---

## Web Dashboard

```bash
deckent web   # Opens at localhost:3100
```

React + Vite + Tailwind — 7 pages (Chat, Config, Dashboard, History, Memory, Settings, Status), SSE real-time updates, dark/light theme, TR/EN language switcher.

<!-- ![dashboard screenshot](docs/assets/dashboard.png) -->
> Run `deckent web` to explore the dashboard.

---

## Workspace Structure

After `deckent init`:

```
my-project/
  DECKENT.md              # Single source of truth (agent config)
  DIRECTIVES.md           # Your goals — edit before each sprint
  CLAUDE.md               # Claude Code adapter
  AGENTS.md               # Generic agent adapter
  .deckent/
    config.json           # Runtime config (deckent_style, mode, providers)
    workspace/            # Identity, tools, boot sequence
    docs/                 # Built-in guides (quick-start, directives, config)
    agents/               # Agent pool (built-in + temp agents, LRU eviction)
    skills/               # Skill registry (built-in + temp skills, AST validated)
    plugins/              # Installed plugins
    i18n/                 # Language files (en, tr)
  .brain/
    memory.db             # SQLite DB — single source of truth (gitignored)
    exports/
      summary.md          # Auto-generated context summary (git-tracked)
      decisions.md        # ADR list (git-tracked)
      memory.md           # Sprint learnings (git-tracked)
      debt.md             # Technical debt (git-tracked)
    archive/              # Per-sprint logs
  .tasks/                 # Task JSON files (managed by Brain)
  .locks/                 # File locks (managed by workers)
  .deck                   # Secret file (gitignored — $DECK:KEY references)
```

---

## Crash Recovery

Deckent knows how to recover itself — and gives you the tools to recover too.

```bash
# Run Brain Self-Audit Gate for any past sprint
deckent audit sprint-150

# Recover a crashed or incomplete sprint (interactive, confirms before destructive ops)
deckent recover sprint-150 --dry-run   # preview what would be cleaned
deckent recover sprint-150             # execute recovery
```

```
Gate: PASS
tsc: pass, vitest: pass
Written: .deckent/sprint-150-gate.json
```

If a sprint crashes mid-execution (network cut, OOM, coordinator panic), `deckent recover` runs audit + orphan cleanup + stale lock clear + task archive in one command.

---

## DeckentHub — Skill Registry

DeckentHub is a curated skill registry where every skill is:
- **AST-sandboxed** — Validated before execution, no arbitrary code injection
- **Ed25519-signed** — Cryptographically signed by the author
- **CI-validated** — GitHub Actions validates sandbox + signature on every PR

```bash
deckent skill publish ./my-skill   # Sign + submit to DeckentHub
```

DeckentHub ships curated seed skills: spotify-control, telegram-bot, discord-moderator, calendar-google, and more.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing guide, code standards, and PR process.

---

## Documentation

- [Quickstart Tutorial](docs/guide/quickstart.md)
- [API Reference](docs/reference/api.md)
- [Configuration Reference](docs/reference/config-reference.md)
- [Multi-Provider Guide](docs/reference/multi-provider.md)
- [Architecture](docs/architecture/architecture.md)
- [Sprint Lifecycle](docs/architecture/sprint-lifecycle.md)
- [MCP Guide](docs/reference/mcp-guide.md)
- [Docker Backend Guide](docs/guide/docker-backend.md)
- [Troubleshooting](docs/development/troubleshooting.md)
- [FAQ](docs/guide/faq.md)

---

## License

MIT — [Alperen @ Verhex](https://deckent.agency)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent)
**Website:** [deckent.agency](https://deckent.agency)
