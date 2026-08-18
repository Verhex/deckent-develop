# Nervous System

## Approvals and Nervous are one product capability

The product promise is simple: **Deckent works autonomously, notices when human attention is
needed, and cannot cross a critical boundary until an authorized person decides.** Users should
not have to operate two separate systems called "Nervous" and "Approvals."

Nervous is the attention layer: it observes runs and project signals, detects a risk or an
opportunity, explains what needs attention, and proposes an action. Approvals is the consent
layer: it pauses the exact critical action, shows the decision to an authorized person, and
records allow or deny. After an allow, the executor performs only the approved action; settlement
records what actually happened. A proposal is never permission, and an approval is never proof
that the action succeeded.

### What works today

- The runtime approval core is live. Durable requests and decisions, authenticated terminal
  decisions, expiry, worker risk gates, and exact attended-execution claims have production
  consumers.
- Nervous has observers, detectors, proposals, CLI controls, and persisted history, but its
  observer is not universally driven by every run and it is disabled by default. Legacy normal
  and panic paths are not yet one authority.
- Signed receipts provide a tamper-evident audit foundation for selected governance workflows.
  They are not yet a signature on every runtime approval and must not be sold as such.

### Target experience

1. Deckent observes a condition and explains why attention is needed.
2. One attention inbox shows the proposed action, risk, scope, cost, expiry, and likely impact.
3. An authorized person allows or denies the exact action once.
4. Deckent executes only that approved action, or fails closed if authority is missing or stale.
5. The same item reports the real outcome: applied, failed, expired, cancelled, or compensated.

Terminal, Desktop, API, connectors, and CLI will consume the same request, decision, and outcome
state. MCP remains a safe read/notification surface and cannot let an agent approve itself.
Cryptographic signatures belong behind this experience as the tamper-evident audit layer, not as
a second ceremony ordinary users must understand.

Customer-facing summary:

> Deckent works on its own, but only an authorized human can let it cross critical boundaries,
> and every critical decision and outcome can be proven later.

This unified experience is the approved direction, not a completion claim. The existing open
work remains the production wiring from every Nervous proposal through one ApprovalBroker and on
to truthful effect settlement.

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
