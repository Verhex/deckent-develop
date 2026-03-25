# deckent

**Your AI development team, orchestrated.**

[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-10500%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Deckent is an AI agent orchestration CLI that turns natural language into working code. Write your goals, and Deckent plans tasks, assigns parallel AI workers, monitors quality, and delivers results -- all in a single sprint.

<!-- ![demo](docs/assets/demo.gif) -->

## 30-Second Quickstart

```bash
# Install globally
npm install -g deckent

# Initialize in your project
cd my-project
deckent init

# Write goals in DIRECTIVES.md, then run
deckent start
```

---

## How It Works

Deckent follows a three-step cycle:

1. **Describe** -- Write what you want built in `DIRECTIVES.md`
2. **Plan** -- Brain reads your goals and creates scoped, prioritized tasks
3. **Execute** -- Parallel AI workers build, test, and report results

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
|   | evaluates|---->| Worker N |     |  alerts)  |                 |
|   +----------+     +----------+     +----------+                 |
|        |                                   |                     |
|   .brain/            .tasks/          .dashboard                 |
|   (memory,           (task JSON,      (live status)              |
|    debt,              results,                                   |
|    patterns)          heartbeats)                                |
+------------------------------------------------------------------+
```

- **Brain** -- Plans tasks, assigns models, evaluates results, learns from patterns
- **Workers** -- Execute tasks in parallel (via tmux or subprocess), each running a full plan-code-test-report cycle
- **Auditor** -- Monitors heartbeats, detects boundary violations, enforces quality

---

## Key Features

- **Sprint Lifecycle** -- Structured PLAN, SPAWN, EXECUTE, EVALUATE, RETRO, DECAY phases ensure every sprint runs to completion
- **Multi-Worker Parallel Execution** -- Up to 10 AI workers running simultaneously, each in an isolated scope
- **Memory and Learning** -- Brain stores learnings in `.brain/MEMORY.md` and patterns in `PATTERNS.md`, improving with every sprint
- **Auditor Quality Gate** -- Continuous monitoring: stale heartbeat detection, boundary violation scanning, deadlock detection via Kahn's algorithm
- **GO / NO-GO Evaluation** -- Every task result is evaluated against defined criteria. NO-GO tasks get logged and optionally retried
- **Multi-Provider Support** -- Works with Claude (default), OpenAI Codex, and Google Gemini. Configure per-role (brain, worker) or per-task
- **Provider Fallback Chain** -- Primary provider fails? Automatic fallback to alternative provider with model equivalence mapping
- **Usage-Aware Planning** -- Automatically adjusts sprint size based on your Claude plan usage (5-hour and weekly thresholds)
- **Plugin System** -- Extend Deckent with custom hooks, commands, and patterns
- **MCP Integration** -- 10 MCP tools + 5 resources for seamless Claude Code IDE integration
- **Web Dashboard** -- React + Vite + Tailwind dashboard with real-time SSE updates
- **Internationalization** -- English and Turkish language support built in

---

## Comparison

| Feature | deckent | Cursor | Devin | Aider | Claude Code (solo) |
|---------|---------|--------|-------|-------|-------------------|
| Multi-agent parallel execution | Yes (up to 10 workers) | No | Yes | No | No |
| Sprint lifecycle management | Yes | No | Partial | No | No |
| Automatic task planning from goals | Yes (AI + structured) | No | Yes | No | No |
| Quality auditor with boundary enforcement | Yes | No | No | No | No |
| Memory and learning across sprints | Yes | No | Partial | No | No |
| GO/NO-GO evaluation per task | Yes | No | No | No | No |
| Usage-aware auto-throttling | Yes | N/A | N/A | N/A | No |
| Open source | Yes (MIT) | No | No | Yes | Partial |
| MCP integration | Yes (10 tools) | N/A | N/A | N/A | N/A |
| Web dashboard | Yes | Built-in | Built-in | No | No |
| Multi-provider support | Yes (Claude, Codex, Gemini) | No | No | Yes | No |
| Works offline (local models) | Planned | Yes | No | Yes | No |

---

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch) | **FULL** | Primary development platform |
| macOS (12+) | **FULL** | All features supported |
| Windows via WSL2 | **FULL** | Recommended Windows setup — use Ubuntu/Debian WSL2 |
| Native Windows (cmd / PowerShell) | **UNSUPPORTED** | tmux unavailable, path issues. Use WSL2 instead |

> **Windows users:** Install [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) with Ubuntu, then run deckent inside the WSL2 terminal. Do not use native Windows cmd or PowerShell. Running `deckent doctor` on native Windows will show a platform warning.

---

## Requirements

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | >= 18 | `node --version` |
| git | any | `git --version` |
| Claude Code CLI | any | `claude --version` |
| tmux | any (optional) | `tmux -V` |
| OpenAI Codex CLI | any (optional) | `codex --version` |
| Google Gemini API | any (optional) | `GOOGLE_API_KEY` env var |

**Claude Subscription:** Pro ($20/mo), Max 5x ($100/mo), Max 20x ($200/mo), or API key (pay-as-you-go)

**Supported OS:** macOS, Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch), Windows via WSL2

---

## Installation

```bash
npm install -g deckent
```

Verify:

```bash
deckent --version
deckent doctor
```

---

## CLI Usage

### Initialize a Project

```bash
cd my-project
deckent init
```

Output:

```
  Welcome to Deckent!

  ? Select your Claude plan:
    > Max 20x ($200/mo) -- up to 8 workers, Opus for Brain
      Max 5x ($100/mo)  -- up to 5 workers, Sonnet for Brain
      Pro ($20/mo)      -- up to 3 workers, Sonnet only
      API (pay-as-you-go) -- up to 10 workers, any model

  ? Project name: my-project

  Next: Edit DIRECTIVES.md with your first goals, then run `deckent start`
```

### Start a Sprint

```bash
# Edit DIRECTIVES.md with your goals, then:
deckent start

# Preview plan without executing:
deckent start --dry-run

# Auto-approve all worker tool permissions:
deckent start --auto-approve
```

### Check Status

```bash
deckent status

# Auto-refresh every 2 seconds:
deckent status --watch

# Machine-readable output:
deckent status --json
```

Example output:

```
Sprint sprint-001 -- EXECUTE phase

  TASK        STATUS      MODEL    LAST HEARTBEAT
  001-001     EXECUTING   sonnet   5s ago
  001-002     DONE        haiku    42s ago

Progress: 1/2 done  |  0 failed  |  1 running
```

### Plan Without Executing

```bash
deckent plan
```

### Health Check

```bash
deckent doctor
```

Output:

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
| `deckent onboard` | Full onboarding (global + project config) |
| `deckent start` | Run the full sprint lifecycle |
| `deckent plan` | Plan the next sprint (plan mode only) |
| `deckent status` | Show live dashboard |
| `deckent attach` | Attach to the tmux session |
| `deckent spawn <id>` | Manually spawn a worker |
| `deckent kill <id>` | Kill a specific worker |
| `deckent retro` | Run sprint retrospective |
| `deckent cleanup` | Archive sprint files and kill workers |
| `deckent doctor` | Check system health |
| `deckent config` | Show/edit configuration |
| `deckent config set <key> <value>` | Set a config value |
| `deckent usage` | Show current plan usage |
| `deckent history` | Show sprint history and metrics |
| `deckent plugin install <name>` | Install a plugin |
| `deckent plugin list` | List installed plugins |
| `deckent analyze` | Analyze project stack and size |
| `deckent archive-debt` | Archive resolved technical debt |
| `deckent dashboard` | Terminal TUI dashboard |
| `deckent serve` | Start HTTP API server |
| `deckent web` | Web dashboard + API server (localhost:3100) |
| `deckent upgrade` | Self-update Deckent |
| `deckent sync` | Sync adapter files with DECKENT.md |
| `deckent watch` | Live tmux split view |
| `deckent test` | Run project tests |
| `deckent set-directives` | Set sprint directives |
| `deckent finalize` | Finalize current sprint |
| `deckent run <cmd>` | Run arbitrary command |
| `deckent explain <topic>` | Explain a concept or command |
| `deckent quick-start` | Quick-start wizard for new projects |
| `deckent skill` | List or manage installed skills |
| `deckent skill-marketplace` | Browse and install skills from marketplace |
| `deckent agent` | Manage agent pool (list, inspect, reset) |
| `deckent review` | Review last sprint results |
| `deckent config migrate` | Migrate config to latest schema version |

---

## MCP Integration

Deckent integrates with Claude Code via the Model Context Protocol. Register with:

```bash
claude mcp add deckent -- npx deckent mcp
```

Or let `deckent init` auto-register it.

### MCP Tools (10)

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

### MCP Resources (5)

| Resource URI | Contents |
|--------------|---------|
| `deckent://dashboard` | Live sprint dashboard |
| `deckent://directives` | Current DIRECTIVES.md |
| `deckent://memory` | Learned patterns from past sprints |
| `deckent://debt` | Technical debt items |
| `deckent://config` | Project configuration |

---

## Configuration

Configuration lives in `.deckent/config.json` (project) and `~/.deckent/config.json` (global). Project config overrides global.

### Key Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mode` | string | `"max_plan"` | Plan mode: `max_plan`, `max5x_plan`, `pro_plan`, `api` |
| `language` | string | `"en"` | Output language: `en`, `tr` |
| `projectName` | string | `"deckent-project"` | Project name for dashboard and logs |
| `brain_planning` | string | `"auto"` | Planning mode: `ai`, `structured`, `auto` |
| `modes.<mode>.max_workers` | number | varies | Maximum parallel workers |
| `modes.<mode>.brain_model` | string | varies | Model used by Brain for planning |
| `modes.<mode>.default_model` | string | varies | Default model for workers |
| `modes.<mode>.haiku_allowed` | boolean | varies | Whether Brain can assign haiku |

### Plan Modes

| Mode | Subscription | Max Workers | Brain Model | Default Model |
|------|-------------|-------------|-------------|---------------|
| `max_plan` | Max 20x ($200/mo) | 8 | opus | opus |
| `max5x_plan` | Max 5x ($100/mo) | 5 | sonnet | opus |
| `pro_plan` | Pro ($20/mo) | 3 | sonnet | sonnet |
| `api` | API key | 10 | opus | sonnet |

**Mode Aliases:** You can also use `performance`, `balanced`, `economic`, or `unlimited` as friendly aliases for the canonical mode names.

**Multi-Provider:** Configure `brain_provider`, `worker_provider`, and `fallback_provider` to use Claude, Codex, or Gemini. See [docs/reference/multi-provider.md](docs/reference/multi-provider.md).

See [docs/reference/config-reference.md](docs/reference/config-reference.md) for the full reference.

---

## Web Dashboard

```bash
deckent web     # Opens at localhost:3100
```

React + Vite + Tailwind -- 4 pages (Dashboard, Settings, History, Memory), SSE real-time updates, dark/light theme.

---

## HTTP API

```bash
deckent serve   # API only at localhost:3100
```

16 endpoints + SSE stream. See [docs/reference/api.md](docs/reference/api.md) for the full reference.

---

## Workspace Structure

After `deckent init`:

```
my-project/
  DECKENT.md             # Single source of truth (agent config)
  DIRECTIVES.md          # Your goals -- edit before each sprint
  CLAUDE.md              # Claude Code adapter
  AGENTS.md              # Generic agent adapter
  .deckent/
    config.json          # Runtime config
    workspace/           # Identity, tools, boot sequence
    plugins/             # Installed plugins
    i18n/                # Language files
  .brain/
    MEMORY.md            # Learned patterns (auto-updated)
    DEBT.md              # Technical debt log
    PATTERNS.md          # Detected patterns
    RETRO.md             # Last sprint retrospective
    DECISIONS.md         # Architecture decisions
    sprints/             # Per-sprint logs
  .tasks/                # Task JSON files (managed by Brain)
  .locks/                # File locks (managed by workers)
```

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
- [Plugin Guide](docs/development/plugin-guide.md)
- [Troubleshooting](docs/development/troubleshooting.md)
- [FAQ](docs/guide/faq.md)

---

## License

MIT -- [Alperen @ Verhex](https://deckent.agency)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent)
**Website:** [deckent.agency](https://deckent.agency)
