# Xverify Exact Attempt Contract — Owner Decision Proposal

Status: owner-approved implementation decision; not a new ADR.

Date: 2026-07-25
Decision owner: Alperen
Altitude: design

## Why a decision is required

M4-070A created a provider-free `CrossVerifyInvocationCoordinator` saga and
M4-071A correctly prevented mandatory verification from using the legacy
candidate/receipt/string-spawn path. The next apparent step—injecting a generic
executor callback into the runner—is unsafe.

The current callback can synthesize all of the following without a real
provider call:

- actual provider/model/auth/backend evidence;
- provider usage references;
- transport and consumer terminal events;
- a complete execution lineage.

The coordinator currently checks equality between callback-authored values and
the grant, but it cannot prove that the exact compiled prompt, owner auditor
budget, policy digest, landing reserve and settlement attempt reached the
provider. `defaultSpawnVerifier` is also unsuitable for mandatory execution:
its task JSON write is best-effort, it calls the broad spawn path, creates its
own settlement attempt and has no exact actual-call/prompt authority.

Concrete violation: an injected callback copies provider/model/auth/backend
from the grant, returns a fabricated `actualCall`, usage event and
`VERDICT: CONFIRMED`, and the current coordinator can settle it without a
provider-side effect.

This blocks the generic-callback approach, not the non-Desktop readiness Goal.
Mandatory xverify remains honestly unavailable under M4-071A.

## Proposed owner decisions

### A — Immutable enforced-attempt contract

Approve a versioned `CrossVerifyEnforcedAttemptContractV1` that binds:

- tenant/project/run/task/verifier-task/call/attempt/fence;
- operation class;
- finite base prompt SHA-256 and exact dispatched-prompt SHA-256;
- verifier task snapshot SHA-256;
- owner auditor budget, budget fingerprint, profile and policy digest;
- landing policy and explicit attendance mode;
- provider/canonical API model/auth/account/transport/backend/endpoint/profile;
- timeout, model effort, tool-profile digest and isolated-context flag.

Invocation identity remains based on the stable attempt/fence identity, not the
contract digest. Therefore prompt or budget drift within the same attempt
causes immutable conflict instead of minting a new invocation.

The binding is not added as an optional field to InvocationReceipt V1. A
post-approval compatibility inventory showed that optional security semantics
would let old readers ignore the field and would conflict with immutable V1
idempotency on retries. The accepted D3 `ExecutionTerminationLedger` remains
the canonical receipt/reservation/attempt/fence/runtime binding authority.
If receipt-contained binding is later required, it needs an explicit
InvocationReceipt V2 dual-read migration decision.

### B — Reservation and grant share the same binding

Approve requiring the exact attempt-contract evidence ref in provider-limit
reservation `estimateEvidenceRefs`. The coordinator verifies it before the
dispatch claim. The frozen execution grant carries the same contract, budget
fingerprint, policy digest and exact settlement-attempt reference.

Any prompt, budget, policy, landing, timeout, tool profile, model effort,
backend or attempt drift is pre-dispatch HOLD. After dispatch it is
reconciliation-required; it never opens fallback or retry.

### C — Strict adapter plus independent host observation

Approve replacing the mandatory generic callback with a dedicated strict
adapter:

```ts
spawnExactCrossVerifyFromGrant(
  grant,
  preparedAttempt,
): Promise<{
  settlementRef: TaskResultSettlementRefV1;
  outputArtifactRef: string;
}>
```

The adapter cannot author actual-call, usage, termination, transport or
consumer truth. A separate host observation authority reads the exact
settlement/runtime/provider evidence and produces those facts. Provider usage
settlement consumes only this host observation. A release requires an exact
host termination-ledger proof for the same attempt/dispatch/contract.

`defaultSpawnVerifier` remains advisory/manual-only. The mandatory runner stays
HOLD until this strict adapter and observation authority are composed.

### D — Durable result provenance and staged rollout

Approve additive canonical result evidence for:

- execution-contract evidence ref;
- InvocationReceipt ref;
- provider-limit reservation ID;
- dispatch and settlement evidence refs;
- exact terminal settlement ref;
- host observation/actual-call evidence ref.

Rollout remains:

1. contract + immutable conflict tests;
2. coordinator binding and no-fabrication tests;
3. strict adapter + host observation + crash/replay tests;
4. runner composition, still default-off;
5. provider-free compiled canary and one finite Fable-5 verifier;
6. live paid canary and default flip only under later explicit owner approval.

## Rejected alternatives

1. **Generic `exactInvocation` callback:** structural typing does not create
   provider or host authority; it can fabricate a settled bundle.
2. **Put contract digest in invocation identity:** drift would mint a new
   identity and bypass first-writer conflict.
3. **Trust mutable verifier task JSON:** worker-writable state cannot be owner
   budget or prompt authority.
4. **Overload reachability/limit evidence fields:** conflates distinct truths
   and creates a silent second schema.
5. **Open mandatory runner before strict adapter:** converts fail-closed safety
   into silent-success risk.

## Authority that remains separately gated

This proposal does not authorize:

- key provisioning, import, rotation or migration;
- live reachability refresh or paid provider canary;
- default policy flip;
- commit, push, publish, tag or repo migration;
- main cleanup;
- Desktop implementation.

## Owner decision

Alperen approved A, B, C and D on 2026-07-25. The approval explicitly leaves
key provisioning/rotation, paid canary, commit/push and default flips behind
separate owner gates.

## Post-approval implementation impact

- Provider-limit storage needs no migration: `estimates` and
  `estimateEvidenceRefs` already live inside the canonical signed reservation
  payload. Exact xverify must nevertheless require one content-addressed
  contract ref; an opaque ref alone is not authority.
- InvocationReceipt V1 remains unchanged. The existing termination ledger binds
  receipt, reservation, attempt, fence and runtime without duplicating
  authority.
- The current `SpawnBackend.spawn(): void` contract cannot expose a durable
  prepare boundary before `docker run`. Production composition therefore
  requires a real two-stage backend adapter; a wrapper around the current broad
  spawn route is insufficient.
- The mandatory launcher may return only settlement and output-artifact refs.
  Actual call, usage, transport and consumer facts belong to a separate host
  observation authority.
- Docker/Claude is the first currently measurable profile. Unsupported
  provider/backend observation profiles remain honest HOLD; they are not
  silently treated as equivalent.
