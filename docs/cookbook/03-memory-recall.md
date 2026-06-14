# Project Memory Cookbook

Short, copy-pasteable recipes for interacting with Deckent's project memory system.

## Memory V2: DB-First Architecture

Deckent's Memory V2 stores all knowledge in a SQLite database (`.brain/memory.db`) with FTS5 full-text search. The Markdown files in `.brain/exports/` are generated snapshots — useful for `git diff` and human review, but the database is the source of truth.

Memory holds five entry types: `adr` (architecture decisions), `memory` (sprint learnings), `sprint` (sprint logs), `debt` (tech debt), and `pattern` (violation patterns).

## Searching Memory

Search across all entry types:

```bash
deckent recall "docker heartbeat"
```

Example output:

```
  3 result(s) for "docker heartbeat":

  1. [adr] ADR-027: Hybrid Spawn Backend (sprint-123)
     ...atomic heartbeat writes via fsync handler...

  2. [memory] Sprint sprint-139 Learnings (sprint-139)
     ...Docker HB Core Fix — atomicWriteFileSync + SIGTERM fsync...

  3. [pattern] stale_heartbeat
     ...worker failed to update .hb within 2-minute window...
```

### Filter by Entry Type

```bash
# Only ADRs
deckent recall "scope enforcement" --type adr

# Multiple types
deckent recall "provider routing" --type adr,memory

# Only sprint learnings
deckent recall "wave execution" --type memory
```

Valid types: `adr`, `memory`, `sprint`, `debt`, `pattern`, `retro`.

### Limit Results

```bash
# Show up to 10 results (default is 5)
deckent recall "dependency wave" --limit 10
```

### Filter by Sprint Range

```bash
# Only results from sprint 200 onward
deckent recall "autonomous" --sprint-min 200
```

### Change Token Match Mode

```bash
# All search terms must match (narrower)
deckent recall "docker timeout" --mode and

# Any term matches (default, broader)
deckent recall "docker timeout" --mode or
```

## Storing Notes

Add a note to project memory:

```bash
deckent remember "Always run deckent doctor before starting a new sprint on a fresh machine."
```

Example output:

```
  Stored: [memory] Always run deckent doctor before starting a new sprint on a ...
```

### Store with Tags

```bash
deckent remember "The Wave 1 timeout is 30 minutes per task." --tags "waves,timeouts"
```

### Store with a Custom Title

```bash
deckent remember "Wave execution stops if any task in the wave reaches NO_GO." \
  --title "Wave NO_GO propagation rule"
```

### Store as a Different Entry Type

```bash
deckent remember "Auditor scope checks are advisory in V1.0 — hard-flip planned post-GA." \
  --type debt --tags "rbac,v2"
```

## Managing Memory Exports

The exports directory (`.brain/exports/`) holds Markdown snapshots of the database. These are git-tracked so teammates can review memory changes in PRs.

```bash
# Export database → .brain/exports/*.md (summary, decisions, memory, debt)
deckent memory export

# Show database statistics
deckent memory stats
```

Example `deckent memory stats` output:

```
  Memory V2 Statistics:
    adr: 89
    memory: 47
    sprint: 31
    debt: 0
    pattern: 30
    retro: 12
    ────────────
    Total: 209
    Schema: v1
```

### Rebuild the Database

If `.brain/memory.db` is lost or corrupted, rebuild it from the committed export files:

```bash
# Delete the broken database first
rm .brain/memory.db

# Rebuild from .brain/exports/*.md and docs/adr/*.md
deckent memory rebuild
```

### Backup the Database

Create a timestamped backup before destructive operations:

```bash
deckent memory backup
# Creates .brain/memory.db.bak-<sprintId>-<timestamp>

# Specify a custom output path
deckent memory backup --output /tmp/memory-snapshot.db
```

## Practical Patterns

### Before Starting a Sprint

Query recent learnings and open debt:

```bash
deckent recall "$(cat DIRECTIVES.md | head -5)" --type memory --limit 3
deckent recall "debt" --type debt --limit 5
```

### After Completing a Sprint

Export snapshots to keep git history current:

```bash
deckent memory export
git add .brain/exports/
git commit -m "chore: memory export after sprint-NNN"
```

### Find a Specific ADR

```bash
deckent recall "scope guard RBAC" --type adr --limit 3
```

### Check for Known Patterns

```bash
deckent recall "stale_heartbeat" --type pattern
```
