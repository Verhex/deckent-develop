# Memory V2 — Context Reduction Benchmark

This document assesses the **"96% context reduction"** claim made for Memory V2. Every number
below is measured from the actual repository state at **sprint-249 (2026-06-09)** and is
reproducible with the commands in [How to Reproduce](#how-to-reproduce). Where a figure cannot
be reproduced from this checkout, it is explicitly labelled as such rather than asserted.

---

## What Memory V2 Does

Memory V2 is **DB-first**: all brain knowledge (ADRs, learnings, sprint records, retros,
patterns, debt, identity) lives in a single SQLite database, `.brain/memory.db`
(`src/core/memory-store.ts` — "SQLite DB layer for Memory V2", FTS5 full-text search).

Markdown files under `.brain/exports/` are **generated snapshots** of that DB
(`src/core/memory-export.ts` — four export functions: `exportSummaryMd`, `exportDecisionsMd`,
`exportMemoryMd`, `exportDebtMd`). They exist for git review, not for model context.

The context-reduction lever is the split between **what is generated** and **what is loaded**:

- **Generated for git review:** `decisions.md`, `memory.md`, `debt.md`, `summary.md`.
- **Loaded into model context** (`@`-referenced in `CLAUDE.md` and `DECKENT.md`): **only
  `summary.md`** — a compact digest (ADR index + recent learnings + active debt + patterns).
  The three large exports are never `@`-referenced.

Targeted retrieval (`deckent recall "<query>"`) reads relevant rows from the DB on demand
instead of loading the whole corpus.

---

## Method

**Baseline (denominator):** the full set of generated markdown exports — i.e. the knowledge a
flat-file ("load everything") setup would place into context.

**V2 context load (numerator):** the bytes Memory V2 actually loads into context — only
`summary.md`.

`reduction = (baseline − loaded) / baseline`

All sizes are byte counts (`wc -c`); the corpus is ASCII/UTF-8 markdown, so bytes ≈ characters.

---

## Measured State (sprint-249, 2026-06-09)

| Generated export | Bytes | Loaded into context? |
|------------------|------:|:--------------------:|
| `exports/decisions.md` | 506,301 | No — git review only |
| `exports/memory.md` | 65,723 | No — git review only |
| `exports/debt.md` | 818 | No — git review only |
| `exports/summary.md` | 8,430 | **Yes** (`@`-referenced) |
| **Total generated** | **581,272** | |

Database (`.brain/memory.db`): **3.33 MB**, **284 live entries** — 107 memory, 75 ADR, 48 chat,
20 sprint, 20 retro, 8 pattern, 5 debt, 1 identity.

---

## Result

**Primary measurement — full generated corpus vs loaded context file:**

```
reduction = (581,272 − 8,430) / 581,272 = 98.55%
```

**Conservative single-file framing — vs `decisions.md` alone** (the dominant export):

```
reduction = (506,301 − 8,430) / 506,301 = 98.33%
```

Both reproducible measurements land at **≈98.3–98.6%**.

---

## Honest Qualification of the 96% Claim

- **The claim is conservative and supported.** The reproducible measurements (98.3–98.6%)
  *exceed* 96%, so the headline number understates the actual reduction rather than inflating it.
- **96% is not the exact output of any single measurement here.** It is a round, conservative
  figure; the directly-derivable numbers from this checkout are ≈98.5%. Treat 96% as a safe
  floor, not a precise reading.
- **The legacy V1 ("flat-file, load everything") baseline cannot be reproduced in this
  checkout.** There is no `.brain/archive/pre-v2/` directory here, so any historical
  V1→V2 figure (the migration-era comparison) is **not verifiable from this repository** and is
  deliberately excluded from the measured result above.
- **The "vs raw DB" angle is excluded from the headline.** Comparing `summary.md` (8,430 B)
  against the 3.33 MB `.brain/memory.db` yields 99.76%, but that is not apples-to-apples: the DB
  is binary and includes the FTS5 index and history table, none of which a flat-file setup would
  paste into context. It is noted only for completeness.
- **`summary.md` exceeds its own design target.** `exportSummaryMd` targets `< 5000 chars`
  (`src/core/memory-export.ts`), but the live file is 8,430 B because the ADR index now holds 75
  one-line rows. The reduction still holds — and improves over time — because the denominator
  (full exports) grows much faster than the digest as the project accumulates knowledge.

**Verdict:** Under the stated assumptions (baseline = all generated exports; loaded = only the
`@`-referenced `summary.md`), Memory V2 reduces loaded memory context by **≈98.5%** at
sprint-249. The advertised **96%** is a conservative, defensible floor — directionally correct
and below the actual reproducible figure, not above it.

---

## How to Reproduce

```bash
# Loaded context file (numerator)
wc -c .brain/exports/summary.md

# Full generated corpus (denominator)
wc -c .brain/exports/*.md

# DB size + live entry count by type
ls -la .brain/memory.db
node -e "
  const Database = require('better-sqlite3');
  const db = new Database('.brain/memory.db', { readonly: true });
  console.log('total', db.prepare('SELECT COUNT(*) c FROM entries WHERE deleted_at IS NULL').get().c);
  for (const r of db.prepare('SELECT type, COUNT(*) c FROM entries WHERE deleted_at IS NULL GROUP BY type ORDER BY c DESC').all())
    console.log(' ', r.type, r.c);
  db.close();
"
```

Numbers will drift as the DB grows; the reduction percentage increases with it, because the
full exports expand while only the compact `summary.md` is loaded.

---

## Database Details

- **Path:** `.brain/memory.db` (SQLite 3, gitignored — rebuilt from exports)
- **Schema:** 5 tables (`entries`, `tags`, `relations`, `entry_history`, `schema_version`) + an
  `entries_fts` FTS5 virtual table
- **Search:** dual-layer FTS5 (original + `turkishNormalize()`) for TR/EN/DE high-recall retrieval
- **Lifecycle:** soft-delete + decay; `summary.md` regenerated each sprint end

See [`../architecture/memory-system.md`](../architecture/memory-system.md) for the full
architecture.

---

*Measured from `.brain/exports/` and `.brain/memory.db` at sprint-249 (2026-06-09). Figures
recompute via the commands above; they are not hard-coded snapshots of a fixed sprint.*
