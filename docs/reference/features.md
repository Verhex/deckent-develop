# Deckent Feature Reference

> Auto-generated from `.deckent/features-manifest.json`. Run `node scripts/sync-manifest.mjs` to regenerate.

This document lists all Deckent features categorized by their activity level. It serves both AI orchestrators (Claude Code, Codex, Gemini) and human developers as the single reference for feature status.

## Categories

| Category | Description |
|----------|-------------|
| **Active** | Core features used in every sprint cycle. High import count, central to the PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→CLEANUP lifecycle. |
| **Lightly Used** | Features that exist and work but are used infrequently — CLI-only commands, opt-in configurations, or rarely triggered paths. |
| **Dormant** | Implemented features that are not wired into the sprint lifecycle. They exist in source but have zero or minimal external imports. |
| **Dead** | Deprecated or superseded features kept as reference. Protected by ADRs or marked `@deprecated`. |

## Active Features

| Feature | Files | Description |
|---------|-------|-------------|
| sprint-controller | `sprint-controller.ts`, `sprint-phases.ts`, `sprint-lifecycle.ts` | Central orchestrator for 8-phase sprint lifecycle |
| task-builder | `task-builder.ts` | Worker prompt builder + DIRECTIVES parser |
| result-evaluator | `result-evaluator.ts` | GO/NO-GO/TECH_DEBT evaluation with rubric scoring |
| auditor | `auditor.ts` | 30s scan loop + 3-pipeline verification + authority enforcement |
| event-stream | `event-stream.ts` | ADR-035 structured event log (15 channel codes) |
| routing-engine-v2 | `routing-engine.ts`, `intent-classifier.ts`, `activation-engine.ts` | Intent-based task routing with confidence scoring |
| model-registry | `model-registry.ts`, `model-equivalence.ts`, `mode-presets.ts` | 13 models, 3 providers, tier-based routing |
| memory-v2 | `memory-store.ts`, `memory-query.ts`, `memory-normalize.ts`, `memory-export.ts` | SQLite FTS5 DB-first architecture |
| dependency-scheduler | `dependency-scheduler.ts` | Kahn's algorithm topological wave ordering |
| authority-enforcer | `authority-enforcer.ts` | ADR-037 RBAC runtime enforcement |

## Dormant Features

These features are implemented but not yet wired into the sprint lifecycle:

| Feature | Blocked By |
|---------|------------|
| heartbeat-daemon | No sprint-controller auto-wiring |
| shared-memory | No integration point in worker prompt or spawn |
| handoff-protocol | No integration point |
| multi-agent-pipeline | No sprint integration |
| human-checkpoint-cli | Opt-in config, rarely set |

## Dead Features

| Feature | Superseded By | ADR |
|---------|---------------|-----|
| decision-orchestrator-v1 | routing-engine-v2 | ADR-028 |
| parallel-pipeline-manager | dependency-scheduler | — |

## CLI & MCP Access

- **CLI:** `deckent features [--category <cat>] [--json] [--id <featureId>]`
- **MCP:** `deckent_feature_query` tool with `category` and `id` parameters
- **Script:** `node scripts/sync-manifest.mjs [--dry-run] [--json]`

## Regeneration

The manifest is automatically regenerated after each sprint in the RETRO phase (sprint-finalizer.ts Step 10d). Manual regeneration:

```bash
node scripts/sync-manifest.mjs
```
