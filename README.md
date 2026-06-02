<p align="center">
  <img src="docs/assets/logo.png" width="140" alt="Deckent — circuit kraken emblem" />
</p>

# deckent

**AI Agent Orchestration That Actually Ships.**

<!-- AUTOGEN:START id="badges" -->
[![npm version](https://img.shields.io/npm/v/deckent.svg)](https://www.npmjs.com/package/deckent) [![tests](https://img.shields.io/badge/tests-18666%2B-brightgreen)](https://github.com/VerhexIO/deckent) [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![sprints](https://img.shields.io/badge/sprints-214%2B-teal)](https://github.com/VerhexIO/deckent) [![version](https://img.shields.io/badge/version-v1.0.0--beta.1-orange)](https://github.com/VerhexIO/deckent) [![CI](https://img.shields.io/github/actions/workflow/status/VerhexIO/deckent/ci.yml?label=ci)](https://github.com/VerhexIO/deckent/actions)
<!-- AUTOGEN:END id="badges" -->

Deckent is an open-source AI agent orchestration CLI that turns your goals into working software. Write what you want in `DIRECTIVES.md`, and Deckent plans tasks, spawns parallel AI workers, enforces quality gates, and delivers results — with full audit trail and cross-sprint memory.

<!-- ![demo](docs/assets/demo.gif) -->

---

## Trinity: Three Faces of Deckent

Deckent serves three distinct roles depending on how you engage with it:

| Face | Description | Entry Point |
|------|-------------|-------------|
| **AI Assistant** | Conversational interface — chat naturally, ask questions, brainstorm, or trigger tasks via `deckent chat` | `deckent chat` |
| **AI System Worker** | Autonomous multi-agent engine — plan, spawn, execute, evaluate, retry; delivers results while you focus on what matters | `deckent start` |
| **Developer Platform** | Extensible orchestration foundation — custom agents, skills, providers, MCP integration, and OSS community | `deckent init` |

These three faces are not separate modes — they work together. Chat to plan, start to execute, extend to grow.

## Status

- Version: 1.0.0-beta.1 (June 2026 OSS GA)
- **Provider-agnostic by design** — bring any LLM: cloud subscriptions (Claude / OpenAI Codex / Google Gemini), OpenAI-compatible APIs (DeepSeek / Qwen / GLM), or fully-local **Ollama** with zero API key. No provider is privileged; pick yours in config or per task. Cursor planned post-GA.
- Auth: Subscription default, per-task `- Auth: api` opt-in. (During beta, subscription mode is recommended; API tiers vary by provider.)
- Security posture: Role boundaries are **advisory** in V1.0 — scope violations are detected and logged by the Auditor but not blocked at the OS/filesystem level. Hard runtime enforcement ships in V2 post-GA. See `SECURITY.md` for the full threat model.

---

## Why Deckent

**Devin, Cursor, and Aider are powerful tools — but they solve different problems.** Devin automates individual coding tasks well, but lacks structured quality gates and cross-sprint learning. Cursor and GitHub Copilot excel at in-editor suggestions but do not orchestrate multi-file, multi-step projects with parallel workers and verification loops. Aider is a capable pair-programmer but runs single-threaded with no sprint lifecycle or memory.

**Deckent takes a different position.** It runs a full 8-phase sprint lifecycle (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP) across up to 10 parallel AI workers. Every task has defined scope, GO/NO-GO criteria, and an Auditor monitoring boundary violations in real time. When a task fails, the FIX phase retries with context from failure. When the sprint ends, learnings are persisted to SQLite memory — and recalled automatically in the next sprint.

**The result is a system that compounds.** Each sprint builds on the last. Architecture decisions (ADRs) are enforced. Agent performance is tracked and evolves. Technical debt is logged and surfaced. Deckent is not just a coding assistant — it is a disciplined AI development team that grows smarter over time.

---

## Quick Start

Get your first sprint running in 5 minutes:

```bash
# Install (or use npx — no global install required)
npm install -g deckent

# Initialize your project
cd my-project
deckent init

# Option A: Chat interface (conversational)
deckent chat

# Option B: Sprint interface (structured)
deckent set-directives   # describe your goals
deckent start            # plan + spawn + execute
deckent status           # watch progress live
```

After `deckent init`, edit `DIRECTIVES.md` with your sprint goals. Deckent handles the rest.

---

## How It Works

### Sprint Mode (structured multi-agent)

```
              DIRECTIVES.md (your goals)
                       |
                [ Brain: Plan ]
               /      |      \
         Worker1   Worker2   Worker3   (parallel, scoped)
               \      |      /
               [ Brain: Evaluate ]
                       |
             GO / NO-GO / TECH_DEBT
```

1. **Describe** — Write goals in `DIRECTIVES.md`
2. **Plan** — Brain reads goals, creates scoped prioritized tasks
3. **Execute** — Parallel AI workers build, test, and report results
4. **Evaluate** — Every task gets GO / NO-GO / TECH_DEBT verdict

### Task Mode (one-shot)

```
  User Input → [ Task Runner ] → Worker → Result
```

Single-task execution for quick commands, reminders, and life-assistant use cases. No PLAN/SPAWN phases needed.

---

## Architecture

```
+------------------------------------------------------------------+
|                         deckent CLI                              |
+------------------------------------------------------------------+
|                                                                  |
|   +----------+     +----------+     +----------+                |
|   |  Brain   |---->| Worker 1 |     | Auditor  |                |
|   | (plans,  |---->| Worker 2 |     | (scans,  |                |
|   | evaluates|---->| Worker N |     |  alerts) |                |
|   +----------+     +----------+     +----------+                |
|        |                                   |                    |
|   .brain/            .tasks/          .dashboard                |
|   (memory DB,        (task JSON,      (live status)             |
|    ADRs, patterns)    results, hb)                              |
+------------------------------------------------------------------+
|         Nervous System — Proactive Meta-Orchestrator             |
+------------------------------------------------------------------+
```

Four core modules — each documented separately:

- **[Brain](docs/architecture/brain.md)** — Plans tasks, assigns models, evaluates results, learns across sprints via SQLite memory
- **[Workers](docs/architecture/workers.md)** — Execute tasks in parallel (tmux, subprocess, or Docker), each with plan-code-test-report cycle
- **[Auditor](docs/architecture/auditor.md)** — Monitors heartbeats, detects boundary violations, enforces quality gates
- **[Memory V2](docs/architecture/memory.md)** — SQLite + FTS5, dual-layer i18n normalize, 96% context reduction, `deckent recall "<query>"` instant search

---

## Key Features

### Core Orchestration
- **Sprint Lifecycle** — 8-phase structured cycle: PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, CLEANUP
- **Multi-Worker Parallel Execution** — Up to 10 AI workers simultaneously, each in isolated scope
- **GO / NO-GO Evaluation** — Every task result evaluated against defined criteria; NO-GO tasks logged and optionally retried in FIX phase
- **Auditor Quality Gate** — Stale heartbeat detection, boundary violation scanning, deadlock detection via Kahn's algorithm
- **Dual Mode** — `sprint` (developer orchestration) or `task` (one-shot life assistant), switchable with `deckent mode`

### Intelligence & Memory
- **Memory V2 DB-First** — SQLite + FTS5 full-text search, dual-layer Turkish/English normalization, 96% context reduction vs raw markdown
- **Brain Auto-Query** — Task DNA → relevant ADRs/patterns/learnings auto-queried at PLAN, SPAWN, EVALUATE phases
- **Nervous System** — Proactive meta-orchestrator (ADR-040): idle detection, routing anomaly alerts, agent health monitoring
- **Multi-Provider Support** — Claude, OpenAI Codex, Google Gemini — 13 models across 4 tiers

### Security & Safety
- **AST Sandbox** — All skills validated via AST before execution; no arbitrary code injection
- **Scope Enforcement** — Workers may only touch files in their assigned `scope.filesWrite` — Auditor enforces via `git diff --stat`
- **RBAC Protocol** — ADR-037 Brain-Auditor-Worker authority matrix with audit trail
- **`.deck` Secret Interpolation** — Reference secrets as `$DECK:MY_TOKEN`; never committed to git

### Agents & Skills
- **15 Built-in Agents** — security-auditor, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, and 6 more
- **21 Built-in Skills** — typescript-expert, testing-expert, react-specialist, security-specialist, docker-expert, and 16 more
- **Agent Evolution Pipeline** — Temp agents promoted to permanent based on performance; demoted on failure

---

## OSS Principles

**"Open source for open world."** One MIT product — from a solo developer on a laptop to a 10,000-person enterprise. The full power of multi-agent orchestration, given to everyone; **no separate "Enterprise Edition", no gated features** (ADR-033). Built on four immovable principles:

1. **Open Source First** — MIT license, public repo, community-driven. Nothing locked behind a paywall — ever.
2. **Discipline Over Convenience** — Quality gates, scope enforcement, and audit trails exist for a reason. Deckent will not skip them.
3. **Provider-Agnostic, Not Locked In** — Any LLM: Claude, OpenAI Codex, Google Gemini, OpenAI-compatible APIs (DeepSeek/Qwen/GLM), or fully-local Ollama. No provider is privileged.
4. **Memory Compounds** — Every sprint makes the system smarter. Learnings are persisted, recalled, and enforced in future sprints.

> We compare with peers (Devin, Cursor, Claude Code, Aider, Cowork) on capability — we never position as "anti" anyone.

---

## Requirements

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | >= 24 | `node --version` |
| git | any | `git --version` |
| **At least one provider** | any | a subscription CLI (`claude` / `codex` / `gemini`), an OpenAI-compatible API key (DeepSeek/Qwen/GLM), **or** local `ollama` |
| tmux | any (optional, Linux/macOS) | `tmux -V` |
| Docker | any (optional, isolated workers) | `docker --version` |

**Any provider works — none is required over the others.** All three subscription CLIs run as first-class peers: `claude` (Anthropic), `codex` (OpenAI), and `gemini` (Google). **If you have a provider's CLI installed and signed in, Deckent drives its workers using your existing subscription — no per-token API key, no extra cost.** That is the core of Deckent's provider-free DNA: your `claude` / `codex` / `gemini` subscription (or local Ollama, zero key) powers the orchestrator. You can also use OpenAI-compatible API keys (DeepSeek/Qwen/GLM) when you prefer. `deckent init` auto-detects your stack + available provider CLIs and, with your consent, helps install missing ones.

> **Provider freedom, concretely:** have `claude`, `codex`, and `gemini` CLIs all installed → Deckent can run a mixed-provider fleet (e.g. Claude brain + Codex/Gemini workers) entirely on subscriptions, no API billing. Or go fully local with Ollama. You are never locked to one vendor or forced onto pay-per-token.

---

## Installation

```bash
# Recommended — no global install required
npx deckent@latest init

# Or install globally
npm install -g deckent && deckent init

# Verify
deckent --version    # 1.0.0-beta.1
deckent doctor       # pre-flight health check
deckent web          # web dashboard at http://localhost:3100
```

---

## CLI Usage

### Initialize a Project

```bash
cd my-project
deckent init
```

### Start a Sprint

```bash
# Edit DIRECTIVES.md with your goals, then:
deckent start

# Preview plan without executing:
deckent start --dry-run
```

### Check Status

```bash
deckent status           # Live sprint status
deckent status --watch   # Auto-refresh every 2s
deckent doctor           # System health check
```

### Query Memory

```bash
deckent recall "docker heartbeat"       # Cross-source FTS5 search
deckent recall "ADR-037 RBAC"           # Find architecture decisions
deckent remember "Deploy freeze until Friday"  # Save a note
```

### All Commands

See `deckent help` for the full command reference, or read [docs/reference/cli.md](docs/reference/cli.md).

---

## MCP Integration

Deckent ships an MCP server, so **any MCP-compatible AI tool** (Claude Code, Cursor, and others) can drive it:

```bash
# Example (Claude Code) — any MCP client works the same way
claude mcp add deckent -- npx deckent-mcp
```

32 MCP tools + 8 MCP resources. Run `deckent help-info` for the full list, or see [docs/reference/mcp-guide.md](docs/reference/mcp-guide.md).

---

## Configuration

Configuration lives in `.deckent/config.json` (project) and `~/.deckent/config.json` (global).

| Option | Default | Description |
|--------|---------|-------------|
| `deckent_style` | `"sprint"` | Runtime mode: `sprint` or `task` |
| `brain_provider` | `"claude"` | Provider for Brain |
| `worker_provider` | `"claude"` | Provider for workers |
| `spawn_backend` | `"tmux"` | Worker backend: `tmux`, `subprocess`, `docker` |
| `sprint_timeout_minutes` | `60` | Hard sprint timeout; `0` = unlimited |

See [docs/reference/config-reference.md](docs/reference/config-reference.md) for the full reference.

---

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing guide, code standards, and PR process.

---

## Documentation

- [Getting Started](docs/guide/getting-started.md)
- [First Sprint](docs/guide/first-sprint.md)
- [Chat Mode](docs/guide/chat-mode.md)
- [Cookbook — Add a REST API](docs/cookbook/add-rest-api.md)
- [Cookbook — Fix a Bug](docs/cookbook/fix-bug.md)
- [API Reference](docs/reference/api.md)
- [Configuration Reference](docs/reference/config-reference.md)
- [Multi-Provider Guide](docs/reference/multi-provider.md)
- [MCP Guide](docs/reference/mcp-guide.md)
- [Architecture Overview](docs/architecture/architecture.md)
- [Sprint Lifecycle](docs/architecture/sprint-lifecycle.md)
- [Docker Backend](docs/guide/docker-backend.md)
- [Troubleshooting](docs/development/troubleshooting.md)

---

## License

MIT — [Alperen @ Verhex](https://deckent.agency)

**GitHub:** [github.com/VerhexIO/deckent](https://github.com/VerhexIO/deckent)
**Website:** [deckent.agency](https://deckent.agency)
**Turkish README:** [README-TR.md](README-TR.md)
