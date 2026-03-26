# Deckent Memory System — 3-Tier Architecture

> **Blueprint Reference:** §6 Memory Architecture (3-Tier)

---

## Overview

Deckent's memory system is a **three-tiered, file-based knowledge store** that lives entirely in the `.brain/` directory. Every sprint reads from and writes to this system, making the orchestrator progressively smarter with each execution cycle.

```
.brain/
├── MEMORY.md          ← Tier 1: Short-term (always loaded, ~200 lines)
├── PATTERNS.md        ← Tier 2: Long-term (JSON array, ~80 lines)
├── DECISIONS.md       ← Tier 3: Permanent (ADR records, never decayed)
├── DEBT.md            ← Tech debt ledger (markdown table)
├── RETRO.md           ← Latest retrospective (overwritten each sprint)
├── sprints/           ← Per-sprint logs (auto-archived)
│   ├── sprint-001.md
│   └── sprint-NNN.md
└── archive/           ← Archived sprint logs (deep history)
    └── sprint-001.md
```

---

## Tier 1: MEMORY.md — Short-Term Memory

### Purpose
Active working memory. Loaded into Brain's context at the start of **every sprint**. Contains the most recent learnings, patterns, and sprint summaries needed for day-to-day orchestration.

### Format
Plain Markdown. Organized by wave/sprint sections:

```markdown
# Learned Patterns

## Wave N Learnings (Sprint X, YYYY-MM-DD)

- Key learning or pattern discovered
- Another pattern with code reference (`functionName`)
- Edge case or caveat found during implementation

## Sprint N-M Özet
- Summary bullet for consolidated sprints
```

### Limits
| Constraint | Value | Source |
|---|---|---|
| Max lines | **200** | `MEMORY_MAX_LINES` in `src/core/constants.ts:47` |
| Decay trigger | 600 lines total `.brain/` budget | `BRAIN_TOTAL_LINE_BUDGET` in `src/core/constants.ts:51` |
| Decay age | Sections older than **5 sprints** are removed | `MEMORY_DECAY_SPRINTS = 5` in `src/core/constants.ts:52` |
| Last-resort truncation | Trimmed to 50 lines when budget still exceeded | `brain.ts:970-975` |

### When Written
- After every sprint retrospective (`runSprint` → `updateMemory` phase)
- Brain appends new learnings from worker results
- Long sections from old sprints are pruned during decay

### Decay Rule
When `countBrainLines(projectRoot) > 600`, Brain removes any MEMORY.md section whose sprint number is `>= 5 sprints` behind the current sprint. If the budget is still exceeded after section removal, the file is hard-truncated to the last 50 lines.

```typescript
// src/orchestra/brain.ts — decay step 4
const sectionMatch = line.match(/^## Sprint sprint-(\d+)/);
if (sectionMatch?.[1]) {
  const sectionNum = parseInt(sectionMatch[1], 10);
  currentSectionOld = (currentNum - sectionNum) >= MEMORY_DECAY_SPRINTS;
}
if (!currentSectionOld) kept.push(line);
```

---

## Tier 2: PATTERNS.md — Long-Term Patterns

### Purpose
Structural patterns detected by the Auditor and confirmed across multiple sprints. Persists longer than MEMORY.md — only resolved (confirmed-fixed) patterns are removed during decay.

### Format
JSON array of `PatternEntry` objects:

```json
[
  {
    "id": "pattern-001",
    "description": "Circular import between brain.ts and auditor.ts",
    "severity": "critical",
    "firstSeenSprintId": "sprint-003",
    "resolved": false,
    "resolvedInSprintId": null,
    "tags": ["architecture", "imports"]
  }
]
```

### Limits
| Constraint | Value | Source |
|---|---|---|
| Max lines | **80** | `PATTERNS_MAX_LINES` in `src/core/constants.ts:48` |
| Decay trigger | Budget exceeded (600 lines total) | `BRAIN_TOTAL_LINE_BUDGET` |
| Decay rule | Resolved patterns removed first | `runDecay` step 1 in `brain.ts:909-919` |
| Pattern lifetime | **8 sprints** before auto-resolve | `PATTERN_DECAY_SPRINTS = 8` in `src/core/constants.ts:53` |

### When Written
- Auditor appends new patterns during scan loop (never overwrites, only appends)
- Brain marks patterns as resolved when GO/NO-GO evaluation confirms fix
- Decay removes only `resolved: true` entries

### Decay Rule
```typescript
// src/orchestra/brain.ts — decay step 1
const patterns = readJsonSafe<PatternEntry[]>(patternsPath);
const resolved = patterns.filter(p => p.resolved);
removedPatternCount = resolved.length;
const active = patterns.filter(p => !p.resolved);
writeFileSync(patternsPath, JSON.stringify(active, null, 2), 'utf-8');
```

### MCP Resource
Patterns are exposed as an MCP resource at `src/mcp/resources/memory.ts`, readable by Claude Code via:
```
deckent://memory/patterns
```

---

## Tier 3: DECISIONS.md — Permanent ADRs

### Purpose
Architecture Decision Records (ADRs). These are **never decayed** — they capture permanent decisions about the system's design and are always available for context.

### Format
Each ADR follows the format:

```markdown
## ADR-NNN: Title

**Decision:** One-line summary of the decision made.
**Context:** Why this decision was needed — the problem being solved.
**Consequence:** What changes as a result — trade-offs, future constraints.
```

### Limits
| Constraint | Value |
|---|---|
| Max lines | No hard limit — grows indefinitely |
| Decay | **Never decayed** |
| Ownership | Brain writes; agents read |

### Current ADRs (Sprint 065 — 21 ADRs total)
| ID | Subject |
|---|---|
| ADR-001 | TypeScript + ESM |
| ADR-002 | Node16 Module Resolution |
| ADR-003 | vitest over Jest |
| ADR-004 | 3-Layer Config Merge |
| ADR-005 | Synchronous I/O |
| ADR-006 | spawnSync Security Pattern |
| ADR-007 | SpawnOptions Interface |
| ADR-008 | Brain Merkezi Import |
| ADR-009 | DEBT.md Markdown Table Format |
| ADR-010 | Single Runtime Dependency (commander.js) |
| ADR-011 | node:readline/promises Built-in Prompt |
| ADR-012 | register\<Name\>(program) Pattern |
| ADR-013 | DECKENT.md Adapter Pattern |

---

## Supporting Files

### DEBT.md — Tech Debt Ledger
9-column pipe-delimited markdown table. Brain reads/writes via `parseDebtTable` / `generateDebtTable` helpers (see `src/core/utils.ts`).

```markdown
| ID | Description | Task | Sprint | Priority | Open | Resolved | Fixed In | Created |
```

Decay removes `resolved: true` rows when budget is exceeded (step 2 of `runDecay`).

### RETRO.md — Sprint Retrospective
Overwritten (not appended) after every sprint. Max **100 lines** (`RETRO_MAX_LINES`). Contains:
- Sprint summary (tasks completed, GO/NO-GO rates)
- What went well
- What needs improvement
- Debt created vs resolved

### sprints/sprint-NNN.md — Per-Sprint Logs
Max **80 lines** per file (`SPRINT_LOG_MAX_LINES`). Contains task list, results, and summary for a single sprint. Kept in `sprints/` directory. Oldest files are archived to `archive/` when decay runs.

---

## Brain Cleanup Cycle (Decay)

The decay cycle runs automatically at the end of every sprint, triggered by `runSprint` after the retrospective phase.

### Trigger Condition
```typescript
// src/orchestra/brain.ts:1250
runDecay(projectRoot, sprint.id);
```

Decay always runs at sprint end. If total `.brain/` line count ≤ 600, it returns immediately with no changes. If `force: true` is passed, it runs regardless of budget.

### Decay Steps (in order)

```
Step 1 — Remove resolved patterns from PATTERNS.md
Step 2 — Remove resolved debt rows from DEBT.md
Step 3 — Archive old sprint logs (keep last 2 active, move rest to archive/)
Step 4 — Trim old MEMORY.md sections (sections >= 5 sprints old)
Step 5 — Last resort: hard-truncate MEMORY.md to 50 lines
```

### `runDecay` Function Signature
```typescript
// src/orchestra/brain.ts:895
export function runDecay(
  projectRoot: string,
  sprintId: string,
  opts?: { force?: boolean }
): DecayResult
```

### `DecayResult` Type
```typescript
interface DecayResult {
  linesBefore: number;        // Total .brain/ lines before decay
  linesAfter: number;         // Total .brain/ lines after decay
  archivedSprints: string[];  // Sprint files moved to archive/
  removedDebtCount: number;   // Resolved debt rows removed
  removedPatternCount: number; // Resolved patterns removed
}
```

### `countBrainLines` Helper
```typescript
// src/core/utils.ts:11
export function countBrainLines(projectRoot: string): number
```
Counts all lines in `.brain/` (excluding `archive/`), including `sprints/`. Used by Brain decay and `deckent doctor` health checks.

---

## Memory Budget Summary

| File | Max Lines | Decay Strategy |
|---|---|---|
| `MEMORY.md` | 200 | Remove sections ≥ 5 sprints old; hard-truncate to 50 as last resort |
| `PATTERNS.md` | 80 | Remove `resolved: true` entries on budget exceeded |
| `DECISIONS.md` | Unlimited | Never decayed |
| `RETRO.md` | 100 | Overwritten every sprint |
| `DEBT.md` | Unlimited | Remove resolved rows on budget exceeded |
| `sprints/sprint-NNN.md` | 80 | Archive oldest (keep last 2 active) |
| **Total `.brain/` budget** | **600** | `BRAIN_TOTAL_LINE_BUDGET` in `constants.ts` |

---

## MCP Resources for Memory

Memory files are exposed as readable MCP resources:

| Resource URI | File | Description |
|---|---|---|
| `deckent://memory` | `MEMORY.md` | Current active memory |
| `deckent://memory/patterns` | `PATTERNS.md` | Detected patterns |

Accessible via Claude Code: use `deckent_status` MCP tool or read resource directly from `src/mcp/resources/memory.ts`.

---

## Blueprint Reference

- **§6 Memory Architecture (3-Tier)** — System design and tier definitions
- **§5 Agent System** — Brain's memory write responsibilities
- **§7 Sprint Lifecycle** — When decay runs in the sprint loop
- **§8 GO/NO-GO Protocol** — How evaluation results feed into MEMORY.md
- **§16 Self-Test & Reporting** — `deckent doctor` brain line count check

---

*Last updated: Sprint 065 — deckent v0.2.0-beta.1 — March 2026*
