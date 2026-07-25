# Xverify Exact Continuation — Owner Decision Proposal

Status: owner decision required; implementation has not started.

Date: 2026-07-25
Decision owner: Alperen
Altitude: design

## Decision boundary

M4-075 proved that a mandatory exact xverify attempt which reaches `LANDED`
cannot safely use the generic continuation runner. The generic runner creates a
new provider call from the checkpoint, but it does not create a fresh auditor
InvocationReceipt, provider-limit reservation, exact attempt contract or
termination-ledger binding for that call.

The current containment is intentionally fail-closed:

- the parent attempt remains immutable `landed/consumed` in the existing D3
  `ExecutionTerminationLedger`;
- no semantic verdict is emitted;
- no reservation is released;
- no fallback, retry or generic continuation is opened;
- restart returns the same reconciliation result.

Concrete violation: reuse the parent receipt and reservation for a child
provider call, then aggregate the child's usage under the already terminal
parent attempt. That makes two charge-bearing calls look like one dispatch and
breaks exactly-once settlement.

This blocks the generic continuation approach, not the non-Desktop readiness
Goal. The smallest safe counterproposal is one fresh, parent-linked exact
invocation for the remaining checkpoint work.

## Proposed decision E — Fresh exact child invocation

Approve the following contract for an exact xverify continuation.

### E1 — One fresh authority tuple per provider call

Every continuation call receives new immutable values:

- `invocationId`, `callId` and InvocationReceipt;
- provider-limit reservation and dispatch claim;
- `attemptId` and raw fence, with only the fence digest crossing durable public
  projections;
- `CrossVerifyEnforcedAttemptContractV1`;
- task-result settlement attempt;
- D3 termination-ledger binding.

The child keeps the same tenant, project, run, original task, verifier role,
operation class, provider, canonical API model, auth/account, transport,
backend, endpoint and execution profile as the parent. Any route drift is HOLD
before dispatch. There is no continuation fallback chain.

### E2 — Parent/child lineage is explicit and content-addressed

The existing first-writer `ExecutionContinuationClaimV1` remains the sole
checkpoint-to-child claim. The child contract additionally binds:

- parent InvocationReceipt ref;
- parent provider-limit reservation ID and terminal evidence ref;
- parent D3 binding/evidence ref;
- parent settlement ref;
- checkpoint SHA-256;
- continuation claim SHA-256;
- child attempt and fence digest.

The parent remains terminal `landed/consumed`; it is never reopened, mutated or
released. The child is a distinct terminal execution. The final verifier
advisory may be produced only from a complete ordered lineage whose every
charge-bearing attempt has its own terminal settlement.

### E3 — Cumulative budget is conserved, not reset

The child execution contract uses the checkpoint's `remainingBudget`. It also
binds the original hard-budget digest and the parent's cumulative usage.

Before reserving or dispatching the child, the coordinator verifies:

- parent cumulative usage + child reservation cannot exceed the original hard
  ceilings;
- the owner verification budget applies to the whole lineage, not per attempt;
- the landing reserve remains available for the child;
- the provider/account/window reservation covers only the remaining work;
- repeated cache-read and context deltas remain cumulative across attempts.

A child landing can create at most one further continuation claim under the
same cumulative budget. The owner-configured finite `maxContinuationAttempts`
is mandatory and cannot be inferred from model output. Exhaustion returns
terminal `UNCLEAR`/HOLD according to the written verification policy; it never
replays the full original prompt.

### E4 — Continuation prompt is checkpoint-only

The child prompt is compiled only from the durable checkpoint, continuation
claim, remaining scope, remaining work and written acceptance criteria. The
original prompt corpus is not reattached.

The exact child contract binds both the bounded continuation prompt digest and
its host-private read-only Docker mount. A task/result/log field cannot widen
scope, budget, tools or acceptance criteria.

### E5 — Restart and settlement behavior

Restart performs lineage reconciliation before any dispatch:

1. child claim absent → no continuation authority exists;
2. claim present, child receipt/reservation absent → create the exact child
   tuple once under the existing claim;
3. reservation claimed or Docker dispatch present → adopt/reconcile only;
4. child `LANDED` → record child D3 `landed/consumed`, then apply the finite
   continuation limit;
5. child closed with complete host observation → settle child receipt and
   reservation, then emit one final semantic verdict;
6. conflicting or partial authority → reconciliation-required, with zero
   fallback and zero re-dispatch.

Exactly one composition root owns this saga. The generic worker continuation
runner remains unavailable for exact xverify parents.

## Production ingress dependency

Exact continuation implementation does not authorize production dispatch by
itself. Production ingress must separately provide exact current
account/reachability/limit query authority for the same Docker execution scope.

The current production source registry proves Claude subscription evidence only
for `cli/host-subprocess`. Projecting that evidence onto `cli/docker` would be a
second authority and is rejected. Until a Docker-scoped account identity,
reachability producer and limit source are composed and later live-proven,
mandatory exact xverify remains HOLD.

## Rejected alternatives

1. **Reuse the parent receipt/reservation:** two calls become one accounting
   identity and terminal immutability is violated.
2. **Treat LANDED as a semantic verdict:** a checkpoint is transport/runtime
   evidence, not an adjudication.
3. **Use the generic continuation runner then attach evidence later:** side
   effect precedes admission and cannot be repaired by post-hoc provenance.
4. **Release the parent reservation at LANDED:** the parent has already made a
   charge-bearing call; unused capacity and consumed provider work are distinct.
5. **Replay the original verifier prompt:** repeats the exact cache/context cost
   M1 is designed to prevent.
6. **Project host-subprocess reachability onto Docker:** catalog/login evidence
   is not backend-scoped live reachability.

## Acceptance gates after approval

1. Hermetic first-writer child claim + new receipt/reservation/attempt/fence
   tests.
2. Parent terminal immutability and cumulative-budget conservation tests.
3. Restart matrix proving no duplicate provider/Docker dispatch.
4. Exact checkpoint-only prompt and scope/budget drift tests.
5. D3 parent/child lineage settlement and terminal-verdict tests.
6. `npm run lint`, `npm run build:all`, provider-free compiled canary and one
   finite Fable-5 verdict.
7. A real paid strict canary remains separately owner-gated.

## Authority that remains separately gated

This proposal does not authorize:

- Docker-scoped provider account/reachability probe execution;
- key provisioning, import, rotation or migration;
- a paid strict xverify canary;
- `cross_verify` or enforcement default flips;
- commit, push, publish, tag or repo migration;
- Desktop implementation.

## Owner decision

- [ ] Approve E1–E5.
- [ ] Request changes.

## Independent finite review

Deckent `xverify` ran one bounded Fable-5 adjudication against the written
decision premises. `xv-1784947029125` returned `CONFIRMED`: no existing bounded
authority safely represents a second charge-bearing exact call, and reusing the
parent receipt/reservation/attempt/fence would violate the current immutable
coordinator and D3 termination bindings.

This verdict does not grant implementation authority and was not re-verified.
Provider envelope: `$0.11789125` (evidence, not an invoice); Fable usage:
input 4, output 1,920, cache-read 24,345, cache-create 8,815. Helper Haiku:
input 2,515, output 18.
