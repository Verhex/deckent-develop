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

## Lightly Used Features

Wired-live but opt-in: each autonomous/enterprise capability below ships **default-off** behind the listed config flag (recurring cadence, work-generator, capability dispatch and RBAC enforcement additionally require `autonomous.enabled: true`, which defaults to `false`).

| Feature | Files | Description |
|---------|-------|-------------|
| recurring-backlog | `runtime-loop.ts`, `backlog.ts` | Recurring backlog entries re-fire on their cron cadence — `applyRecurringReenqueue` flips due `done` recurring entries back to `pending` on every backlog load. Default-off: `autonomous.enabled: false`. |
| work-generator | `work-generator-source.ts`, `backlog.ts` | Self-generated work: active tech-debt records become backlog candidates (deduped by id, enqueued, dispatched at the lowest trigger priority — after backlog/scheduled/reactive). Default-off: `autonomous.work_generator.enabled: false` (scan throttle `interval_ms: 600000`). |
| capability-dispatch | `execute-dispatcher.ts`, `capability-runtime.ts` | F8 broker dispatch: `kind=capability` backlog entries resolve through `CapabilityRegistry.invoke`; every invocation lands on the ENT-3 audit hash-chain as `capability.success` / `capability.error` (`createAuditedCapabilityRegistry`); allowlist-gated handlers DENY by default. Default-off: `autonomous.enabled: false`. |
| autonomous-rbac-enforcement | `runtime-loop.ts`, `policy-engine.ts` | RBAC enforcement on machine-initiated dispatch: every entry-carrying trigger is gated through `evaluatePolicy` — a role without `execute` permission (default `viewer`) hard-denies the cycle (`denied`). First enforced slice of ADR-037 (advisory → enforced). Default-off: `autonomous.rbac_policy.enabled: false` (role default `viewer`). |
| audit-compliance-siem | `audit.ts` (CLI), `compliance-report.ts`, `siem-forwarder.ts` | Read-side consumers over the live ENT-3 audit chain: `deckent audit compliance --sprint <id>` (chain-integrity + rbac/tenant controls; broken chain → exit 1) and `deckent audit forward --sprint <id> --out <path>` (NDJSON file export; HTTP/syslog transports = roadmap). Commands are always available; the `rbacEnforcement` control reflects the default-off `autonomous.rbac_policy.enabled` flag. |

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
