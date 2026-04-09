# DECKENT MASTER BLUEPRINT
## AI Agent Orchestration System — Complete Implementation Reference
### Version 2.1 — March 2026 — Verhex

---

## Live Metrics
| Metrik | Değer |
|--------|-------|
| Sprint | sprint-123 |
| Toplam Task | 3 |
| Tamamlanan | 3 |
| Tech Debt | 3 |
| No-Go | 0 |
| Süre | 4dk 30sn |
| Coverage | 0.0% |

# TABLE OF CONTENTS

1. Product Identity & Vision
2. Architecture Overview
3. Native CLI & Installation
4. Workspace Structure
5. Agent System (Brain, Auditor, Worker)
6. Memory Architecture (3-Tier)
7. Sprint Lifecycle & Orchestration
8. GO / NO-GO / Tech Debt Protocol
9. Usage-Aware Planning
10. Dynamic Terminal Management (tmux)
11. Plugin & Skill System
12. UI Roadmap (Terminal → Web → VSCode)
13. Multi-Plan Compatibility
14. i18n & Multi-Language
15. Security & Permissions
16. Self-Test & Reporting
17. Repository Strategy
18. File-by-File Reference
19. Implementation History
20. Claude Code Integration Guide
21. MCP Server Architecture
22. User Flows
23. Strategic Roadmap
24. Sprint History

---

# 1. PRODUCT IDENTITY & VISION

**Name:** Deckent (Deck + Agent)
**Domain:** deckent.agency
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
│  20 Tools + 8 Resources                             │
│  init | set_directives | plan | start | analyze ... │
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
│              MEMORY SYSTEM (.brain/)                  │
│  Tier 1: MEMORY.md (always loaded, ~200 lines)      │
│  Tier 2: sprint logs (per-sprint, auto-archived)    │
│  Tier 3: deep knowledge (searchable archive)        │
└─────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────┐
│          HTTP API + WEB DASHBOARD                    │
│  src/api/server.ts — 16 endpoints + SSE             │
│  src/dashboard/ — React+Vite+Tailwind (6 pages)     │
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
deckent mcp               Start MCP server (stdio transport for Claude Code)
deckent sync             Sync adapter files (CLAUDE.md, AGENTS.md) with DECKENT.md reference
deckent watch            Live tmux split view: dashboard + worker panes
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
  Node.js ≥ 18 (22 recommended)
  git
  tmux (auto-installed on first run if missing)
  Claude Code CLI (npm install -g @anthropic-ai/claude-code)
  Claude subscription (Pro, Max, or API key)

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
├── .brain/                            # Memory system (Brain + Auditor only)
│   ├── MEMORY.md                      # Tier 1: always loaded (~200 lines)
│   ├── DECISIONS.md                   # Architecture Decision Records
│   ├── DEBT.md                        # Technical debt log
│   ├── PATTERNS.md                    # Auditor findings
│   ├── RETRO.md                       # Latest sprint retrospective
│   ├── sprints/                       # Tier 2: per-sprint logs
│   │   ├── sprint-001.md
│   │   └── sprint-002.md
│   └── archive/                       # Tier 3: deep knowledge
│       └── memory-old.md
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
│       ├── worker-default.md          # Default worker rules
│       └── testing.md                 # Rules for test files
│
├── src/                               # Deckent source code
│   ├── core/                         # Types, config, constants, utils
│   │   ├── types.ts                 # All shared interfaces and enums
│   │   ├── constants.ts             # App-wide constants
│   │   ├── config.ts                # 3-layer config loader
│   │   ├── utils.ts                 # Shared utilities
│   │   └── analyzer.ts             # Project stack/size analysis
│   ├── orchestra/                    # Brain + Planner + tmux orchestration
│   │   ├── brain.ts                 # Sprint lifecycle orchestrator
│   │   ├── planner.ts              # AI task planning (Zod-validated)
│   │   └── tmux.ts                  # tmux session management
│   ├── agents/                       # Worker lifecycle
│   ├── monitor/                      # Auditor monitoring
│   ├── api/                          # HTTP API + SSE
│   │   ├── server.ts               # 16 endpoints + SSE stream
│   │   └── watcher.ts              # Dashboard file watcher
│   ├── cli/                          # CLI commands (commander.js, 35 files)
│   ├── mcp/                          # MCP server integration
│   │   ├── server.ts                # Entry point (McpServer + stdio)
│   │   ├── tools/                   # 20 tool handlers
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
│   │   │   ├── usage.ts            # deckent_usage
│   │   │   ├── review.ts           # deckent_review
│   │   │   ├── run.ts              # deckent_run
│   │   │   ├── kill.ts             # deckent_kill
│   │   │   ├── cleanup.ts          # deckent_cleanup
│   │   │   └── help.ts             # deckent_help
│   │   └── resources/               # 8 resource handlers
│   └── dashboard/                    # Web Dashboard (React+Vite+Tailwind)
│       └── src/
│           ├── pages/               # 6 pages: Dashboard, Settings, History, Memory, Config, Status
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

**Brain+Planner Separation (ADR-008):**
- `brain.ts` — orchestrator, imports from all modules
- `planner.ts` — AI task planning, imports ONLY from `core/` (types, constants)
- Planner uses Zod schema validation for AI responses
- Brain delegates planning to Planner when `brain_planning` is `'ai'` or `'auto'`

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

---

# 6. MEMORY ARCHITECTURE (3-Tier)

Inspired by OpenClaw's tiered memory.

## Tier 1: Always Loaded (MEMORY.md)
- Max 300 lines
- Brain writes after every sprint
- Loaded into every agent's context via @import in AGENTS.md
- Contains: learned patterns, key conventions, critical rules
- Decay: oldest entries archived after 5 sprints of non-use

## Tier 2: Sprint Logs (.brain/sprints/)
- One file per sprint: sprint-001.md, sprint-002.md
- Contains: full results, metrics, decisions made
- Brain reads last 2 sprints at planning time
- Older sprints archived automatically

## Tier 3: Deep Archive (.brain/archive/)
- Compressed old memories, patterns, sprint logs
- NOT loaded into context automatically
- Brain can search when needed (grep/find)
- Useful for long-term trend analysis

## Decay Mechanism
```
Every sprint end:
1. Count total lines in .brain/ (excluding archive/)
2. If > 900 lines → compress:
   a. MEMORY.md: archive entries unused for 5+ sprints
   b. PATTERNS.md: remove resolved patterns
   c. DEBT.md: remove resolved debts
   d. Move old sprint logs to archive/
3. Verify total < 900 lines
```

## Memory Files

| File | Writer | Reader | Max Lines | Decay |
|------|--------|--------|-----------|-------|
| MEMORY.md | Brain | All | 300 | 5 sprints |
| DECISIONS.md | Brain | Brain, Auditor | No limit | Never |
| DEBT.md | Brain | Brain | No limit | On resolve |
| PATTERNS.md | Auditor | Brain | 150 | 5 sprints |
| RETRO.md | Brain | Brain | 120 | Overwritten |
| sprints/*.md | Brain | Brain | 100 each | Auto-archive |

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
  Clean .tasks/, .locks/

Phase 8: TRANSITION
  If DIRECTIVES.md has more goals → start Phase 1 again
  If done → report final status
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

## Phase 2: Web Dashboard — DONE (Sprint 11)

React + Vite + Tailwind, 6 pages, shadcn/ui components, SSE for real-time updates.

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

# 15. SECURITY & PERMISSIONS

## Permission Model

```
Level 1: Operator (YOU)
  - Full access to everything
  - Writes DIRECTIVES.md, AGENTS.md
  - Approves/rejects sprint plans
  - Can kill any agent

Level 2: Brain
  - Read: all files
  - Write: .tasks/, .contracts/, .brain/, .dashboard
  - Execute: claude -p (spawn workers)
  - tmux: create/kill windows
  - git: commit, push (with operator approval)
  - CANNOT: write AGENTS.md, DIRECTIVES.md, .deckent/config.json

Level 3: Auditor
  - Read: all files
  - Write: .dashboard, .brain/PATTERNS.md, .tasks/ALERT
  - Execute: git diff, git log (read-only git)
  - CANNOT: write source code, create tasks, spawn workers

Level 4: Worker
  - Read: AGENTS.md, .contracts/, assigned task
  - Write: source code WITHIN SCOPE ONLY
  - Write: .tasks/{own-id}.hb, .tasks/{own-id}.result, .tasks/{own-id}.plan
  - Execute: build, test, lint (project commands)
  - CANNOT: write .brain/, .contracts/, other workers' files
```

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
| src/mcp/tools/*.ts | MCP tool handlers (20) | Developer | MCP server | Permanent |
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
- MCP Enrichment (`enrich.ts`): `enrichResponse()` adds `_enriched: { summary, hints, timestamp }` to all 20 tools
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

## Sprint 27-29: Global Launch Preparation (Planned)

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
claude mcp add deckent -- npx deckent mcp
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

## Tools (17)

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

### Information Tools

| Tool | Input | Maps To | Purpose |
|------|-------|---------|---------|
| `deckent_status` | none | reads .dashboard | Get current sprint dashboard |
| `deckent_doctor` | none | runDoctorChecks() | System health check |
| `deckent_retro` | none | reads RETRO.md | Latest sprint retrospective |
| `deckent_history` | last?: number | reads .brain/sprints/ | Sprint history logs |
| `deckent_usage` | none | reads usage stats | Token and cost usage across sprints |
| `deckent_help` | none | runtime capabilities | Runtime state, capabilities, and usage guide |

### Configuration & Sync Tools

| Tool | Input | Maps To | Purpose |
|------|-------|---------|---------|
| `deckent_config` | action: 'read'\|'set', key?, value? | loadConfig/setConfig | Read or set configuration values |
| `deckent_sync` | none | ensureDeckentImport() | Sync CLAUDE.md + AGENTS.md with @DECKENT.md reference |
| `deckent_analyze_project` | none | analyzeProject() | Analyze project stack, size, methodology |

## Resources (8)

| URI | Content | MIME Type |
|-----|---------|-----------|
| `deckent://dashboard` | Live sprint status (JSON) | application/json |
| `deckent://directives` | Current DIRECTIVES.md | text/markdown |
| `deckent://memory` | Learned patterns (.brain/MEMORY.md) | text/markdown |
| `deckent://debt` | Tech debt items (parsed table → JSON) | application/json |
| `deckent://config` | Project config (.deckent/config.json) | application/json |
| `deckent://retro` | Last sprint retrospective (RETRO.md) | text/markdown |
| `deckent://usage` | Token and cost usage summary | application/json |
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

## Phase 4: Agent/Skill Intelligence (Sprint 29-33) — COMPLETE

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

## Phase 5: Multi-Provider & Ecosystem (Sprint 35-38) — IN PROGRESS

**Goal:** Run workers on different providers simultaneously. VSCode extension. Community ecosystem.

**Completed:**
- Provider adapters: OpenAI Codex CLI, Gemini CLI — DONE (Sprint 038)
- Brain on Opus (Claude), workers on GPT-4o (OpenAI) — mix and match — DONE (Sprint 038)
- Cost optimization: expensive tasks on powerful models, simple on cheap — DONE (tier-based equivalence, Sprint 038)
- Plugin system v3 (security hardened, skill sandbox AST) — DONE (Sprint 037)
- Memory system fix — DONE (Sprint 037)
- Platform decoupling (planner/tmux/subprocess) — DONE (Sprint 038)
- Beta cleanup: readJsonSafe, error handling, type safety, brain.ts split — DONE (Sprint 035-036)

**Remaining:**
- Provider-specific tool mapping (allowedTools → function_calling)
- Local models (Ollama) adapter
- VSCode extension (sidebar, status bar, sprint management)
- GitHub App (issue → sprint → PR automation)
- Team mode: shared sprints, role-based access
- Skill marketplace (community skills + agents)
- Cloud dashboard (deckent.agency remote monitoring)
- Claude Code Agent Teams integration (native spawn backend)

## Phase 6: Platform & Enterprise (Sprint 45+) — VISION

**Goal:** Deckent as a platform for AI-driven development.

- Enterprise features: SSO, audit log, compliance, RBAC
- Deckent Hub: community templates, plugins, DIRECTIVES examples
- CI/CD integration: auto `deckent plan --dry-run` on PR
- Cloud orchestration: remote tmux-free workers
- Multi-project orchestration: cross-repo sprints
- Native Windows support (no WSL2 required)

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

# END OF BLUEPRINT

This document is the single source of truth for Deckent's implementation.
Use the MCP tools: "Set up Deckent" or "Plan a sprint for [goals]".
Or open it in Claude Code and say: "Implement this."
