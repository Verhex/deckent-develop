# Deckent — Frequently Asked Questions (FAQ)

> **Last Updated:** Sprint 065 | **Language:** English

This FAQ addresses the most common questions about Deckent, its capabilities, requirements, and workflow.

---

## Table of Contents

1. [What is Deckent, and what is it NOT?](#1-what-is-deckent-and-what-is-it-not)
2. [Which Claude plan do I need?](#2-which-claude-plan-do-i-need)
3. [Why is tmux required?](#3-why-is-tmux-required)
4. [How does the MCP server work?](#4-how-does-the-mcp-server-work)
5. [How long does a sprint take?](#5-how-long-does-a-sprint-take)
6. [How do I write a plugin?](#6-how-do-i-write-a-plugin)
7. [Can I manage multiple projects with Deckent?](#7-can-i-manage-multiple-projects-with-deckent)
8. [Can I use Deckent in CI/CD?](#8-can-i-use-deckent-in-cicd)
9. [Can I use Deckent with OpenAI/Codex or Gemini?](#9-can-i-use-deckent-with-openaicodex-or-gemini)
10. [What happens if my primary provider is unavailable?](#10-what-happens-if-my-primary-provider-is-unavailable)

---

## 1. What is Deckent, and what is it NOT?

### What Deckent IS

Deckent is an **AI agent orchestration system** for coordinated software development. It allows you to:

- **Write plain-language directives** in a `DIRECTIVES.md` file describing what you want done
- **Automatically plan** those directives into concrete, scoped tasks
- **Execute tasks in parallel** using multiple Claude Code agents (workers), each in its own tmux window
- **Monitor progress** via a live dashboard showing agent activity, logs, and status
- **Learn and improve** — the system remembers successful patterns and applies them to future sprints
- **Enforce boundaries** — each worker operates in a sandbox with declared file/directory access limits

Deckent consists of three key components:
- **Brain** — plans tasks, evaluates results, updates memory
- **Auditor** — monitors agents 24/7, detects issues, enforces scope boundaries
- **Workers** — execute tasks in parallel, each running a full plan→code→test→document cycle

### What Deckent is NOT

- **Not a replacement for Claude Code** — Deckent uses Claude Code as its execution engine
- **Not a CI/CD system** — Deckent is designed for interactive development sprints with human oversight (though CI/CD usage is possible with careful setup)
- **Not a build tool** — Deckent doesn't compile, test, or deploy code directly; it orchestrates AI agents that do
- **Not a git management tool** — Workers use git to track their changes, but Deckent doesn't manage branches or commits
- **Not fully autonomous** — You remain in control: you write DIRECTIVES.md, review results, and decide whether to proceed

### TL;DR

**Deckent = Human directives → AI planning → Parallel agent execution → Monitored progress → Learned patterns**

---

## 2. Which Claude plan do I need?

Deckent works with any Claude subscription, but the tier determines how many workers you can run in parallel and which models are available. As of Sprint 038, Claude is no longer the only option — you can also use Codex (OpenAI) or Gemini as your provider; see Q9 for details.

| Claude Plan | Max Workers | Brain Model | Worker Model | Cost | Best For |
|-------------|------------|-------------|--------------|------|----------|
| **Pro** ($20/mo) | 2 | Sonnet | Sonnet | Lowest cost | Small projects, hobby work |
| **Max 5x** ($100/mo) | 5 | Sonnet | Sonnet + Haiku | Moderate usage | Medium teams, active development |
| **Max 20x** ($200/mo) | 8 | Opus | Opus + Sonnet + Haiku | Highest cost, best quality | High-velocity teams, large codebases |
| **API Key** (pay-as-you-go) | 10 | Configurable | Configurable | Variable | Custom setups, budget-sensitive |

### Planning Modes

When you run `deckent init`, you choose a planning mode that affects model assignment:

- **AI Mode** — Brain uses AI to intelligently assign models based on task complexity (recommended)
- **Structured Mode** — Brain uses fixed rules (faster, more predictable)
- **Auto Mode** — Brain chooses based on workload (hybrid approach)

### Can I start with Pro and upgrade later?

Yes. You can run `deckent init --force-reconfigure` to update your plan tier without losing your project configuration.

### What if I run out of tokens?

If you exceed your monthly budget, you can:

1. Pause the current sprint: `deckent pause`
2. Review DIRECTIVES.md and reduce task scope
3. Resume: `deckent resume`

---

## 3. Why is tmux required?

Deckent spawns each worker as an independent **tmux window** within a session. Here's why:

### Architecture

```
deckent session (main tmux session)
├── pane 0: Brain + Auditor
├── pane 1: Worker #001
├── pane 2: Worker #002
└── pane 3: Worker #003
```

### Benefits

1. **Process Isolation** — Each worker runs in a separate shell session with its own environment and working directory
2. **Parallel Execution** — Multiple workers run simultaneously without blocking each other
3. **Live Monitoring** — You can attach to the session with `deckent attach` and see all agents working in real-time
4. **Independent Cleanup** — Killing a worker (via `deckent kill {id}`) doesn't affect others
5. **Session Persistence** — If your terminal closes, the tmux session continues running; reconnect with `deckent attach`

### Installation

- **macOS**: `brew install tmux`
- **Ubuntu/Debian**: `sudo apt install tmux`
- **Fedora**: `sudo dnf install tmux`
- **Arch**: `sudo pacman -S tmux`
- **Windows (WSL2)**: `sudo apt install tmux` (within WSL shell)

### Can I use tmux without X11?

Yes. Tmux is entirely terminal-based and works over SSH, in Docker, on headless servers, and anywhere you have a terminal.

---

## 4. How does the MCP server work?

Deckent provides an **MCP (Model Context Protocol) server** that integrates directly into Claude Code and other IDE plugins. MCP allows Claude to call Deckent tools and read Deckent resources as part of your conversation.

### Architecture

```
Claude Code (IDE) ─── MCP stdio transport ───> deckent-mcp server
                                                      ↓
                                          src/mcp/tools/ (16 tools)
                                          src/mcp/resources/ (9 resources)
                                                      ↓
                                          Deckent Core Engine
```

### How It Works

1. **You register the MCP server** with Claude Code:
   ```bash
   deckent init  # automatically adds to .claude/settings.json
   ```

2. **Claude Code loads the server** at startup and discovers available tools and resources

3. **You use Deckent tools naturally** in Claude Code:
   - `@deckent init` — Initialize a new Deckent project
   - `@deckent plan` — Show the current sprint plan
   - `@deckent status` — Check live sprint status
   - `@deckent start` — Launch a sprint
   - `@deckent doctor` — Health check

4. **You reference Deckent resources**:
   - `@deckent://directives` — Read/edit DIRECTIVES.md
   - `@deckent://dashboard` — See live sprint dashboard
   - `@deckent://memory` — Review learned patterns

### Tools vs. Resources

| Type | Purpose | Examples |
|------|---------|----------|
| **Tools** | Actions you take (like commands) | init, plan, start, status |
| **Resources** | Data you read/reference | directives, dashboard, memory |

### Benefits

- **Natural integration** — Call Deckent without leaving Claude Code
- **Context-aware** — Claude sees your DIRECTIVES.md and dashboard in the same conversation
- **No extra setup** — `deckent init` automatically configures everything
- **Works offline** — If your Deckent project is local, the MCP server communicates via stdio (no network required)

### Supported IDEs

- ✅ **Claude Code** (recommended, fully integrated)
- ✅ **VS Code** (via Cline or Continue plugins)
- ✅ **Cursor** (native MCP support)
- ⚠️ **Others** — Any IDE with MCP client support can integrate Deckent

---

## 5. How long does a sprint take?

A **sprint** is one complete cycle of task planning, parallel execution, evaluation, and learning. Sprint duration depends on several factors.

### Phases

Each sprint progresses through these phases (each phase can be monitored via `deckent status`):

| Phase | Duration | What Happens |
|-------|----------|--------------|
| **PLAN** | 5-30 seconds | Brain analyzes DIRECTIVES.md and creates task files |
| **SPAWN** | 5-10 seconds | Workers are launched in tmux windows |
| **EXECUTE** | Minutes to hours | Workers code, test, and document simultaneously |
| **EVALUATE** | 10-30 seconds | Brain reviews each worker's result (DONE / TECH_DEBT / NO_GO) |
| **RETRO** | 5-10 seconds | System updates MEMORY.md and DEBT.md with learnings |
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
2. **Number of tasks** — More tasks = longer EXECUTE phase (but parallelization helps)
3. **Worker count** — More workers speed up execution (limited by your Claude plan)
4. **Model choice** — Opus is slower but more accurate; Sonnet/Haiku are faster but less capable
5. **Code size** — Larger codebases take longer to read/understand

### Can I interrupt a sprint?

Yes, with caveats:

```bash
deckent pause       # Pause the current sprint (workers continue briefly)
deckent kill {id}   # Kill a specific worker immediately
deckent cleanup     # End the sprint and clean up (archive files)
```

**Warning:** Pausing is safe; killing workers mid-task may leave partial changes. Always review `git diff` after an abrupt halt.

---

## 6. How do I write a plugin?

Plugins extend Deckent with custom skills, automated hooks, and reusable agent behaviors.

### Plugin Structure

```
.deckent/plugins/
  my-plugin/
    manifest.json      ← Required: metadata and config
    SKILL.md           ← Required: agent instructions
    README.md          ← Optional: user documentation
```

### Step 1: Create the manifest.json

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "A custom plugin for my team",
  "author": "Your Name",
  "enabled": true,
  "model": "sonnet",
  "permissions": {
    "filesRead": ["src/**", "docs/**"],
    "filesWrite": ["src/**", "docs/**"]
  },
  "hooks": {
    "beforeSprint": true,
    "afterSprint": true,
    "beforeTask": false
  }
}
```

### Step 2: Write SKILL.md

SKILL.md contains agent instructions that workers will follow when your plugin is enabled.

```markdown
# My Plugin — Skill Definition

## Purpose
This plugin ensures all code includes proper error handling.

## Behavior
Before writing code:
1. Review the task scope
2. Identify all error-prone operations (API calls, file I/O, etc.)
3. Add try-catch blocks with meaningful error messages
4. Test error cases

## Examples
✓ Wrap fetch() in try-catch
✓ Check file existence before read
✓ Validate user input before processing
```

### Step 3: Install the plugin

```bash
deckent plugin install ./my-plugin
# or
deckent plugin install path/to/my-plugin
```

### Step 4: Verify

```bash
deckent plugin list
# Output:
# ✓ my-plugin (v1.0.0, enabled, sonnet)
```

### Hook System

Plugins can trigger behavior at key points in the sprint:

| Hook | When | Use Case |
|------|------|----------|
| `beforeSprint` | Before planning starts | Setup environment, validate config |
| `afterSprint` | After sprint completes | Run additional tests, publish results |
| `beforeTask` | Before each task starts | Set environment variables, lock resources |
| `afterTask` | After each task completes | Archive artifacts, notify team |

When a hook is `true`, the Brain will pass the plugin's SKILL.md to every worker in that phase.

### Publishing a Plugin

To share your plugin with others:

1. Create a git repository: `my-deckent-plugin`
2. Push to GitHub (or another public repo)
3. Document in README.md
4. Others install with: `deckent plugin install {repo-url}`

---

## 7. Can I manage multiple projects with Deckent?

Yes, but with important caveats.

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
- `.deckent/` directory
- DIRECTIVES.md
- tmux session (named after the project)
- config and memory

### Limitations

⚠️ **Sequential execution only** — Each `deckent start` blocks until the sprint completes. To run sprints in parallel, you must use separate machines or manually manage tmux sessions.

⚠️ **Shared Claude account** — Token usage is shared across all projects on your account. If project-a exhausts your monthly budget, project-b will be blocked.

⚠️ **No cross-project communication** — Workers in project-a cannot see or modify project-b's code.

### Recommended Approach

For teams managing multiple projects:

1. **Global config** — `deckent onboard` sets up your default Claude plan, model preferences, and team settings once
2. **Project-local config** — Each project has its own `.deckent/config.json` with project-specific settings
3. **Coordination** — Document which projects are in active sprints to avoid quota contention

### Example Team Setup

```
Team Account (Claude Max 20x, $200/mo)
├── Project A (backend service) — Sprint scheduled Mondays
├── Project B (frontend app) — Sprint scheduled Tuesdays
├── Project C (DevOps) — Sprint scheduled Wednesdays
└── Shared global config (model preferences, team rules)
```

---

## 8. Can I use Deckent in CI/CD?

**Short answer:** Deckent can be used in CI/CD, but it's not designed as a primary build tool. It's designed for interactive development sprints.

### Supported Scenarios

#### ✅ DO: Pre-deployment verification

```bash
# In CI pipeline, before releasing
deckent doctor  # Health check
deckent test    # Run all tests
git diff        # Verify no unexpected changes
```

#### ✅ DO: Automated fixes in a gated step

```bash
# Gate: Run Deckent to fix linting/formatting issues
# Only merge if `deckent start` completes with all tasks DONE
```

#### ✅ DO: Documentation generation

```bash
# Use Deckent to generate/update docs before release
deckent start  # Tasks may include doc generation
git commit -am "Auto-generated docs"
```

### NOT Recommended

#### ❌ DON'T: Run long, unattended sprints on CI servers

- tmux sessions may timeout
- Workers need Claude Code CLI, which expects a terminal
- No human oversight to handle NO_GO results

#### ❌ DON'T: Use as your primary test runner

- Too heavy (spawns agents, monitors, spawns workers)
- For testing, just use `npx vitest run` directly
- Deckent is better for development tasks than testing

#### ❌ DON'T: Expect automated DIRECTIVES.md generation

- CI jobs can update DIRECTIVES.md, but this defeats the purpose
- DIRECTIVES.md should be human-written and intentional

### Example CI/CD Integration

```yaml
# .github/workflows/gated-development.yml
name: Gated Development Sprint
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  deckent-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "22"

      - name: Install tmux
        run: sudo apt install -y tmux

      - name: Install Deckent
        run: npm install -g deckent

      - name: Health check
        run: deckent doctor

      - name: Lint test
        run: npm run lint

      - name: Unit tests
        run: npm test

      - name: Comment PR
        run: echo "✅ All checks passed"
```

### Key Constraints

1. **CI/CD must have Node.js, git, and tmux**
2. **Claude Code CLI must be available** (usually via `npm install -g @anthropic-ai/claude-code`)
3. **Claude API key or Pro/Max plan** must be configured (via env vars or global config)
4. **Sprints must be short** (30 min – 1 hour max; long sprints will timeout)
5. **DIRECTIVES.md must be static** (pre-written by humans, not generated by CI)
6. **Workers should be limited** (2-3 at most, to avoid quota issues)

---

## 9. Can I use Deckent with OpenAI/Codex or Gemini?

Yes. Sprint 038 added multi-provider support. You can configure which provider Brain and workers use via `.deckent/config.json`:

```json
{
  "brain_provider": "claude",
  "worker_provider": "codex"
}
```

### Supported Providers

| Provider | Key | Models |
|----------|-----|--------|
| `claude` | (Claude subscription or API key) | opus, sonnet, haiku |
| `codex` | `OPENAI_API_KEY` | gpt-4.1, gpt-4o, gpt-4o-mini |
| `gemini` | `GOOGLE_API_KEY` | gemini-2.5-pro, gemini-2.0-flash |

### Setup

- **Codex (OpenAI):** Set `OPENAI_API_KEY` in your environment before running `deckent start`.
- **Gemini:** Set `GOOGLE_API_KEY` in your environment before running `deckent start`.
- **Mixed:** You can use different providers for Brain and workers — e.g., Claude for Brain (planning) and Codex for workers (execution).

---

## 10. What happens if my primary provider is unavailable?

Deckent has a fallback chain. If your primary provider fails (e.g., API outage, quota exhaustion), tasks are automatically rerouted to your configured fallback provider.

### Configuration

```json
{
  "brain_provider": "claude",
  "worker_provider": "claude",
  "fallback_provider": "codex"
}
```

### Fallback Model Mapping

When falling back, Deckent maps equivalent model tiers across providers:

| Primary Model | Fallback (Codex) | Fallback (Gemini) |
|---------------|------------------|-------------------|
| opus | gpt-4.1 | gemini-2.5-pro |
| sonnet | gpt-4o | gemini-2.0-flash |
| haiku | gpt-4o-mini | gemini-2.0-flash-lite |

### Behavior

- Fallback is transparent — task files and results use the same format regardless of provider.
- If no fallback is configured, Deckent pauses the sprint and surfaces an error via `deckent status`.
- Fallback events are logged in `.brain/RETRO.md` for review after the sprint.

---

## Still Have Questions?

For detailed guides, see:
- [Quickstart](./quickstart.md) — 5-minute setup tutorial
- [Core Concepts](./concepts.md) — How Brain, Workers, and Auditor work together
- [MCP Guide](../reference/mcp-guide.md) — MCP integration details
- [Multi-Provider Guide](../reference/multi-provider.md) — Using Claude, Codex, and Gemini
- [Migration Guide](../reference/migration-guide.md) — Version upgrade paths

Or ask in the [GitHub Discussions](https://github.com/anthropics/deckent/discussions).
