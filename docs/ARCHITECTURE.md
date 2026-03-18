# Deckent Architecture

> This is a condensed overview. For full details, see [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md).

---

## System Components

```
YOU (Operator) → writes DIRECTIVES.md
       │
   DECKENT CLI → `deckent start` / `deckent web`
       │
   ┌───┴───────────────┐
   │                    │
 BRAIN + PLANNER    AUDITOR (in-process)
 Plans (AI/struct), 30s scan loop within
 evaluates, learns  Brain's runSprint
   │
 WORKER POOL (dynamic, via tmux)
 plan → code → test → doc → report
       │
 HTTP API + WEB DASHBOARD
 16 endpoints + SSE, React+Vite+Tailwind
```

### Brain + Planner (Orchestrator)
- Model: opus (Max) or sonnet (Pro)
- Reads: DIRECTIVES, MEMORY, RETRO, DEBT, PATTERNS, project state
- Writes: `.tasks/`, `.contracts/`, `.brain/RETRO`, `.brain/MEMORY`, `.brain/DECISIONS`
- **Planner** (`planner.ts`): AI task planning with Zod validation, imports only from `core/` (ADR-008)
- **Planning modes**: `'ai'` | `'structured'` | `'auto'` (default) via `brain_planning` config
- Lifecycle: check usage → read memory → plan sprint → spawn workers → start auditor scan → wait → stop scan → evaluate → retro → decay

### Auditor (In-Process Scan Loop)
- Runs within Brain's `runSprint` process (not as separate tmux window)
- `startScanLoop()` called between SPAWN and EXECUTE phases
- `clearInterval()` called after EXECUTE completes
- 30-second scan cycle: heartbeats → git diff → boundaries → locks → deadlocks
- `writeScanToDashboard()` merges scan results into `.dashboard`
- Writes: `.dashboard`, `.brain/PATTERNS.md`, alerts

### Worker (Builder)
- Model: per-task (opus/sonnet/haiku) — Brain decides
- Lifecycle: CLAIM → HEARTBEAT → PLAN → CODE → TEST → DOCUMENT → REPORT
- Scoped: can only write files within assigned directories
- Heartbeat: creates and updates `.tasks/task-{id}.hb` periodically

---

## File Structure

```
project/
├── AGENTS.md              # @DECKENT.md adapter
├── CLAUDE.md              # @DECKENT.md adapter for Claude Code
├── DECKENT.md             # Single source of truth (agent config)
├── DIRECTIVES.md          # Operator commands
├── .deckent/              # Runtime config, workspace, plugins, i18n
├── .brain/                # Memory system (3 tiers)
├── .contracts/            # Inter-agent API contracts
├── .tasks/                # Ephemeral task files (auto-cleaned)
├── .locks/                # File locks (runtime)
├── .dashboard             # Live status (Auditor overwrites)
├── .claude/rules/         # Path-scoped agent rules
└── src/, tests/, docs/    # Source code
```

### Key Source Modules

```
src/
├── core/
│   ├── types.ts           # Shared TypeScript interfaces and enums
│   ├── constants.ts       # App-wide constants
│   ├── config.ts          # 3-layer config loader
│   ├── utils.ts           # Shared utilities (countBrainLines, shouldRemoveResolvedDebt, etc.)
│   ├── analyzer.ts        # Project stack/size/methodology analysis
│   ├── system-profile.ts  # CPU, RAM, recommended workers detection
│   └── subscription.ts    # Claude plan detection (max_20x/max_5x/pro/api/unknown)
├── orchestra/
│   ├── brain.ts           # Sprint lifecycle, resolveTaskModel, planSprint (AI post-validation)
│   ├── planner.ts         # AI task planning (Zod-validated)
│   └── tmux.ts            # tmux session and window management
├── cli/
│   ├── auto-setup.ts      # Auto setup wizard (generateSetupRecommendation)
│   ├── commands/          # 28 CLI commands (init, start, test, run, doctor --profile, ...)
│   └── helpers/
│       ├── hints.ts       # Phase-based contextual hints (tr/en)
│       └── messages.ts    # Localized message system (tr/en)
├── mcp/
│   ├── tools/             # 10 MCP tool handlers (all enriched)
│   ├── resources/         # 5 MCP resource handlers
│   └── helpers/
│       └── enrich.ts      # enrichResponse() — adds _enriched meta to all tool responses
├── api/                   # HTTP API (16 endpoints + SSE)
└── dashboard/             # Web Dashboard (React+Vite+Tailwind)
```

See Blueprint Section 4 for complete file-by-file reference.

---

## Memory Architecture (3 Tiers)

| Tier | Location | Max Lines | Loaded | Decay |
|------|----------|-----------|--------|-------|
| 1 | `.brain/MEMORY.md` | 100 | Always (via @import) | 3 sprints unused |
| 2 | `.brain/sprints/*.md` | 50 each | Brain reads last 2 | Auto-archived |
| 3 | `.brain/archive/` | No limit | On-demand (grep) | Never |

Total `.brain/` budget: **300 lines** (excluding archive). Compressed at sprint end if exceeded.

---

### HTTP API & Web Dashboard
- **HTTP API** (`src/api/server.ts`): 16 endpoints + SSE stream
- **Web Dashboard** (`src/dashboard/`): React + Vite + Tailwind, 4 pages (Dashboard, Settings, History, Memory)
- `deckent web` launches both at localhost:3100
- SSE endpoint watches `.dashboard` file for real-time updates
- Dashboard shows agent status, progress, alerts, auditor status, sprint history

---

## Sprint Lifecycle

```
DIRECTIVE → PLAN → SPAWN → AUDITOR START → EXECUTE → AUDITOR STOP → EVALUATE → FIX → RETRO → DECAY → TRANSITION
```

1. **DIRECTIVE** — Operator writes/updates DIRECTIVES.md
2. **PLAN** — Brain reads context, checks usage, creates task JSONs (AI or structured mode)
3. **SPAWN** — Brain spawns workers via tmux
4. **AUDITOR START** (Phase 2.5) — `startScanLoop()` begins in-process scan
5. **EXECUTE** — Workers code in parallel, auditor scans every 30s in background
6. **AUDITOR STOP** (Phase 3.5) — `clearInterval()` stops scan loop
7. **EVALUATE** — Brain grades each result: DONE / GO+DEBT / NO-GO
8. **FIX** — NO-GO tasks get priority fixes (cross-dependency aware)
9. **RETRO** — Brain updates MEMORY, RETRO, DECISIONS
10. **DECAY** — Compress if over 300 lines, archive old logs
11. **TRANSITION** — More directives? Loop. Done? Report.

**Sprints are never left incomplete.** If usage limits hit, tasks pause and resume.

---

*Full reference: [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)*
