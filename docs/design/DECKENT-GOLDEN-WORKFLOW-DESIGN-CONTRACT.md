# Deckent Golden Workflow — Cross-Surface Experience Contract

Status: foundational workflow retained; its initial shell/art-direction exploration was rejected by
owner review as too narrow and too simple. The current Desktop product authority is
[`DECKENT-DESKTOP-OPERATING-MODEL.md`](./DECKENT-DESKTOP-OPERATING-MODEL.md).

Date: 2026-08-25

Surfaces: Desktop and Terminal primary control/operator surfaces; Dashboard observability only

## 1. Outcome

Deckent must let a person move from intent to verified outcome without losing causality, control
or context:

    connect → converse → attach context → inspect plan → authorize → execute
    → intervene → verify → settle → resume from either primary surface

Desktop and Terminal adapt this workflow to their medium. They share authoritative objects,
lifecycle, permissions, evidence and action consequences. They do not need pixel parity.

This document defines the design target. It does not claim that the current protocol and runtime
already provide every transition.

## 2. Repository truth at the design boundary

Current evidence:

- Desktop is an Electron daemon client using REST, SSE and terminal WebSocket surfaces.
- Desktop currently contains Classic and NOVA shells with different information architectures.
- Classic Desktop exposes Console, History, Runs, Approval, Chat, Terminal and Changes routes.
- Desktop conversation history still includes renderer-local persistence and is not the canonical
  cross-surface conversation authority.
- Terminal exposes conversation, plan preview, runtime approval and run-inbox cards inside one Ink
  transcript, with explicit stdin ownership.
- Terminal runtime composition remains substantially in-process rather than using the same
  versioned client boundary as Desktop.
- The current run-flow lifecycle includes PROPOSAL_READY, PREVIEWING, AWAITING_APPROVAL, APPROVED,
  STARTING, DETACHED_RUNNING, COMPLETED, FAILED, CANCELLED and BLOCKED.
- Dashboard remains an observe-only projection and must not gain execution authority.

Consequences:

- Classic and NOVA cannot be polished as two permanent products.
- A screenshot cannot prove Desktop/Terminal handoff.
- Conversation, run, approval, evidence and settlement identity must come from canonical services.
- M1 runtime boundary and M2 protocol/shared-state gaps remain explicit production dependencies.

## 3. Users and jobs

### Guided solo user

Job: express an outcome naturally, understand the proposed work, authorize risk and know whether
the result is trustworthy.

Needs:

- one obvious command/conversation entrance;
- plain-language plan and consequence preview;
- visible progress without orchestration vocabulary overload;
- recovery actions that explain what will happen;
- the ability to reveal expert evidence when needed.

### Expert operator

Job: supervise multiple concurrent runs, identify divergence quickly, intervene at the correct
boundary and inspect evidence without losing the command context.

Needs:

- high-density run and worker state;
- keyboard-first navigation;
- stable causal timeline;
- fast transitions between command, live execution, changes, logs and evidence;
- explicit freshness and scope.

### Enterprise reviewer

Job: determine who authorized what, under which policy, against which environment, with what cost
and verification evidence.

Needs:

- principal, tenant, project and environment scope;
- policy and approval explanation;
- immutable evidence links;
- reliable filtering and durable deep links;
- unknown and unavailable states that fail closed.

The product model is shared. Progressive disclosure changes density and available shortcuts, not
authority or truth.

## 4. Authoritative object chain

The primary chain is:

    Goal → Mission → Flow → Run → WorkItem → Attempt → Operation

The interface may summarize lower levels, but it must preserve:

- stable identifier and revision;
- initiating principal and surface;
- provider, agent or worker attribution;
- policy and approval scope;
- input/context digest;
- current lifecycle and freshness;
- side effects and affected resources;
- cost, usage and limits when authoritative;
- evidence and verifier status;
- recovery and next safe action.

Conversation is the causal narrative around this chain. It is not a competing execution store.

## 5. Golden Workflow

| Stage | User decision | Canonical truth | Desktop expression | Terminal expression | Current closure gap |
|---|---|---|---|---|---|
| Connect | Which provider/connection/profile can act? | Connection ID, health, authority evidence | Connection workspace with health and scope | Palette-guided connection flow | Unified user-facing connection aggregate is partial |
| Converse | What outcome do I want? | Persisted conversation and principal | Conversation canvas | Transcript and pinned input | Desktop transcript authority is not canonical |
| Context | What may the run read or change? | Versioned context refs, scope and digest | Context/evidence drawer | At-reference picker and context summary | Shared digest/access projection requires protocol closure |
| Propose | Is this the right interpretation? | Flow ID, plan revision and digest | Plan embedded in causal workspace | Plan preview card | Existing surfaces expose plan differently |
| Gate | Is the scope valid and policy satisfied? | Scope gate and policy decision | Findings adjacent to affected plan step | Compact gate lines with detail expansion | Same versioned error/evidence contract required |
| Authorize | Do I approve this exact consequence? | Approval request, principal, scope, expiry and receipt | Bounded approval sheet or inspector | Keyboard-first approval card | Remote/critical authority differs by channel |
| Start | Start this exact approved revision? | Idempotency key and run handle | Explicit start from approved plan | Explicit start/full-ahead action | Same cross-process start proof required |
| Observe | Is execution healthy and fresh? | Run read model, event cursor, heartbeat, logs | Run workspace with timeline and inspector | Stable status anchor, tree and live log | Reconnect/replay parity incomplete |
| Intervene | Should I guide, pause, cancel or retry? | Typed application command and resulting revision | Contextual action with consequence preview | Scoped keyboard command and confirmation | Pause/resume/cancel semantics need shared protocol |
| Verify | Is the outcome supported by evidence? | Provider-separated verdict, evidence and usage | Evidence inspector tied to result | Result block with expandable evidence | Durable cross-provider closure must remain explicit |
| Settle | What actually changed and remains? | Result, changes, receipts, debt and final outcome | Result in conversation plus inspector | Final transcript block plus inspect command | Surface readback parity incomplete |
| Resume | Can I continue from another process/surface? | Checkpoint, conversation ID and logical run ID | Resume in same workspace | Resume picker/command | Cross-process resume is not fully supported |

## 6. Multi-axis state model

A single badge cannot carry all state. Every critical object resolves these axes independently:

| Axis | Values the design must distinguish |
|---|---|
| Lifecycle | proposed, previewing, awaiting approval, approved, starting, running, terminal |
| Freshness | live, delayed, stale, disconnected, unknown |
| Authority | allowed, approval required, denied, expired, unavailable |
| Evidence | pending, partial, verified, contradicted, unavailable |
| Outcome | completed, failed, cancelled, blocked, superseded, partial |

Rules:

- Unknown is not failed, and neither is allowed.
- Stale is never rendered as live merely because the last status was running.
- Completed execution is not the same as verified outcome.
- Cancelled states disclose partial side effects.
- A blocked state names the exact missing authority or dependency and the next safe action.
- Color is always paired with text, icon geometry or structural position.

## 7. Shared causal anatomy

Every direction must preserve the same five regions, even if their layout differs:

1. Intent: conversation/command and current goal.
2. Plan: revisioned proposed work, scope and policy findings.
3. Execution: run, workers, operations, heartbeat and freshness.
4. Evidence: changes, logs, verification, cost and receipts.
5. Control: approvals, intervention and recovery.

The selected run remains the context anchor across all regions. Navigation cannot silently switch
project, tenant, environment or logical run.

## 8. Desktop adaptation

Desktop provides spatial memory and simultaneous inspection:

- one product shell and route authority;
- command/conversation as the persistent causal entrance;
- a selected-run workspace rather than separate unrelated pages;
- contextual panes for plan, workers, changes, terminal, logs and evidence;
- a durable scope bar for project, environment, connection and freshness;
- keyboard and visible-action parity;
- versioned saved layouts with reliable focus restoration.

The current left rail decision may remain, but its nouns and grouping must follow the accepted
direction. NOVA may survive only as an optional visualization preset inside the same product
model, never as a second shell.

## 9. Terminal adaptation

Terminal provides continuity, automation compatibility and keyboard speed:

- transcript and completed events remain in native scrollback;
- current state and input stay stable at the bottom;
- plan, approval and inbox cards share explicit stdin ownership;
- expert detail expands without destroying the readable transcript;
- redirected and machine-readable modes never emit cursor control or decoration;
- NO_COLOR, ANSI-16, narrow width and reconnect states preserve meaning;
- every action names its target run and consequence.

Terminal is not a miniature pane layout. Its equivalent of a Desktop inspector is a stable,
expandable detail block and a focused command route.

## 10. Progressive complexity

The experience has three simultaneous levels:

| Level | Default visibility | Never hidden |
|---|---|---|
| Guided | Goal, plan summary, current state, primary approval/recovery action | Scope, risk, consequence, failure and evidence verdict |
| Operator | Worker topology, live operations, changes, logs, cost and freshness | Attribution and action target |
| Forensic | Raw events, revisions, receipts, policy trace and evidence records | Integrity or availability gaps |

Users can move between levels without changing the underlying run or losing focus.

## 11. Critical scenarios every direction must render

1. Ready: connected, no active run, valid next action.
2. Plan review: scope gate passed with a revisioned plan.
3. Approval: elevated mutation with exact scope, expiry and consequence.
4. Active: multiple workers, one delayed heartbeat and current file operations.
5. Stale/reconnect: last known running state with cursor/replay recovery.
6. Failure: partial side effect, verified reason and safe retry boundary.
7. Complete/unverified: execution ended but verifier evidence is pending.
8. Complete/verified: final result, changes, cost and evidence receipt.
9. Permission denied: policy source and remediation.
10. Cross-surface resume: same conversation and logical run on the other primary surface.

## 12. Direction evaluation

All candidate directions use the same content and scenarios. Evaluate them on:

- causal clarity;
- operator scan speed;
- progressive complexity;
- approval and recovery safety;
- Desktop/Terminal semantic parity;
- accessibility and localization;
- large-scale worker/run handling;
- implementation feasibility on current Electron/Ink foundations;
- resistance to generic AI-product styling;
- long-session fatigue.

Changing only palette, radius or glow is not a separate direction.

## 13. Production readiness boundary

The design can be prototyped before M1/M2 completion, but it cannot be labeled production-complete
until:

- Desktop and Terminal consume the canonical application-service/protocol boundary;
- conversation and logical-run identity survive cross-process handoff;
- reconnect replays from an authoritative cursor;
- approval and intervention commands share typed authority;
- persisted result/evidence reads back identically;
- real Desktop and Terminal binaries prove the Golden Workflow.

Any prototype uses representative data and must be labeled as design evidence, not live product
evidence.
