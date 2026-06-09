# Cookbook: First Sprint

Run this recipe from a project root to complete your first Deckent sprint. It follows the standard workflow: initialize Deckent, write a small `DIRECTIVES.md`, plan the sprint, start workers, check status, review the result, and read the retrospective.

## 1. Initialize

Run this once from the project root:

```bash
deckent init
```

This creates the Deckent workspace files, including `.deckent/`, `.brain/`, `.tasks/`, `DECKENT.md`, and `DIRECTIVES.md`.

## 2. Write DIRECTIVES

Replace `DIRECTIVES.md` with one small documentation task:

```markdown
# DIRECTIVES - Sprint 001: First Sprint

## Goal
Make one safe, reviewable improvement.

---

## Task 1: Update project notes
- Agent: doc-writer
- Skills: documentation-writer
- Model: sonnet
- Effort: low
- Files: docs/notes.md
- Scope: docs/

### Description
Create or update docs/notes.md with a short project note.

**Kanit:** docs/notes.md exists.
**Test:** No automated test required.
```

Keep the first sprint small. One documentation task is enough to verify the workflow before you add code changes.

## 3. Plan

Generate task files from `DIRECTIVES.md`:

```bash
deckent plan
```

Review the planned tasks before starting.

## 4. Start

Launch the workers:

```bash
deckent start
```

Deckent runs the sprint lifecycle in the background.

## 5. Check Status

Inspect progress:

```bash
deckent status
```

For a live view, use:

```bash
deckent status --watch
```

## 6. Review

Evaluate the sprint outcome:

```bash
deckent review
```

The review reports `GO`, `NO_GO`, or `GO_WITH_TECH_DEBT`.

## 7. Read the Retro

Read the retrospective and learnings:

```bash
deckent retro
```

Use the retro output to decide what to put in the next `DIRECTIVES.md`.
