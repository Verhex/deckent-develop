# Recipe 07: Tech Debt Tracking

Deckent tracks technical debt automatically through the sprint lifecycle. When a worker's output is acceptable but imperfect, Brain records a debt entry in Memory V2. This recipe shows how to read, search, and manage that debt.

## How Debt Enters the System

When Brain evaluates a task result as `GO_WITH_TECH_DEBT`, the task is marked DONE and a debt entry is written to `.brain/memory.db` (`type=debt`, `status=active`). The entry contains the originating task ID, sprint, and the worker's notes.

Workers may also self-flag: a worker that writes `selfAssessment: "GO_WITH_TECH_DEBT"` in its `.result` file causes Brain to open a debt entry during evaluation.

## View Open Debt

```bash
# Report debt status — open vs. resolved counts from memory.db
deckent archive-debt
```

This command reads the Memory V2 SQLite DB and prints a summary of open and resolved debt items. Example output:

```
Tech debt (memory.db): 3 open, 12 resolved.

Open items:
  debt-285-003  [normal]  Tech debt from 285-003: retry limit reached ...
  debt-284-007  [high]    Tech debt from 284-007: coverage below threshold ...
  debt-281-001  [normal]  Tech debt from 281-001: edge case unhandled ...

Resolved debt is retained in memory.db and pruned by sprint decay — no manual archive needed.
```

## Search Debt by Keyword

```bash
# Full-text search — returns ADR, debt, memory, and pattern entries
deckent recall "auth token" --type debt

# Limit results
deckent recall "coverage" --type debt --limit 10
```

`recall` uses FTS5 with dual-layer Turkish normalization. Pass `--type debt` to restrict results to debt entries only.

## Exported Debt Snapshot

Brain auto-exports a Markdown snapshot after each sprint:

```
.brain/exports/debt.md
```

This file is git-tracked and readable without the DB. It shows all open and recently resolved items. To regenerate it from the current DB state:

```bash
deckent memory export
```

## Debt Escalation

Debt that is not resolved escalates automatically each sprint:

| Sprints Open | Priority |
|-------------|----------|
| 0–2         | normal   |
| ≥ 3         | high     |
| ≥ 5         | critical |

The `escalateDebt()` function in `src/orchestra/debt-manager.ts` increments `sprintsOpen` in the DB entry's metadata on every sprint pass. Critical items appear prominently in `deckent status` output.

## Resolving Debt

Debt is resolved by Brain when a subsequent sprint task fixes the underlying issue and evaluates as DONE. There is no manual resolve command — Brain's evaluation loop (`handleEvaluation`) calls `resolveDebt()` automatically when the fix task is marked DONE.

Resolved debt is retained in `memory.db` with `status=resolved` and is excluded from the active debt table. Sprint decay prunes resolved entries after `decay_after_sprints` (default 20) sprints.

## Decay and Cleanup

Memory V2 handles debt decay automatically. To manually force a decay pass during cleanup:

```bash
deckent cleanup --decay
```

This trims old resolved entries, patterns, and sprint logs while keeping ADRs and identity entries exempt from decay.

## See Also

- `deckent archive-debt` — view open/resolved counts from memory.db
- `deckent recall "<query>" --type debt` — full-text search over debt entries
- `deckent memory export` — regenerate `.brain/exports/debt.md`
- `deckent memory stats` — DB entry counts by type
- `.brain/exports/debt.md` — git-tracked snapshot for review
