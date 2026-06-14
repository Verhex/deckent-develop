# Deckent v1.0.0-beta.1 — Release Notes

**Release Date:** 2026-05-01
**Status:** Public Beta
**Node.js Requirement:** >= 24.0.0

---

## What's New

Deckent is an AI agent orchestration CLI that coordinates multiple AI agents (Claude, Codex, Gemini, Ollama) to execute software engineering tasks in parallel. v1.0.0-beta.1 marks the first public beta after 200+ development sprints, bringing enterprise-grade orchestration, Memory V2 DB-first architecture, the Nervous System meta-orchestrator, and the Autonomous engine to the wider community.

---

## Core Capabilities

### Orchestration Engine
- **Brain Orchestrator:** 8-phase sprint lifecycle (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP)
- **Dependency-Pipeline Waves:** Kahn's topological sort — tasks run in dependency-aware parallel waves
- **GO/NO-GO Evaluation:** Every result scored across correctness, coverage, scope compliance, and documentation
- **Quality Assessor:** Multi-dimensional rubric scoring per task
- **FIX Phase:** Failed tasks automatically retried with enriched context

### Multi-Provider Fleet
- **4 Providers:** Claude (Docker/tmux/subprocess), OpenAI Codex, Google Gemini, Ollama (local)
- **13 Models / 4 Tiers:** premium_plus → premium → standard → economy — single `ModelRegistry` source of truth
- **Provider-Agnostic Config:** `brain_tier` / `worker_tier` instead of model names
- **Mixed-Fleet Sprints:** Per-task provider override — some tasks on Claude, others on Gemini in the same sprint
- **OpenAI-Compatible HTTP Adapter:** Any OpenAI-compatible endpoint as a provider

### Memory V2 — DB-First Architecture
- **SQLite FTS5:** Single source of truth for all brain knowledge (ADRs, patterns, learnings, debt)
- **Dual-Layer i18n Search:** Turkish normalize (TR/EN/DE — 100% recall) via `deckent recall "query"`
- **96% Context Reduction:** From flat Markdown files to compact DB-driven exports
- **Auto-Query:** Task DNA → relevant ADRs and past learnings automatically injected at PLAN/SPAWN/EVALUATE

### Nervous System (ADR-040)
- **Proactive Meta-Orchestrator:** 12 detectors observe sprint state and surface proposals
- **Authority Matrix:** Safety floor — 5 locked actions require explicit human consent
- **Decision Engine:** Proposals ranked by risk, confidence, and authority level
- **MCP Integration:** `deckent_nervous_subscribe/accept/reject/status/config` tools

### Autonomous Engine
- **Backlog Types:** `task | sprint | capability` entries with `pending/running/parked/done/failed` lifecycle
- **Trigger Modes:** `recurring` (cron), `one-off`, `reactive` (detector-driven)
- **3-Gate Governance:** RBAC → policy → risk assessment before dispatch
- **CLI:** `deckent autonomous status/stop/backlog add`

### Agent & Skill System
- **15 Built-in Agents:** security-auditor, doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist
- **21 Built-in Skills:** typescript-expert, testing-expert, documentation-writer, security-specialist, performance-optimizer, api-builder, devops-engineer, database-migration, react-specialist, python-expert, ci-testing, accessibility-expert, anthropic-sdk, code-simplifier, docker-expert, frontend-design, git-expert, graphql-expert, migration-expert, monorepo-expert, system-architect
- **Evolution Pipeline:** Agent/skill promote/demote based on outcome tracking and synergy matrix

### Docker Backend (Default)
- **Container Isolation:** Each worker runs in its own Docker container
- **Graceful Shutdown:** SIGTERM + fsync handler, 15s grace period
- **Atomic Heartbeat Writes:** `atomicWriteFileSync` prevents partial HB corruption
- **Configurable:** `spawn_backend: docker | tmux | subprocess` per worker or globally

### MCP Integration — 34 Tools / 8 Resources
Full Claude Code / Cursor integration via MCP server (`npx deckent-mcp`):
- Sprint lifecycle: `deckent_init`, `deckent_plan`, `deckent_start`, `deckent_status`, `deckent_review`, `deckent_retro`, `deckent_cleanup`
- Memory: `deckent_memory_query` — cross-source FTS5 search
- Nervous System: `deckent_nervous_subscribe/accept/reject/status/config`
- Autonomous: `deckent_autonomous` (status/stop/backlog)
- Utilities: `deckent_doctor`, `deckent_history`, `deckent_checkpoint`, `deckent_recover`, `deckent_models`, `deckent_watch`

### Web Dashboard — 16 Pages
React + Vite + Tailwind dashboard at `deckent serve`:
Dashboard, Chat, Config, Debt, Directives, Enterprise, Evolution, History, Memory, MemoryExplorer, Nervous, Settings, Status, Workers, Login, Callback

### Native REPL (Experimental)
- Argless `deckent` launches an Ink-based interactive REPL
- Agentic tool-use via `<deckent_tool>` protocol
- Approval modes: suggest / auto-edit / full-auto
- Native-agent mode is flag-gated (`DECKENT_NATIVE_AGENT=1` or `--native`), default OFF

### CLI — 55+ Commands
```bash
deckent init          # Initialize project
deckent plan          # Plan sprint (ai|structured|auto)
deckent start         # Execute sprint
deckent status        # Live status (--watch)
deckent review        # GO/NO-GO evaluation
deckent retro         # Retrospective
deckent recall "q"    # Memory FTS5 search
deckent remember "n"  # Save a memory entry
deckent autonomous    # Autonomous engine management
deckent serve         # Web dashboard + API server
deckent doctor        # System health check
deckent checkpoint    # Approve/reject a checkpoint
deckent recover       # Recover a stuck sprint
```

---

## Key Metrics

| Metric | Value |
|--------|-------|
| Version | 1.0.0-beta.1 |
| Sprints (dogfood) | 285+ |
| Tests | 20,668+ |
| Coverage | 88.58% |
| CLI Commands | 55+ |
| MCP Tools | 34 |
| MCP Resources | 8 |
| Built-in Agents | 15 |
| Built-in Skills | 21 |
| Dashboard Pages | 16 |
| Providers | 4 (Claude, Codex, Gemini, Ollama) |
| Models | 13 across 4 tiers |
| Spawn Backends | 3 (Docker default, tmux, subprocess) |
| Platforms | macOS, Linux, WSL2 |

---

## Getting Started

### Prerequisites
- Node.js >= 24.0.0
- git
- At least one AI provider:
  - **Claude:** `claude` CLI installed and authenticated (Docker backend recommended)
  - **Codex:** `OPENAI_API_KEY` environment variable
  - **Gemini:** `GOOGLE_API_KEY` environment variable
  - **Ollama:** Ollama running locally (REPL/chat; sprint-worker support is partial)

### Install
```bash
npm install -g deckent
```

### Quick Start
```bash
# Initialize a new project
deckent init

# Check system health
deckent doctor

# Set sprint goals
deckent set-directives

# Plan the sprint
deckent plan --mode auto

# Execute the sprint
deckent start

# Watch progress in real-time
deckent status --watch

# Review results
deckent review

# Read the retrospective
deckent retro
```

### MCP Integration
Register as an MCP server and use Deckent from Claude Code or Cursor:
```bash
claude mcp add deckent -- npx deckent-mcp
```

---

## Notable Improvements Since Beta Start

- **Memory V2:** SQLite FTS5 replaces flat Markdown — 96% context reduction, instant semantic search
- **Dependency-Pipeline Waves:** Kahn's topological sort enables true parallel wave execution
- **Nervous System:** 12-detector proactive meta-orchestrator with authority matrix
- **Autonomous Engine:** Cron/one-off/reactive backlog with 3-gate governance
- **ADR Governance:** 89 accepted ADRs, mandatory constraint enforcement in all agents
- **Evolution Pipeline:** Agent/skill performance tracking → promote/demote → adaptive routing
- **Docker Backend:** Default spawn backend with full isolation and graceful shutdown
- **RBAC V1.0 (ADR-037):** Brain-Auditor-Worker authority matrix, advisory enforcement
- **Brain Self-Update (ADR-046):** Brain updates its own rules from sprint outcomes
- **Worker Prompt God-Level:** Full ADR injection, Karpathy 4-discipline anchor, idempotency keys
- **Disk-Verify Gate:** 7 synthetic NO_GO source paths now verify disk evidence before flagging
- **Embedded Web Terminal (ADR-062):** VSCode-style PTY terminal panel in dashboard

---

## Known Limitations

### Provider Support
- **Ollama:** Works for REPL/chat; sprint-worker path is partial (stub-level).
- **Docker backend:** Claude-only by design. Codex/Gemini use tmux/subprocess backends.
- **Provider fallback:** Single retry — no exponential backoff.

### RBAC
- **ADR-037 V1.0 Layer-2:** Runtime scope enforcement is **advisory/soft** — violations are warned and emitted but do not hard-block. Hard enforcement planned post-GA V2.

### Native REPL
- **Experimental:** Native-agent mode (`DECKENT_NATIVE_AGENT=1`) is opt-in and not yet default. Standard REPL is stable.

### Platform
- **Windows:** Not supported natively. Use WSL2.

---

## Upgrade

```bash
npm install -g deckent@latest
deckent doctor
```

---

*See [CHANGELOG.md](../../CHANGELOG.md) for the full change history.*
*See [deckent.ai](https://deckent.ai) for documentation.*
