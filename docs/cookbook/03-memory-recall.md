# Project Memory Recipes

This section provides short, copy-pasteable recipes for interacting with Deckent's project memory system.

## Memory V2: DB-First Architecture

Deckent's Memory V2 is a DB-first system, utilizing SQLite with FTS5 for full-text search. Markdown files in `.brain/exports/` are generated exports, serving as human-readable snapshots of the memory database.

## Recalling Information

To search and retrieve information from the project memory:

```bash
deckent recall "<query>"
```

Replace `"<query>"` with your search terms.

## Remembering Notes

To add a new note or learning to the project memory:

```bash
deckent remember "<note>"
```

Replace `"<note>"` with the information you want Deckent to remember.

## Managing Memory Exports

To manage the memory database and its exports:

```bash
deckent memory rebuild
deckent memory export
deckent memory stats
```

- `rebuild`: Reconstructs the memory database from source.
- `export`: Generates or updates the markdown export files (`.brain/exports/`).
- `stats`: Displays statistics about the memory database.
