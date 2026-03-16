# Deckent Architecture

> This is a condensed overview. For full details, see [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md).

---

## System Components

```
YOU (Operator) → writes DIRECTIVES.md
       │
   DECKENT CLI → `deckent start`
       │
   ┌───┴───────────────┐
   │                    │
 BRAIN              AUDITOR
 Plans, evaluates,  Monitors, detects,
 learns, adapts     reports, enforces
   │
 WORKER POOL (dynamic, via tmux)
 plan → code → test → doc → report
```

### Brain (Orchestrator)
- Model: opus (Max) or sonnet (Pro)
- Reads: DIRECTIVES, MEMORY, RETRO, DEBT, PATTERNS, project state
- Writes: `.tasks/`, `.contracts/`, `.brain/RETRO`, `.brain/MEMORY`, `.brain/DECISIONS`
- Lifecycle: check usage → read memory → plan sprint → spawn workers → evaluate → retro → decay

### Auditor (Immune System)
- Model: sonnet (always)
- 30-second scan cycle: heartbeats → git diff → boundaries → locks → deadlocks → usage
- Writes: `.dashboard`, `.brain/PATTERNS.md`, alerts

### Worker (Builder)
- Model: per-task (opus/sonnet/haiku) — Brain decides
- Lifecycle: CLAIM → PLAN → CODE → TEST → DOCUMENT → REPORT
- Scoped: can only write files within assigned directories

---

## File Structure

```
project/
├── AGENTS.md              # Master instructions (max ~80 lines)
├── CLAUDE.md → AGENTS.md  # Symlink for Claude Code
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

## Sprint Lifecycle

```
DIRECTIVE → PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → TRANSITION
```

1. **DIRECTIVE** — Operator writes/updates DIRECTIVES.md
2. **PLAN** — Brain reads context, checks usage, creates task JSONs
3. **SPAWN** — Brain spawns workers + auditor via tmux
4. **EXECUTE** — Workers code in parallel, auditor scans every 30s
5. **EVALUATE** — Brain grades each result: DONE / GO+DEBT / NO-GO
6. **FIX** — NO-GO tasks get priority fixes (cross-dependency aware)
7. **RETRO** — Brain updates MEMORY, RETRO, DECISIONS
8. **DECAY** — Compress if over 300 lines, archive old logs
9. **TRANSITION** — More directives? Loop. Done? Report.

**Sprints are never left incomplete.** If usage limits hit, tasks pause and resume.

---

*Full reference: [DECKENT-MASTER-BLUEPRINT.md](../DECKENT-MASTER-BLUEPRINT.md)*
