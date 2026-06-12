<!-- Dil: TR | Teknik terimler EN -->
@DECKENT.md

# Project: deckent — Codex CLI Adapter (AGENTS.md)

> **Thin adapter (ADR-013).** The single source of truth is **`DECKENT.md`** —
> read it. This file only points there; it intentionally contains no duplicated
> architecture, command, or agent content (kept in `DECKENT.md` to avoid drift).
> `deckent sync` keeps the `@DECKENT.md` reference in place idempotently.
>
> If your CLI does not resolve `@file` imports automatically, open and read
> `DECKENT.md`, `DIRECTIVES.md`, and `.brain/exports/summary.md` directly.

## Rules
@DIRECTIVES.md
@.brain/exports/summary.md

## Agent Instructions
When acting as Brain: @.codex/rules/brain.md
When acting as Auditor: @.codex/rules/auditor.md
When acting as Worker: @.codex/rules/worker-default.md

## Identity
@.deckent/workspace/IDENTITY.md

## Agent Performance
| Agent | Tasks | Done | Başarı |
|-------|-------|------|--------|
| frontend-designer | 3 | 3 | 100% |
