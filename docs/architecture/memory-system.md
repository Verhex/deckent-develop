# Deckent Memory System — 3-Tier Architecture (V1 Design)

> **Blueprint Reference:** §6 Memory Architecture (3-Tier)

> **Memory V2 (DB-first) — read this first.** The "3-tier file-based" model
> below is the **original V1 design**, preserved for conceptual context. As of
> **Memory V2 the single source of truth is `.brain/memory.db`** (SQLite +
> FTS5, dual-layer Turkish/English normalize). The markdown files
> (`exports/summary.md`, `exports/decisions.md`, `exports/memory.md`,
> `exports/debt.md`) are **generated exports**, not hand-edited tiers. **ADRs
> live in the DB (`type='adr'`)** and are exported to
> `.brain/exports/decisions.md` and `docs/adr/` — there is no live
> hand-maintained `.brain/DECISIONS.md`.
>
> All line-budget numbers quoted below (max-lines per file, total budget, decay
> sprints, etc.) are **V1 design figures that have since changed**. The
> authoritative current constants are in `src/core/constants.ts` (marked
> `@deprecated` — prefer config keys `memory_budget` / `decay_after_sprints`).
> Current `@deprecated` backward-compat defaults (Sprint 140 pre-flight
> uplift):
>
> | Constant | V1 value | Current value |
> |---|---|---|
> | `MEMORY_MAX_LINES` | 200 | **1500** |
> | `PATTERNS_MAX_LINES` | 80 | **800** |
> | `RETRO_MAX_LINES` | 100 | **400** |
> | `SPRINT_LOG_MAX_LINES` | 80 | **500** |
> | `BRAIN_TOTAL_LINE_BUDGET` | 600 | **5000** |
> | `MEMORY_DECAY_SPRINTS` | 5 | **20** |
> | `PATTERN_DECAY_SPRINTS` | 8 | **25** |
>
> Schema reference: [api-surface.md](../reference/api-surface.md) (Memory V2
> DB Schema). Under Memory V2, decay is DB-driven via `MemoryStore.decay()` in
> `src/core/memory-store.ts`; file-based decay logic in `runDecay()`
> (`src/orchestra/debt-manager.ts`, re-exported via `src/orchestra/brain.ts`)
> is a no-op when the DB is present.

---

## Memory V2 DB Schema

The single source of truth for all Brain knowledge is `.brain/memory.db` (SQLite). The schema contains **5 tables + 1 FTS5 virtual table** (`src/core/memory-store.ts:99-237`):

| Table | Type | Description |
|---|---|---|
| `schema_version` | real table | Migration tracking; single row with `version` + `applied_at` |
| `entries` | real table | Main knowledge store — every ADR, memory entry, retro, debt, pattern |
| `tags` | real table | Normalized many-to-many tag association (`entry_id`, `tag COLLATE NOCASE`) |
| `relations` | real table | Cross-entry links: `from_id → to_id` with `rel_type` (references, supersedes, caused_by, resolves, blocks, depends_on) |
| `entry_history` | real table | Field-level change tracking: `entry_id`, `field`, `old_value`, `new_value`, `changed_by`, `change_type` |
| `entries_fts` | **FTS5 virtual table** | Full-text search over 8 columns — 4 original + 4 `turkishNormalize`d |

### FTS5 Dual-Layer Search

`entries_fts` indexes **8 columns** for dual-layer TR/EN recall:

```sql
CREATE VIRTUAL TABLE entries_fts USING fts5(
  title, content, summary, tag_text,          -- 4 original columns
  title_norm, content_norm, summary_norm, tag_norm,  -- 4 turkishNormalize columns
  content='entries',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);
```

The `_norm` columns store the output of `turkishNormalize()` (`src/core/memory-normalize.ts`), which maps Turkish-specific characters (ı→i, ğ→g, ş→s, ç→c, ö→o, ü→u) and normalizes casing. A query for "dogrulama" matches entries containing "doğrulama" — 100% recall across TR/EN/DE text.

Sync is maintained via 3 triggers: `entries_ai` (after insert), `entries_ad` (after delete), `entries_au` (after update).

### Additive Migrations

The schema supports additive (non-destructive) column migrations via `applyAdditiveMigrations()`. New columns are PRAGMA-guarded so re-opening an existing DB is idempotent. Historical rows are never dropped or rebuilt. Current additive columns: `tenant_id`, `audit_prev_hmac`, `audit_hmac`.

---

## Overview

Deckent's memory system was originally designed as a **three-tiered, file-based knowledge store** in the `.brain/` directory (the V1 model documented below). Under Memory V2 it is realised DB-first — see the note above. Every sprint reads from and writes to this system, making the orchestrator progressively smarter with each execution cycle.

```
.brain/
├── MEMORY.md          ← Tier 1: Short-term (always loaded)
├── PATTERNS.md        ← Tier 2: Long-term (JSON array)
├── RETRO.md           ← Latest retrospective (overwritten each sprint)
├── memory.db          ← Memory V2: single source of truth (SQLite)
├── exports/           ← Memory V2 generated exports (git-tracked)
│   ├── summary.md
│   ├── decisions.md
│   ├── memory.md
│   └── debt.md
├── sprints/           ← Per-sprint logs (auto-archived)
│   ├── sprint-001.md
│   └── sprint-NNN.md
└── archive/           ← Archived sprint logs (deep history)
    └── sprint-001.md
```

> Note: `.brain/DECISIONS.md` no longer exists as a hand-maintained file.
> ADRs are stored in `memory.db` (`type='adr'`) and exported to
> `.brain/exports/decisions.md` and individual files under `docs/adr/`.

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

### Limits (V1 design — superseded by Memory V2 DB budget)
| Constraint | V1 Value | Current `@deprecated` constant | Source |
|---|---|---|---|
| Max lines | 200 | **1500** | `MEMORY_MAX_LINES` in `src/core/constants.ts` |
| Decay trigger | 600 lines total `.brain/` budget | **5000** | `BRAIN_TOTAL_LINE_BUDGET` in `src/core/constants.ts` |
| Decay age | Sections older than 5 sprints | **20 sprints** | `MEMORY_DECAY_SPRINTS` in `src/core/constants.ts` |
| Last-resort truncation | Trimmed to 50 lines when budget still exceeded | (file-based path, DB-first no-op) | `runDecay` in `src/orchestra/debt-manager.ts` |

### When Written
- After every sprint retrospective (`runSprint` → `updateMemory` phase)
- Brain appends new learnings from worker results
- Long sections from old sprints are pruned during decay

### Decay Rule (V1 file-based — no-op under Memory V2 DB)
When total `.brain/` entry count exceeds the configured budget, Brain removes any MEMORY.md section whose sprint number is older than `MEMORY_DECAY_SPRINTS` sprints behind the current sprint. Under Memory V2 this is handled by `MemoryStore.decay(currentSprintNum, decayAfterSprints)` operating on the SQLite DB, not the markdown file.

```typescript
// src/orchestra/debt-manager.ts — runDecay (DB-first path)
// When memory.db is present, file-based decay is skipped entirely.
// DB decay is performed via:
store.decay(currentNum, decaySprints);
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

### Limits (V1 design — superseded by Memory V2 DB budget)
| Constraint | V1 Value | Current `@deprecated` constant | Source |
|---|---|---|---|
| Max lines | 80 | **800** | `PATTERNS_MAX_LINES` in `src/core/constants.ts` |
| Decay trigger | Budget exceeded (600 lines total) | **5000** | `BRAIN_TOTAL_LINE_BUDGET` in `src/core/constants.ts` |
| Decay rule | Resolved patterns removed first | (DB-driven under V2) | `MemoryStore.decay()` in `src/core/memory-store.ts` |
| Pattern lifetime | 8 sprints before auto-resolve | **25 sprints** | `PATTERN_DECAY_SPRINTS` in `src/core/constants.ts` |

### When Written
- Auditor appends new patterns during scan loop (never overwrites, only appends)
- Brain marks patterns as resolved when GO/NO-GO evaluation confirms fix
- Decay removes only `resolved: true` entries

### Decay Rule (V1 file-based — no-op under Memory V2 DB)
```typescript
// src/orchestra/debt-manager.ts — V1 file-based path (skipped when DB present)
const patterns = readJsonSafe<PatternEntry[]>(patternsPath);
const resolved = patterns.filter(p => p.resolved);
removedPatternCount = resolved.length;
const active = patterns.filter(p => !p.resolved);
writeFileSync(patternsPath, JSON.stringify(active, null, 2), 'utf-8');
```

### MCP Resource
Memory (including patterns stored in DB) is exposed as an MCP resource registered in `src/mcp/resources/memory.ts`, readable by Claude Code via:
```
deckent://memory
```

---

## Tier 3: ADRs — Permanent Architecture Decisions

### Purpose
Architecture Decision Records (ADRs). These are **never decayed** (`decay_exempt = true` in DB) — they capture permanent decisions about the system's design and are always available for context.

### Storage (Memory V2)
ADRs are stored in `memory.db` with `type='adr'` and `decay_exempt=1`. They are exported to:
- `.brain/exports/decisions.md` — summary table (auto-generated)
- `docs/adr/*.md` — individual ADR files

### Format
Each ADR follows MADR v3 hybrid format (ADR-036):

```markdown
## ADR-NNN: Title

**Decision:** One-line summary of the decision made.
**Context:** Why this decision was needed — the problem being solved.
**Consequence:** What changes as a result — trade-offs, future constraints.
```

### Limits
| Constraint | Value |
|---|---|
| Max entries | No hard limit — grows indefinitely |
| Decay | **Never decayed** (`decay_exempt = true`) |
| Ownership | Brain writes via `MemoryStore.upsert()`; agents read |
| Current count | 89 ADRs (ADR-001 through ADR-089; see `docs/adr/` for full list) |

> ADR governance was formalized in Sprint 138 (ADR-036). For the
> authoritative list query `store.getByType('adr')` or see `docs/adr/`.

---

## Supporting Files

### DEBT.md — Tech Debt Ledger (removed Sprint 186)

> ⚠️ `.brain/DEBT.md` was **removed in Sprint 186** (Task #4 — DB-first migration). The file no longer exists in new projects and is no longer initialized by `deckent init`. Tech debt is now entirely in `memory.db` (`type='debt'`), exported to `.brain/exports/debt.md` (generated, git-tracked). The `archive-debt` CLI command reads from `memory.db` directly via `getDebtItems()` in `src/core/debt-store.ts`.

Decay removes `resolved: true` debt entries when budget is exceeded (DB-driven via `MemoryStore.decay()`). The `parseDebtTable` / `generateDebtTable` helpers in `src/core/utils.ts` are legacy V1 code (no active callers post-Sprint 186).

### RETRO.md — Sprint Retrospective
Overwritten (not appended) after every sprint. Current constant: `RETRO_MAX_LINES = 400` (`src/core/constants.ts`; V1 value was 100). Contains:
- Sprint summary (tasks completed, GO/NO-GO rates)
- What went well
- What needs improvement
- Debt created vs resolved

Under Memory V2, retrospectives are also stored in `memory.db` (`type='retro'`) and exported to `.brain/exports/memory.md`.

### sprints/sprint-NNN.md — Per-Sprint Logs
Current constant: `SPRINT_LOG_MAX_LINES = 500` (`src/core/constants.ts`; V1 value was 80). Contains task list, results, and summary for a single sprint. Kept in `sprints/` directory. Oldest files are archived to `archive/` when decay runs.

---

## Brain Cleanup Cycle (Decay)

The decay cycle runs automatically at the end of every sprint, triggered by `runSprint` after the retrospective phase.

### Trigger Condition
```typescript
// src/orchestra/sprint-phases.ts — runDecayPhase
runDecay(projectRoot, sprint.id);
```

Decay always runs at sprint end. If total DB entry count ≤ configured budget (config key `memory_budget`, default `5000`), it returns immediately with no changes. If `force: true` is passed, it runs regardless of budget.

### Decay Steps (Memory V2 DB-first)

```
Step 1 — MemoryStore.decay(currentSprintNum, decayAfterSprints)
         Soft-deletes non-exempt entries older than decayAfterSprints sprints
         (decay_exempt=false entries only; ADRs are always exempt)
Step 2 — Return DecayResult with before/after DB entry counts
```

> The V1 5-step file-based decay pipeline (remove patterns → remove debt rows
> → archive sprints → trim MEMORY.md sections → hard-truncate) is preserved in
> `src/orchestra/debt-manager.ts` but runs only when `memory.db` is absent
> (legacy fallback).

### `runDecay` Function Signature
```typescript
// src/orchestra/debt-manager.ts:542 (re-exported via src/orchestra/brain.ts)
export function runDecay(
  projectRoot: string,
  sprintId: string,
  opts?: RunDecayOptions
): DecayResult

// RunDecayOptions
interface RunDecayOptions {
  memoryBudget?: number;   // default: 900 (legacy fallback; use config memory_budget)
  decaySprints?: number;   // default: 8 (legacy fallback; use config decay_after_sprints)
  force?: boolean;
}
```

### `DecayResult` Type
```typescript
// src/core/sprint-types.ts
interface DecayResult {
  linesBefore: number;        // DB entry count before decay (Memory V2) or line count (V1)
  linesAfter: number;         // DB entry count after decay
  archivedSprints: string[];  // Sprint files moved to archive/ (V1 file path; empty under V2)
  removedDebtCount: number;   // Resolved debt rows removed (V1 file path; 0 under V2)
  removedPatternCount: number; // Resolved patterns removed (V1 file path; 0 under V2)
}
```

### DB-First Memory Entry Count
Under Memory V2 the legacy `countBrainLines(projectRoot)` helper (which counted `.brain/` markdown file lines) is **replaced** by DB-first entry counts. CLI commands (`doctor`, `cleanup`) use `MemoryStore.totalCount()` directly. See comments in `src/cli/commands/doctor.ts` and `src/cli/commands/cleanup.ts`.

---

## Memory Budget Summary

> All values below are current `src/core/constants.ts` values (marked
> `@deprecated` — canonical config keys are `memory_budget` and
> `decay_after_sprints`). V1 original values are shown in parentheses for
> reference.

| File / Store | Current Max | V1 Max | Decay Strategy |
|---|---|---|---|
| `MEMORY.md` / DB `type='memory'` | 1500 lines (200) | 200 | Remove entries older than 20 sprints (was 5); hard-truncate to 50 lines as last resort (V1 file path only) |
| `PATTERNS.md` / DB `type='pattern'` | 800 lines (80) | 80 | Remove `resolved: true` entries on budget exceeded; 25-sprint auto-expire (was 8) |
| ADRs (DB `type='adr'`) | Unlimited | Unlimited | Never decayed (`decay_exempt=true`) |
| `RETRO.md` / DB `type='retro'` | 400 lines (100) | 100 | Overwritten every sprint |
| `exports/debt.md` (generated) / DB `type='debt'` | Unlimited | Unlimited | Remove resolved rows on budget exceeded (`.brain/DEBT.md` removed Sprint 186) |
| `sprints/sprint-NNN.md` | 500 lines (80) | 80 | Archive oldest (keep last 2 active) |
| **Total `.brain/` budget** | **5000** (600) | **600** | `BRAIN_TOTAL_LINE_BUDGET` in `constants.ts`; canonical: `config.memory_budget` (default 5000) |

---

## MCP Resources for Memory

Memory is exposed as a readable MCP resource:

| Resource URI | Source | Description |
|---|---|---|
| `deckent://memory` | `memory.db` (`type='memory'`) | Current sprint learnings and patterns |

Accessible via Claude Code: use `deckent_memory_query` MCP tool or read resource directly. Resource registered in `src/mcp/resources/memory.ts`.

> Note: The V1 `deckent://memory/patterns` URI does not exist. All memory
> (including patterns) is served under `deckent://memory` from the DB.

---

## Blueprint Reference

- **§6 Memory Architecture (3-Tier)** — System design and tier definitions
- **§5 Agent System** — Brain's memory write responsibilities
- **§7 Sprint Lifecycle** — When decay runs in the sprint loop
- **§8 GO/NO-GO Protocol** — How evaluation results feed into memory
- **§16 Self-Test & Reporting** — `deckent doctor` brain entry count check
- **Memory V2 DB Schema** — [api-surface.md](../reference/api-surface.md)

---

*Last updated: Sprint 186 — deckent v1.0.0-beta.1 — Memory V2 DB-first architecture*
