---
name: deckent-closure
description: Decide Deckent outcome closure from production wiring, exact execution custody, real surfaces, and durable settlement evidence. Do not use mock-only or test-green results as completion.
---

# Deckent Closure

## Preconditions

Require the exact active outcome, accepted proof manifest, fresh `$deckent-authority-bootstrap`
snapshot, implementation settlement candidate, and production diff. Closure review grants no
signing, MASTER, ledger, commit, push, cleanup, or XVerify authority.

## Mandatory evidence chain

Verify all applicable links:

1. canonical producer → consumer → entrypoint/ingress → effective policy/config enablement;
2. exact outcome/task/operation/invocation/causation/attempt identities and immutable input;
3. attempt-private result, partial-result, timeout, log, IPC, acceptance, brain evaluation,
   finalizer, settlement, archive, restart/adoption, and recovery custody;
4. disk diff and durable effects/receipts attributed to the accepted attempt;
5. real compiled binary and actual CLI, TUI, Desktop, Dashboard, API, MCP, Autonomous, connector,
   extension, process, or worker boundary named by the manifest;
6. relevant Linux, macOS, Windows-native, WSL, accessibility, tenant isolation, security,
   idempotency/replay, cancellation, scale, performance, cost, HA, backup, and disaster-recovery
   claims, with honest unsupported/HOLD states;
7. one independent verification pass using fresh disk evidence.

Tests, typechecks, linters, mocks, fixtures, and CI are supporting evidence only. Name their scope
and result, but never replace a missing production link or real-surface observation with green
tests. Remote CI unavailability is advisory unless the exact proof manifest made it essential.

## Decision

Return only an evidence-backed `GO`, `HOLD`, `NO_GO`, or `ABORTED`, with contradictions and missing
links explicit. Worker or model self-report, optional coverage scoring, generated projection, and
force-finalize cannot override canonical custody or produce false success/death.

Use XVerify only when current policy and owner authority require it, always through a genuinely
different provider resolved by effective config. Unavailable cross-provider authority is HOLD, not
self-verification. Terminal disposition, signing, ledger/MASTER mutation, commit, and push remain
separate gates after GO.
