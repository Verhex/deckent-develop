# Deckent — Frequently Asked Questions (FAQ)

> **Version:** 1.0.0-beta.1 | **Language:** English

This FAQ addresses the most common questions about Deckent, its capabilities, requirements, and workflow.

---

## Table of Contents

1. [What is Deckent, and what is it NOT?](#1-what-is-deckent-and-what-is-it-not)
2. [Which provider and model do I need?](#2-which-provider-and-model-do-i-need)
3. [What spawn backend does Deckent use?](#3-what-spawn-backend-does-deckent-use)
4. [How does the MCP server work?](#4-how-does-the-mcp-server-work)
5. [How long does a sprint take?](#5-how-long-does-a-sprint-take)
6. [How do I add custom agents and skills?](#6-how-do-i-add-custom-agents-and-skills)
7. [Can I manage multiple projects with Deckent?](#7-can-i-manage-multiple-projects-with-deckent)
8. [Can I use Deckent in CI/CD?](#8-can-i-use-deckent-in-cicd)
9. [Can I use Deckent with OpenAI/Codex, Gemini, or Ollama?](#9-can-i-use-deckent-with-openaicodex-gemini-or-ollama)
10. [What happens if my primary provider is unavailable?](#10-what-happens-if-my-primary-provider-is-unavailable)
11. [How do I use the Autonomous engine?](#11-how-do-i-use-the-autonomous-engine)
12. [What is the Nervous System?](#12-what-is-the-nervous-system)
13. [How do I use memory recall?](#13-how-do-i-use-memory-recall)
14. [What is the native REPL / native-agent mode?](#14-what-is-the-native-repl--native-agent-mode)

---

## 1. What is Deckent, and what is it NOT?

### What Deckent IS

Deckent is an **AI agent orchestration system** for coordinated software development. It allows you to:

- **Write plain-language directives** in a `DIRECTIVES.md` file describing what you want done
- **Automatically plan** those directives into concrete, scoped tasks
- **Execute tasks in parallel** using multiple AI workers (claude, codex, gemini, or ollama), each in an isolated environment
- **Monitor progress** via a live dashboard showing agent activity, logs, and status
- **Learn and improve** — Memory V2 (SQLite FTS5) remembers successful patterns and applies them to future sprints
- **Enforce boundaries** — each worker operates in a sandbox with declared file/directory access limits
- **Run autonomously** — the Autonomous engine dispatches recurring and reactive work items from a persistent backlog
- **React proactively** — the Nervous System monitors sprint health and surfaces issues before they become failures

Deckent consists of three key components:
- **Brain** — plans tasks, evaluates results, updates memory
- **Auditor** — monitors agents in real time, detects issues, enforces scope boundaries
- **Workers** — execute tasks in parallel, each running a full plan→code→test→document cycle

### What Deckent is NOT

- **Not a CI/CD system** — Deckent is designed for interactive development sprints with human oversight (though CI/CD usage is possible with careful setup)
- **Not a build tool** — Deckent doesn't compile, test, or deploy code directly; it orchestrates AI agents that do
- **Not a git management tool** — Workers use git to track their changes, but Deckent doesn't manage branches or commits
- **Not fully autonomous by default** — You remain in control: you write DIRECTIVES.md, review results, and decide whether to proceed (the Autonomous engine is opt-in)

### TL;DR

**Deckent = Human directives → AI planning → Parallel agent execution → Monitored progress → Learned patterns**

---

## 2. Which provider and model do I need?

Deckent is **provider-agnostic** (v1.0.0-beta.1): Brain and each worker can use Claude, Codex (OpenAI), Gemini, or Ollama independently. You choose tiers rather than hard-coding model names.

### Provider Setup

| Provider | How to Enable |
|----------|---------------|
| `claude` | Claude subscription (default) or `ANTHROPIC_API_KEY` |
| `codex` | `OPENAI_API_KEY` env var |
| `gemini` | `GOOGLE_API_KEY` env var |
| `ollama` | Local Ollama server running at `http://localhost:11434` |

### Model Tiers (provider-agnostic)

Configure `brain_tier` and `worker_tier` in `.deckent/config.json` instead of hard-coding model names:

| Tier | Claude | Codex | Gemini | Best For |
|------|--------|-------|--------|----------|
| `premium_plus` | (fable) | o3 | gemini-3.1-pro-preview | Highest reasoning, architecture |
| `premium` | opus | gpt-5 | gemini-2.5-pro | Complex tasks, major refactors |
| `standard` | sonnet | gpt-4.1 / o4-mini | gemini-2.5-flash | General development (default) |
| `economy` | haiku | gpt-5-mini / gpt-4.1-mini | gemini-2.0-flash | Docs, simple fixes |

### Planning Modes

When you run `deckent plan`, you choose a planning mode:

- **AI Mode** (`mode: 'ai'`) — Brain uses AI to intelligently assign models based on task complexity (recommended)
- **Structured Mode** (`mode: 'structured'`) — Brain uses fixed rules (faster, deterministic)
- **Auto Mode** (`mode: 'auto'`) — Brain selects based on project size

### Per-Task Provider Override

You can assign a specific provider or model to individual tasks in DIRECTIVES.md:

```markdown
## Task 1: Security Audit
- Provider: claude
- Model: opus
```

---

## 3. What spawn backend does Deckent use?

Deckent supports three worker spawn backends. **Docker is the default.**

### Backends

| Backend | Default? | Description |
|---------|----------|-------------|
| `docker` | **Yes** | Workers run in isolated Docker containers with configurable memory limits and graceful shutdown |
| `tmux` | No | Workers run as Claude Code processes in separate tmux windows |
| `subprocess` | No | Workers run as child processes without a terminal session |

### Configuring the Backend

```json
// .deckent/config.json
{
  "spawn_backend": "docker"
}
```

Per-task override in DIRECTIVES.md:
```markdown
- Backend: tmux
```

### Docker Backend Details

- **Container isolation** — each worker gets its own container with the project mounted read-write only to its declared scope
- **Memory limit** — `4g` per worker container by default; tune per task-kind via `worker_memory_limit_by_kind` in `.deckent/config.json`
- **Graceful shutdown** — SIGTERM sent first, then SIGKILL after grace period; heartbeat data is fsynced before exit
- **Timeout** — configurable via `docker_timeout` (seconds, default `1200`)

### Using tmux

If you prefer tmux, install it first:

- **macOS**: `brew install tmux`
- **Ubuntu/Debian**: `sudo apt install tmux`
- **Windows (WSL2)**: `sudo apt install tmux`

Then set `spawn_backend: "tmux"` in your config.

---

## 4. How does the MCP server work?

Deckent provides an **MCP (Model Context Protocol) server** that integrates directly into Claude Code and other MCP-compatible IDE extensions. MCP allows Claude to call Deckent tools and read Deckent resources as part of your conversation.

### Architecture

```
Claude Code (IDE) ─── MCP stdio transport ───> deckent-mcp server
                                                      ↓
                                          src/mcp/tools/ (35 tools)
                                          src/mcp/resources/ (8 resources)
                                                      ↓
                                          Deckent Core Engine
```

### How It Works

1. **Register the MCP server** with Claude Code:
   ```bash
   claude mcp add deckent -- npx deckent-mcp
   ```
   Or let `deckent init` configure it automatically.

2. **Claude Code loads the server** at startup and discovers available tools and resources.

3. **Use Deckent tools naturally** in Claude Code:
   - `deckent_init` — Initialize a new Deckent project
   - `deckent_plan` — Plan the current sprint
   - `deckent_status` — Check live sprint status
   - `deckent_start` — Launch a sprint
   - `deckent_doctor` — Health check

4. **Reference Deckent resources**:
   - `deckent://directives` — Read DIRECTIVES.md
   - `deckent://dashboard` — See live sprint dashboard
   - `deckent://memory` — Review learned patterns and ADRs

### Tools vs. Resources

| Type | Purpose | Count |
|------|---------|-------|
| **Tools** | Actions (like commands) | 34 |
| **Resources** | Data you read/reference | 8 |

For the full tool reference, see [MCP Tools Reference](../reference/mcp-tools.md) (generated by `npm run docs:ref`).

### Benefits

- **Natural integration** — Call Deckent without leaving Claude Code
- **Context-aware** — Claude sees your DIRECTIVES.md and dashboard in the same conversation
- **No extra setup** — `deckent init` automatically configures everything
- **Works offline** — Local projects communicate via stdio (no network required)

---

## 5. How long does a sprint take?

A **sprint** is one complete cycle of task planning, parallel execution, evaluation, and learning. Sprint duration depends on several factors.

### Phases

Each sprint progresses through **8 phases** (monitor via `deckent status`):

| Phase | Duration | What Happens |
|-------|----------|--------------|
| **PLAN** | 5-30 seconds | Brain analyzes DIRECTIVES.md and creates task JSON files |
| **SPAWN** | 5-10 seconds | Workers are launched via the configured backend (docker/tmux/subprocess) |
| **EXECUTE** | Minutes to hours | Workers code, test, and document simultaneously |
| **EVALUATE** | 10-30 seconds | Brain reviews each worker's result (GO / NO_GO / GO_WITH_TECH_DEBT) |
| **FIX** | Variable | Failed tasks are retried (configurable max attempts) |
| **RETRO** | 5-10 seconds | Sprint learnings written to memory.db |
| **DECAY** | 5 seconds | Memory trimmed if .brain/ exceeds budget |
| **CLEANUP** | 5 seconds | Sprint files archived, workers terminated |

### Real-World Examples

**Simple sprint** (3 tasks, quick fixes):
- Total time: **15-45 minutes**
- Example: "Add documentation, refactor one module, fix a bug"

**Medium sprint** (8 tasks, feature work):
- Total time: **2-4 hours**
- Example: "Implement a new API endpoint, update tests, write docs, refactor auth"

**Complex sprint** (20+ tasks, major refactor):
- Total time: **4-8 hours** (or overnight)
- Example: "Database migration, API redesign, security audit, plugin system overhaul"

### Factors That Affect Duration

1. **Task complexity** — Simple fixes finish faster than deep refactors
2. **Number of tasks** — More tasks = longer EXECUTE phase (parallelization via dependency waves helps)
3. **Worker count** — More workers speed up execution (limited by provider quota)
4. **Model tier** — `premium` is slower but more accurate; `economy` is faster but less capable
5. **Code size** — Larger codebases take longer to read and understand

### Interrupting or Recovering a Sprint

```bash
deckent kill --all         # Stop all active workers
deckent cleanup            # Archive task files, end sprint
deckent recover <sprint-id>  # Re-evaluate partial results from a stalled sprint
deckent resume <sprintId>  # Resume from the latest checkpoint
```

---

## 6. How do I add custom agents and skills?

Deckent has two extension mechanisms: **skills** (horizontal domain expertise) and **agents** (vertical specializations). Both can be extended beyond the 15 built-in agents and 21 built-in skills.

### Custom Skills

Create a skill directory under `.deckent/skills/my-skill/`:

```
.deckent/skills/my-skill/
  skill.json     ← Required: metadata and activation rules
  SKILL.md       ← Required: domain instructions for workers
```

`skill.json` example:
```json
{
  "id": "my-skill",
  "name": "My Domain Skill",
  "version": "1.0.0",
  "description": "Domain expertise for my specific stack",
  "activationKeywords": ["mystack", "myframework"]
}
```

### Custom Agents

Create an agent directory under `.deckent/agents/my-agent/`:

```
.deckent/agents/my-agent/
  agent.json     ← Required: metadata, model preferences, activation rules
  PROMPT.md      ← Required: agent system prompt
```

### Plugin System

For reusable extensions you want to share or apply project-wide, use the plugin CLI:

```bash
deckent plugin install ./my-plugin     # Install from a local directory
deckent plugin install <repo-url>      # Install from a git repository
deckent plugin list                    # Show installed plugins
deckent plugin create <name>           # Scaffold a new plugin
```

### Evolution Pipeline

The **Evolution Pipeline** automatically promotes high-performing temp agents and skills to permanent status based on outcome data, and demotes poor performers. This happens after sprint evaluation — no manual intervention needed.

---

## 7. Can I manage multiple projects with Deckent?

Yes, with important caveats.

### Single Machine, Multiple Projects

You can initialize Deckent in separate project directories:

```bash
cd ~/project-a
deckent init
deckent start

cd ~/project-b
deckent init
deckent start
```

Each project has its own:
- `.deckent/` directory with independent config and agent/skill pools
- DIRECTIVES.md
- Sprint session (named after the project)
- Memory V2 database (`.brain/memory.db`)

### Limitations

**Sequential execution** — Each `deckent start` runs until the sprint completes. To run sprints in parallel on the same machine, use separate shells or terminals.

**Shared provider quota** — Token usage is shared across all projects on your account. If project-a exhausts your monthly budget, project-b will be affected.

**No cross-project communication** — Workers in project-a cannot see or modify project-b's code (ADR-034 multi-project isolation).

### Recommended Approach

For teams managing multiple projects:

1. **Global config** — `deckent onboard` sets up your default provider, model tier, and team settings once
2. **Project-local config** — Each project has its own `.deckent/config.json` with project-specific overrides
3. **Coordination** — Document which projects are in active sprints to avoid quota contention

---

## 8. Can I use Deckent in CI/CD?

**Short answer:** Deckent can be used in CI/CD for health checks and verification steps, but it is designed for interactive development sprints.

### Supported Scenarios

#### ✅ Pre-deployment verification

```bash
# In CI pipeline, before releasing
deckent doctor   # Health check
npm run lint
npm test
```

#### ✅ Automated doc generation step

```bash
# Use Deckent to generate/update docs before release
deckent start
git commit -am "Auto-generated docs"
```

### NOT Recommended

#### ❌ Long, unattended sprints on CI servers

- Workers need provider authentication (Claude subscription or API key)
- No human oversight to handle NO_GO results
- Sprint timeouts may occur on slow CI agents

#### ❌ As your primary test runner

- Too heavy (spawns agents, monitors, workers)
- For testing, use `npm test` or `npx vitest run` directly

### Example CI/CD Integration

```yaml
# .github/workflows/verify.yml
name: Verify
on:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "24"

      - name: Install Deckent
        run: npm install -g deckent

      - name: Health check
        run: deckent doctor

      - name: Lint
        run: npm run lint

      - name: Tests
        run: npm test
```

### Key Requirements for CI

1. **Node.js >=24** must be available
2. **Provider credentials** must be set via environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`)
3. **DIRECTIVES.md must be static** — pre-written by humans, not generated by CI
4. **Keep sprints short** — limit tasks and use `economy` or `standard` tier models

---

## 9. Can I use Deckent with OpenAI/Codex, Gemini, or Ollama?

Yes. Deckent (v1.0.0-beta.1) is fully multi-provider. You configure which provider Brain and workers use via `.deckent/config.json`:

```json
{
  "brain_provider": "claude",
  "worker_provider": "codex"
}
```

### Supported Providers

| Provider | Key / Setup | Models |
|----------|-------------|--------|
| `claude` | Claude subscription or `ANTHROPIC_API_KEY` | fable, opus, sonnet, haiku |
| `codex` | `OPENAI_API_KEY` | gpt-5, gpt-4.1, o4-mini, gpt-5-mini, gpt-4.1-mini |
| `gemini` | `GOOGLE_API_KEY` | gemini-2.5-pro, gemini-2.5-flash, gemini-2.0-flash |
| `ollama` | Local Ollama server at `http://localhost:11434` | Any locally-pulled model tag |

### OpenAI-Compatible HTTP Adapter

If you run a custom inference server that exposes an OpenAI-compatible API, you can point Deckent at it:

```json
{
  "openai_compatible": {
    "base_url": "http://localhost:8080/v1",
    "model": "my-local-model"
  }
}
```

### Mixed-Fleet Setup

You can use different providers per task using the `- Provider:` directive in DIRECTIVES.md:

```markdown
## Task 1: Complex Architecture
- Provider: claude
- Model: opus

## Task 2: Generate Docs
- Provider: gemini
- Model: gemini-2.5-flash
```

### Ollama Limitations

Ollama works for the native REPL (`deckent` chat mode) and single-task mode. Full sprint-worker support via Ollama is a stub — workers will run but tool-use may be limited depending on the local model's capabilities.

---

## 10. What happens if my primary provider is unavailable?

Deckent has a fallback chain. If your primary provider fails (API outage, quota exhaustion), tasks are automatically rerouted to your configured fallback.

### Configuration

```json
{
  "brain_provider": "claude",
  "worker_provider": "claude",
  "fallback_provider": "codex"
}
```

### Fallback Tier Mapping

When falling back, Deckent maps equivalent model tiers across providers:

| Tier | Primary (Claude) | Fallback (Codex) | Fallback (Gemini) |
|------|-----------------|------------------|-------------------|
| `premium_plus` | (fable) | o3 | gemini-3.1-pro-preview |
| `premium` | opus | gpt-5 | gemini-2.5-pro |
| `standard` | sonnet | gpt-4.1 / o4-mini | gemini-2.5-flash |
| `economy` | haiku | gpt-5-mini / gpt-4.1-mini | gemini-2.0-flash |

### Behavior

- Fallback is transparent — task files and results use the same format regardless of provider.
- If no fallback is configured, Deckent surfaces an error via `deckent status`.
- Fallback events are recorded in memory.db for review after the sprint.
- Fallback is a single retry — no infinite loops.

---

## 11. How do I use the Autonomous engine?

The **Autonomous engine** runs authority-bounded continuous work from a persistent backlog. It dispatches recurring, one-off, and reactive items without requiring a new sprint per task.

### Starting the Engine

```bash
deckent autonomous start        # Start the autonomous loop
deckent autonomous status       # Check current status
deckent autonomous stop         # Stop the engine
```

### Managing the Backlog

```bash
# Add a one-off task
deckent autonomous backlog add --id my-task --title "Run nightly audit" --kind task

# Add a recurring task (cron syntax)
deckent autonomous backlog add --id nightly-audit --title "Nightly security scan" \
  --kind task --cron "0 2 * * *"

# List the backlog
deckent autonomous backlog list
```

### Backlog Entry Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Ready to dispatch |
| `running` | Currently executing |
| `parked` | Held for human approval (policy gate) |
| `done` | Completed successfully |
| `failed` | Execution failed |

### Trigger Types

| Type | When it Runs |
|------|-------------|
| `one-off` | Once, immediately when pending |
| `recurring` | On a cron schedule (re-enqueued after each run) |
| `reactive` | When triggered by a Nervous System detector event |

### Policy Gates

Every entry has a `policy`:
- `auto` — dispatches automatically (requires Brain risk assessment)
- `approval-required` — pauses in `parked` state until you approve
- `risk-tagged` — dispatches with an elevated risk annotation

### Via MCP

```
deckent_autonomous { "action": "status" }
deckent_autonomous { "action": "backlog", "subAction": "add", ... }
```

---

## 12. What is the Nervous System?

The **Nervous System** is Deckent's proactive meta-orchestrator (ADR-040). Rather than waiting for failures, it continuously observes sprint health and surfaces proposals before problems compound.

### Pipeline

```
Observer → Detector Registry → Decision Engine → Proposer → Dispatcher → Executor
```

### What It Detects

The Nervous System includes detectors for events like:
- Stale heartbeats (workers that may have crashed)
- Scope boundary violations
- Unusual resource consumption
- Task dependency deadlocks
- Provider availability degradation

### Human-in-the-Loop

By default, Nervous proposals require your approval:

```bash
deckent nervous                      # Dashboard: see pending proposals
```

Or via MCP:
```
deckent_nervous_status
deckent_nervous_accept { "proposalId": "..." }
deckent_nervous_reject { "proposalId": "..." }
```

You can configure detectors and approval thresholds with `deckent nervous config` or `deckent_nervous_config`.

---

## 13. How do I use memory recall?

**Memory V2** is Deckent's DB-first knowledge store (ADR-088). It holds ADRs, sprint learnings, patterns, debt records, and retrospectives in a SQLite database with FTS5 full-text search.

### CLI Commands

```bash
# Search project memory
deckent recall "docker heartbeat fix"

# Save a note to memory
deckent remember "Always use atomicWrite for heartbeat files"

# View memory stats and export
deckent memory stats
deckent memory export     # Re-generate .brain/exports/*.md snapshots
deckent memory rebuild    # Rebuild memory.db from .md exports
```

### What Memory Recalls

- **ADRs** — Architecture Decision Records (all 89 accepted decisions)
- **Sprint learnings** — What worked and what didn't, per sprint
- **Patterns** — Recurring violation and success patterns
- **Debt records** — Open and resolved technical debt
- **Retrospectives** — Sprint-by-sprint summaries

### Search Quality

Memory V2 uses dual-layer FTS5 search with Turkish normalization — searches in Turkish and English both return accurate results (`turkishNormalize()` handles accent-insensitive matching).

### Via MCP

```
deckent_memory_query { "text": "docker heartbeat", "type": ["adr", "memory"], "limit": 5 }
```

---

## 14. What is the native REPL / native-agent mode?

### Native REPL (Stable)

Running `deckent` without arguments opens the **native REPL** — an Ink-based (React-for-CLI) interactive terminal interface. It supports:

- Multi-turn conversation with your configured provider (Claude, Codex, Gemini, Ollama)
- `/` slash commands (e.g. `/status`, `/recall`, `/plan`)
- Inline tool use with per-tool approval queue
- Approval modes: `suggest`, `auto-edit`, `full-auto`
- Model and provider switching mid-session

```bash
deckent          # Opens the native REPL
deckent chat     # Equivalent explicit command
```

### Native-Agent Mode (Experimental)

Native-agent mode enables **agentic tool use** inside the REPL — Deckent emits `<deckent_tool>` protocol messages and the REPL routes them through the same Brain/Worker/Auditor pipeline.

**This feature is experimental and opt-in.** It is disabled by default.

To enable:
```bash
# Via environment variable
DECKENT_NATIVE_AGENT=1 deckent

# Via flag
deckent --native
```

Experimental means: the feature works but the API surface may change between beta releases. Sprint-based orchestration remains the stable path for production use.

---

## Still Have Questions?

For detailed guides, see:
- [Quickstart](./quickstart.md) — 5-minute setup tutorial
- [Core Concepts](./concepts.md) — How Brain, Workers, and Auditor work together
- [Multi-Provider Guide](../reference/multi-provider.md) — Using Claude, Codex, Gemini, and Ollama
- [Autonomous Engine](./autonomous.md) — Continuous dispatch and backlog management
- [Migration Guide](../reference/migration-guide.md) — Version upgrade paths

Or open an issue on [GitHub](https://github.com/VerhexIO/deckent/issues).
