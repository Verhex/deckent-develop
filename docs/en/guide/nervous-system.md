# Nervous System

## Product-user perspective

The Nervous System is a proactive observer/detector/proposal/action subsystem. It watches runtime and repository signals, groups findings, and exposes human-governed suggestions. It does not grant itself authority over locked actions. [Evidence: `src/nervous/observer.ts:1-49,84-180`; `src/nervous/executor.ts`; `src/core/config.ts:1736-1782`]

## Signals and detectors

The observer merges event bus, filesystem, cron, and sprint-lifecycle sources. It watches `.tasks`, `.brain`, `DIRECTIVES.md`, and `.deckent`, while filtering its own high-churn output to prevent feedback loops. [Evidence: `src/nervous/observer.ts:1-81`]

The registry implements 12 detectors:

1. stale worker
2. scope collision
3. debt trend
4. agent routing health
5. directives protection
6. task-mode idle
7. build-failure recurrence
8. token spike
9. agent-routing anomaly
10. scope-collision rate
11. notification-delivery health
12. dead event stream

Each detector is enabled independently; one detector failure is logged without aborting the rest. [Evidence: `src/nervous/detector-registry.ts:1-22,24-75,99-190`]

In normal sprint behavior, detection dispatch is EXECUTE-only and debounced by 500 ms. An explicit `activeInAnyPhase` construction option exists for autonomous contexts, but the feature manifest says current autonomous start does not drive the observer. [Evidence: `src/nervous/observer.ts:110-160,217-260`; manifest `autonomous-runtime` and `nervous-system`]

## Configuration and safety floor

The fresh default has `nervous_system.enabled=false`, balanced mode, no bypass, and locked actions covering live sprint kill, manual deletion, cost threshold, destructive git, and accepted ADR deprecation. Notification defaults enable MCP/CLI/file but disable Desktop. [Evidence: `src/core/config.ts:1736-1782`]

Five detectors are enabled inside the default block, but the system-level enabled flag is false. Six later detectors and dead-event-stream are default-off. A consumer must evaluate both the parent flag and detector flag; reading only child defaults is misleading. [Evidence: same source lines]

## Operator surface

The CLI provides dashboard, enable, accept, reject, edit, undo, history, recommendations, log, panic acceptance, and baseline refresh. The `config nervous` family manages authority presets and per-action overrides. [Evidence: `src/cli/commands/nervous.ts:712-839`; `src/cli/commands/config-nervous.ts`; real help audit]

A real read-only `nervous history --limit 1` returned one rejected `SCOPE_COLLISION_REORDER` record. This proves persisted history, not current automatic observer execution. [Evidence: real output, 2026-08-01]

## Dogfood / repository reality

The feature manifest classifies Nervous as dormant because the observer is not imported by the sprint controller and activation is CLI-driven. That classification takes precedence over archive prose claiming always-on behavior. [Evidence: `.deckent/settings/features-manifest.json` `nervous-system`; source import scan]

| Layer | State | Constraint |
|---|---|---|
| Observer | ✅ implemented | production driver not universal |
| Detector registry | ✅ implemented | parent disabled by default; phase-gated |
| CLI governance | ✅ live surface | state-changing actions not run in audit |
| Persisted history | ✅ observed | one rejected record read |
| Autonomous reactive flow | ⚠️ partial | attach-only per manifest |
| Always-on meta-orchestration | 🔜 roadmap | not supported by current wiring proof |

Never treat a suggestion as permission. Locked/destructive actions still require owner/system authority and applicable approval gates. [Evidence: `AGENTS.md:69-108`; `src/core/config.ts:1741-1751`]
