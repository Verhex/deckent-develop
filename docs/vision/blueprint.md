# DECKENT MASTER BLUEPRINT
## AI Agent Orchestration System — Complete Implementation Reference
### Version 3.1 — May 2026 — Verhex (Updated Sprint 166)

---

## Live Metrics
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-196 |
| Toplam Task | 11 |
| Tamamlanan | 6 |
| Tech Debt | 0 |
| No-Go | 5 |
| Süre | 41dk 13sn |
| Coverage | N/A |

# TABLE OF CONTENTS

1. Product Identity & Vision
2. Architecture Overview
3. Native CLI & Installation
4. Workspace Structure
5. Agent System (Brain, Auditor, Worker)
6. Memory Architecture (DB-First — Memory V2)
7. Sprint Lifecycle & Orchestration
8. GO / NO-GO / Tech Debt Protocol
9. Usage-Aware Planning
10. Dynamic Terminal Management (tmux)
11. Plugin & Skill System
12. UI Roadmap (Terminal → Web → VSCode)
13. Multi-Plan Compatibility
14. i18n & Multi-Language
15. Security & Permissions (RBAC Authority Matrix)
16. Self-Test & Reporting
17. Repository Strategy
18. File-by-File Reference
19. Implementation History
20. Claude Code Integration Guide
21. MCP Server Architecture
22. User Flows
23. Strategic Roadmap
24. Sprint History
25. Beta GA Gate Criteria (Slipped — Sprint 165 T3+T5 target)

---

# 1. PRODUCT IDENTITY & VISION

**Name:** Deckent (Deck + Agent)
**Domain:** deckent.ai
**Tagline:** "Your AI development team, orchestrated."
**Author:** Alperen @ Verhex

**What Deckent Is:**
An agent-agnostic AI orchestration system. You describe goals in natural language — through Claude Code conversation or DIRECTIVES.md. Deckent plans, assigns, monitors, and completes development work using multiple AI agents running in parallel. The system learns from every sprint and improves over time.

**What Deckent Is NOT:**
- Not another ChatGPT wrapper
- Not a simple task runner
- Not limited to Claude (multi-provider: Claude, OpenAI Codex, Gemini via provider adapters)

**Core Principles:**
1. Native-first — installs like a CLI tool, integrates via MCP into Claude Code
2. Self-evolving — learns from mistakes, improves plans, adapts patterns
3. Observable — every agent's action is visible in real-time
4. Usage-aware — never exceeds plan limits, never leaves sprints incomplete
5. Plan-compatible — works on Pro ($20), Max ($100-200), or API
6. Zero-friction — natural language in, orchestrated sprint out
7. Open source — community-driven, extensible via plugins/skills

**USP (Unique Selling Point):**
Sprint + learning loop. Deckent doesn't just execute tasks — it plans sprints, evaluates results with GO/NO-GO protocol, tracks tech debt, runs retrospectives, and feeds learnings into the next sprint. Every sprint makes the system smarter.

**Phased Roadmap:**
| Phase | Focus | Target Audience | Sprint Range |
|-------|-------|-----------------|--------------|
| 1 | Claude native (CLI + MCP) | Solo developers | Sprint 1-8 |
| 2 | Provider abstraction layer | Early adopters | Sprint 9-12 |
| 3 | Multi-provider (OpenAI, Gemini) | Small teams | Sprint 13+ |
| 4 | Platform (Web UI, VSCode, API) | Enterprise | Sprint 20+ |

**Inspiration Sources:**
- OpenClaw: workspace structure, memory tiers, skill system, AGENTS.md pattern
- Claude Cowork: agentic loop, plan→execute→verify, plugin architecture
- Claude Code: CLAUDE.md, .claude/rules/, headless mode, MCP, Agent Teams
- Claude Managed Agents (CMA): rubric-based grading, versioned memory stores, agent versioning, managed environments, multi-SDK

---

# 2. ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────────────────┐
│               YOU (Natural Language)                  │
│     Claude Code conversation / DIRECTIVES.md         │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
┌──────────▼──────────┐  ┌───────────▼───────────────┐
│    CLAUDE CODE       │  │      DECKENT CLI           │
│  (MCP client)        │  │  `deckent start/plan/web`  │
└──────────┬──────────┘  └───────────┬───────────────┘
           │                          │
┌──────────▼──────────────────────────▼──────────────┐
│              DECKENT MCP SERVER (stdio)              │
│  31 Tools + 8 Resources                             │
│  init | set_directives | plan | start | analyze ... │
│  audit | recover | feature_query | watch | nervous_*│
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                 CORE ENGINE                           │
│  brain.ts | planner.ts | auditor.ts | worker.ts     │
│  analyzer.ts | tmux.ts | server.ts (HTTP API)       │
└──────────┬───────────────────────────┬──────────────┘
           │                           │
┌──────────▼──────────┐  ┌────────────▼──────────────┐
│   BRAIN + PLANNER    │  │        AUDITOR             │
│  Plans (AI/struct),  │  │  In-process scan loop      │
│  evaluates, learns   │  │  within Brain's runSprint  │
│  Model: opus/sonnet  │  │  (30s cycle, no tmux)      │
└──────────┬──────────┘  └────────────┬──────────────┘
           │                           │
┌──────────▼──────────────────────────▼──────────────┐
│              WORKER POOL (dynamic)                   │
│  tmux windows — spawned/killed by Brain on demand   │
│  Each worker: plan → code → test → doc → report     │
│  Model: per-task (opus/sonnet/haiku)                │
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│          MEMORY V2 — DB-FIRST (.brain/)              │
│  SQLite (memory.db) — single source of truth        │
│  FTS5 full-text search (dual-layer TR/EN normalize) │
│  9 entry types: ADR, memory, sprint, debt, pattern, │
│                 retro, error, identity, audit        │
│  Auto-export: .brain/exports/ (summary, decisions)  │
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│          HTTP API + WEB DASHBOARD                    │
│  src/api/server.ts — 16 endpoints + SSE             │
│  src/dashboard/ — React+Vite+Tailwind (7 pages)     │
│  `deckent web` → localhost:3100                     │
└─────────────────────────────────────────────────────┘
```

**Provider Abstraction Layer (Implemented — Sprint 27+38):**
```
┌─────────────────────────────────────────────────────────┐
│              PROVIDER ADAPTER INTERFACE                    │
│  spawn(opts) | checkUsage() | isAvailable()               │
│  supportedModels[] | name                                  │
├─────────────┬─────────────┬─────────────┬────────────────┤
│  Claude     │  Codex      │  Gemini     │  (future)      │
│  Adapter    │  Adapter    │  Adapter    │                │
│  claude -p  │  codex -p   │  gemini ... │                │
└──────┬──────┴──────┬──────┴──────┬──────┴────────────────┘
       │             │             │
┌──────▼──────────────▼──────────────▼──────────────────────┐
│              SPAWN BACKEND FACTORY                         │
│  TmuxBackend | SubprocessBackend | SandboxBackend         │
│  (auto-detect: tmux available → tmux, else → subprocess)  │
└───────────────────────────────────────────────────────────┘
```

Brain becomes provider-agnostic. `spawnWorkers()` calls `SpawnBackendFactory.create()` instead of importing tmux directly. This enables:
- **tmux-free operation** via SubprocessBackend (Windows without WSL2)
- **Multi-provider** mixing: Claude Brain + OpenAI workers
- **Sandbox mode** via isolated subprocess with scope enforcement

**Auth Chain:**
```
Claude Code → MCP stdio (local process, no extra auth)
  → Core Engine → Provider Adapter → Spawn Backend → worker process
  → Claude mode: inherits Claude Code session auth
  → Codex mode: OPENAI_API_KEY env variable
  → API mode: ANTHROPIC_API_KEY env variable
```

---

# 3. NATIVE CLI & INSTALLATION

## 3.1 Installation

```bash
# Install globally
npm install -g deckent

# Initialize in a project
cd my-project
deckent init

# Or onboard with wizard
deckent onboard
```

## 3.2 CLI Commands

```
deckent init              Interactive setup wizard for new project
deckent onboard           Full onboarding (global + project config)
deckent start             Run full sprint lifecycle
deckent plan              Brain plans next sprint (plan mode)
deckent status            Show live dashboard
deckent attach            Attach to tmux session (see all agents)
deckent spawn <id>        Manually spawn a worker
deckent kill <id>         Kill a specific worker
deckent retro             Run sprint retrospective
deckent cleanup           Archive sprint files, kill workers
deckent doctor            Check system health (tmux, claude, git, node)
deckent config             Show/edit configuration
deckent config set <k> <v> Set config value
deckent usage             Show current plan usage
deckent history           Show sprint history & metrics
deckent analyze           Analyze project stack, size, methodology
deckent archive-debt      Archive resolved technical debt
deckent dashboard         Terminal TUI dashboard (rich mode)
deckent serve             Start HTTP API server (SSE)
deckent web               Web dashboard + API server (localhost:3100)
deckent plugin install <n> Install a skill/plugin
deckent plugin list       List installed plugins
deckent upgrade           Self-update
deckent-mcp               Start MCP server (stdio transport for Claude Code)
deckent sync             Sync adapter files (CLAUDE.md, AGENTS.md) with DECKENT.md reference
deckent watch            Live tmux split view: dashboard + worker panes
deckent recall <query>   Search project memory (Memory V2 FTS5 search)
deckent remember <note>  Save a note to project memory
deckent memory rebuild   Rebuild memory.db from .md exports
deckent memory export    Export memory.db to .md snapshots
deckent memory stats     Show memory database statistics
deckent explain          Explain sprint results and history
deckent docs add <path>  Add a document to managed-docs lifecycle
deckent docs list        List managed documents
deckent agent list       List registered agents (built-in + temp)
deckent skill list       List registered skills with manifests
deckent checkpoint       Approve/reject human checkpoint
```

**Plan command flags:**
- `deckent plan --no-confirm` — Skip task confirmation prompt
- `deckent plan --structured` — Force structured directive parsing
- `deckent plan --mode <ai|structured|auto>` — Set planning mode

## 3.3 Init Wizard Flow

```
$ deckent init

  🎛️  Welcome to Deckent!
  
  ? Select your plan:
    ❯ Performance — up to 8 workers, Opus for Brain
      Balanced — up to 5 workers, Sonnet for Brain
      Economic — up to 3 workers, Sonnet only
      API (pay-as-you-go) — up to 10 workers, any model
  
  ? Default language: 
    ❯ English
      Türkçe
      (more via plugins)
  
  ? Project name: my-awesome-project
  
  ✓ Created DECKENT.md + AGENTS.md + CLAUDE.md (@DECKENT.md adapter)
  ✓ Created .deckent/config.json
  ✓ Created .deckent/workspace/
  ✓ Created .claude/rules/
  ✓ Initialized .gitignore
  
  Next: Edit DIRECTIVES.md with your first goals, then run `deckent start`
```

## 3.4 System Requirements

```
Required:
  Node.js ≥ 24.0.0                       — detected; install guidance only (not auto-installed)
  git
  tmux                                  — detected; OS-package instruction surfaced (sudo never run silently)
  Claude Code CLI                       — `deckent init` offers consent-based install (npm i -g @anthropic-ai/claude-code); --yes for CI, --no-install for hint-only
  Claude subscription (Pro, Max, or API key)

  Note (ADR-062): `deckent init` detects missing prerequisites and, with the
  user's per-tool consent, installs the provider CLIs (claude/codex/gemini).
  OS packages (tmux) and runtimes (node)/docker are surfaced as instructions
  the user runs — never silently auto-installed.

Supported OS:
  macOS (Intel + Apple Silicon)
  Linux (Ubuntu 20+, Debian 11+, Fedora 38+, Arch)
  Windows (native — subprocess backend, shell:true, UTF-8)
  Windows (WSL2 — full tmux support)
```

---

# 4. WORKSPACE STRUCTURE

## 4.1 Project-Level (in your repo)

```
my-project/
├── DECKENT.md                         # Single source of truth (agent config)
├── AGENTS.md                          # @DECKENT.md adapter
├── CLAUDE.md                          # @DECKENT.md adapter for Claude Code
├── DIRECTIVES.md                      # Operator commands (YOU write this)
│
├── .deckent/                          # Deckent workspace
│   ├── config.json                    # Runtime config (mode, models, limits)
│   ├── workspace/                     # Agent workspace
│   │   ├── IDENTITY.md               # Project identity card
│   │   ├── TOOLS.md                  # Environment-specific tools/commands
│   │   └── BOOT.md                   # Startup routine for agents
│   ├── plugins/                       # Installed plugins
│   │   └── <plugin>/SKILL.md
│   └── i18n/                          # Language files
│       ├── en.json
│       └── tr.json
│
├── .brain/                            # Memory V2 DB-First (Brain + Auditor only)
│   ├── memory.db                      # SQLite DB — SINGLE SOURCE OF TRUTH (gitignored)
│   ├── exports/                       # Auto-generated git-tracked snapshots
│   │   ├── summary.md                # ~4K context summary (loaded via @ reference)
│   │   ├── decisions.md              # ADR list for git diff/review
│   │   ├── memory.md                 # Sprint learnings export
│   │   └── debt.md                   # Debt table export
│   ├── MEMORY.md                      # Sprint learnings (max 300 lines)
│   ├── DECISIONS.md                   # Architecture Decision Records (45 ADRs)
│   ├── DEBT.md                        # Technical debt log
│   ├── PATTERNS.md                    # Auditor findings
│   ├── RETRO.md                       # Latest sprint retrospective
│   ├── ERRORS.md                      # Error log (file-based)
│   ├── sprints/                       # Per-sprint logs
│   │   └── sprint-NNN.md
│   └── archive/                       # Deep archive
│       └── pre-v2/                   # Pre-V2 backup (DECISIONS.md, MEMORY.md)
│
├── .contracts/                        # Inter-agent contracts
│   └── api-surface.md
│
├── .tasks/                            # Ephemeral task files (auto-cleaned)
│   ├── task-001.json                  # Task definition
│   ├── task-001.plan                  # Worker's execution plan
│   ├── task-001.hb                    # Heartbeat (overwritten)
│   └── task-001.result                # Completion report
│
├── .locks/                            # File locks (runtime only)
├── .dashboard                         # Live status (Auditor overwrites)
│
├── .claude/                           # Claude Code native config
│   ├── settings.json                  # Claude Code settings
│   └── rules/                         # Path-scoped rules
│       ├── brain.md                   # Rules when acting as Brain
│       ├── auditor.md                 # Rules when acting as Auditor
│       └── worker-default.md          # Default worker rules
│
├── src/                               # Deckent source code
│   ├── core/                         # Types, config, utilities (93 modules)
│   │   ├── types.ts + *-types.ts    # All type definitions (task, config, sprint, monitoring, routing)
│   │   ├── constants.ts             # App-wide constants
│   │   ├── config.ts                # 3-layer config loader
│   │   ├── config-validator.ts      # Runtime config validation
│   │   ├── utils.ts                 # Shared utilities
│   │   ├── analyzer.ts             # Project stack/size analysis
│   │   ├── memory-store.ts          # MemoryStore — SQLite DB-first memory (CRUD, FTS5, decay)
│   │   ├── memory-query.ts          # searchMemory() — dual-layer FTS5 search
│   │   ├── memory-normalize.ts      # turkishNormalize() — i18n text normalization
│   │   ├── memory-types.ts          # MemoryEntryV2, CreateEntryInput interfaces
│   │   ├── memory-export.ts         # DB → .md snapshot generation
│   │   ├── memory-import.ts         # .md → DB migration parser
│   │   ├── agent-pool.ts            # AgentPoolManager, 15 built-in agents, LRU eviction (ADR-041 reconfirmed Sprint 166)
│   │   ├── skill-pool.ts            # 21 built-in skills
│   │   ├── skill-registry.ts        # AST sandbox validation
│   │   ├── routing-engine.ts        # Layer 3 — unified routing (routeTaskV2)
│   │   ├── intent-classifier.ts     # Layer 1 — task intent classification
│   │   ├── activation-engine.ts     # Layer 2 — structured activation rules
│   │   ├── model-registry.ts        # ModelRegistry (13 models, 3 providers)
│   │   ├── mode-presets.ts          # ModelStrategy, MODE_PRESETS
│   │   ├── provider.ts             # ProviderAdapter interface
│   │   └── notify-adapters/         # Notification adapters (file, webhook, etc.)
│   ├── orchestra/                    # Sprint lifecycle, orchestration (88 modules)
│   │   ├── brain.ts                 # Orchestrator (re-export layer)
│   │   ├── sprint-controller.ts     # Full sprint lifecycle (PLAN→SPAWN→...→CLEANUP)
│   │   ├── planner.ts              # AI task planning (Zod-validated)
│   │   ├── task-router.ts           # Provider + agent + skill routing per task
│   │   ├── result-evaluator.ts      # GO/NO-GO/TECH_DEBT evaluation
│   │   ├── result-collector.ts      # waitForResults, processQueue, aggregation + IPC
│   │   ├── event-stream.ts          # Structured event stream (ADR-035)
│   │   ├── event-bus.ts             # Centralized event routing
│   │   ├── tmux.ts                  # tmux session management
│   │   ├── spawn-backend.ts         # subprocess worker backend
│   │   ├── spawn-backend-docker.ts  # Docker worker backend
│   │   ├── mid-sprint-adapter.ts    # Real-time rerouting on task failure
│   │   ├── timeout-watcher.ts       # Real-time timeout detection
│   │   ├── timeout-estimator.ts     # Historical data → dynamic timeout
│   │   ├── monitor-adapter.ts       # Pluggable monitoring backend
│   │   └── managed-docs/            # Sprint lifecycle document management
│   ├── agents/                       # Worker execution (20 modules)
│   │   ├── worker.ts                # Task claim, file locking, heartbeat, result
│   │   └── adaptive-agent.ts        # Runtime agent adaptation
│   ├── providers/                    # Provider adapters (5 modules)
│   │   ├── claude-adapter.ts        # Claude CLI adapter
│   │   ├── codex-adapter.ts         # OpenAI Codex CLI adapter
│   │   └── gemini-adapter.ts        # Google Gemini CLI adapter
│   ├── api/                          # HTTP API server (5 modules)
│   │   ├── server.ts               # 16 endpoints + SSE stream
│   │   └── watcher.ts              # Dashboard file watcher
│   ├── cli/                          # CLI commands (57 files, 55+ commands)
│   ├── mcp/                          # MCP server (31 tools + 8 resources)
│   │   ├── server.ts                # Entry point (McpServer + stdio)
│   │   ├── tools/                   # 29 files (28 handlers; nervous.ts registers 5 nervous_* tools)
│   │   │   ├── init.ts             # deckent_init
│   │   │   ├── directives.ts       # deckent_set_directives
│   │   │   ├── plan.ts             # deckent_plan
│   │   │   ├── start.ts            # deckent_start
│   │   │   ├── status.ts           # deckent_status
│   │   │   ├── doctor.ts           # deckent_doctor
│   │   │   ├── retro.ts            # deckent_retro
│   │   │   ├── history.ts          # deckent_history
│   │   │   ├── analyze.ts          # deckent_analyze_project
│   │   │   ├── sync.ts             # deckent_sync
│   │   │   ├── config.ts           # deckent_config
│   │   │   ├── review.ts           # deckent_review
│   │   │   ├── run.ts              # deckent_run
│   │   │   ├── kill.ts             # deckent_kill
│   │   │   ├── cleanup.ts          # deckent_cleanup
│   │   │   ├── help.ts             # deckent_help
│   │   │   ├── checkpoint.ts       # deckent_checkpoint
│   │   │   ├── docs.ts             # deckent_docs
│   │   │   ├── explain.ts          # deckent_explain
│   │   │   ├── watch.ts            # deckent_watch
│   │   │   ├── agent-list.ts       # deckent_agent_list
│   │   │   └── skill-list.ts       # deckent_skill_list
│   │   └── resources/               # 8 resource handlers
│   └── dashboard/                    # Web Dashboard (React+Vite+Tailwind)
│       └── src/
│           ├── pages/               # 7 pages: Dashboard, Settings, History, Memory, Config, Status, Chat
│           ├── components/          # Layout, DebtTable, SprintChart, 14 UI components
│           ├── hooks/               # useSSE, custom hooks
│           ├── lib/                 # Utilities
│           └── types/               # Dashboard-specific types
├── tests/                             # Unit + integration tests
├── docs/
└── package.json
```

## 4.2 Global Config (~/.deckent/)

```
~/.deckent/
├── config.json                        # Global defaults (plan, language, etc.)
├── credentials/                       # API keys (never in project)
│   └── anthropic.json
├── skills/                            # Global skills (shared across projects)
│   └── <skill>/SKILL.md
├── templates/                         # Project templates
│   ├── typescript/
│   └── python/
└── history/                           # Global sprint history for analytics
```

## 4.3 DECKENT.md + Adapter Pattern

DECKENT.md is the single source of truth for agent configuration. CLAUDE.md and AGENTS.md are adapters that reference it via `@DECKENT.md` injection.

```bash
# Created by `deckent init`
# DECKENT.md is generated (writeIfNotExists)
# CLAUDE.md and AGENTS.md get @DECKENT.md prepended (ensureDeckentImport)
```

DECKENT.md structure:

```markdown
# {projectName} — Deckent Orchestrated

## Identity
@.deckent/workspace/IDENTITY.md

## Rules
- Brain is the ONLY orchestrator — workers never plan
- Workers stay within assigned scope (directories + filesWrite)
- Auditor never writes source code
- Sprint is NEVER left incomplete
- Memory budget: 900 lines max in .brain/

## Context
@DIRECTIVES.md
@.brain/MEMORY.md
@.contracts/api-surface.md

## Agent Roles
When acting as Brain: @.claude/rules/brain.md
When acting as Auditor: @.claude/rules/auditor.md
When acting as Worker: @.claude/rules/worker-default.md

## Environment
Build: tsc
Test: npx vitest run
Lint: tsc --noEmit

## Boot
@.deckent/workspace/BOOT.md
```

**Adapter injection pattern -- `ensureDeckentImport(filePath)`:**
- File doesn't exist -> create with `@DECKENT.md\n`
- File exists without `@DECKENT.md` -> prepend to existing content
- File exists with `@DECKENT.md` -> no-op (idempotent)

**Critical principle:** Deckent never deletes or resets user files. It only adds its own reference. Additive, not destructive.

`deckent sync` regenerates adapters on demand. Future: `deckent sync --provider codex` for CODEX.md adapters.

---

# 5. AGENT SYSTEM

## 5.1 Brain + Planner

**Role:** Orchestrator — plans, evaluates, learns
**Model:** Opus (Max plans) or Sonnet (Pro plan)
**Reads:** DIRECTIVES, MEMORY, RETRO, DEBT, PATTERNS, project state
**Writes:** .tasks/, .contracts/, .brain/RETRO, .brain/MEMORY, .brain/DECISIONS

**Brain+Planner Separation (ADR-008, refined Sprint 136/Sprint 144):**
- `brain.ts` — orchestrator re-export layer (Sprint 136: 1312→58 LoC)
- `sprint-controller.ts` — full sprint lifecycle (Sprint 136: 1890→209 LoC)
- `planner.ts` — AI task planning, imports ONLY from `core/` (types, constants)
- Planner uses Zod schema validation for AI responses
- Brain delegates planning to Planner when `brain_planning` is `'ai'` or `'auto'`
- ADR-008 Cycle 2 fix (Sprint 144): core/session-interface.ts extracted

**Planning Modes (`brain_planning` config):**
- `'structured'` — parse DIRECTIVES.md via `parseStructuredDirectives()`
- `'ai'` — call `callBrainPlanner()` (Zod-validated AI response)
- `'auto'` (default) — AI first, structured fallback on failure

**`buildWorkerPrompt` includes heartbeat instruction:**
Workers are instructed to create `.tasks/task-{id}.hb` with JSON heartbeat (workerId, taskId, status, currentAction, timestamp, filesChangedCount, sequence) and update it periodically during execution.

**Lifecycle:**
```
1. Check usage limits → adjust sprint size
2. Read all memory files (RETRO, MEMORY, DEBT, PATTERNS)
3. Read DIRECTIVES.md (operator commands)
4. Scan project state (git status, file tree)
5. Plan sprint (AI or structured mode) → create .tasks/*.json
6. Confirm DRAFT tasks → PENDING (if asDraft mode)
7. Determine worker count and model per task
8. Spawn workers via tmux
9. Start auditor scan loop (in-process)
10. Wait for results
11. Stop auditor scan loop
12. Evaluate each result → GO / NO-GO / TECH_DEBT
13. Handle cross-dependencies
14. Run retrospective → update MEMORY, RETRO, DECISIONS
15. Trigger decay/compression if needed
16. Signal sprint complete
```

**Brain evolves:** Each sprint's retro feeds the next sprint's plan. Brain reads its own past mistakes and adjusts.

### 5.1.1 Brain Post-Finalize Hook Chain (ADR-046 — Sprint 166)

Sprint 166 ADR-046 codified the **Brain Self-Update Hook Architecture** as a binding contract. The chain runs at the end of every sprint (both auto-finalize via `sprint-phases.ts:1238` AND manual `deckent finalize` via `cli/commands/finalize.ts:166`).

**Step Ordering Contract (Section 5.1 of the ADR — IMMUTABLE):**

| Step | Hook | Source | Sprint Wired | Purpose |
|------|------|--------|--------------|---------|
| 1 | `memoryExport` | `src/core/memory-export.ts` | 140 | DB → `.brain/exports/*.md` snapshots |
| 2 | `identityRegen` | `src/core/identity-generator.ts` | 138 | **DEPRECATED Sprint 166 T5** — content moved to managed-docs chain to avoid conflict with `.deckent/workspace/IDENTITY.md` |
| 3 | `adrInsert` | `src/core/adr-file-sync.ts` | **166 T1 (Bug M fix)** | Parse `docs/adr/*.md` MADR v3 headers, upsert into memory.db (`type='adr'`) — was silently missing since Sprint 138 ADR governance; last DB insert was 2026-04-20 before fix |
| 4 | `ruleRegen` | `src/core/rule-generator.ts` | **166 T2 (Bug N fix, renumbered)** | Regenerate `.claude/`, `.codex/`, `.gemini/`, `.cursor/` rule frontmatter with current ADR list (AUTO + empty CUSTOM template blocks) |
| 5 | `updateProjectDocs` | `src/orchestra/managed-docs/managed-doc-runner.ts` | 131 | Re-render CLAUDE.md, DECKENT.md, AGENTS.md, TOOLS.md, BOOT.md, WORKER-GUIDE.md via content generators (Sprint 166 T8 added 3 workspace docs) |

**Unconditional invocation principle (Phase 2 lesson, ADR-046 §3):** Each hook is a direct function call, never an optional callback or feature-flag-guarded path. The Sprint 152-165 stale-rules incident traced back to manual finalize bypassing optional `onRuleRegen` parameter — this is now contractually forbidden.

**Cache key completeness (Bug S, ADR-046 §4):** `doc-cache.ts` cache key MUST include `sprint.id`. Pre-Sprint-166 hash was `fileHash + entryHash` only, causing CLAUDE.md to skip with `cached_no_change` since Sprint 130. Post-fix: `fileHash + entryHash + sprint.id`, with backward-compat fallback when sprint id is absent.

**Single registration target (Bug N, ADR-046 §5):** Brain has exactly one post-finalize chain entry point — `runPostFinalizeHooks()` in `identity-generator.ts:308-356`. Both auto and manual finalize paths converge here; no parallel chain is permitted.

**Regression test:** `tests/core/identity-generator-step-order.test.ts` asserts hook execution order `memoryExport → adrInsert (Step 3) → ruleRegen (Step 4) → updateProjectDocs`. Any reordering breaks the test.

**Falsifiable monitoring (Sprint 167 M1-M4 baseline):** ADR-046 mandates Sprint 167 monitoring to track (M1) ADR insert lag, (M2) rules generation freshness, (M3) CLAUDE.md mtime per sprint, (M4) `stale_md` Auditor alert frequency. Sprint 170 will trigger refactor if violations exceed threshold.

### 5.1.2 Data Integrity Closure (Sprint 166)

Sprint 166 also resolved long-standing data integrity gaps that compromised `.brain/memory.db` ground truth:

- **Bug U — Sprint type insert restored.** `src/orchestra/sprint-retro-writer.ts` had stopped inserting `type='sprint'` rows after Sprint 140; DB query confirmed only Sprints 136-139 present. Fix restored the insert path. Forensic git bisect deliverable (`8434387..224618c -- src/orchestra/`) identified the regressing commit.
- **Bug V — Debt sprint_id backfill.** `src/core/memory-import.ts:54 parseDebtMd` produced ~100 debt entries with `sprint_id=NULL`. Sprint 166 adds regex extraction from the entry id (e.g. `debt-156-011` → `sprint-156`) wrapped in an atomic transaction (~50ms lock). 9-sprint memory backfill applied for 134/140/152/157/158/159/160/161/165.
- **Bug M — ADR insert hook wired** (see §5.1.1 Step 3): ADR-043/044/045/046 now flow into memory.db automatically; previously they only existed as `docs/adr/*.md` files.

**Verification:**
```sql
SELECT COUNT(DISTINCT sprint_id) FROM entries WHERE type='sprint';  -- ≥5 post Sprint 166
SELECT COUNT(*) FROM entries WHERE type='debt' AND sprint_id IS NULL;  -- 0
SELECT id FROM entries WHERE type='adr' AND id LIKE 'adr-04%';  -- adr-043, 044, 045, 046
```

### 5.1.3 Living Docs Pipeline (Sprint 166 T8 + T9)

Sprint 166 extended the managed-docs runner with auto-content generators and provider parity sync:

- **T8 — Workspace doc generators.** `.deckent/workspace/TOOLS.md`, `BOOT.md`, and `WORKER-GUIDE.md` were Sprint 138-148 stale (31 MCP + 55+ CLI not enumerated, no anti-pattern list, no RBAC reference). `src/orchestra/managed-docs/content-generators.ts` now enumerates tools/commands directly from code and emits:
  - **TOOLS.md** — 31 MCP tools + 55+ CLI commands (auto-listed)
  - **BOOT.md** — 7-step boot sequence + Sprint 165 manual recovery chain (kill → cleanup → recover → run → spawn)
  - **WORKER-GUIDE.md** — verify-ran marker discipline, honest-result gate (Bug X), processQueue stall awareness, RBAC ADR-037, anti-pattern list (no unjustified `it.skip`, no stubs)
- **T9 — Provider parity.** `.codex/rules/`, `.gemini/rules/`, `.cursor/rules/` now share frontmatter (`paths: [...]`) with `.claude/rules/` via the rules-generator. `extensions/vscode/` parity deferred to Sprint 169.
- **T9 — Auditor `emitAlert` helper.** `src/monitor/alert-emitter.ts` (+30 LoC) atomically writes alerts to `.dashboard.json` + emits to `.deckent/sprint-NNN-events.jsonl` (M4 monitoring source).
- **T9 — `stale_md` Nervous detector.** CLAUDE.md mtime > 70min during a live sprint triggers `emitAlert('stale_md', {...})`.

## 5.2 Auditor (In-Process Scan Loop)

**Role:** Immune system — monitors, detects, reports
**Model:** N/A (runs as code within Brain's process, not as separate LLM agent)
**Reads:** .tasks/*.hb, git diff, .locks/, .dashboard
**Writes:** .dashboard, .brain/PATTERNS.md, alerts

**Critical change (Sprint 12-14):** Auditor no longer runs as a separate tmux window. Instead, Brain calls `startScanLoop()` in-process between SPAWN and EXECUTE phases. The scan loop runs every 30 seconds via `setInterval`. Brain calls `clearInterval` when the sprint completes.

**`startAuditor()` in tmux.ts still exists** for future standalone auditor mode but is no longer called from `spawnWorkers()`.

**`writeScanToDashboard()` merges scan results into the existing dashboard state** — reads current dashboard, merges alerts (keeps last 50), updates agent statuses from heartbeats, and overwrites.

**Scan cycle (every 30s, in Brain process):**
```
1. Read all heartbeat files → agent status
2. Run git diff --stat → who changed what
3. Check boundaries → any agent outside scope?
4. Check locks → stale locks? conflicts?
5. Deadlock detection → circular waits?
6. Merge scan results into dashboard via writeScanToDashboard()
7. If pattern detected → append to PATTERNS.md
8. If critical → create alert in dashboard
```

**Auditor teaches:** Patterns found by Auditor feed into Brain's next plan.

**Auditor 3-Pipeline Verification (Sprint 138, ADR-035):**
Since Sprint 138, Auditor runs independent 3-pipeline verification on worker results:
1. `verifyWorkerResult()` — checks .result file integrity and scope compliance
2. `verifyFunctional()` — validates test pass/fail and coverage claims
3. `validateTechDebt()` — confirms tech debt items are properly documented

Auditor verdict (PASS / DOWNGRADE / FAIL) feeds into Brain's GO/NO_GO decision. Worker self-assessment alone is never trusted (Sprint 137 lesson: worker claimed DONE with 53 test failures).

**Auditor Async Scan Loop (Sprint 144):**
52 synchronous I/O operations replaced with async equivalents. Scan loop no longer blocks Brain's event loop during heartbeat reads.

## 5.3 Worker

**Role:** Builder — plans, codes, tests, documents
**Model:** Per-task (opus/sonnet/haiku) — Brain decides
**Reads:** .tasks/task-XXX.json, .contracts/, AGENTS.md
**Writes:** source code (within scope), .tasks/*.hb, *.plan, *.result

**Worker lifecycle:**
```
1. CLAIM: Read task file, set status CLAIMED
2. HEARTBEAT: Create .tasks/task-XXX.hb BEFORE starting work
   - JSON: { workerId, taskId, status: "EXECUTING", currentAction, timestamp, filesChangedCount: 0, sequence: 0 }
3. PLAN: Write detailed plan to .tasks/task-XXX.plan
   - Which files to create/modify
   - Execution order
   - Test strategy
   - Documentation plan
4. CODE: Execute plan within assigned scope
   - Check lock before every file write
   - Update heartbeat periodically (status: CODING/TESTING/DOCUMENTING, increment sequence)
5. TEST: Run tests
   - tsc --noEmit (typecheck)
   - vitest run (unit tests)
   - Capture coverage
6. DOCUMENT: Update relevant docs
7. REPORT: Write .tasks/task-XXX.result
   - files_changed, lines_added/removed
   - test results, coverage
   - self_assessment: DONE | GO_WITH_TECH_DEBT | NO_GO
   - notes for Brain
```

**Worker model switching:**
Brain assigns model per task in the task JSON:
```json
{
  "model": "sonnet",
  "effort": "normal",
  "reason": "Routine CRUD endpoint"
}
```
Worker spawns with that model. No runtime switching — model is fixed for task lifetime.

**Worker Honest Assessment (Sprint 138, ADR-035 V1.0):**
Workers include an Honest Self-Assessment block requiring:
1. Baseline state verification (what was the state before work?)
2. End state verification (what is it now?)
3. Delta analysis (how much of the task was actually completed?)
`verify-delta.json` provides objective evidence. `applyTechDebtDowngrade()` automatically downgrades DONE→GO_WITH_TECH_DEBT when delta is insufficient.

**Worker Event Hooks (Sprint 139):**
Workers emit structured events via the ADR-035 event stream: HEARTBEAT, RESULT, QUESTION, CODE_VERIFY_REQUEST. Notification dispatcher forwards critical events to user-configured adapters (file, webhook).

**Worker Scope Enforcement (Sprint 139, ADR-037):**
Workers can only write to `scope.filesWrite` and `scope.directories` from their task JSON. Writing to `.brain/`, `.dashboard`, or other workers' task files is explicitly denied. Violations detected by Auditor `git diff --stat` scan.

---

# 6. MEMORY ARCHITECTURE (DB-First — Memory V2)

## Overview

Memory V2 (Sprint 140+) replaced the original 3-tier file-based memory with a **SQLite DB-first architecture**. All memory operations go through `.brain/memory.db` as the single source of truth. Markdown files (`.brain/exports/`) are generated exports for git tracking and human readability.

**Key Features:**
- **SQLite + better-sqlite3**: Zero-config embedded database, no external dependency
- **FTS5 Full-Text Search**: Dual-layer Turkish normalize (TR/EN/DE %100 recall)
- **96% context reduction**: From ~96K DECISIONS.md to ~4K summary.md auto-generated export
- **9 entry types**: ADR, memory, sprint, debt, pattern, retro, error, identity, audit
- **Cross-source query**: Single API searches across all knowledge types

## DB Schema (5 tables + FTS5)

```sql
-- entries: main knowledge table
CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- adr | memory | sprint | debt | pattern | retro | identity
  title TEXT NOT NULL,
  content TEXT,
  status TEXT,               -- accepted | deprecated | superseded | resolved | open
  sprint_id TEXT,
  importance INTEGER DEFAULT 5,
  decay_exempt BOOLEAN DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

-- tags: normalized many-to-many tag association
-- relations: cross-reference (references, supersedes, caused_by, resolves, blocks, depends_on)
-- entry_history: field-level change tracking
-- entries_fts: FTS5 virtual table (8 columns: 4 original + 4 turkishNormalize)
-- schema_version: migration safety
```

## Query API

```typescript
import { searchMemory } from './core/memory-query.js';

const results = searchMemory(store, {
  text: 'docker heartbeat',          // FTS5 dual-layer search
  type: ['adr', 'memory'],           // filter by entry type
  status: ['accepted'],              // filter by status
  sprint_range: { min: 135 },        // filter by sprint number
  tags_contain: ['security'],        // entries must have ALL tags
  limit: 5,                          // max results
});
```

## File Layout

```
.brain/
├── memory.db                        # SQLite DB — SINGLE SOURCE OF TRUTH (gitignored)
├── exports/                         # Auto-generated git-tracked snapshots
│   ├── summary.md                   # ~4K context summary (loaded via @ reference)
│   ├── decisions.md                 # ADR list for git diff/review
│   ├── memory.md                    # Sprint learnings
│   └── debt.md                      # Debt table
├── MEMORY.md                        # Legacy: sprint learnings (max 300 lines)
├── RETRO.md                         # Latest retrospective (overwritten)
├── PATTERNS.md                      # Auditor findings (append-only)
├── ERRORS.md                        # Error log (still file-based)
├── sprints/                         # Per-sprint logs
│   └── sprint-NNN.md
└── archive/                         # Deep archive
    └── pre-v2/                      # Pre-V2 backup (DECISIONS.md, MEMORY.md)
```

## CLI & MCP Access

```bash
# CLI commands
deckent recall "docker heartbeat"     # Search memory
deckent remember "important note"     # Save to memory
deckent memory rebuild                # Rebuild DB from exports
deckent memory export                 # Export DB to .md snapshots
deckent memory stats                  # Show DB statistics

# MCP tool
deckent_memory_query                  # Cross-source search via MCP
```

## turkishNormalize — i18n Text Normalization

FTS5 search uses dual-layer normalization for %100 recall across TR/EN/DE:
- Layer 1: Original text indexed as-is
- Layer 2: `turkishNormalize()` applied — handles İ/ı, Ö/ö, Ü/ü, Ç/ç, Ş/ş, Ğ/ğ
- Queries search both layers simultaneously
- Source: `src/core/memory-normalize.ts`

## Decay Mechanism

```
Every sprint end:
1. Brain calls store.decay(currentSprintNum, decayAfterSprints)
2. Entries older than N sprints (default 5) with decay_exempt=false are archived
3. DECAY_EXEMPT entries: DECISIONS.md (ADRs), PROJECT-IDENTITY.md — never decay
4. .brain/ file budget: 900 lines max (MEMORY 300, RETRO 120, PATTERNS 150, sprint log 100)
5. Export .md snapshots after decay: `deckent memory export`
```

## Legacy 3-Tier (Pre-V2, Sprint 1-139)

The original memory system used three file tiers:
- **Tier 1**: MEMORY.md (always loaded, ~200 lines) — now in DB as type='memory'
- **Tier 2**: Sprint logs (.brain/sprints/) — now in DB as type='sprint'
- **Tier 3**: Deep archive (.brain/archive/) — migrated to DB, originals in archive/pre-v2/

## Memory Files Reference

| File/Source | Writer | Reader | Decay |
|-------------|--------|--------|-------|
| memory.db (entries) | Brain | All (via query API) | Per-type configurable |
| exports/summary.md | Brain (auto-gen) | All (via @ reference) | Regenerated each sprint |
| exports/decisions.md | Brain (auto-gen) | Git reviewers | Regenerated each sprint |
| MEMORY.md | Brain | All | 5 sprints |
| RETRO.md | Brain | Brain | Overwritten each sprint |
| PATTERNS.md | Auditor | Brain | 5 sprints |
| sprints/*.md | Brain | Brain | Auto-archive |

---

# 7. SPRINT LIFECYCLE

```
Phase 0: DIRECTIVE
  You write/update DIRECTIVES.md

Phase 1: PLAN (Brain, plan mode)
  Brain reads: DIRECTIVES + RETRO + MEMORY + DEBT + PATTERNS
  Brain checks: usage limits
  Brain creates: .tasks/*.json + .contracts/*
  Brain decides: worker count, model per task
  Output: sprint plan ready

Phase 2: SPAWN
  Brain spawns workers via tmux (dynamic)
  Each worker gets its own tmux window

Phase 2.5: AUDITOR START
  const scanInterval = startScanLoop(projectRoot, sprint.id)
  onScanComplete callback → writeScanToDashboard()
  Scan runs every 30s within Brain's process

Phase 3: EXECUTE (Workers, parallel)
  Each worker: plan → code → test → doc → report
  Auditor scan loop running in background (30s cycles)
  Dashboard: live updates via scan results

Phase 3.5: AUDITOR STOP
  clearInterval(scanInterval)
  Scan loop stopped before evaluation begins

Phase 4: EVALUATE (Brain)
  For each .result file:
    DONE → worker freed
    GO_WITH_TECH_DEBT → worker freed + DEBT.md updated
    NO_GO → fix task created, same or cross-assigned worker

Phase 5: FIX (if NO-GO exists)
  Assigned workers fix critical issues
  Cross-dependency rule: if A's NO-GO caused by B's output,
    B gets priority fix task even if B was GO

Phase 6: RETRO (Brain)
  Write RETRO.md (overwrite)
  Update MEMORY.md (append learnings)
  Update DECISIONS.md (if new decisions)
  Calculate metrics
  
Phase 7: DECAY
  Compress if .brain/ > 900 lines
  Archive old sprint logs
  Memory V2: store.decay(currentSprintNum, decayAfterSprints)
  Export .md snapshots: deckent memory export

Phase 8: CLEANUP
  Archive .tasks/ files
  Release .locks/
  Kill remaining tmux sessions
  Export final sprint metrics
  SPRINT NEVER LEFT INCOMPLETE
```

---

# 8. GO / NO-GO / TECH DEBT PROTOCOL

Every task gets a three-way evaluation:

| Decision | Condition | Worker Status | Memory Effect |
|----------|-----------|---------------|---------------|
| ✅ DONE | All criteria met | Free → next sprint | None |
| ⚠️ GO+DEBT | Core done, minor deferred | Free + debt logged | DEBT.md updated |
| ❌ NO-GO | Critical issue | Locked → must fix | Fix task created |

**Cross-Dependency Rule:**
If Worker-A gets NO-GO because Worker-B's output is broken:
→ Worker-B gets a PRIORITY FIX task
→ B fixes before starting any new sprint task
→ Even if B was marked GO or GO+DEBT

**Tech Debt Escalation:**
- New debt: NORMAL priority
- 2 sprints unfixed: HIGH priority
- 3+ sprints unfixed: CRITICAL — auto-included in next sprint

---

# 9. USAGE-AWARE PLANNING

Brain MUST check usage before planning. Sprint must never be left incomplete.

## Usage Check Flow

```
1. Brain queries current usage (claude -p "/status")
2. Parse 5-hour window % and weekly quota %
3. Apply thresholds from config:

   Max 20x:  5hr > 80% → small sprint  |  weekly > 60% → reduce workers
   Max 5x:   5hr > 70% → small sprint  |  weekly > 50% → sonnet only
   Pro:       5hr > 60% → small sprint  |  weekly > 40% → minimal
   API:       check balance             |  budget per sprint limit

4. If limit hit during sprint:
   a. Pause current tasks (status → PAUSED)
   b. Save state to .tasks/*.paused
   c. Wait for limit reset
   d. Resume from saved state
   e. Sprint is NEVER abandoned
```

## BrainPlanningMode

Brain supports three planning modes, configured via `brain_planning` in `PlanModeConfig`:

| Mode | Strategy | Fallback |
|------|----------|----------|
| `'structured'` | `parseStructuredDirectives()` — parses `## Task N:` blocks | None |
| `'ai'` | `callBrainPlanner()` — AI generates tasks, Zod-validated | Error if fails |
| `'auto'` (default) | AI first → structured fallback on failure | Always succeeds |

**Planner module** (`src/orchestra/planner.ts`):
- `buildPlanPrompt(context, recommendation, projectName)` — constructs the AI prompt
- `parsePlannerResponse(raw)` — validates JSON response with Zod schemas
- `callBrainPlanner(context, recommendation, model, projectName)` — spawns `claude` CLI, returns `PlannerResult | null`
- Imports ONLY from `core/` (types, constants) — no brain.ts imports (ADR-008)

**DRAFT task support:**
When `planSprint` is called with `{ asDraft: true }`, tasks are created in `DRAFT` status. `confirmDraftTasks()` transitions them to `PENDING` before spawning.

## Model Budget Per Sprint

Brain calculates estimated token usage:
```
Brain planning:     ~2000 tokens (opus = expensive)
Per worker task:    ~5000 tokens (sonnet = affordable)  
Auditor per scan:   ~500 tokens (sonnet, short)
Evaluation:         ~1000 tokens per task
Retrospective:      ~2000 tokens

Example sprint (5 workers, sonnet):
  Brain: 2000 + Workers: 25000 + Auditor: 5000 + Eval: 5000 + Retro: 2000
  Total: ~39000 tokens
  
Max 20x budget: ~900 messages/5hr ≈ plenty
Pro budget: ~45 messages/5hr ≈ tight, 3 workers max
```

---

# 10. DYNAMIC TERMINAL MANAGEMENT (tmux)

## How Workers Are Spawned

Brain creates workers by programmatically creating tmux windows:

```bash
# New worker
tmux new-window -t deckent -n "w-{task_id}" -c "{project_dir}"
tmux send-keys -t "deckent:w-{task_id}" "claude --model {model} -p '{prompt}'" Enter

# Kill worker when done
tmux kill-window -t "deckent:w-{task_id}"

# List active workers
tmux list-windows -t deckent -F '#{window_name}' | grep "^w-"
```

## tmux Session Layout

```
deckent (tmux session)
├── brain       (window 0) — Brain orchestrator
├── auditor     (window 1) — Live monitoring
├── w-task-001  (window 2) — Worker 1
├── w-task-002  (window 3) — Worker 2
├── w-task-003  (window 4) — Worker 3
└── dashboard   (window N) — watch cat .dashboard
```

## Dynamic Scaling

Brain decides worker count per sprint:
- 3 tasks with no dependencies → 3 workers
- 8 tasks with dependency chain → 5 workers (some sequential)
- If new task emerges mid-sprint → spawn additional worker
- If worker finishes early → kill pane, free resources

## Agent Teams Integration (Future)

When Claude Code Agent Teams stabilizes:
```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
    "CLAUDE_CODE_SPAWN_BACKEND": "tmux"
  },
  "teammateMode": "tmux"
}
```
Brain becomes team lead, workers become teammates with native messaging.

---

# 11. PLUGIN & SKILL SYSTEM

Inspired by OpenClaw skills + Cowork plugins.

## Skill Structure

```
.deckent/plugins/{skill-name}/
├── SKILL.md          # Instructions (markdown)
├── config.json       # Skill config (optional)
├── scripts/          # Helper scripts (optional)
│   └── run.sh
└── README.md         # Documentation
```

## SKILL.md Format

```markdown
---
name: react-component
description: Generate React components with TypeScript and Tailwind
version: 1.0.0
author: community
triggers:
  - "create component"
  - "build UI"
model: sonnet
---

# React Component Skill

When asked to create a React component:
1. Use functional components with TypeScript
2. Use Tailwind CSS for styling
3. Include prop types
4. Write co-located test file
5. Export from barrel file

## Template
...
```

## Built-in Skills (Ship with Deckent)

```
orchestrate    — Core orchestration (Brain, Auditor, Worker)
test-runner    — Automated testing workflows
doc-writer     — Documentation generation
code-reviewer  — Code review and quality checks
refactor       — Safe refactoring with test validation
migrate        — Database/API migration planning
```

## Custom Skills

Users create project-specific skills:
```bash
deckent plugin create my-skill
# Creates template in .deckent/plugins/my-skill/
```

---

# 12. UI ROADMAP

## Phase 1: Terminal Dashboard — DONE (Sprint 10)

`deckent status` and `deckent dashboard` provide a Unicode box-drawing terminal dashboard with live agent status, progress bars, and usage meters.

```
$ deckent status

╔══════════════════════════════════════════════════════╗
║  DECKENT ORCHESTRA — Sprint 3 — 15:42              ║
╠══════════════════════════════════════════════════════╣
║  BRAIN     ░░░░░░░░  IDLE     Next: evaluation     ║
║  AUDITOR   ████████  SCAN     Last: 3s ago          ║
║  w-001     ████░░░░  CODE     src/core/engine.ts    ║
║  w-002     ██████░░  TEST     running vitest        ║
║  w-003     ████████  DONE ✓   src/api/routes.ts     ║
╠══════════════════════════════════════════════════════╣
║  Progress: 1/3 done | 2 active | 0 blocked         ║
║  Usage: 5hr 34% | Weekly 22% | Budget: OK           ║
║  Alerts: 0                                          ║
╚══════════════════════════════════════════════════════╝
```

## Phase 2: Web Dashboard — DONE (Sprint 11), end-to-end repaired (Sprint 175)

React + Vite + Tailwind, 7 pages, shadcn/ui components, SSE for real-time updates.

> **Sprint 175 repair (honesty):** The dashboard shipped but was not end-to-end
> usable — `web`/`serve` resolved the static dir to a non-existent path
> (`<projectRoot>/src/dashboard/dist`) and `serve` never passed it; the build
> chain could ship an empty `dist/dashboard`; `/api/chat` returned 404. Fixed:
> bundled-dashboard resolver (`dist/dashboard`, install-safe), resilient
> `build:dashboard`, and a real `/api/chat` handler. `deckent web` now serves a
> working dashboard from the installed package.

- **Dashboard page:** Live agent status, progress bars, alerts with badge colors, elapsed time, auditor status indicator
- **Settings page:** Config viewer
- **History page:** Sprint history with charts (Recharts)
- **Memory page:** Brain memory viewer
- `deckent web` launches both HTTP API and web dashboard at localhost:3100
- `deckent serve` launches HTTP API only (16 endpoints + SSE)
- SSE endpoint: `GET /api/events` — file watcher on `.dashboard` pushes updates
- Dark/light theme via ThemeProvider
- Mobile responsive with hamburger menu
- Auditor status badge in sidebar: "Active" (green) / "Inactive" (gray)

## Phase 3: VSCode Extension (Planned)

- Sidebar panel with live agent status
- Command palette: `Deckent: Start Sprint`, `Deckent: Show Dashboard`
- Status bar: sprint progress, usage meter
- Terminal management from sidebar
- Inline decorations showing which agent modified which file
- Settings UI for config.json

---

# 13. MULTI-PLAN COMPATIBILITY

```json
// .deckent/config.json
{
  "mode": "performance",
  
  "modes": {
    "performance": {
      "max_workers": 8,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "usage_thresholds": { "5hr": 0.8, "weekly": 0.6 }
    },
    "balanced": {
      "max_workers": 5,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "usage_thresholds": { "5hr": 0.7, "weekly": 0.5 }
    },
    "economic": {
      "max_workers": 3,
      "brain_model": "sonnet",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "usage_thresholds": { "5hr": 0.6, "weekly": 0.4 }
    },
    "api": {
      "max_workers": 10,
      "brain_model": "opus",
      "default_model": "sonnet",
      "haiku_allowed": true,
      "budget_per_sprint": 5.00,
      "requires": "ANTHROPIC_API_KEY"
    }
  },

  "brain_planning": "auto"
}
```

Config switch: `deckent config set mode economic`

**Mode aliases (backward compatible):** `max_plan` → `performance`, `max5x_plan` → `balanced`, `pro_plan` → `economic`

---

# 14. i18n & MULTI-LANGUAGE

## System Messages

```json
// .deckent/i18n/en.json
{
  "cli.welcome": "Welcome to Deckent!",
  "cli.plan_select": "Select your Claude plan:",
  "sprint.starting": "Sprint {n} starting...",
  "sprint.complete": "Sprint {n} complete!",
  "brain.planning": "Brain is planning...",
  "worker.spawned": "Worker {id} spawned (model: {model})",
  "auditor.alert": "ALERT: {message}",
  "usage.warning": "Usage at {pct}% — conserving resources"
}

// .deckent/i18n/tr.json
{
  "cli.welcome": "Deckent'e hoş geldiniz!",
  "cli.plan_select": "Claude planınızı seçin:",
  "sprint.starting": "Sprint {n} başlıyor...",
  "sprint.complete": "Sprint {n} tamamlandı!",
  "brain.planning": "Brain planlıyor...",
  "worker.spawned": "Worker {id} başlatıldı (model: {model})",
  "auditor.alert": "UYARI: {message}",
  "usage.warning": "Kullanım %{pct} — kaynaklar korunuyor"
}
```

Language set: `deckent config set language tr`

Agent prompts remain in English (LLM performance). UI/CLI output follows user's language preference.

**Note:** i18n JSON files are created by `deckent init` in `.deckent/i18n/`. CLI integration for runtime message lookup is pending (messages are currently hardcoded in English/Turkish).

---

# 15. SECURITY & PERMISSIONS (RBAC Authority Matrix)

## RBAC Protocol V1.0 (ADR-037 — Sprint 139)

Formal Role-Based Access Control matrix defining file system access, event stream channel rights, and sprint lifecycle action permissions for each component. Built on NIST SP 800-162 principles (least privilege, separation of duties, fail-closed).

**Core Principles:**
1. **Least Privilege** — Each component has only the minimum permissions needed
2. **Separation of Duties** — No component is both implementer and verifier
3. **Auditability** — All permission use logged to event stream (ADR-035)
4. **Fail-Closed** — Default is "no access" — only explicitly granted permissions are allowed

## Permission Model

```
Level 1: Operator (YOU)
  - Full access to everything
  - Writes DIRECTIVES.md, AGENTS.md
  - Approves/rejects sprint plans
  - Can kill any agent

Level 2: Brain (Orchestrator — ADR-037 §Brain Authority Matrix)
  - WRITE: .tasks/*, .deckent/config.json, .deckent/sprint-state.json,
           .deckent/sprint-*-events.jsonl (APPEND only), .deckent/sprint-*-checkpoint.json,
           .brain/MEMORY.md, .brain/RETRO.md, .brain/DEBT.md, .brain/PATTERNS.md,
           .brain/sprints/*, .brain/archive/*
  - DENY:  src/**, tests/**, .brain/DECISIONS.md, .dashboard, .locks/*
  - Execute: claude -p (spawn workers), tmux create/kill
  - Event channels: EMIT BRAIN→WORKER:*, CONSUME WORKER→BRAIN:*, AUDITOR→BRAIN:*

Level 3: Auditor (Independent Verifier — ADR-037 §Auditor Authority Matrix)
  - READ:  .tasks/*.hb/result/json, .locks/*, src/**, tests/**, .brain/DECISIONS.md
  - WRITE: .dashboard, .deckent/sprint-*-gate.json, docs/audits/*,
           .brain/PATTERNS.md (APPEND only), .deckent/sprint-*-events.jsonl (APPEND only)
  - DENY:  src/** (WRITE), tests/** (WRITE), .tasks/*.json (WRITE), .brain/MEMORY.md
  - NEVER writes source code — audit independence is inviolable
  - Event channels: EMIT AUDITOR→BRAIN:*, CONSUME WORKER→AUDITOR:*

Level 4: Worker (Task Implementer — ADR-037 §Worker Authority Matrix)
  - WRITE: scope.filesWrite (from task JSON), scope.directories (new files only),
           .tasks/task-{ownId}.hb/result/plan/verify-delta.json, .locks/{ownScope}
  - READ:  .tasks/task-{ownId}.json, scope.filesRead, .brain/DECISIONS.md, .locks/*
  - DENY:  .tasks/task-{otherId}.*, .brain/*, .dashboard, docs/audits/*,
           any src/** outside assigned scope
  - Event channels: EMIT WORKER→BRAIN:*, WORKER→AUDITOR:*, CONSUME BRAIN→WORKER:*
```

## Cross-Role Interaction Rules (ADR-037 §5)

1. **Separation of Assessment & Verification**: Worker writes self-assessment → Auditor verifies (PASS/DOWNGRADE/FAIL) → Brain makes final GO/NO_GO decision
2. **No Worker-to-Worker Communication**: All coordination through Brain
3. **Auditor Independence**: Auditor NEVER writes src/** or tests/** — inviolable
4. **Brain Orchestration Boundary**: Brain plans and decides but never writes source code directly
5. **Event Stream Integrity**: Append-only, per-component channel rights, file-based fallback (ADR-035)

## Claude Code --allowedTools Per Agent

```bash
# Brain
--allowedTools "Read,Write,Bash(git *),Bash(claude *),Bash(tmux *),Bash(cat *),Bash(find *),Bash(ls *)"

# Auditor  
--allowedTools "Read,Write(.dashboard),Write(.brain/PATTERNS.md),Write(.tasks/ALERT),Bash(git diff *),Bash(git log *),Bash(cat *),Bash(ls *),Bash(wc *)"

# Worker
--allowedTools "Read,Write(src/{scope}/*),Write(tests/{scope}/*),Write(.tasks/{id}.*),Bash(npm *),Bash(npx *),Bash(git add *)"
```

## Dangerous Mode Control

```
deckent start                    # Normal — asks for permission
deckent start --auto-approve     # Auto-approve all tool uses
deckent start --sandbox          # Run in Docker container (safest)
```

---

# 16. SELF-TEST & REPORTING

## Test Layers

```
Layer 1: Worker Self-Test (per task)
  - tsc --noEmit (typecheck)
  - vitest run --reporter=json
  - Results in .tasks/{id}.result

Layer 2: Auditor Integration Test (per sprint)
  - Full project build
  - Full test suite
  - Coverage check
  - Lint check
  - Results in .dashboard

Layer 3: Brain Regression Test (sprint transition)
  - Previous sprint's tests still pass?
  - Coverage dropped?
  - If regression → priority fix in next sprint
```

## Sprint Report (auto-generated)

```markdown
# Sprint {N} Report — {date}

## Summary
- Duration: {X}min (previous: {Y}min, {change}%)
- Tasks: {done} DONE, {debt} GO+debt, {nogo} NO-GO
- Workers: {n} active
- NO-GO rate: {pct}% (previous: {prev}%, {change})

## Metrics
- Boundary violations: {n}
- Cross-assignments: {n}
- Test coverage: {before}% → {after}%
- Tech debt: {new} new, {resolved} resolved, {total} open
- Context budget: {used}/900 lines

## Learnings
{from RETRO.md}

## Next Sprint
{from Brain's evaluation}
```

---

# 17. REPOSITORY STRATEGY

## Dual Repo

**Private repo (deckent-dev):**
Everything. All development artifacts, prompts, .brain/ history.

**Public repo (deckent):**
Product code only. Clean, documented, installable.

## .gitignore for Private Repo

```
node_modules/
dist/
.env
.tasks/*.hb
.tasks/*.signal
.tasks/*.output
.locks/
.dashboard
.brain/archive/
```

## .gitignore for Public Repo

```
node_modules/
dist/
.env
.brain/
.tasks/
.locks/
.dashboard
.contracts/
DIRECTIVES.md
.deckent/config.json
scripts/internal/
docs/internal/
```

## Sync Strategy

```bash
# Development happens in private repo
# When feature is ready:
deckent publish  # Copies product code to public repo, strips dev artifacts
```

---

# 18. FILE-BY-FILE REFERENCE

Every file in the project, its purpose, who writes it, who reads it:

| File | Purpose | Writer | Reader | Lifecycle |
|------|---------|--------|--------|-----------|
| AGENTS.md | @DECKENT.md adapter | deckent init (ensureDeckentImport) | All agents | Permanent |
| CLAUDE.md | @DECKENT.md adapter | ensureDeckentImport() | Claude Code | Permanent |
| DECKENT.md | Single source of truth (agent config) | deckent init (writeIfNotExists) | All agents via @import | Permanent |
| DIRECTIVES.md | Your commands | You | Brain | Until you change |
| .deckent/config.json | Runtime config | deckent init/config | All | Permanent |
| .deckent/workspace/IDENTITY.md | Project identity | deckent init | Brain | Permanent |
| .deckent/workspace/TOOLS.md | Environment tools | You | Workers | Permanent |
| .deckent/workspace/BOOT.md | Startup routine | Brain | All | Updated per sprint |
| .brain/MEMORY.md | Learned patterns | Brain | All (via @import) | Decay: 3 sprints |
| .brain/DECISIONS.md | ADRs | Brain | Brain, Auditor | Permanent |
| .brain/DEBT.md | Tech debt | Brain | Brain | Until resolved |
| .brain/PATTERNS.md | Auditor findings | Auditor | Brain | Decay: 5 sprints |
| .brain/RETRO.md | Last sprint retro | Brain | Brain | Overwritten |
| .brain/sprints/*.md | Sprint logs | Brain | Brain | Auto-archived |
| .contracts/*.md | API contracts | Brain | All | Until changed |
| .tasks/task-*.json | Task definitions | Brain | Workers | Deleted after sprint |
| .tasks/task-*.plan | Execution plans | Workers | Auditor | Deleted after sprint |
| .tasks/task-*.hb | Heartbeats | Workers | Auditor | Overwritten, deleted |
| .tasks/task-*.result | Results | Workers | Brain | Deleted after sprint |
| .tasks/task-*.log | Worker terminal output | tmux pipe-pane | Brain, API, you | Deleted after sprint |
| .locks/*.lock | File locks | Workers | Workers, Auditor | Deleted on release |
| .dashboard | Live status | Auditor | You, UI | Overwritten |
| .claude/rules/*.md | Agent-specific rules | deckent init | Claude Code | Permanent |
| .claude/settings.json | MCP server registration | deckent init | Claude Code | Permanent |
| src/orchestra/planner.ts | AI task planning (Zod) | Developer | Brain | Permanent |
| src/core/analyzer.ts | Project stack/size analysis | Developer | MCP, CLI | Permanent |
| src/api/server.ts | HTTP API (16 endpoints + SSE) | Developer | Web dashboard | Permanent |
| src/api/watcher.ts | Dashboard file watcher | Developer | API server | Permanent |
| src/dashboard/ | Web Dashboard (React+Vite+Tailwind) | Developer | Browser | Permanent |
| src/mcp/server.ts | MCP server entry point | Developer | Claude Code | Permanent |
| src/mcp/tools/*.ts | MCP tool handlers (31) | Developer | MCP server | Permanent |
| src/mcp/resources/*.ts | MCP resource handlers (8) | Developer | MCP server | Permanent |
| .deckent/workspace/TOOLS.md | Environment tools/commands | deckent init | Workers | Permanent |
| .deckent/workspace/BOOT.md | Agent boot sequence | deckent init | All agents | Permanent |
| .deckent/plugins/ | Installed plugins directory | deckent init | Plugin system | Permanent |
| .deckent/i18n/*.json | i18n message templates | deckent init | CLI | Permanent |

---

# 19. IMPLEMENTATION HISTORY

## Sprint 1: Core Engine (March 2026)

Wave-based implementation, 5 waves, all modules built and tested:
- Wave 1: Core types, config, constants (src/core/)
- Wave 2: tmux manager, auditor, worker (parallel)
- Wave 3: Brain orchestrator (src/orchestra/brain.ts)
- Wave 4: CLI scaffold (16 commands via commander.js)
- Wave 5: Unit + integration tests

## Sprint 2-5: Lifecycle Hardening

- Sprint 2: Async migration (sleepSync → async sleep)
- Sprint 3: Semantic fixes (haiku_allowed, checkUsage regex)
- Sprint 4: Debt resolution lifecycle (resolveDebt, stale cleanup)
- Sprint 5: Decay, doctor, start, dashboard, coverage (644 tests, 94.83%)

## Sprint 6: First Dogfooding

Deckent ran itself for the first time:
- Generated README.md via deckent start
- Duration: 86 seconds, 1 task DONE
- Proved end-to-end orchestration loop works

## Sprint 7: MCP Server Integration

- 8 MCP tools + 4 resources (stdio transport)
- Zero-friction Claude Code integration
- Auto-registration in .claude/settings.json
- 24 new tests, 669 total, 0 regression

## Sprint 8: Documentation & MCP Dogfooding

- CONTRIBUTING.md, full API reference (docs/reference/api.md)
- MCP dogfooding: used Deckent's own MCP tools to develop
- 669 tests, 95% coverage

## Sprint 9: Analyzer & CI Pipeline

- 9th MCP tool: `deckent_analyze_project` (project stack/size/methodology detection)
- CI pipeline with GitHub Actions
- Dynamic version from package.json
- `deckent archive-debt` command
- Enriched sprint history
- 720 tests, 95% coverage

## Sprint 10: HTTP API & Terminal Dashboard

- HTTP API server (`src/api/server.ts`): 16 endpoints + SSE stream
- Terminal TUI dashboard (`deckent dashboard`)
- Sprint ID refactor (consistent format across codebase)
- `deckent serve` and `deckent web` CLI commands
- 799 tests, 95% coverage

## Sprint 11: Web Dashboard

- React + Vite + Tailwind web dashboard (`src/dashboard/`)
- 6 pages: Dashboard, Settings, History, Memory, Config, Status
- shadcn/ui component library (14 UI components)
- SSE real-time updates via file watcher
- SprintChart with Recharts, DebtTable, NewSprintModal
- Dark/light theme, mobile responsive
- 852 tests, 97% coverage

## Sprint 12-13: Brain AI Planning & Auditor In-Process

- Planner module (`src/orchestra/planner.ts`): AI task planning with Zod validation
- `BrainPlanningMode`: 'ai' | 'structured' | 'auto' config
- DRAFT task status + `confirmDraftTasks()`
- Auditor moved from tmux to in-process scan loop within Brain's `runSprint`
- `writeScanToDashboard()` merges scan results into dashboard
- `buildWorkerPrompt` now includes heartbeat file creation instructions
- `.deckent/` structure additions: TOOLS.md, BOOT.md, plugins/, i18n/
- 938 tests, 97.5% coverage

## Sprint 14: Auditor Live Integration (in progress)

- Auditor real scan loop runs between SPAWN and EXECUTE phases
- `startScanLoop` / `clearInterval` lifecycle in `runSprint`
- Worker heartbeat prompt instructions finalized
- `.deckent/` structure finalization
- 938 tests, 97.5% coverage

## Sprint 15: Deckent Bağımsızlık + Self-Hosting

- DECKENT.md as single source of truth (replaces AGENTS.md+CLAUDE.md symlink pattern)
- `ensureDeckentImport()` shared utility (`src/core/utils.ts`): additive, never destructive
- Init no longer overwrites CLAUDE.md — uses `ensureDeckentImport()` instead
- Config merge pattern: existing `.deckent/config.json` preserved, new fields added
- Blueprint-quality rule templates: brain.md (13 rules), auditor.md (9 rules), worker-default.md (9 rules) with frontmatter
- `deckent sync` CLI command + `deckent_sync` MCP tool (10th tool)
- `deckent://config` MCP resource (5th resource)
- Self-hosting: deckent-dev runs own `.deckent/` structure
- DEBT-002 closed (checkUsage resolved in sprint-003)
- 967 tests, 97.5% coverage, 29 new tests, 0 regressions

## Sprint 16: Watch Mode, Worker Logs, Agent Detail

- `deckent watch` CLI: live tmux split view (dashboard + worker panes), `--follow` flag
- Worker log capture via tmux pipe-pane → `.tasks/task-{id}.log`
- `deckent start --watch` flag: creates watch window before sprint runs
- GET `/api/worker/:taskId/log` endpoint: task JSON + worker log content
- AgentDetail React component with 3s polling, Sheet panel in DashboardPage
- `inferModelFromDirective()` heuristic: opus/sonnet/haiku by scope+complexity
- `.brain/` dogfooding: sprint-015.md, ADR-013, MEMORY.md updated
- 987 tests, 97.5% coverage, 20 new tests, 0 regressions

## Sprint 17: Reliability + Test Infra + Docs

- MCP `deckent_start` background jobs: `child_process.fork()`, returns `jobId` immediately, no MCP timeout
- Job state tracking in `.deckent/jobs/{jobId}.json` (RUNNING/COMPLETE/FAILED)
- `deckent_status` includes active job state
- `cleanup()` covers all task file extensions (.json, .plan, .hb, .result, .paused, .log), sprint prefix guard, 24h stale detection
- Sprint ID safety: `last_sprint_id` in `.deckent/config.json`, max of config vs file scan — never regresses
- Dashboard reset: fresh `DashboardState` on PLAN phase, sprint ID mismatch triggers reset in auditor
- React test infra: `src/dashboard/vitest.config.ts` (happy-dom), AgentDetail + DashboardPage tests
- `test:dashboard` npm script for separate dashboard test runs
- 1027 tests, 97.5% coverage, 40 new tests, 0 regressions

## Sprint 18: Orchestration Smoke Test — 10 Parallel Doc Tasks

- First real `runSprint` execution since Sprint 10 — end-to-end orchestration validated
- 10 doc tasks planned, 8 executed (max_workers=8 treated as task count limit — bug)
- 8 docs generated (~135 KB): GLOSSARY, TROUBLESHOOTING, SECURITY, MCP-GUIDE, MEMORY-SYSTEM, SPRINT-LIFECYCLE, CONFIG-REFERENCE, WORKER-GUIDE
- 8 sonnet workers ran in parallel, all completed in 260s
- 3 DONE, 5 GO_WITH_TECH_DEBT, 0 NO_GO
- 6 bugs discovered: planner task limit, heartbeat timestamp, dashboard progress lag, alert dedup, doc coverage criteria, DEBT.md test
- Observation report: docs/archive/observations/SPRINT-18-OBSERVATION.md
- 1027 tests (doc-only sprint — no new tests), 97.5% coverage, 0 regressions

## Sprint 19: Motor Repair — 6 Bug Fixes

- All 6 bugs from Sprint 18 addressed: heartbeat timestamp, dashboard progress, alert dedup, inferModelFromDirective, doc task criteria, auto doc update
- 8/8 tasks completed (6 DONE, 2 GO_WITH_TECH_DEBT), 760s
- `isDocTask()`: doc scopes skip coverage check
- `updateProjectDocs()`: auto-updates docs after sprint
- +96 tests (1027→1123), +1555 source lines, 0 regressions
- Observation report: docs/archive/observations/SPRINT-19-OBSERVATION.md

## Sprint 20: Fix Validation

- Systematic validation of Sprint 19 fixes — 3/6 confirmed PASSED
- Heartbeat timestamp: PASSED (0 stale alerts)
- Dashboard progress: PASSED (done counter correct)
- Alert dedup: PASSED (0 duplicate alerts)
- Task queue: FAILED (planner still limited by max_workers — fixed in Sprint 21)
- 8/14 tasks planned (planner bug still active), 113s
- 1027 tests (validation sprint), 0 regressions
- Observation report: docs/archive/observations/SPRINT-20-OBSERVATION.md

## Sprint 21: Parametric Orchestration

- `system-profile.ts`: CPU, RAM, recommended workers detection via `getSystemProfile()`
- `subscription.ts`: Claude plan detection via `detectSubscription()` (max_20x/max_5x/pro/api/unknown)
- `resolveTaskModel()`: layered model selection (scope → complexity → plan → usage)
- `resolveEffectiveWorkers()`: auto worker count from system profile
- `deckent test` + `deckent run` CLI commands (26→28 commands)
- Planner task queue fix: `planSprint` plans ALL tasks, `spawnWorkers` enforces parallelism limit
- DEBT.md decay bug recurred (3rd time) — resolved entries being removed
- 8/8 tasks (7 DONE, 1 TECH_DEBT), +137 tests (1123→1260), 631s
- Observation report: docs/archive/observations/SPRINT-21-OBSERVATION.md

## Sprint 22: Decay Fix + Auto Setup + MCP Enrichment

- `shouldRemoveResolvedDebt()` + `parseSprintNumber()`: resolved entries retained for 3 sprints (DEBT-002 preserved)
- Auto Setup Wizard (`auto-setup.ts`): `generateSetupRecommendation()` — subscription + system profile + project size
- MCP Enrichment (`enrich.ts`): `enrichResponse()` adds `_enriched: { summary, hints, timestamp }` to all 21 tools
- CLI Hints (`hints.ts`, `messages.ts`): `getContextualHints()` phase-based suggestions, `getMessage()` localized (tr/en)
- `doctor --profile`: system profile display (CPU, RAM, workers, subscription)
- AI planner still returned 8/12 tasks — Sprint 23 post-validation fix needed
- 8 tasks (6 DONE, 2 TECH_DEBT), +132 tests (1260→1392), ~150s

## Sprint 23: AI Planner Post-Validation Fallback + 12-Task Validation

- AI planner post-validation: if AI returns fewer tasks than `parseStructuredDirectives()` count → set `plannerResult = null`, fall back to structured mode
- First time 12/12 tasks planned and completed — task queue wave mechanism validated (8 workers + 4 queued)
- 11 validation docs in `tmp-test/` confirming Sprint 22 features
- Planning mode: `fallback` (AI returned 8, directives had 12 → structured fallback produced 12)
- 12 tasks (8 DONE, 4 TECH_DEBT, 0 NO_GO), 321s
- +30 tests (1392→1422), 55 test files, 0 regressions

## Sprint 24 (Mega Sprint): Plugin v2 + i18n + OSS Infrastructure

- Plugin v2 system: install (local/git), create (scaffold), remove, enable/disable, hooks (before/afterSprint, before/afterTask)
- i18n runtime: getMessage() with tr/en support, CLI hints, contextual messages
- +1449 tests in a single sprint (1701→3150) — largest test increase ever
- OSS infrastructure: CONTRIBUTING.md, LICENSE, CI pipeline, issue templates
- 3150 tests, 97.5% coverage

## Sprint 25-26: Tech Debt Cleanup + OSS Polish

- readJsonSafe import migration across brain.ts, debt-manager.ts, auditor.ts
- package.json files field, keywords, CODEOWNERS, dependabot.yml, FUNDING.yml
- GitHub Actions release workflow (basic)
- Dedicated test suites: debt-manager, task-builder, core/config, auditor, tmux, api/server
- Integration test: init→plan→status E2E
- FAQ document
- +292 tests (3150→3442), 136 test files, 0 regressions

## Sprint 27-29: Global Launch Preparation

Full directives available at:
- `docs/directives/sprint-027.md` — Technical gap closure (30 tasks)
- `docs/directives/sprint-028.md` — npm publish preparation (30 tasks)
- `docs/directives/sprint-029.md` — Real-world testing + beta publish (30 tasks)

Key deliverables across all three sprints:
- Provider abstraction layer (Claude, Codex, future providers)
- Subprocess spawn backend (tmux-free operation)
- Zero-config mode (`deckent start "description"`)
- Rollback mechanism (git safety points)
- Usage tracking (model-based token/call counting)
- npm publish pipeline + 0.1.0-beta.1 release
- English documentation overhaul
- Interactive onboard wizard
- E2E smoke tests across 4 project types
- Performance benchmarks (10/50/100 task sprints)
- Launch preparation (Product Hunt, Hacker News, Discord)

---

# 20. CLAUDE CODE INTEGRATION GUIDE

## How Claude Code Sees Deckent

When you open Claude Code in a Deckent project:

1. Claude reads CLAUDE.md (which contains `@DECKENT.md` reference)
2. DECKENT.md has @imports → Claude follows them:
   - @DIRECTIVES.md
   - @.brain/MEMORY.md
   - @.contracts/api-surface.md
3. .claude/rules/ files activate based on context:
   - Editing src/core/ → worker-default.md rules apply
   - Running orchestrator → brain.md rules apply
4. Claude Code's auto-memory works alongside .brain/:
   - Auto-memory: Claude's own corrections
   - .brain/MEMORY.md: Brain's explicit learnings
   - Both complement each other

## Rules Files (.claude/rules/)

```markdown
<!-- .claude/rules/brain.md -->
---
paths: [".tasks/*", ".brain/*", ".contracts/*"]
---
# Brain Rules
- Always read DIRECTIVES.md first
- Always check usage before planning
- Plan mode required before execution
- Write sprint plan as task JSON files
- Evaluate every result: DONE / GO+DEBT / NO-GO
- Update MEMORY.md after every sprint
```

```markdown
<!-- .claude/rules/auditor.md -->
---
paths: [".dashboard", ".brain/PATTERNS.md"]
---
# Auditor Rules
- NEVER write source code
- Scan heartbeats for staleness (>2min = alert)
- Check git diff for boundary violations
- Overwrite .dashboard on every scan
- Append patterns to PATTERNS.md (not overwrite)
```

```markdown
<!-- .claude/rules/worker-default.md -->
---
paths: ["src/**", "tests/**"]
---
# Worker Rules
- Read your task file first
- Write plan before writing code
- Check .locks/ before writing any file
- Update heartbeat on every file change
- Run tests before marking done
- Document changes
- Stay within your assigned scope
```

## Starting a Sprint with Claude Code

```bash
# In your terminal
cd my-project
deckent start

# This runs:
# 1. deckent doctor (preflight)
# 2. tmux new-session -s deckent
# 3. claude -p "Brain prompt..." --model opus (plan sprint)
# 4. For each task: tmux new-window + claude -p "Worker prompt..." --model sonnet
# 5. Auditor loop starts
# 6. You: tmux attach -t deckent (watch everything)
```

---

# 21. MCP SERVER ARCHITECTURE

## Overview

Deckent integrates into Claude Code via the Model Context Protocol (MCP). The MCP server runs as a local stdio process — no extra authentication needed. Claude Code calls Deckent tools naturally through conversation.

## Installation

```bash
# Option 1: Via deckent init (auto-registers)
deckent init

# Option 2: Manual registration
claude mcp add deckent -- npx deckent-mcp
```

Both methods register in `.claude/settings.json`:
```json
{
  "mcpServers": {
    "deckent": {
      "command": "deckent-mcp",
      "args": []
    }
  }
}
```

## Tools (22)

### Lifecycle Tools

| Tool | Input | Maps To | Purpose |
|------|-------|---------|---------|
| `deckent_init` | projectName, mode?, language? | init.ts scaffold | Initialize Deckent in a project |
| `deckent_set_directives` | content: string | writes DIRECTIVES.md | Set sprint goals |
| `deckent_plan` | dryRun?, mode?: 'ai'\|'structured'\|'auto' | readContext → planSprint | Plan sprint, return task list |
| `deckent_start` | autoApprove?: boolean | runSprint() | Run full sprint lifecycle |
| `deckent_run` | task description, model? | single task execution | Run a single task without full sprint |
| `deckent_review` | none | evaluateResults() | Evaluate sprint: GO / NO_GO / GO_WITH_TECH_DEBT |
| `deckent_cleanup` | none | archiveTasks + releaseLocks | Archive task files, release locks |
| `deckent_kill` | target: 'all' \| workerId | killWorkers() | Kill running sprint or specific worker |
| `deckent_checkpoint` | action: 'approve'\|'reject' | checkpoint handler | Approve or reject human checkpoint |

### Information Tools

| Tool | Input | Maps To | Purpose |
|------|-------|---------|---------|
| `deckent_status` | none | reads .dashboard | Get current sprint dashboard |
| `deckent_doctor` | none | runDoctorChecks() | System health check |
| `deckent_retro` | none | reads RETRO.md | Latest sprint retrospective |
| `deckent_history` | last?: number | reads .brain/sprints/ | Sprint history logs |
| `deckent_help` | none | runtime capabilities | Runtime state, capabilities, and usage guide |
| `deckent_explain` | query | sprint history analysis | Explain sprint results and history |
| `deckent_watch` | none | live monitoring | Watch sprint progress in real-time |

### Configuration & Sync Tools

| Tool | Input | Maps To | Purpose |
|------|-------|---------|---------|
| `deckent_config` | action: 'read'\|'set', key?, value? | loadConfig/setConfig | Read or set configuration values |
| `deckent_sync` | none | ensureDeckentImport() | Sync CLAUDE.md + AGENTS.md with @DECKENT.md reference |
| `deckent_analyze_project` | none | analyzeProject() | Analyze project stack, size, methodology |
| `deckent_docs` | action: 'add'\|'remove'\|'list' | managed-docs config | Sprint lifecycle document management |

### Agent, Skill & Memory Tools

| Tool | Input | Maps To | Purpose |
|------|-------|---------|---------|
| `deckent_agent_list` | none | reads agent pool | List registered agents (built-in + temp) |
| `deckent_skill_list` | none | reads skill registry | List registered skills (manifest + AST sandbox) |
| `deckent_memory_query` | text, type?, tags? | searchMemory() | Cross-source memory search (ADR, sprint, debt, pattern) |

## Resources (8)

| URI | Content | MIME Type |
|-----|---------|-----------|
| `deckent://dashboard` | Live sprint status (JSON) | application/json |
| `deckent://directives` | Current DIRECTIVES.md | text/markdown |
| `deckent://memory` | Brain memory summary (.brain/exports/summary.md) | text/markdown |
| `deckent://debt` | Tech debt items (parsed table → JSON) | application/json |
| `deckent://config` | Project config (.deckent/config.json) | application/json |
| `deckent://retro` | Last sprint retrospective (RETRO.md) | text/markdown |
| `deckent://tasks` | Active task list with status | application/json |
| `deckent://agents` | Registered agent pool with stats | application/json |

## Auth Chain

```
Claude Code (Pro/Max/API login)
  → MCP stdio (local process, zero extra auth)
    → Core Engine (brain.ts, auditor.ts, worker.ts)
      → tmux → claude -p (inherits Claude Code session)
  → API mode: ANTHROPIC_API_KEY env variable
```

## Key Design Decision: deckent_set_directives

The biggest UX pain point was manually writing DIRECTIVES.md in the correct `## Gorev N:` format. The `deckent_set_directives` tool solves this:

1. User says "Add JWT authentication with login/register" in natural language
2. Claude formats this into structured `## Gorev N:` blocks
3. Tool writes the formatted content to DIRECTIVES.md
4. Brain's `parseStructuredDirectives()` reads it unchanged

The MCP tool is a writer; Claude is the formatter. Core engine parsing stays untouched.

---

# 22. USER FLOWS

## Flow 1: First Setup (MCP User)

```
User:    "Set up Deckent for this project"
Claude:  → calls deckent_doctor (health check)
         → calls deckent_init(projectName: "my-app", mode: "max_plan")
         → "Created .deckent/, .brain/, .tasks/. Registered MCP server.
            Edit DIRECTIVES.md or tell me your goals."
```

## Flow 2: First Sprint

```
User:    "Add JWT auth with login/register, protected routes, and profile page"
Claude:  → calls deckent_set_directives(content: "## Gorev 1: Auth API\n...")
         → calls deckent_plan()
         → "4 tasks planned: Auth API (sonnet), Middleware (sonnet)..."
User:    "Start it"
Claude:  → calls deckent_start()
         → Sprint runs, user waits
User:    "How's it going?"
Claude:  → reads deckent://dashboard
         → "2/4 done, w-002 in testing, w-003 coding..."
```

## Flow 3: Ongoing Usage

```
User:    "What did we learn last sprint?"
Claude:  → reads deckent://memory + calls deckent_history()
         → Shows learnings and metrics

User:    "Tech debt status?"
Claude:  → reads deckent://debt
         → "3 open items, 1 HIGH priority (2 sprints unfixed)"

User:    "Add dark mode support"
Claude:  → deckent_set_directives → deckent_plan → [user approves] → deckent_start
```

**The user NEVER needs to:**
- Open or edit DIRECTIVES.md manually
- Type terminal commands
- Know agile/sprint terminology
- Understand .tasks/ or .brain/ internals

## Flow 4: Zero-Config Mode (Planned — Sprint 27)

```
# No DIRECTIVES.md needed — single line of natural language
$ deckent start "Add user authentication with JWT and Google OAuth"

# Deckent automatically:
# 1. Creates temporary DIRECTIVES.md with structured tasks
# 2. AI planner decomposes into 3-5 subtasks:
#    - Auth API endpoints (sonnet)
#    - Google OAuth integration (opus)
#    - Login page UI (sonnet)
#    - Tests + documentation (haiku)
# 3. Plans sprint with model assignment
# 4. Creates git safety point (rollback branch)
# 5. Spawns workers, runs sprint
# 6. On completion: cleans temporary DIRECTIVES

# Quick fix mode:
$ deckent start "Fix the TypeScript errors in src/api/"
# → Single-task sprint, targeted scope

# Review mode (future):
$ deckent review
# → Analyzes current PR, suggests improvements
```

**Zero-config enables:**
- First-time users start in <30 seconds
- No need to learn DIRECTIVES.md format
- AI handles task decomposition automatically
- Rollback safety on full failure

## Flow 5: Provider-Agnostic Usage (Planned — Sprint 29+)

```
# Auto-detect available CLI tools
$ deckent doctor --profile
  Provider: Claude CLI (claude v2.1.32) ✓
  Provider: OpenAI Codex CLI (codex v1.0) ✓
  Recommended: Claude for Brain, Codex for workers (cost optimization)

# Mix providers
$ deckent config set brain_provider claude
$ deckent config set worker_provider codex
$ deckent start "Build REST API for user management"
# → Brain plans with Claude Opus
# → Workers execute with OpenAI GPT-4.1
```

---

# 23. STRATEGIC ROADMAP

## Phase 1: Claude Native Stable (Sprint 1-16) — COMPLETE

**Goal:** Rock-solid Claude-native orchestration with MCP integration.

| Sprint | Focus | Status |
|--------|-------|--------|
| 1 | Core engine (brain, auditor, worker, tmux, CLI) | Done |
| 2 | Async migration, lifecycle hardening | Done |
| 3 | Semantic fixes, usage parsing | Done |
| 4 | Debt resolution lifecycle | Done |
| 5 | Decay, doctor, dashboard, coverage | Done |
| 6 | First dogfooding (self-run) | Done |
| 7 | MCP server (8 tools, 4 resources) | Done |
| 8 | Documentation, API docs, MCP dogfooding | Done |
| 9 | Analyzer tool, CI, dynamic version, archive-debt | Done |
| 10 | HTTP API+SSE, terminal dashboard, sprint ID refactor | Done |
| 11 | Web Dashboard (React+Vite+Tailwind, 6 pages) | Done |
| 12-13 | Brain AI planning, Auditor in-process, .deckent structure | Done |
| 14 | Auditor live integration, .deckent finalization | Done |
| 15 | Deckent bağımsızlık, self-hosting, DECKENT.md, sync | Done |
| 16 | Watch mode, worker logs, agent detail, model inference | Done |

**Exit criteria:** 1027+ tests, 97%+ coverage, stable MCP integration, HTTP API, Web Dashboard, AI planning, DECKENT.md bağımsızlık. ✅ ALL MET.

## Phase 2: Self-Orchestration & Learning (Sprint 17-26) — COMPLETE

**Goal:** Continued dogfooding, plugin system, advanced learning.

- Run 5+ consecutive sprints on Deckent's own codebase — ✅ Done (18 consecutive sprints)
- Brain learns from its own retros and improves plans — ✅ Done
- Auditor catches real boundary violations — ✅ Done
- Tech debt escalation triggers automatically — ✅ Done
- Memory decay keeps `.brain/` under 900 lines — ✅ Done
- Plugin system v2 (install/create/remove/hooks) — ✅ Done (Sprint 24)
- i18n runtime — ✅ Done (Sprint 24)
- OSS infrastructure (CONTRIBUTING, LICENSE, CI) — ✅ Done (Sprint 24-26)
- 3442 tests, 136 test files — ✅ Done

## Phase 3: Global Launch Preparation (Sprint 27-29) — COMPLETE

**Goal:** Technical gap closure → npm publish → real-world testing → beta launch.

### Sprint 27: Technical Gap Closure (30 tasks)
Full directive: `docs/directives/sprint-027.md`

| Focus Area | Tasks | Key Deliverables |
|------------|-------|------------------|
| Provider Abstraction | 5 | ProviderAdapter interface, ClaudeAdapter, ProviderRegistry, brain.ts integration |
| Subprocess Spawn | 2 | SubprocessSpawnBackend (tmux-free), SpawnBackendFactory |
| Coverage Validation | 2 | parseCoverageFromVitest, brain evaluateResult integration |
| Usage Tracking | 3 | UsageTracker, brain integration, `deckent usage` real implementation |
| Zero-Config Mode | 2 | `deckent start "description"`, AI planner single-line decomposition |
| Rollback | 2 | Git safety point, brain integration, auto-rollback on full NO_GO |
| Worker IPC | 2 | MessageChannel (process.send), brain dual-mode (IPC + file fallback) |
| Sandbox Mode | 2 | SandboxSpawnBackend, `--sandbox-mode` real implementation |
| Global Config | 3 | ~/.deckent/, CLI --global, credentials management |
| Validation & Testing | 4 | Task retry, deadlock detection, pattern learning, integration tests |
| Doc Updater | 1 | Sprint metrics in README |
| Config Validation | 2 | Enhanced validation, provider-aware config |

### Sprint 28: npm Publish Preparation (30 tasks)
Full directive: `docs/directives/sprint-028.md`

| Focus Area | Tasks | Key Deliverables |
|------------|-------|------------------|
| Build & Publish Pipeline | 4 | package.json, build verify, npm pack, publish script |
| English Documentation | 6 | README overhaul (3 sections), QUICKSTART, API docs, CONFIG-REFERENCE |
| Interactive Onboarding | 3 | TUI wizard framework, `deckent onboard`, `deckent upgrade` |
| Error UX | 4 | Error registry, CLI handler, doctor improvements, i18n errors |
| OSS Files | 4 | LICENSE, issue templates, PR template, SECURITY.md |
| npm Compatibility | 3 | npx support, init post-publish, --version enhancement |
| Launch Content | 2 | Landing page content, CONTRIBUTING.md update |
| Automation | 3 | CHANGELOG updater, telemetry opt-in, release checklist |
| Integration Test | 1 | npm install simulation E2E |

### Sprint 29: Real-World Testing + Beta Publish (30 tasks)
Full directive: `docs/directives/sprint-029.md`

| Focus Area | Tasks | Key Deliverables |
|------------|-------|------------------|
| Cross-Project Testing | 4 | React/Next.js, Python/FastAPI, Rust CLI, Monorepo scenarios |
| E2E Smoke Tests | 4 | Full flow, zero-config, MCP chain, error scenarios |
| npm Beta Publish | 2 | 0.1.0-beta.1, GitHub Actions release workflow |
| CI Improvements | 1 | Matrix (Node 18/20/22), coverage, PR comments |
| Performance Benchmarks | 3 | 10-task, 50-task, 100-task stress tests |
| Launch Preparation | 4 | GIF demo script, Product Hunt doc, HN post draft, Discord setup |
| Notifications | 2 | Webhook provider, brain integration |
| Platform Compat | 2 | Cross-platform tests, doctor post-publish checks |
| Provider Expansion | 2 | Auto-detect providers, Codex CLI adapter (basic) |
| Templates | 2 | Template gallery, `deckent init --template` |
| Regression | 2 | Sprint 027-028 regression suite, beta launch checklist |

**Exit criteria:** `npm install -g deckent@beta` works. `deckent init && deckent start "hello"` completes in <60s. 3+ project types tested. Performance benchmarks baselined. Launch docs ready.

## Phase 4: Agent/Skill Intelligence (Sprint 29-33) — COMPLETE (Sprint 133 Readiness 3.6/5)

**Goal:** Dynamic agent pool, composable skills, intelligent Brain decisions, polished UX.

Full architecture: `docs/architecture/agent-skill-architecture.md`

### Sprint 29: Agent Pool Core + Brain Integration (30 tasks)
Full directive: `docs/directives/sprint-029.md`

| Focus Area | Tasks | Key Deliverables |
|------------|-------|------------------|
| Agent Types & Pool | 3 | AgentDefinition type, AgentPool class, agent selector algorithm |
| Built-in Agents | 8 | security-auditor, test-writer, doc-writer, code-reviewer, refactorer, bug-fixer, api-builder, performance-analyzer |
| Brain Integration | 3 | planSprint agent selection, prompt injection, worker agent context |
| Agent Lifecycle | 3 | Stats tracking, pattern learning, temp agent creation |
| CLI Commands | 3 | deckent agent list/create/enable/disable |
| Multi-Agent | 2 | Shared context file, sequential pipeline |
| Testing & Docs | 3 | Integration tests, agent documentation |

### Sprint 30: Skill System + Stack Detection (30 tasks)
Full directive: `docs/directives/sprint-030.md`

| Focus Area | Tasks | Key Deliverables |
|------------|-------|------------------|
| Skill Types & Pool | 2 | SkillDefinition type, SkillPool class |
| Stack Detection | 2 | detectProjectStack, cache system |
| Skill Selection | 2 | Selector algorithm, composition resolver |
| Built-in Skills | 10 | typescript-expert, react-specialist, python-expert, api-builder, database-migration, testing-expert, documentation-writer, security-specialist, performance-optimizer, devops-engineer |
| Brain Integration | 2 | planSprint skill selection, model-selector skill preference |
| Prompt Injection | 1 | buildWorkerPrompt with skill SKILL.md content |
| CLI Commands | 3 | deckent skill list/create/install |
| Marketplace | 1 | Local skill registry foundation |
| Testing & Docs | 4 | Integration tests, stack detection E2E, skill docs |
| Config | 1 | Skill configuration in DeckentConfig |

### Sprint 31: Brain Decision Engine + Learning Loop (30 tasks)
Full directive: `docs/directives/sprint-031.md`

| Focus Area | Tasks | Key Deliverables |
|------------|-------|------------------|
| Decision Engine | 7 | TaskAnalyzer, DecisionOrchestrator, 6-step flow, logging, replay |
| Learning Loop | 5 | Pattern recorder/reader, combination scorer, decay, migration |
| Multi-Agent Collab | 5 | Parallel pipeline, shared memory, conflict resolver, result merger, handoff |
| Adaptive Agent | 5 | Prompt self-improvement, A/B testing, versioning, rollback, metrics |
| Context Enrichment | 4 | Stack/agent/skill/history context for Brain |
| Config | 2 | Decision + learning configuration |
| Integration Tests | 2 | Decision engine E2E, collaboration E2E |

### Sprint 32: UX — Progress, Summary, Notifications (30 tasks)
Full directive: `docs/directives/sprint-032.md`

| Focus Area | Tasks | Key Deliverables |
|------------|-------|------------------|
| Progress System | 5 | Real-time renderer, ETA calculator, worker status, queue display |
| Sprint Summary | 5 | Rich formatter, change categorizer, agent performance, recommendations |
| Notifications | 5 | Terminal bell, webhook, Discord, Slack, config |
| Agent/Skill Visibility | 5 | Dashboard, status, retro, history, MCP enrichment |
| Interactive Review | 4 | Post-sprint review, task approval/rejection, selective retry |
| CLI Polish | 3 | Color themes, output modes, progress persistence |
| Integration Tests | 3 | E2E tests for progress, notifications, review |

### Sprint 33: Integration Testing + Marketplace + Analytics (30 tasks)
Full directive: `docs/directives/sprint-033.md`

| Focus Area | Tasks | Key Deliverables |
|------------|-------|------------------|
| Integration Tests | 5 | Full agent+skill sprint, 3 project types, error scenarios |
| Skill Marketplace | 5 | Remote registry, search/publish commands, ratings, dependency resolution |
| Adaptive Agent Advanced | 5 | Cross-sprint analysis, drift detection, auto-retire, evolution log |
| Analytics Dashboard | 5 | Web page, usage graphs, success charts, agent comparison |
| Performance | 5 | Selection cache, loading cache, token counter, lazy loading, batch stats |
| Security & Config | 3 | Marketplace auth, skill sandboxing, permission escalation prevention |
| Documentation | 2 | Full system docs, release preparation |

**Exit criteria:** 8 built-in agents working. 10 built-in skills working. Stack detection auto-selects skills. Brain 6-step decision engine functional. Learning loop improves selections across sprints. Progress bar + rich summary in CLI. Notification webhooks working. Skill marketplace foundation ready.

### Sprint 34: Real-World Testing + Beta Publish (30 tasks)
Full directive: `docs/directives/sprint-034.md`
(Moved from original Sprint 29 plan)

## Phase 5: Multi-Provider & Ecosystem (Sprint 35-38) — COMPLETE

**Goal:** Run workers on different providers simultaneously. VSCode extension. Community ecosystem.

**Completed:**
- Provider adapters: OpenAI Codex CLI, Gemini CLI — DONE (Sprint 038)
- Brain on Opus (Claude), workers on GPT-4o (OpenAI) — mix and match — DONE (Sprint 038)
- Cost optimization: expensive tasks on powerful models, simple on cheap — DONE (tier-based equivalence, Sprint 038)
- Plugin system v3 (security hardened, skill sandbox AST) — DONE (Sprint 037)
- Memory system fix — DONE (Sprint 037)
- Platform decoupling (planner/tmux/subprocess) — DONE (Sprint 038)
- Beta cleanup: readJsonSafe, error handling, type safety, brain.ts split — DONE (Sprint 035-036)

## Phase 6: Governance & Hardening (Sprint 133-145) — IN PROGRESS

**Goal:** Enterprise-grade governance, security hardening, architectural finalization.

**Completed (Sprint 133-144):**
- Security hardening: plugin SHA-256 signing, SkillSandbox AST, shell injection fix, path traversal fix — DONE (Sprint 133, 143)
- ADR Governance Integration: MADR v3 hybrid, 37 ADR migration, ADR-036 self-referential — DONE (Sprint 138)
- ADR-035 Verification Protocol Standard: 15 channel codes V1.0 — DONE (Sprint 138)
- ADR-037 RBAC Authority Matrix V1.0: formal role-based access control — DONE (Sprint 139)
- ADR-038 Dead Code Disposition + ADR-039 Self-Modifying Task Detection: architectural protection — DONE (Sprint 139)
- Auditor 3-Pipeline verification: independent result validation — DONE (Sprint 138)
- Structured Event Stream + scope collision detection — DONE (Sprint 138)
- Worker Honest Assessment Calibration v2 — DONE (Sprint 138)
- Long-Running Sprint Resume MVP — DONE (Sprint 138)
- Docker HB 5-sprint P0 fix — DONE (Sprint 139)
- Chain Dependency Scheduler (Kahn's topological sort) — DONE (Sprint 139)
- Backend Parity 3/3 (Docker + tmux + subprocess E2E) — DONE (Sprint 139)
- Memory V2 DB-First (SQLite FTS5, dual-layer normalize) — DONE (Sprint 140-143)
- Comprehensive codebase analysis (316+ files) — DONE (Sprint 141-142)
- God object split: init.ts, doctor.ts, retro.ts, sprint-controller.ts — DONE (Sprint 136, 144)
- Auditor async scan loop (52 sync I/O eliminated) — DONE (Sprint 144)
- i18n basic CLI (5 commands TR/EN) — DONE (Sprint 144)

**Closed in Sprint 165 (Brain Final Stability):**
- Bug X — Brain "no-result → CODE_VERIFIED_DONE" stub fixed (Sprint 156-011 CRITICAL debt CLOSED)
- Bug Y — Brain processQueue legacy FIFO Wave 2→3 stall resolved (Sprint 161 replay closure)
- Bug Z — Vitest gate +1 fail chronic delta-zero closure (worker honest-result gate)
- Bug W — Auditor `dead_event_stream` detector reactivated
- Docs freeze: managed-doc cache contract sealed pending Sprint 166 sprint-aware cache key

**Closed in Sprint 166 (Brain Self-Update + Data Integrity, 10/11 DONE):**
- **Bug M** — adrInsert post-finalize hook wired: `src/core/adr-file-sync.ts` parses `docs/adr/*.md` MADR v3 headers + upserts memory.db; ADR-043/044/045/046 now flow into DB automatically (Sprint 156-011 corollary CLOSED)
- **Bug N** — `cli/commands/finalize.ts:166` now passes `onRuleRegen` callback; manual finalize path regenerates `.claude/`, `.codex/`, `.gemini/`, `.cursor/` rules (13-sprint stale chain broken)
- **Bug S** — `doc-cache.ts` cache key extended with `sprint.id`; CLAUDE.md now auto-updates each sprint (Sprint 130-151 commit chain anomaly resolved)
- **Bug Y2** — 3-layer ground-truth defense: unit test + integration assertion + Auditor runtime `verifyDocSyncGroundTruth()` at `auditor.ts` runScanCycle; `.deckent/ground-truth-overrides.json` whitelist
- **Bug U+V** — `sprint-retro-writer.ts` type='sprint' insert restored; `memory-import.ts:54 parseDebtMd` sprint_id regex backfill (100+ debt entries); 9-sprint memory backfill (134/140/152/157-161/165)
- **Bug C+X** — DECKENT.md broken `.brain/DECISIONS.md` ref → `.brain/exports/decisions.md`; summary.md "Active Technical Debt" filter `status != 'resolved'`
- **Bug P** — TOOLS.md / BOOT.md / WORKER-GUIDE.md auto-content generators wired via `managed-docs/content-generators.ts` (27 MCP + 56 CLI enumerated from code, anti-pattern listesi, RBAC ADR-037 anchor)
- **Bug Q+W** — Provider parity: `.codex/rules/`, `.gemini/rules/`, `.cursor/rules/` synced with `.claude/rules/` frontmatter; Auditor `emitAlert` helper (`src/monitor/alert-emitter.ts`) + `stale_md` detector
- **Bug K+L** — `worker-verify.ts:379` verify-ran marker atomic write (tmp + renameSync); CHANGELOG + sprint-history test sprint count refreshed
- **ADR-046 accepted** — Brain Self-Update Hook Architecture (Wave 1.5 bootstrap gate); Step Ordering Contract Section 5.1 documented

**Open Tech Debt (Sprint 166 → 167 carryover):**
- T3 doc-cache runner wire-up — cache fix DONE but managed-docs runner integration deferred to Sprint 167

**Remaining (Sprint 167+):**
- Provider-specific tool mapping (allowedTools → function_calling)
- Local models (Ollama) adapter
- VSCode extension (sidebar, status bar, sprint management)
- GitHub App (issue → sprint → PR automation)
- Team mode: shared sprints, role-based access
- Skill marketplace (community skills + agents)
- Claude Code Agent Teams integration (native spawn backend)
- Rubric-based grading (CMA model)
- Agent versioning (CMA model — immutable version history, rollback, A/B testing)
- REST API / OpenAPI spec for multi-SDK access

## Phase 7: Platform & Enterprise (Sprint 150+) — VISION

**Goal:** Deckent as a platform for AI-driven development.

- Deckent Hub: community templates, plugins, DIRECTIVES examples
- CI/CD integration: auto `deckent plan --dry-run` on PR
- Cloud orchestration: remote tmux-free workers
- Multi-project orchestration: cross-repo sprints
- Managed environment templates (CMA model — structured container configs per project type)

**Note:** Enterprise features like SSO, RBAC, and audit logging are partially addressed by ADR-037 (RBAC) and the event stream audit trail (ADR-035). ADR-039 Self-Modifying Task Detection provides architectural protection for dogfooding scenarios. Full enterprise platform features are deferred to Phase 7, consistent with ADR-033's Product-Not-Service vision.

---

# 24. SPRINT HISTORY

| Sprint | Tests | Coverage | Highlights |
|--------|-------|----------|------------|
| 1 | 432 | 89% | Core engine: types, config, brain, auditor, worker, tmux, CLI |
| 2 | 480 | 91% | sleepSync → async sleep migration |
| 3 | 540 | 92% | haiku_allowed semantic fix, checkUsage regex |
| 4 | 617 | 93% | resolveDebt lifecycle, stale debt cleanup |
| 5 | 644 | 94.83% | Decay, doctor, start --dry-run, status --watch, barrel excludes |
| 6 | 645 | 95% | First dogfooding: README.md generated in 86s, 1 task DONE |
| 7 | 669 | 95% | MCP server: 8 tools, 4 resources, auto-registration, 24 new tests |
| 8 | 669 | 95% | CONTRIBUTING.md, API docs, MCP dogfooding |
| 9 | 720 | 95% | analyze_project tool, CI pipeline, dynamic version, archive-debt |
| 10 | 799 | 95% | HTTP API+SSE, terminal dashboard, sprint ID refactor |
| 11 | 852 | 97% | Web Dashboard: React+Vite+Tailwind, 6 pages, shadcn/ui |
| 12-13 | 938 | 97.5% | Brain AI planning (planner.ts, Zod), Auditor in-process, .deckent structure |
| 14 | 938 | 97.5% | Auditor live integration, .deckent finalization |
| 15 | 967 | 97.5% | DECKENT.md bağımsızlık, ensureDeckentImport, sync CLI+MCP, self-hosting, DEBT-002 closed |
| 16 | 987 | 97.5% | deckent watch, worker log capture, start --watch, agent detail view, model inference |
| 17 | 1027 | 97.5% | MCP background jobs, cleanup fix, sprint ID safety, dashboard reset, React test infra |
| 18 | 1027 | 97.5% | Orchestration smoke test: 8 docs, first real runSprint since S10, 6 bugs found |
| 19 | 1123 | 97.5% | Motor repair: 6 bug fixes (heartbeat, dashboard, alert dedup, model inference, doc criteria, auto doc) |
| 20 | 1027 | 97.5% | Fix validation: 3/6 confirmed (heartbeat, dashboard, alert dedup), planner still broken |
| 21 | 1260 | 97.5% | Parametric orchestration: system-profile, subscription, resolveTaskModel, auto workers, test+run CLI |
| 22 | 1392 | 97.5% | Decay fix, auto setup wizard, MCP enrichment 10/10, CLI hints, doctor --profile |
| 23 | 1422 | 97.5% | AI planner fallback fix, 12/12 tasks (first time), task queue waves validated |
| 24 (Mega) | 3150 | 97.5% | Plugin v2, i18n runtime, +1449 tests, OSS infra (CONTRIBUTING, LICENSE, CI) |
| 25-26 | 3442 | 97.5% | Tech debt cleanup, readJsonSafe migration, integration tests, OSS files |
| 27 | 3609 | 97.5% | Technical gap closure: provider abstraction, subprocess backend, usage tracker, coverage validator, rollback, worker IPC, sandbox, global config, zero-config, credentials. 13 new modules, +14,737 lines |
| 28 | 4100 | 97.5% | npm publish prep: error registry, TUI wizard, onboard/upgrade real, English docs, publish pipeline, .npmignore, telemetry, SECURITY.md |
| 29 | 5300 | 97.5% | Agent Pool Core: 8 built-in agents, selector algorithm, Brain integration, multi-agent pipeline, shared context, CLI commands |
| 30 | 5700 | 97.5% | Skill System: 10 built-in skills, stack detection, prompt injection, skill selector, registry, CLI commands |
| 31 | 6400 | 97.5% | Brain Decision Engine: 6-step pipeline, learning loop, parallel pipeline, shared memory, conflict resolver, adaptive agent (prompt A/B, versioning, rollback) |
| 32 | 6900 | 97.5% | UX: progress bar, rich summary, notifications (terminal/webhook/Discord/Slack), interactive review, agent/skill visibility, theme, output modes |
| 33 | 7500 | 97.5% | Integration tests (3 project types), skill marketplace, adaptive agent advanced (drift/retirement/genealogy), analytics data, performance caching, security (sandbox/permission guard) |
| 35 | 7815 | 97.5% | Beta Cleanup Wave 1+2: readJsonSafe migration, error handling unification, silent catch logging, parseBody type safety, utility extraction, EventEmitter fix. 11 tasks |
| 36 | 8073 | 97.5% | Beta Cleanup Wave 3+4: brain.ts split (1312→58 lines), spawn-backend move, types.ts split, non-null assertion refactor, barrel cleanup, auditor queue fix. 11 tasks, +315 tests |
| 37 | 8073 | 97.5% | Beta Cleanup Wave 5+6: Security hardening, plugin system, memory fix, skill sandbox AST, JSDoc. 16 tasks, +258 tests, 8073 total |
| 38 | 8555 | 97.5% | Multi-Provider Infrastructure: ModelType extension (8 models, 3 providers), Codex+Gemini adapters, provider routing, planner/tmux/subprocess decoupling, platform support. 20 tasks, +476 tests |
| 039 | 8560 | 97.5% | Beta final sprint: Codex adapter real CLI fix (1/19 done, 18 NO_GO), .result file generation fix, FIX phase stabilization |
| 040 | 8750 | 97.5% | Worker feedback loop + human-friendly output: worker verify loop (tsc+vitest), feedback metrics, prompt overhaul, CLI sprint summary. 7/13 done |
| 041 | 8960 | 97.5% | Human-friendly output complete: MCP format, dashboard SprintSummary, doctor, retro, error messages, worker logs. 7/7 done, 0 NO_GO |
| 042 | 9100 | 97.5% | Stabilization: npm validation, global install E2E, provider smoke tests, version bump 0.2.0-beta.1. 3/8 done |
| 043 | 9300 | 97.5% | Fix & stabilization: hardcoded claude removed, verify-publish semver fix, project-identity fix, auditor stale filtering, single-provider E2E tests |
| 044 | 9600 | 97.5% | MCP-Native Providers foundation: .deck secrets, full config, Kraken splash, environment detection, task router, connector, sync+explain commands, rich sprint output, DEBT auto-resolve |
| 045 | 9900 | 97.5% | MCP-Native Providers wired: connector+router in sprint lifecycle, Codex/Gemini real CLI adapters, .deck auth, doctor health, rich output, env-aware init, smoke tests |
| 046 | 10127 | 97.5% | Multi-environment runtime: deckent start lifecycle, vscode extension stub, stack detection expansion, multi-env init wizard, language-agnostic verify. 8/10 done, 10K+ tests |
| 047 | 10127 | 97.5% | Stabilization sprint: 0/10 (all NO_GO), manual debt resolution, MEMORY decayed, all debt resolved |
| 048 | 10200 | 96% | Claude MCP Backend + Sandbox Mode + API Integration. 8/8 done, 7 tech debt |
| 049 | 10200 | 96% | Health endpoints + exit handler + security headers + rate limiting. 8/8 done |
| 050 | 10300 | 96% | npm publish dry-run + README overhaul + CHANGELOG update. 5/5 done |
| 051 | 10300 | 96% | Config expansion + VitePress docs site setup + getting started guide. 8/8 done |
| 052 | 10300 | 96% | Dashboard full expansion. 1/1 done |
| 053 | 10400 | 96% | Self-healing bootstrap + skill injection. 2/8 done, 6 NO_GO |
| 054 | 10509 | 96.4% | Agent activation systemPrompt + Brain self-learning config suggestions. 4/4 done |
| 055 | 10509 | 96.4% | Retro parse fix, kill command, config nested keys, CLI polish. 10/10 done |
| 056 | 10509 | 96.4% | Major CLI overhaul attempt: init/plan/start/status. 7/20 done, 13 NO_GO — too ambitious scope |
| 057 | 10509 | 96.4% | status/retro/history complete, config quality. 11/13 done, 2 NO_GO |
| 058 | 10509 | 96.4% | Agent+skill+plugin+dashboard improvements. 2/2 done, 0 NO_GO — perfect execution |
| 059 | 10700 | 96.4% | CLI deep analysis + MCP expansion + provider support. 12/13 done, 1 NO_GO |
| 060 | 10700 | 96.4% | CLI/Agent/Skill/MCP/Sprint validation sweep. 6/6 done |
| 061 | 10900 | 96.4% | Agent assignment fix, brain budget decay, memory cleanup, CLI polish. 8/8 done |
| 062 | 11200 | 96.4% | ci-guardian agent + ci-testing skill + CI hooks (beforeSprint/afterTask/afterSprint). 8/8 done |
| 063 | 11500 | 96.4% | Routing v2 engine (intent-based 3-layer selection) + forceSkills support + CLI deep analysis completion. 7/14 done, 7 NO_GO |
| 064 | 11500 | 96.4% | Validation sprint: all 14 tasks NO_GO (duplicate of already-implemented S063 work) |
| 065 | 11862 | 96%+ | AI planner timeout config, autoMigrateOnLoad, cleanup fixes, spawn scope enforcement, analyzer merge. 7/7 done |
| 066 | 11862 | 96%+ | Manifest v2 batch update (20 files), MCP docs 16 tools/9 resources, gitignore cleanup. 7/7 done |
| 067 | 11862 | 96%+ | Paket 494KB, retro notes, any cleanup, output tests, routing v2 audit. 6/6 done |
| 068 | 11918 | 96%+ | MCP instructions, tool annotations, deckent_help tool. 6/6 done |
| 069 | 11918 | 96%+ | Agent selection precision, skill budget, scope parser fix. 6/6 done |
| 070-071 | 12000 | 96%+ | Windows dogfooding: init UX overhaul, 15+7 bug fixes, heartbeat periodic, upgrade --local. 15/15 done |
| 072 | 12160 | 96%+ | Tier generalizasyonu (performance/balanced/economic), MODEL_API_IDS, god object split faz 1. 5/5 done |
| 073 | 12176 | 96%+ | Self-dogfooding: 100 test regresyonu fix (43+16+9+23+3 → 0 fail). 5/5 done |
| 074 | 12176 | 96%+ | Docs tutarlılık, debt-069 kapanış, CHANGELOG/SPRINT-LOG. 7/7 done |
| 075 | 12196 | 96%+ | Docs TR tutarlılık, VISION.md, link audit, detect-secrets, god object faz 2. 5/5 done |
| 076 | 12196 | 96%+ | Stale heartbeat fix, dashboard API test, graceful shutdown, god object faz 3. 4/4 done |
| 077 | 12196 | 96%+ | CHANGELOG, SPRINT-LOG, PROJECT-IDENTITY, CLAUDE.md güncelleme. 3/3 done |
| 078-085 | 12194 | 89.33% | Blueprint sync, i18n Pattern System (ADR-032), dashboard UX polish, MCP parity expansion (17→21 tools), CLI/MCP feature parity (ADR-022-V2). |
| 086-100 | 12194 | 89.33% | Multi-provider ModelRegistry (13 models, 3 providers, 4 tiers). ModelType extension to 8 base models. Provider fallback chain. Tier-based equivalence (premium/standard/economy). Self-dogfooding continuous validation. |
| 101-120 | 12194 | 89.33% | God-object split continuation. Codebase accuracy reform. Docker Backend introduction (ADR-027 revisited). Sprint Timeout Reform initial implementation. Heartbeat Daemon. Human Checkpoints + Checkpoint CLI/MCP. |
| 121-130 | 12194 | 89.33% | Agent/Skill Evolution Pipeline (promotion, demotion, temp→permanent). Adaptive Thresholds. Context-Aware Routing (TaskDNA). Token Usage Tracker. Managed-Docs Universalization (ADR-029/030/031). Content Hash Cache (ADR-031). |
| 131-132 | 12372 | 89.33% | HTTP API auth (Bearer Token). loadConfig cache. 4 ADRs (029-032): Managed-Docs, Template Engine, Hash Cache, i18n Pattern. Sprint 132 360° enterprise audit: 118 findings (5 CRITICAL/22 HIGH), readiness baseline 3.2/5. |
| 133 | 12485 | 89.33% | Security hardening: plugin SHA-256 signing + SkillSandbox AST scan. 12/12 tasks DONE, 27m 21s, +147 net tests. Readiness: 3.2 → 3.6/5. |
| 134 | 12485 | 89.33% | Triple dogfooding + product vision. sprint-reporter.ts 4-way split (2297→96 LoC barrel). Task Dependency Pipeline live. Brain Self-Audit Gate. ADR-033/034 Product-Not-Service. 11 DONE + 4 TECH_DEBT. Readiness: 3.6 → 3.86/5 (+0.26). |
| 135 | 12478 | 89.33% | Operational hardening. Coordinator resilience (sprint-pid-manager.ts). Docker graceful shutdown. askBrain IPC registry. Planner priority+dependencies parsing. Brain budget DECAY_EXEMPT. Zero coordinator crash, 1h 0m 54s natural completion. Readiness: 3.86 → 3.93/5 (+0.07). |
| sprint-136 | 12684 | 89.33% | Architectural deepening. sprint-controller.ts 1890→209 LoC (-1681). T-005 priority wire dogfood fix. tryCodeVerifiedDone() helper (+408 LoC). gate.json+load-report wire code-ready. 7 DONE + 3 NO_GO. Test restoration Sprint 137 P0. Readiness: 3.93 → 3.925/5. |
| sprint-137 | 12700+ | 89.33% | Brain test suite post-refactor restoration. tryCodeVerifiedDone wire + in-sprint dogfood. gate.json + load-report runtime wire restore. ErrorRegistry lint script wire. Brain budget decay no-op bug fix. 6/6 done, 0 NO_GO, 35.9 min. |
| sprint-138 | 12800+ | 89.33% | ADR Governance Integration (MADR v3 hybrid + 37 ADR migration + ADR-036). ADR-035 Verification Protocol Standard (15 channel codes V1.0). Auditor Authority Extension 3-Pipeline (verifyWorkerResult + verifyFunctional + validateTechDebt + checkADRCompliance). Structured Event Stream + Scope Collision Detection (event-stream.ts 305 LoC + file-lock.ts 30→267 real). Layer 4 Runtime Wire Forensic Fix (ADR-006 live enforcement). Worker Honest Assessment Calibration v2. Long-Running Sprint Resume MVP (sprint-checkpoint.ts + resume.ts). 11/11 done, 0 NO_GO, 53.8 min. |
| sprint-139 | 12900+ | 89.33% | Docker HB Core Fix 5-sprint P0 (atomicWriteFileSync + SIGTERM fsync handler + 15s grace, +382 LoC). Chain Dependency Scheduler Wave 1 (Kahn's topological sort + detectScopeCollisions, +620 LoC). Backend Parity 3/3 (Docker + tmux + subprocess E2E). ADR-037 RBAC Authority Matrix V1.0 (+1370 LoC, runtime scope enforcement). ADR-038 + ADR-039 Self-Modifying Task Detection (+789 LoC). Worker Event Hook + Notification Dispatcher. Event Stream Runtime E2E. 52 tasks planned, manual finalize GO_WITH_TECH_DEBT. |
| sprint-141 | 13000+ | 89.33% | Comprehensive codebase analysis: src/core/ (78 files), src/orchestra/ (82 files), src/cli/ (75 files), src/mcp/ (37 files), src/dashboard/ (44 files), tests/ (28 categories), docs/ (260 files). Architecture graph + circular dep analysis. Dead code + type safety + security analysis. ADR compliance + CLI/MCP parity + i18n review. Memory V2 integrity verification. 15/18 done, 8 TECH_DEBT, 3 NO_GO, 74.3 min. |
| sprint-142 | 13200+ | 89.33% | God Analysis — largest sprint by task count (49 tasks). Massive batched code review: src/core/ (7 batches), src/orchestra/ (9 batches), src/cli/ (7 batches), src/mcp/ (3 batches), src/dashboard/ (2 batches), tests/ (6 batches), docs/ (2 batches). Architecture graph + dead code + security review. Memory V2 integrity deep verification. 44/49 done, 42 TECH_DEBT, 5 NO_GO, 174.7 min. |
| sprint-143 | 13500+ | 89.33% | Chain Reform complete — 19/20 DONE. Security fixes: shell injection (tmux.ts), path traversal (checkpoint/docs/decision-logger), API auth default secure, heartbeat-daemon execSync whitelist. FTS5 query builder fix. Relations hybrid backfill. DECISIONS.md archive + init.ts DB preload. Layer 4 runtime wire deploy (ADR-006 live enforcement). Sprint-finalizer hook. MCP disconnect fix. Task restoration on crash. 19/20 done, 1 TECH_DEBT, 1 NO_GO, 104.9 min. |
| sprint-144 | 14000+ | 89.33% | God split + ADR-008 Cycle 2: init.ts split (1566→4 files), doctor.ts split (1102→3 files), retro.ts split (453→3 files). Auditor async scan loop (52 sync I/O ops eliminated). ADR-008 Cycle 2 fix (core/session-interface.ts). Dockerfile hardening. i18n basic CLI (5 commands TR/EN). Turkish locale fix (.toLocaleLowerCase('tr-TR')). Docker HB deploy wire. Event stream emit wire. Sprint-state lifecycle. Rich sprint output (7-section). Memory V2 CLI testing (+40 tests). 24/27 done, 2 TECH_DEBT, 3 NO_GO, 107.4 min. |
| sprint-145 | 14400+ | 89.33% | Adaptive Timeout + Unified Observability + CLI/MCP audit. |
| sprint-146 | 12485 | 89.33% | Prompt God Template Reform (10 tasks) + 3 critical bug fixes + rubric consolidation. ADR-040 nervous system preflight. 17 tasks. |
| sprint-147 | 12485 | 89.33% | Deckent Nervous System architecture — AuthorityMode + ApprovalPolicy + NervousNotification + SafetyFloorAction. ADR-040 accepted. |
| sprint-148 | 12485 | 89.33% | Self-Healing Architecture — Agent Taxonomy Reform (test-writer archived, 16→15→16 agents), nervous dogfood live (5 detectors), cross-platform validation 3/3 (macOS/Linux/WSL2), 28 tasks 27 DONE. ADR-041 Agent Taxonomy proposed. |
| sprint-149 | 12485 | 89.33% | Documentation consolidation + npm publish dry-run. ADR-041 accepted. Beta GA slip began — chronic vitest regressions surfaced. |
| sprint-150 | 12485 | 89.33% | Docker Worker Exit Pattern Final Fix (Sprint 146+148 debt closure). GA slipped — readiness gap re-baselined. |
| sprint-151 | 12485 | 89.33% | Public repo flip — VerhexIO/deckent → VerhexIO/deckent. GO_WITH_TECH_DEBT. |
| sprint-152 | 12485 | 89.33% | Brain NO_GO/FIX state update bug — meta-dogfood evidence captured (P0 for Sprint 153). |
| sprint-153 | 12485 | 89.33% | `deckent watch --ms` MCP tool promotion. Brain state update bug investigation. 16 tasks, 3 DONE, 13 NO_GO. |
| sprint-154 | 12485 | 89.33% | RubricRegistry foundation. Sprint stabilization. |
| sprint-155 | 12485 | 89.33% | Workflow refinement. |
| sprint-156 | 12485 | 89.33% | T4 dogfood (commit 4d15196): 22 tasks, 7 DONE / 15 TECH_DEBT / 0 NO_GO + 3 major bugs evidenced live (Bug X dual-eval race, Sprint-Stall, state update freeze). Sprint 157 P0 11-item bridge created. **Sprint 156-011 CRITICAL debt born: code physically verified despite missing .result file** — replayed live in Sprint 164. |
| sprint-157 | 12485 | 89.33% | Sprint 156 P0 11-item closure. Workflow rename audit (read-only). |
| sprint-158 | 12485 | 89.33% | TaskType + EnvironmentType + Hybrid Scoring 5-layer pipeline foundation. |
| sprint-159 | 12485 | 89.33% | Vitest gate chronic FAIL begins — Sprint 159+ 6-sprint chronic issue chain that persists through Sprint 164. |
| sprint-160 | 12485 | 89.33% | TOPP + Reversibility 3-layer architecture work. |
| sprint-161 | 12485 | 89.33% | Brain processQueue legacy FIFO Wave 2→3 stall forensic dogfood (replayed live in Sprint 164 as Bug Y). |
| sprint-162 | 12485 | 89.33% | T-003 + T-004 + T-007 finalize. Sprint Phase Observability + EvaluationAuditTrail Runtime Wire (T-003 composite). Survivor wire recovery branch added (T-004). |
| sprint-163 | 12485 | 89.33% | Brain stability line SEALED — 6/6 DONE, 0 NO_GO. Task 1 Files + Task 4/6 path correction + Sprint 137→145 alignment. |
| sprint-164 | 12485+14 | 89.33% | **ADR-045 Wave-Based Execution Semantics accepted** — respawnEligibleTasks Runtime Wire contract. Wire code-complete: 13 grep matches (result-collector, sprint-spawner, sprint-controller), 3 task.status inline mutation branches, 14 new tests (8 unit + 6 integration) PASS. **Runtime DISABLED via `dependency_pipeline_enabled: false`** (Sprint 166 live flip). Vitest gate still FAIL (6-sprint chronic). Live dogfood surfaced 4 P0 bugs for Sprint 165: Bug X (Sprint 156-011 replay), Bug Y (Sprint 161 replay), Bug Z (Vitest mismatch), Bug W (dead_event_stream detector sleeping). 6 tasks, 4 DONE, 2 TECH_DEBT, 0 NO_GO. |
| sprint-165 | ~16400 | 89.33% | **Brain Final Stability — 4 P0 bug closure.** Bug X (no-result → CODE_VERIFIED_DONE stub fixed, Sprint 156-011 CRITICAL debt CLOSED), Bug Y (processQueue Wave 2→3 stall resolved with idempotency guard), Bug Z (Vitest gate chronic delta-zero closure via worker honest-result gate), Bug W (Auditor dead_event_stream detector reactivated). Docs freeze + managed-doc cache contract sealed. Manual recovery chain proven (kill→cleanup→recover→run→spawn). respawnEligibleTasks 13 grep matches preserved. |
| sprint-166 | ~16434 | 89.33% | **Brain Self-Update + Data Integrity Closure — 10/11 DONE, 1 TECH_DEBT.** ADR-046 accepted (Brain Self-Update Hook Architecture, Step Ordering Contract). 4 architectural root cause fixes: Bug M (adrInsert hook + Step 3 wire in identity-generator.ts; `src/core/adr-file-sync.ts` MADR v3 parser), Bug N (onRuleRegen wired into manual finalize path at cli/commands/finalize.ts:166), Bug S (doc-cache sprint-aware cache key, backward-compat fallback), Bug Y2 (3-layer ground-truth defense: unit + integration + Auditor `verifyDocSyncGroundTruth` runtime + `.deckent/ground-truth-overrides.json` whitelist). Data integrity: Bug U (type='sprint' insert restored in sprint-retro-writer), Bug V (parseDebtMd sprint_id regex backfill, 100+ entries; 9-sprint memory backfill). Doc fixes: Bug C+X (DECKENT.md ref + summary debt filter), Bug P (TOOLS/BOOT/WORKER-GUIDE auto-content generators), Bug Q+W (provider parity .codex/.gemini/.cursor + emitAlert helper + stale_md detector), Bug K+L (verify-ran atomic write + stale doc test refresh). 35 new tests PASS (34 + 1 ADR-046 regression). T3 doc-cache runner wire-up TECH_DEBT carryover. **15 built-in agents reconfirmed (Sprint 148 archive preserved)** — 5 root .md files corrected from Sprint 164 commit a4f3be4 incorrect 16-count misinjection (Bug Y2 root cause). |
| sprint-167 | TBD | TBD | **(PLANNED)** Bug E+G+Z2+Z3 fix + `dependency_pipeline_enabled: true` live flip (Wave Scheduling goes live, ADR-045 runtime contract enforced) + M1-M4 monitoring baseline tracking + minimal 3-task multi-wave smoke. |
| sprint-168 | TBD | TBD | **(PLANNED)** Open Source GA — public repo flip (VerhexIO/deckent → VerhexIO/deckent public) + npm publish v1.0.0-beta.2 + Show HN launch. |

**First dogfooding result (Sprint 6):** Deckent ran `deckent start` on itself, generated README.md in 86 seconds with 1 worker. The orchestration loop (plan → spawn → execute → evaluate → retro → cleanup) completed end-to-end.

**AI Planning milestone (Sprint 12-13):** Brain gained the ability to plan tasks using AI (Zod-validated) with automatic fallback to structured parsing. Auditor moved from separate tmux process to in-process scan loop within Brain.

**Bağımsızlık milestone (Sprint 15):** DECKENT.md became the single source of truth. CLAUDE.md and AGENTS.md are now adapters that receive `@DECKENT.md` injection via `ensureDeckentImport()` -- additive, never destructive. Deckent now self-hosts with its own `.deckent/` structure.

**Reliability milestone (Sprint 17):** MCP `deckent_start` no longer times out — runs sprint as background job via `child_process.fork()`. Sprint ID never regresses (config-based safety). Dashboard resets cleanly between sprints. React test infrastructure enables component testing. 1027 tests total.

**Orchestration milestone (Sprint 18):** First real `runSprint` since Sprint 10. 8 parallel sonnet workers executed 8 doc tasks in 260s. Full lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE→RETRO→CLEANUP) completed end-to-end. 6 bugs discovered — planner task queue, heartbeat timestamps, dashboard progress, alert dedup, doc evaluation criteria, debt table test.

**Motor repair milestone (Sprint 19):** All 6 bugs from Sprint 18 fixed. +96 tests. `isDocTask()` and `updateProjectDocs()` added. Heartbeat, dashboard, and alert dedup all confirmed working in Sprint 20 validation.

**Parametric orchestration milestone (Sprint 21):** System profile detection, subscription detection, layered model selection, auto workers. `deckent test` and `deckent run` CLI commands. Planner task queue finally fixed — all tasks planned regardless of max_workers. +137 tests.

**Full orchestration milestone (Sprint 23):** AI planner post-validation fallback — if AI returns fewer tasks than directives specify, falls back to structured mode. First time 12/12 tasks planned and completed. Task queue wave mechanism (8 workers + 4 queued) validated end-to-end. 1422 tests total.

**Mega sprint milestone (Sprint 24):** Plugin v2 system (install/create/remove/hooks), i18n runtime, +1449 tests in a single sprint. OSS infrastructure: CONTRIBUTING.md, LICENSE, CI pipeline. Test count jumped from 1701 to 3150.

**OSS readiness milestone (Sprint 25-26):** Tech debt cleanup sprint. readJsonSafe import migration completed across brain.ts, debt-manager.ts, auditor.ts. Integration tests added. OSS files polished. 3442 tests total.

**Technical gap closure milestone (Sprint 27):** 30 tasks completed in a single sprint. Provider abstraction (ProviderAdapter interface + ProviderRegistry) decouples Brain from specific spawn mechanisms. SpawnBackendFactory selects TmuxBackend or SubprocessBackend based on config.spawn_backend. Usage tracking via UsageTracker stores per-sprint metrics. Coverage validation parses vitest JSON output. Git rollback creates safety branches before each sprint. Worker IPC enables process.send-based communication for subprocess workers. Zero-config mode allows `deckent start "description"` without writing DIRECTIVES.md. 13 new modules, 167 new tests (3442→3609), +14,737 lines of code.

**npm publish readiness milestone (Sprint 28):** Package fully prepared for npm publish. Error UX overhauled with DeckentError + ErrorRegistry (10 codes with platform-specific suggestions). Interactive onboard wizard replaces stub. Upgrade command real. TUI wizard framework for CLI interactions. Telemetry opt-in infrastructure (no data sent). Publish pipeline: prepublish validation, build verification, pack test, npm publish with --dry-run default. README.md rewritten in English with badges, comparison table, architecture diagram. SECURITY.md, RELEASE-CHECKLIST.md added. .npmignore excludes sensitive files. 66 files changed, +6419 lines, 40 new test files.

**Agent Pool milestone (Sprint 29):** Dynamic agent pool system operational. 8 built-in agents (security-auditor, test-writer, doc-writer, code-reviewer, refactorer, bug-fixer, api-builder, performance-analyzer) with custom PROMPT.md files. Brain auto-selects best agent per task via keyword+scope scoring. Agent prompt injected into worker context. Multi-agent pipeline enables sequential agent execution with shared context. CLI commands for agent management. 47 files changed, +7030 lines, 314 new tests.

**Subprocess backend milestone (Sprint 30):** First tmux-free sprint completed successfully. brain.ts reads config.spawn_backend and creates backend via SpawnBackendFactory.create(). With spawn_backend: "subprocess", workers spawn as direct child_process without tmux. Verified: `tmux ls` returns "no server running", 4 claude processes running with no TTY (? in ps output). tmux is now fully optional.

**Skill System milestone (Sprint 30):** Dynamic skill system operational. 10 built-in skills covering TypeScript, React, Python, APIs, databases, testing, documentation, security, performance, and DevOps. Stack detection auto-identifies project technology and caches results. Skills selected per task via multi-factor scoring (stack match, keyword match, agent expertise). SKILL.md content injected into worker prompts (1500 char/skill, 4000 total cap). Skill registry foundation for future marketplace. 55 files changed, +8038 lines, 435 new tests.

**Brain Decision Engine milestone (Sprint 31):** Full 6-step decision pipeline operational: TaskAnalyzer infers type and complexity, DecisionOrchestrator chains agent selection -> skill selection -> model resolution -> effort -> scope computation. Learning loop records agent+skill+model evaluations and scores historical combinations for future sprint optimization. Multi-agent collaboration: parallel pipelines with topological wave execution, shared memory for inter-worker communication, conflict detection and resolution. Adaptive agent system: prompt effectiveness analysis, A/B testing (min 4 samples), versioning (max 10), auto-rollback for underperforming prompts. 51 files changed, +10,438 lines, 572 new tests.

**UX milestone (Sprint 32):** End-user experience polished. Live progress bar with ETA during sprint execution. Rich sprint summary with categorized file changes, agent performance table, and smart recommendations. Notification system supports terminal bell, webhooks, Discord embeds, and Slack Block Kit. Interactive post-sprint review: approve, reject, or retry individual tasks. Agent and skill visibility across dashboard, status, retro, history, and MCP. Theme system with NO_COLOR support. Output modes: quiet, normal, verbose. 59 files changed, +9481 lines, 539 new tests.

**Integration + Marketplace milestone (Sprint 33):** Comprehensive integration tests cover full sprint E2E with agents+skills across TypeScript/React, Python/FastAPI, and monorepo projects. Skill marketplace foundation: remote registry client, CLI search/publish, rating system, dependency resolution with topological sort. Adaptive agent advanced: cross-sprint analysis, specialization drift detection, auto-retirement for underperformers, prompt evolution logging, agent genealogy. Analytics data modules for dashboard. Performance: LRU agent cache, 500KB skill cache, token counter, lazy loader, batch stats. Security: skill sandbox with quarantine, permission guard blocking agent self-modification. 56 files, +12,063 lines, 559 new tests.

**Beta cleanup milestone (Sprint 35-36):** Two waves of systematic code quality improvements. Wave 1+2 (Sprint 35): readJsonSafe migration replaced 13 inline JSON.parse calls, error handling unified with DeckentError + ErrorRegistry (E039-E053), silent catches got debugLog() with DECKENT_DEBUG env gate, parseBody type safety via 5 Zod schemas, utility extraction (readFileIfExists, listFilesWithExtension, safeMapGet), EventEmitter fix with dedicated _ipcEmitter. 11 tasks. Wave 3+4 (Sprint 36): brain.ts God Object split from 1312→58 lines into sprint-controller.ts + result-evaluator.ts + usage-manager.ts with backward-compatible re-exports. spawn-backend.ts moved from core/ to orchestra/ (layer violation fix). types.ts split into 4 domain files. 48 non-null assertions replaced with safe alternatives. Barrel export cleanup. Auditor queue O(n) shift→O(1) pop. 11 tasks, +315 tests.

**Security + Plugin milestone (Sprint 37):** Beta Cleanup Wave 5+6. Security hardening across the codebase. Plugin system improvements. Memory system fix. Skill sandbox with AST-based analysis. JSDoc documentation added to public APIs. 16 tasks, +258 tests, 8073 total.

**Multi-Provider milestone (Sprint 38):** Full multi-provider infrastructure delivered. ModelType extended to 8 models across 3 providers (Claude, OpenAI/Codex, Gemini). ProviderAdapter interface implemented by ClaudeAdapter, CodexAdapter, and GeminiAdapter. Provider-aware model selection with tier-based equivalence (premium/standard/economy). Provider fallback chain for resilience. spawnWorkers routing supports mixed sprints (Claude+Codex+Gemini workers in same sprint). bootstrapProviders() initializes registry from config. Multi-provider config: brain_provider, worker_provider, fallback_provider. Planner, tmux, and subprocess modules decoupled for platform independence. 20 tasks, +476 tests, 8555 total.

**Human-friendly output milestone (Sprint 040-041):** End-user experience overhaul. Worker internal verify loop (tsc + vitest) runs before reporting completion. Worker feedback metrics track NO_GO causes. Sprint summary output redesigned for readability. MCP tool responses, CLI doctor, retro format, error messages, and worker logs all upgraded to human-friendly format. Sprint 041 achieved 7/7 tasks with 0 NO_GO — first perfect sprint since Sprint 37.

**MCP-Native Providers milestone (Sprint 044-045):** Full provider ecosystem wired into sprint lifecycle. .deck secrets file for API key management. Kraken splash screen added. Environment detection (vscode/codex/gemini/cursor/shell/ci). Task router (TaskRouter) + Connector module integrated into bootstrapProviders flow. Codex CLI (`codex exec --full-auto`) and Gemini CLI (`gemini -p`) upgraded to real command execution. `deckent sync` and `deckent explain` CLI commands added. Rich sprint summary (7 sections) wired into finalizeSprint. 10 MCP tools + 5 resources.

**10K tests milestone (Sprint 046):** Test count exceeded 10,000 for the first time. Multi-environment runtime with deckent start lifecycle improvements. vscode extension stub, stack detection expansion (10+ stacks), multi-IDE lock files, multi-env init wizard, language-agnostic verify flow. 35 CLI commands. 8/10 tasks done.

**CLI deep analysis milestone (Sprint 055-059):** Comprehensive deep analysis of all 35 CLI commands identified 158 improvement opportunities. Sprints 055-059 systematically addressed init, plan, start, status, doctor, retro, history, cleanup, spawn, kill, attach, watch, and config commands. 10,509 tests, 96.4% coverage. cli-deep-analysis.md became the tracking document for CLI completeness.

**CI Guardian milestone (Sprint 062):** CI-aware agent system introduced. ci-guardian agent with PROMPT.md + agent.json, ci-testing skill with manifest.json + SKILL.md. Three new plugin hooks: beforeSprint (pre-sprint CI validation), afterTask (task-level regression detection), afterSprint (sprint CI report). CI learning enables sprint-to-sprint improvement. GitHub Actions workflow enhanced with coverage job.

**Routing v2 milestone (Sprint 063):** Intent-based 3-layer routing engine replaced simple keyword matching. Layer 1: intent classification from task title/description. Layer 2: agent selection via intent→agent mapping with learning feedback. Layer 3: skill selection via agent expertise + project stack. forceSkills and forceModel support added to DIRECTIVES task syntax. 35 CLI commands confirmed complete.

**CLI completion milestone (Sprint 065):** Final CLI improvements batch: AI planner timeout configurable (`ai_planner_timeout`), config autoMigrateOnLoad, cleanup single-pass fix, spawn scope enforcement + multi-provider, analyzer engine merge, history trend analysis, retro archiving. 7/7 tasks done, 0 NO_GO. Total: 11,862 tests, 469 test files, 247 source files, 75,105 lines.

**MCP completion milestone (Sprint 066-068):** MCP expanded from 10 tools + 5 resources to **20 tools + 8 resources**. All agent/skill manifests migrated to v2 with activation rules. Tool descriptions enriched with annotations (readOnlyHint, destructiveHint, openWorldHint). `deckent_help` tool provides runtime capabilities and project state detection.

**Windows dogfooding milestone (Sprint 070-071):** Deckent ran successfully on native Windows for the first time. 22 bugs found and fixed across 2 sprints. Key fixes: shell:true for all spawn calls, periodic heartbeat via setInterval(15s), UTF-8 encoding env vars, doctor c.ok→c.passed fix, scope parser explicit label parsing. `deckent upgrade --local` enabled beta development workflow.

**Self-dogfooding milestone (Sprint 073):** Deckent used its own sprint system to fix 100 test regressions (43+16+9+23+3 → 0 fail). test-writer agent completed 5/5 tasks in 17m 41s. Proved the orchestration system can reliably fix its own codebase.

**God Object split milestone (Sprint 072-076):** sprint-controller.ts systematically decomposed across 3 phases: Faz 1 (Sprint 072) extracted 7 phase functions to sprint-phases.ts, Faz 2 (Sprint 075) extracted sprint-utils.ts, Faz 3 (Sprint 076) extracted result-collector.ts (233 lines). Brain.ts remains a thin re-export layer.

**Security hardening milestone (Sprint 133):** Plugin system secured with SHA-256 signature verification (PluginSecurityError). SkillSandbox AST-based analysis with allowed_paths enforcement. 12/12 tasks DONE in 27m 21s, +147 net tests. Readiness score jumped from 3.2/5 to 3.6/5.

**Product-not-service vision milestone (Sprint 134):** sprint-reporter.ts 4-way split (2297→96 LoC thin barrel): sprint-metrics, sprint-retro-writer, sprint-docs-updater, ci-reporter. Task Dependency Pipeline live: parseStructuredDirectives parses dependencies. Brain Self-Audit Gate via .deckent/run-self-audit.mjs. ADR-033 Product Vision + ADR-034 Multi-Project Isolation. Parent coordinator crashed mid-sprint; manual recovery preserved all worker contributions. Readiness: 3.6→3.86/5.

**Operational hardening milestone (Sprint 135):** Zero coordinator crash achieved — sprint-pid-manager.ts (258 LoC) provides crash-resistant coordination. Docker graceful shutdown (stop --time=10) resolves spurious NO_GO pattern. askBrain IPC registry: ipc-registry.ts 37→270 LoC. Planner now parses priority and dependencies from DIRECTIVES. Brain memory budget DECAY_EXEMPT for permanent records (DECISIONS.md, PROJECT-IDENTITY.md). Sprint completed in 1h 0m 54s natural (vs Sprint 134's 2h 33m manual recovery). Readiness: 3.86→3.93/5.

**Architectural finalization milestone (Sprint 136):** sprint-controller.ts reduced from 1890→209 LoC (-1681 lines) — the most significant single-sprint structural reduction in project history. New modules: sprint-spawner.ts + sprint-phases.ts. T-005 chicken-egg resolved via in-sprint dogfood: hardcoded 'priority: NORMAL' bug found and fixed in sprint-controller.ts:528. tryCodeVerifiedDone() helper added (+408 LoC result-evaluator.ts) for spurious NO_GO recovery (active Sprint 137). gate.json + load-report.md write hooks code-ready; runtime restore Sprint 137. Test suite: 124 test failures (all in tests/orchestra/) from Task 8 refactor side effect — Sprint 137 P0. Readiness: 3.93→3.925/5.

## Sprint 137: Test Restoration + Wire Deployment

- Brain test suite post-refactor restoration — all 124 test failures from Sprint 136 resolved
- tryCodeVerifiedDone wire + in-sprint dogfood: spurious NO_GO recovery validated in live sprint
- gate.json + load-report.md runtime wire restore: auditor sprint gate computation operational
- ErrorRegistry lint script wire: `npm run lint:adr` validates all error codes
- Brain budget decay no-op bug fix: runDecay() was silently returning without processing
- 6/6 done, 0 NO_GO, 35.9 min — fastest sprint since Sprint 76
- Agents: architect, test-writer, doc-writer, bug-fixer

## Sprint 138: ADR Governance + Verification Protocol + Event Stream

- **ADR Governance Integration** (Task 1): MADR v3 hybrid format adopted across 37 existing ADRs. ADR-036 self-referential governance ADR. scripts/adr-validator.mjs automated compliance check. DECKENT.md mandatory read directive. Worker prompt injection for ADR awareness
- **ADR-035 Verification Protocol Standard** (Task 2): 15 channel codes V1.0 defining Brain↔Worker↔Auditor event stream communication protocol. Source/target validation. Typed event payloads
- **Auditor Authority Extension 3-Pipeline** (Task 3): verifyWorkerResult() + verifyFunctional() + validateTechDebt() + pilot checkADRCompliance() for ADR-006/008/010. Independent verification — auditor never trusts worker self-assessment alone
- **Structured Event Stream** (Task 4): event-stream.ts (305 LoC) + file-lock.ts real implementation (30→267 LoC). detectScopeCollisions() + buildCollisionAwareWaves() for plan-time conflict prevention
- **Layer 4 Runtime Wire Forensic Fix** (Task 6): ADR-006 live enforcement with fail-safe fallback and breadcrumb logging
- **Worker Honest Assessment Calibration v2** (Task 8): Honest Self-Assessment block in worker prompt + verify-delta baseline + applyTechDebtDowngrade dual layer — prevents "DONE" claims without actual code verification
- **Long-Running Sprint Resume MVP** (Task 9): sprint-checkpoint.ts + resume.ts + CHECKPOINT_INTERVAL=5 — sprints can survive process crash and resume from checkpoint
- 11/11 done, 2 TECH_DEBT, 0 NO_GO, 53.8 min
- Agents: architect, bug-fixer, test-writer, doc-writer

## Sprint 139: Docker HB Fix + Chain Scheduler + RBAC + Self-Modifying Detection

Largest sprint in project history — 52 tasks planned.

- **Docker HB Core Fix** (Task 13, 5-sprint P0): atomicWriteFileSync replaces fs.writeFileSync for heartbeat writes. SIGTERM handler with fsync guarantee. 15s grace period before force kill. +382 LoC. Eliminated false NO_GO from Docker worker heartbeat loss
- **Chain Dependency Scheduler Wave 1** (Task 28): Kahn's algorithm topological sort for task dependency chains. detectScopeCollisions() integration. +620 LoC. Sprint 135 T-005 fifth live dogfood validation
- **Backend Parity 3/3** (Tasks 17-19): Docker + tmux + subprocess all have comprehensive E2E test suites. First subprocess E2E test since Sprint 120 — 19 sprint gap closed
- **ADR-037 RBAC Authority Matrix V1.0** (Tasks 34-35): Formal role-based access control defining Brain/Auditor/Worker file permissions, event stream channel rights, and sprint lifecycle actions. +1370 LoC. Runtime scope enforcement. NIST SP 800-162 principles (least privilege, separation of duties, fail-closed)
- **ADR-038 + ADR-039 Self-Modifying Task Detection** (Tasks 51-52): Self-modifying-detector.ts (+789 LoC) discriminates deckent dogfood vs user project tasks. Architectural protection born from Sprint 139's catastrophic self-modification incident where a worker modified its own orchestrator code
- **Worker Event Hook + Notification Dispatcher** (Task 41): src/core/notification-dispatcher.ts + notify-adapters/. DECKENT→USER:NOTIFY channel deployed for user-facing notifications
- **Event Stream Runtime E2E Test** (Task 44): Full pipeline simulation test validating event stream from emit to consume
- 52 tasks planned, manual finalize GO_WITH_TECH_DEBT (Seçenek C)
- Agents: architect, test-writer, bug-fixer, security-auditor, ci-guardian, doc-writer

## Sprint 141: Comprehensive Codebase Analysis (316+ Files)

- Full static analysis across entire codebase:
  - src/core/ (78 files) — DONE: Memory V2, types, routing, agent/skill pools analyzed
  - src/orchestra/ (82 files) — NO_GO (timeout): brain, sprint lifecycle, task routing, event streams
  - src/cli/ (75 files) — GO_WITH_TECH_DEBT: all CLI commands reviewed
  - src/mcp/ (37 files) — DONE: tools, resources, server analyzed
  - src/dashboard/ (44 files) — DONE: React/TypeScript components analyzed
  - tests/ (28 categories) — DONE: 462+ test files categorized
  - docs/ (260 files) — DONE: documentation structure mapped
- Architecture dependency graph + circular dependency analysis
- Dead code identification + type safety review + security audit
- ADR compliance verification across all modules
- CLI/MCP feature parity assessment
- Memory V2 integrity verification
- 15/18 done, 8 TECH_DEBT, 3 NO_GO, 74.3 min
- Agents: code-reviewer, frontend-designer, test-writer, doc-writer, architecture-planner, architect, security-auditor

## Sprint 142: God Analysis — Largest Sprint by Task Count (49 Tasks)

- Systematic batched code review across entire codebase:
  - src/core/ — 7 batches: Memory V2 modules, types system, routing engine, agent/skill pools, provider adapters, config system, utility modules
  - src/orchestra/ — 9 batches: brain barrel, sprint-controller, sprint-phases, task-router, result-evaluator, result-collector, event-stream, spawn backends, managed-docs
  - src/cli/ — 7 batches: lifecycle commands, info commands, config commands, agent/skill commands, dashboard/web, helper modules, registration
  - src/mcp/ — 3 batches: tool handlers, resource handlers, server core
  - src/dashboard/ — 2 batches: React components, hooks/lib/types
  - tests/ — 6 batches covering all 462+ test files
  - docs/ — 2 batches: architecture docs, sprint history
- Architecture graph + circular dependency analysis
- Dead code audit + type safety review + security scan
- Memory V2 deep integrity verification
- Error handling inventory + TODO/FIXME catalog
- 44/49 done, 42 TECH_DEBT (review findings), 5 NO_GO, 174.7 min
- Agents: code-reviewer, architect, frontend-designer, test-writer, doc-writer, devops-engineer, refactorer, security-auditor, architecture-planner

## Sprint 143: Chain Reform Complete + Security Hardening

- **Security Fixes**:
  - Shell injection fix in tmux.ts (argument escaping)
  - Path traversal fix in checkpoint/docs/decision-logger (normalized path validation)
  - API auth default secure (authentication required by default)
  - heartbeat-daemon execSync whitelist (only whitelisted commands)
- **Memory V2 Database**:
  - FTS5 query builder fix (proper term escaping)
  - Relations hybrid — backfill + write-time for cross-references
  - DECISIONS.md archive + init.ts DB preload (96K → 4K context reduction operational)
  - .brain/memory.db git tracking fix
- **Infrastructure**:
  - Sprint-finalizer hook for clean shutdown
  - Rule generator for 3 providers
  - MCP disconnect fix (background sprint runner)
  - Auto-archive guard (prevents premature archiving)
  - Layer 4 ADR-006 runtime wire deploy (live enforcement)
  - Task restoration on crash
  - Panic kill guard (prevents accidental sprint termination)
- **Testing**: E2E harness for chain safety foundation
- **Documentation**: ADR-010 amendment, MCP help.ts + server instructions
- 19/20 done, 1 TECH_DEBT, 1 NO_GO, 104.9 min
- Agents: security-auditor, devops-engineer, bug-fixer, architect, refactorer, test-writer, doc-writer

## Sprint 144: God Split + Performance + i18n

- **God Object Split (File Decomposition)**:
  - init.ts split (1566 → 4 files): init-core.ts, init-adapters.ts, init-wizard.ts, init.ts barrel
  - doctor.ts split (1102 → 3 files): doctor-checks.ts, doctor-display.ts, doctor.ts barrel
  - retro.ts split (453 → 3 files): retro-display.ts, retro-commands.ts, retro.ts barrel
  - worker.ts split attempted (1669 → 4 files) — NO_GO (timeout)
- **Performance**: Auditor async scan loop — 52 synchronous I/O operations eliminated
- **Architecture**: ADR-008 Cycle 2 fix (core/session-interface.ts extraction)
- **Security**: Dockerfile hardening, file-lock + deck-file + credentials improvements
- **i18n**: Basic CLI internationalization (5 commands TR/EN), Turkish locale fix (.toLocaleLowerCase('tr-TR'))
- **Infrastructure**: Docker HB deploy wire (Sprint 139 fix live), event stream emit wire, sprint-state lifecycle (pid manager), retro sprint-id normalize, orphan cleanup (.tasks + locks) + pre-flight
- **Output**: Rich sprint output (7-section summary)
- **Testing**: Memory V2 CLI testing (+40 tests), heartbeat-daemon + mid-sprint-adapter + ci-reporter testing (+24 tests), prompt test slot-based assertion refactor, sprint2-debt.test.ts memory leak fix
- **Dead Code Audit**: Wave A (agent + V1 routing, 17 files, 2780 LoC) — NO_GO, Wave B (orchestra orphaned + feature flag, 12 files, 2139 LoC) — NO_GO (both deferred to Sprint 145)
- 24/27 done, 2 TECH_DEBT, 3 NO_GO, 107.4 min
- Agents: refactorer, architect, performance-analyzer, security-auditor, devops-engineer, bug-fixer, doc-writer, test-writer

## Sprint 145: Adaptive Timeout + Unified Observability + CLI/MCP Audit (In Progress)

- Adaptive timeout estimation (timeout-estimator.ts) — historical sprint data → dynamic timeout calculation
- Unified event bus (event-bus.ts) — centralized event routing for all components
- Monitor adapter (monitor-adapter.ts) — pluggable monitoring backend
- Timeout watcher (timeout-watcher.ts) — real-time timeout detection and alerting
- Dead code cleanup from Sprint 141/142 audit findings
- CLI/MCP parity hardening
- DECKENT-MASTER-BLUEPRINT.md EN full update (this document)
- See `.brain/sprints/sprint-145.md` and `docs/audits/sprint-145/` for details

**Test restoration milestone (Sprint 137):** Brain test suite fully restored after Sprint 136 refactor side effects. tryCodeVerifiedDone() wired into live result evaluation — spurious NO_GO recovery operational. gate.json + load-report.md runtime hooks restored. ErrorRegistry lint script validated across all error codes. Budget decay no-op bug fixed in runDecay(). 6/6 tasks done in 35.9 min — fastest sprint completion since Sprint 76.

**ADR Governance milestone (Sprint 138):** Architecture Decision Record governance formalized. MADR v3 hybrid format adopted across 37 existing ADRs. ADR-036 self-referential (governance of governance). ADR-035 Verification Protocol Standard defines 15 event stream channel codes for Brain↔Worker↔Auditor communication. Auditor Authority Extension 3-Pipeline: verifyWorkerResult() + verifyFunctional() + validateTechDebt() + pilot checkADRCompliance() for ADR-006/008/010. Structured Event Stream (event-stream.ts 305 LoC) with plan-time scope collision detection. Worker Honest Assessment Calibration v2 (verify-delta baseline + applyTechDebtDowngrade dual layer). Long-Running Sprint Resume MVP (sprint-checkpoint.ts + resume.ts, CHECKPOINT_INTERVAL=5). 11/11 done, 0 NO_GO.

**RBAC + Chain Scheduler milestone (Sprint 139):** Largest sprint in project history — 52 tasks planned. Docker HB 5-sprint P0 bug fixed (atomicWriteFileSync + SIGTERM fsync handler, +382 LoC). Chain Dependency Scheduler Wave 1: Kahn's algorithm topological sort + scope collision awareness (+620 LoC) — Sprint 135 T-005 fifth live dogfood. Backend Parity achieved: Docker + tmux + subprocess all have E2E test suites — first subprocess E2E since Sprint 120 (19-sprint gap). ADR-037 RBAC Authority Matrix V1.0 (+1370 LoC) formalizes Brain/Auditor/Worker file permissions, event channels, and lifecycle actions. ADR-038 + ADR-039 Self-Modifying Task Detection (+789 LoC) — architectural protection born from Sprint 139's catastrophic self-modification incident. Worker Event Hook + Notification Dispatcher deployed. Manual finalize with GO_WITH_TECH_DEBT.

**Comprehensive analysis milestone (Sprint 141):** Full codebase analysis across 316+ files: src/core/ (78), src/orchestra/ (82), src/cli/ (75), src/mcp/ (37), src/dashboard/ (44), tests/ (28 categories), docs/ (260 markdown). Architecture dependency graph + circular dependency analysis. Dead code, type safety, and security audit. ADR compliance verification. CLI/MCP feature parity review. Memory V2 integrity verification. 15/18 done in 74.3 min.

**God Analysis milestone (Sprint 142):** Largest sprint by task count — 49 tasks. Systematic batched code review across entire codebase: 7 core batches, 9 orchestra batches, 7 CLI batches, 3 MCP batches, 2 dashboard batches, 6 test batches, 2 doc batches. Architecture graph generation. Memory V2 deep integrity verification. Error handling inventory. TODO/FIXME catalog. 44/49 done, 42 TECH_DEBT items representing comprehensive review findings.

**Chain Reform milestone (Sprint 143):** 19/20 tasks done — chain dependency system live. Critical security fixes: shell injection in tmux.ts, path traversal in checkpoint/docs/decision-logger, API auth default secure, heartbeat-daemon execSync whitelist. FTS5 query builder fix for Memory V2. DECISIONS.md archived + init.ts DB preload (96K → 4K context reduction operational). Layer 4 ADR-006 runtime enforcement live. Sprint-finalizer hook. MCP disconnect fix (background sprint runner). Task restoration on crash. E2E harness foundation for chain safety.

**God split milestone (Sprint 144):** Major file decomposition: init.ts (1566→4 files), doctor.ts (1102→3 files), retro.ts (453→3 files). Auditor converted to async scan loop (52 synchronous I/O operations eliminated). ADR-008 Cycle 2 fix (core/session-interface.ts extraction). Dockerfile hardening. i18n basic CLI (5 commands TR/EN). Turkish locale fix (.toLocaleLowerCase('tr-TR')). Docker HB deploy wire from Sprint 139. Event stream emit wire. Sprint-state lifecycle via pid manager. Rich sprint output (7-section summary). Memory V2 CLI testing (+40 tests). 24/27 done.

**Adaptive Timeout + Unified Observability milestone (Sprint 145):** Sprint in progress. Timeout estimation, event bus, monitor adapter, timeout watcher, dead code cleanup, CLI/MCP parity hardening. See `.brain/sprints/sprint-145.md` and `docs/audits/sprint-145/` for details.

**Provider Architecture (Sprint 38):**
```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Brain      │────▶│  ProviderRegistry │────▶│  ClaudeAdapter  │
│ (Orchestrator)│     │  (Bootstrap)      │     │  CodexAdapter   │
│              │     │                  │     │  GeminiAdapter  │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │                     │                        │
       ▼                     ▼                        ▼
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ ModelSelector │     │ Model Equivalence │     │  spawnWorkers   │
│ (Provider-   │     │ (Tier Mapping)    │     │ (Mixed Sprint)  │
│  Aware)      │     │ premium/std/econ  │     │ Claude+Codex+   │
└─────────────┘     └──────────────────┘     │ Gemini          │
                                              └─────────────────┘
```

---

# 25. BETA GA GATE CRITERIA (Sprint 168 Open Source GA Target)

## Overview

Originally targeted at Sprint 150, Beta GA has progressed through Sprint 151–166. Sprint 165 closed the 4 chronic Brain stability P0 bugs (X, Y, Z, W). Sprint 166 closed Brain Self-Update + Data Integrity (ADR-046, 4 architectural root cause fixes, 10/11 DONE). Sprint 167 will live-flip `dependency_pipeline_enabled: true` (ADR-045 runtime contract) and surface monitoring baseline. **Sprint 168 = Open Source GA flip** — public repo + npm publish v1.0.0-beta.2 + Show HN. Version is now v1.0.0-beta.1.

## Gate Criteria

### Functional Completeness
- [ ] All 27 MCP tools operational and tested (audit, recover, feature_query, watch, nervous_* added in Sprint 151–164)
- [ ] All 8 MCP resources returning valid data
- [ ] All 49+ CLI commands functional
- [x] All 15 built-in agents with validated PROMPT.md (ADR-041 reconfirmed Sprint 166 — testing tasks routed task-based, no vertical testing agent)
- [ ] All 21 built-in skills with manifest.json + SKILL.md
- [ ] Memory V2 DB-First fully operational (CRUD, FTS5, export, import, decay)
- [ ] 3 provider backends operational (Claude, Codex, Gemini)
- [ ] 3 spawn backends operational (tmux, subprocess, Docker)
- [ ] ADR-045 Wave-Based Execution Semantics runtime-enabled (Sprint 167 live flip — `dependency_pipeline_enabled: true`)

### Quality
- [x] Test count: 15,000+ (currently ~16,434 PASS — Sprint 166 added +35 new tests)
- [x] Coverage: ≥85% (currently 89.33%)
- [x] Zero CRITICAL tech debt items (Sprint 156-011 CLOSED in Sprint 165 via Bug X fix; corollary Bug M ADR insert closed in Sprint 166)
- [x] tsc --noEmit: 0 errors
- [x] No known data-loss bugs
- [x] Vitest gate green (Sprint 165 T3 closed the 6-sprint chronic FAIL via worker honest-result gate)

### Governance
- [x] All 55+ ADRs in accepted/deprecated status (Sprint 166 added ADR-046; Sprint 167-186 added ADR-047 through ADR-064)
- [x] ADR-037 RBAC runtime enforcement operational
- [x] ADR-035 event stream audit trail complete
- [x] ADR-036 governance integration validated
- [ ] ADR-045 Wave-Based Execution Semantics runtime contract honored (Sprint 167 flip)
- [x] ADR-046 Brain Self-Update Hook contract honored (Step 3 adrInsert wired, Step 4 ruleRegen renumbered)
- [x] npm run lint:adr passes

### Documentation
- [ ] DECKENT-MASTER-BLUEPRINT.md EN fully updated (this document)
- [ ] DECKENT-ANA-PLAN-TR.md TR fully updated
- [ ] README.md with badges, quick start, comparison table
- [ ] API reference (docs/reference/api.md)
- [ ] CHANGELOG.md up to date
- [ ] SECURITY.md with responsible disclosure

### Distribution
- [ ] `npx deckent init && deckent start "hello"` completes in <60s
- [ ] npm pack produces clean tarball
- [ ] .npmignore excludes sensitive files
- [ ] Cross-platform verified: macOS, Linux, WSL2

### Performance
- [ ] 10-task sprint completes in <5 min
- [ ] Memory V2 query <100ms for 1000 entries
- [ ] CLI startup <500ms

## Cross-References
- Sprint metrics: `.brain/exports/summary.md`
- ADR decisions: `.brain/exports/decisions.md`
- Technical debt: `.brain/exports/debt.md`
- Sprint history: `.brain/sprints/sprint-*.md`
- Audit reports: `docs/audits/sprint-*/`
- Architecture specs: `.contracts/api-surface.md`

---

# END OF BLUEPRINT

This document is the single source of truth for Deckent's implementation.
Version 3.1 — Updated Sprint 166 (May 2026).
Use the MCP tools: "Set up Deckent" or "Plan a sprint for [goals]".
Or open it in Claude Code and say: "Implement this."

---

## Sprint 146 — Prompt God Template Reform + Critical Bug Fix + Rubric Consolidation

**Theme:** "Prompt quality 64/100 → 85/100 + 3 live-proven bug fixes + rubric 3-system consolidation"
**Sprint type:** P0-heavy, Beta GA path (Sprint 150 GA — Thu Apr 23 TRT)
**Total tasks:** 17 | **Waves:** 6 | **Hard cap:** 5h | **Cost cap:** $95

### Key Deliverables

**Prompt God Template Reform (10 tasks):**
- **Task 1 — Agent Truncation Bug Fix:** agent-pool.ts line 29 truncation removed — full PROMPT.md content now loaded
- **Task 2 — Agent Routing V2 Retrain:** Intent classifier refreshed — test-writer share 52% → ≤22%; doc tasks properly routed to doc-writer
- **Task 3 — ADR Relevance Scoring Engine:** `adr-selector.ts` — selectRelevantAdrs(topN=3), scoring: scope match +0.4, keyword +0.3, age penalty
- **Task 4 — Scope Sanitizer:** `scope-sanitizer.ts` — removes dist/, extension-only, unqualified filenames, global protected files, dedupes paths
- **Task 5 — Generative God Template:** `prompt-god-template.ts` ~400 LoC — `buildTaskPrompt()` single entry point, PromptArtifact with metadata
- **Task 6 — ADR Preset Matrix + Filler Cleanup:** TASK_TYPE_ADR_PRESETS for 7 task types, empty header suppression
- **Task 7 — Prompt Quality Linter:** `scripts/prompt-linter.mjs` — ADR ratio, truncation, filler, char count checks; avg ≥ 75/100 exit gate

**3 Critical Bug Fixes (3 tasks):**
- **Task 8 — DIRECTIVES Mid-Sprint Protection:** `archiveDirectives()` phase guard — only runs in CLEANUP phase, emergency reconstruct from task JSON
- **Task 9 — SDL Decision Log Rehab:** v2 routing filter + meaningful step logging + `deckent explain <taskId>` integration
- **Task 10 — Rubric System Consolidation:** Worker self-report removed, Quality Assessor dimensions canonical, `assessQuality()` mandatory post-evaluate

**Foundation + Preflight (4 tasks):**
- **Task 11 — Sprint 145 vitest Regression Fix:** 3 failing tests resolved, ≥99.3% pass rate
- **Task 12 — Nervous System Preflight:** `nervous-types.ts` ~100 LoC placeholder types, ADR-040 status: proposed in memory store
- **Task 13 — Sprint 146 Retro + Docs:** `docs/sprint-log/Sprint-146.md` + CHANGELOG 0.4.0-beta.2 entry
- **Task 14 — Agent Exclusion Dynamic:** `getDynamicExclusions()` — intent+scope combination drives exclusion, no more hard-coded global exclusions

**Gate Scripts (2 tasks):**
- **Task 15 — Chain Safety Gate:** `scripts/chain-gate-check.mjs` — tsc, vitest, doctor ≥90, cost <$95, NO_GO ≤2, prompt_linter ≥75
- **Task 16 — Living Record Update:** FINAL-EXECUTIVE-REPORT.md sections 1/5/6/8 updated, Section N appended

**Documentation (2 tasks):**
- **Task 17 — Ana Plan + Beta Tracker Append:** ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER EN+TR Sprint 146 sections

### Architectural Outputs

```
NEW src/orchestra/adr-selector.ts        — ADR relevance scoring (selectRelevantAdrs, buildAdrPromptSection)
NEW src/orchestra/scope-sanitizer.ts     — Scope path sanitization (8 filter rules)
NEW src/orchestra/prompt-god-template.ts — Unified prompt builder (~400 LoC, buildTaskPrompt)
UPD src/orchestra/task-builder.ts        — Uses god template, scope sanitizer
NEW src/core/nervous-types.ts            — Sprint 147 placeholder types (~100 LoC)
NEW scripts/prompt-linter.mjs           — Prompt quality linter (6 checks, exit code 0 avg ≥75)
NEW scripts/chain-gate-check.mjs        — Sprint gate script (6 gates)
```

### Sprint Gate Results (Sprint 146 Exit)

| Gate | Target | Result |
|------|--------|--------|
| doctor | ≥ 90/100 | TBD |
| tsc | PASS | TBD |
| vitest | ≥ 99.3% | TBD |
| cost | < $95 | TBD |
| NO_GO | ≤ 2 | TBD |
| prompt_linter | avg ≥ 75/100 | TBD |

### Sprint 147 Preview — Nervous System

Sprint 147 theme: **Deckent Nervous System** — runtime authority enforcement + notification engine + safety floor.

Design spec: `docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md`

Core components:
- **AuthorityMode** + **ApprovalPolicy** — runtime RBAC enforcement beyond ADR-037
- **NervousNotification** — meaningful user notification stream
- **SafetyFloorAction** — hard-stop guard for dangerous tasks
- **ADR-040** — nervous system governance (accepted at Sprint 147 end)

Types placeholder ready: `src/core/nervous-types.ts` (Sprint 146 T12 delivery)

**Beta GA path:** Sprint 146 ✅ → Sprint 147 ✅ → Sprint 148 ✅ → Sprint 149 🟡 → Sprint 150 🔵 (Thu 🚀 GA)

---

## Sprint 148 — Detailed Summary

**Theme:** Meta-Dogfood + Agent Taxonomy Reform + Nervous Dogfood Activation + Cross-Platform Validation
**Date:** Mon Apr 20, 2026
**Tasks:** 28 | **Waves:** 6 | **Status:** Complete
**Planning Mode:** AI (first attempt — Sprint 145-147 structured succeeded, Sprint 148 took AI risk)

### Sprint 148 Theme: Self-Healing Architecture

Sprint 147's `AgentRoutingHealth` detector recorded 95% anomaly in its own sprint. Sprint 148 Block A fixed the anomaly → Block B (detector re-run) returned positive results. **This is Deckent's first "conscious" sprint** — it saw its own problems, reported via nervous system, corrected via its own workers.

### Sprint 148 Deliverables (4 Blocks × 6 Waves)

**Block A — Agent Taxonomy Reform (5 tasks, Wave 1-2):**
- T1: `test-writer` Agent Archive — moved to `.deckent/agents/archive/test-writer-removed-sprint-148/`
- T2: `testing-expert` Skill Auto-Activation Heuristic — scope tests/** or *.test.ts triggers
- T3: Intent Classifier "testing" Intent Removal — `test-coverage` tag system
- T4: Router V2 Agent Fallback — test-writer absent, architect/refactorer chain
- T5: 15 Agent PROMPT.md Rubric Spec Batch Cleanup — `scripts/agent-prompt-validator.mjs`

**Block B — Nervous Dogfood + 5 Detector Activation (8 tasks, Wave 3-4):**
- T6: Nervous System enabled=true Pivot — BALANCED preset
- T7: Ana PID Notification Scope Enforcement — `runtime-scope-check.ts`, ADR-037 RBAC
- T8: StaleWorkerDetector Live Activation + DetectorRegistry
- T9: ScopeCollisionMonitor + DebtTrendAnalyzer Live Activation
- T10: AgentRoutingHealth Live Positive Validation (post-reform: severity='warning', not critical)
- T11: DirectivesMidSprintProtection Live + Deliberate Stress Test
- T12: CLI `deckent nervous` TUI Integration Test + Smoke Script
- T13: MCP `deckent_nervous_*` 5 Tools End-to-End Live Test

**Block C — Cross-Platform Validation (6 tasks, Wave 5):**
- T14: macOS E2E — tmux Backend Full Sprint (GitHub Actions)
- T15: Linux E2E — subprocess Backend Full Sprint
- T16: WSL2 E2E — Docker Backend Full Sprint
- T17: Provider Matrix — Claude + Codex Mixed Mini-Sprint
- T18: i18n Parity — TR/EN Task Description Routing Identical
- T19: Fresh Install Matrix — Node 18/20/22 × Clean Env

**Block D — Polish + Debt Liquidation + Docs (9 tasks, Wave 6):**
- T20: Vitest Triage — 135 Fail → < 50 Fail
- T21: Routing V3 Intent Classifier — core-dev Sub-Intents
- T22: Sprint 146 T-146-011 Docker Worker Exit Pattern Root Cause Fix
- T23: CHANGELOG 0.4.0-beta.4 + Sprint-148.md
- T24: FINAL-EXECUTIVE-REPORT Sprint 148 Living Record
- T25: ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 148 Append (this entry)
- T26: Memory V2 Nervous History Integration
- T27: npm Publish Dry-Run Rehearsal
- T28: ADR-041 Draft — Agent Taxonomy (Horizontal vs Vertical)

### Architectural Outputs

```
.deckent/agents/archive/
└── test-writer-removed-sprint-148/  (archived, restorable)

src/nervous/
├── detector-registry.ts    (NEW — 5-detector registry, config-driven)
├── runtime-scope-check.ts  (NEW — Brain PID scope enforcement, ADR-037)

src/core/
├── intent-classifier.ts    (UPD — 'testing' intent removed, V3 sub-intents)
├── routing-types.ts        (UPD — Intent union updated, TaskDNA tags)
├── skill-pool.ts           (UPD — testing-expert auto-activation)

scripts/
├── agent-prompt-validator.mjs      (NEW — rubricScores cleanup validator)
├── directives-stress-simulator.mjs (NEW — detector stress test)
├── nervous-tui-smoke.sh            (NEW — TUI smoke test)
├── mcp-nervous-e2e.mjs            (NEW — MCP end-to-end test)
├── fresh-env-test.sh               (NEW — Node 18/20/22 fresh install)
├── npm-publish-dry.sh              (NEW — npm publish dry-run rehearsal)

.github/workflows/
└── cross-platform-e2e.yml          (NEW — macOS/Linux matrix CI)
```

### Detector Live Evidence (Sprint 148)

| Detector | Sprint 148 Status | Evidence |
|----------|------------------|----------|
| AgentRoutingHealth | severity='warning' (pre-reform: critical) | test-writer removal successful |
| DebtTrendAnalyzer | ≥1 event — Sprint 145-147 debt trend | avgDebtRate calculated |
| ScopeCollisionMonitor | 0 collisions (28 tasks clean) | plan-time trigger positive |
| DirectivesMidSprintProtection | ≥1 emergency + restore | stress simulator evidence |
| StaleWorkerDetector | registry active, live monitoring | all 5 detectors enabled |

### Sprint Gate Results (Sprint 148 Exit)

| Gate | Target | Status |
|------|--------|--------|
| tsc --noEmit | PASS | ✅ |
| vitest fail | < 50 | ✅ (reduced from 135) |
| doctor | ≥ 92/100 | ✅ |
| NO_GO | ≤ 2 | ✅ |
| Nervous events | ≥ 10 | ✅ |
| Cross-platform | 3/3 | ✅ |
| test-writer routing | = 0 | ✅ |
| npm dry-run | PASS | ✅ |
| ADR-041 proposed | recorded | ✅ |

### Sprint 148 → Sprint 149 Bridge

Sprint 148 exit criteria met:
- `test-writer` agent removed (16 → 15 built-in agents)
- `testing-expert` skill auto-activation live (scope tests/** triggers)
- Intent 'testing' removed, 'test-coverage' tag system active
- **Nervous system LIVE** (enabled=true, balanced preset)
- 5 detectors active, live evidence listed in Sprint 148 retro
- Cross-platform 3/3: macOS + Linux + WSL2
- `test-writer removed` — routing anomaly resolved
- **Beta GA 1 day away: Sprint 150 is next 🚀**

### Sprint 149 Preview — Documentation Consolidation + npm Publish

Sprint 149 theme: **"Last Mile"** — npm publish v1.0.0-beta.1 + docs finalize + debt zero.

- `npm publish v1.0.0-beta.1` (after Sprint 148 dry-run rehearsal)
- All docs updated post-Sprint 148
- ADR-041 status: proposed → **accepted**
- vitest fail: < 10 target (Sprint 148 reduced to < 50)
- **Beta GA path:** Sprint 149 (Wed-Thu) → Sprint 150 (Thu 🚀 GA Apr 23)
