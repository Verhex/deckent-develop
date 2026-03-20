# Deckent

**Your AI development team, orchestrated.**

1422+ tests | 97.5% coverage | 26 sprints completed

Deckent is a self-evolving AI agent orchestration system. Write directives in plain language — Deckent plans, assigns, monitors, and completes development work using multiple AI agents running in parallel. The system learns from every sprint and improves over time.

## What Deckent Is

- **Brain** — plans tasks, evaluates results, learns from patterns
- **Auditor** — monitors agents, detects issues, enforces quality
- **Workers** — execute tasks in parallel tmux panes, each running a full plan→code→test→report cycle

## Requirements

- Node.js >= 18
- git
- tmux
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`npm install -g @anthropic-ai/claude-code`)
- Claude subscription (Pro, Max 5x/20x, or API key)

**Supported OS:** macOS, Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch), Windows via WSL2

## Installation

```bash
npm install -g deckent
```

## Quick Start

```bash
# 1. Initialize Deckent in your project
cd my-project
deckent init

# 2. Write your goals
# Edit DIRECTIVES.md with the tasks you want completed

# 3. Run a sprint
deckent start
```

### Init Wizard

```
$ deckent init

  Welcome to Deckent!

  ? Select your Claude plan:
    > Max 20x ($200/mo) — up to 8 workers, Opus for Brain
      Max 5x ($100/mo)  — up to 5 workers, Sonnet for Brain
      Pro ($20/mo)      — up to 3 workers, Sonnet only
      API (pay-as-you-go) — up to 10 workers, any model

  ? Project name: my-awesome-project

  Next: Edit DIRECTIVES.md with your first goals, then run `deckent start`
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `deckent init` | Interactive setup wizard for a new project |
| `deckent onboard` | Full onboarding (global + project config) |
| `deckent start` | Run the full sprint lifecycle |
| `deckent plan` | Brain plans the next sprint (plan mode only) |
| `deckent status` | Show live dashboard |
| `deckent attach` | Attach to the tmux session to see all agents |
| `deckent spawn <id>` | Manually spawn a worker |
| `deckent kill <id>` | Kill a specific worker |
| `deckent retro` | Run sprint retrospective |
| `deckent cleanup` | Archive sprint files and kill workers |
| `deckent doctor` | Check system health (tmux, claude, git, node) |
| `deckent config` | Show/edit configuration |
| `deckent config set <k> <v>` | Set a config value |
| `deckent usage` | Show current plan usage |
| `deckent history` | Show sprint history and metrics |
| `deckent plugin install <name>` | Install a skill/plugin |
| `deckent plugin list` | List installed plugins |
| `deckent analyze` | Analyze project stack, size, methodology |
| `deckent archive-debt` | Archive resolved technical debt |
| `deckent dashboard` | Terminal TUI dashboard (rich mode) |
| `deckent serve` | Start HTTP API server (SSE) |
| `deckent web` | Web dashboard + API server (localhost:3100) |
| `deckent upgrade` | Self-update Deckent |
| `deckent sync` | Sync adapter files with DECKENT.md reference |
| `deckent watch` | Live tmux split view: dashboard + worker panes |
| `deckent test` | Run project tests (`npx vitest run`) |
| `deckent run <cmd>` | Run arbitrary command in project context |

## MCP Integration

Deckent integrates into Claude Code via 10 MCP tools (enriched responses) + 5 resources. Register with:

```bash
claude mcp add deckent -- npx deckent mcp
```

Or let `deckent init` auto-register it.

## Web Dashboard

Launch the web dashboard:

```bash
deckent web     # Opens at localhost:3100
```

React + Vite + Tailwind — 4 pages (Dashboard, Settings, History, Memory), SSE real-time updates, dark/light theme.

## HTTP API

```bash
deckent serve   # API only at localhost:3100
```

16 endpoints + SSE: status, sprint, history, config, doctor, memory, debt, worker log, start, plan, kill, set-directives, events (SSE).

## Workspace Structure

After `deckent init`, your project will contain:

```
my-project/
├── AGENTS.md           # @DECKENT.md adapter
├── CLAUDE.md           # @DECKENT.md adapter (Claude Code compatibility)
├── DECKENT.md          # Single source of truth (agent config)
├── DIRECTIVES.md       # Your goals — edit this before each sprint
└── .deckent/
    ├── config.json     # Runtime config (mode, models, limits)
    ├── workspace/
    │   ├── IDENTITY.md # Project identity card
    │   ├── TOOLS.md    # Environment tools/commands
    │   └── BOOT.md     # Agent boot sequence
    ├── plugins/        # Installed plugins
    └── i18n/           # Language files (en.json, tr.json)
```

## How a Sprint Works

1. **You** write goals in `DIRECTIVES.md`
2. **Brain** reads directives, creates tasks, assigns workers
3. **Workers** execute tasks in parallel tmux panes
4. **Auditor** monitors progress and enforces quality
5. **Brain** evaluates results — GO, NO-GO, or GO_WITH_TECH_DEBT
6. Results and learnings are stored in `.brain/` for the next sprint

## License

MIT — [Alperen @ Verhex](https://deckent.agency)
