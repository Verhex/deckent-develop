# Runner Protocol V2 — ADR-G-014 amendment proposal

Status: `READY_FOR_OWNER_DECISION`
Date: 2026-07-25
Altitude: `design`
MASTER-PLAN: 584 / RUNNER-PROTO-V2

## Outcome first

ADR-G-014 should be amended before Runner Protocol V2 code is written.

The accepted ADR correctly governs heterogeneous per-worker backends, deterministic
backend selection, options and backend-agnostic observation. Its current executable
contract, however, is still local-process shaped:

```ts
spawn(...): void;
kill(taskId): void;
list(): string[];
isAvailable(): Promise<boolean>;
```

This contract cannot durably identify or adopt a started execution, negotiate
capabilities, resume events from a cursor, fence a stale coordinator, distinguish
graceful from forced termination, or collect artifacts across a process/host boundary.
Those are protocol responsibilities, not additional `spawn()` options.

The amendment should authorize a versioned, handle-based Runner Protocol while preserving
the existing ADR's laws:

- backend choice remains explicit and deterministic; no silent fallback;
- heterogeneity remains per execution/worker;
- Brain is not a worker and Auditor remains in-process;
- CLI and MCP consume one observation semantic;
- provider, budget, settlement and runner evidence remain separate authorities;
- Go/remote runner implementation remains a later, separately approved decision.

## Current disk truth

### Existing strengths to reuse

- `TaskResultSettlementRefV1` already provides host-owned exact-attempt terminal authority.
- Execution landing/checkpoint and termination ledgers already separate non-terminal landing
  from terminal settlement.
- Runtime budget observation already records durable incremental counters.
- Provider authority and InvocationReceipt contracts already distinguish requested, resolved
  and called provider/model identity.
- Event-stream infrastructure already provides append-only project events.
- Goal-v2 already demonstrates lease epoch, heartbeat renewal and fenced claim patterns.
- Docker restart reconciliation already demonstrates first-writer attempt adoption.

Runner Protocol V2 should reference these authorities; it must not duplicate them inside one
large runner record.

### Structural gaps

| Current contract | Missing protocol property | Consequence |
|---|---|---|
| `spawn(): void` | immutable returned handle | caller cannot adopt/reconcile what was started |
| `kill(taskId)` | execution/attempt/fence binding | a reused task ID can target the wrong execution |
| `list(): string[]` | tenant/project/run scope and lifecycle | cross-project or remote results are ambiguous |
| optional capability fields | versioned capability negotiation | admission can drift from the executor used |
| backend-specific logs | resumable event cursor | reconnect can lose or duplicate observations |
| local process ownership | lease epoch/fencing | two coordinators can both believe they own execution |
| no artifact contract | immutable manifest/digests | remote output cannot be proven complete |
| backend-specific termination | requested/observed termination receipt | graceful and forced outcomes are conflated |

## Proposed ADR-G-014 amendment

### 1. Protocol identity

Every accepted execution has a host-authored immutable identity:

```ts
interface RunnerExecutionIdentityV2 {
  protocolVersion: 2;
  tenantId: string;
  projectId: string;
  runId: string;
  taskId: string;
  attemptId: string;
  invocationId: string;
  idempotencyKey: string;
  runnerId: string;
  backend: string;
  requestDigest: string;
  authorityFence: string;
}
```

`runnerId` identifies an attested runner instance or adapter, not a hostname supplied by a
worker. `authorityFence` is opaque and host-private; only its digest crosses durable public
records. PID, container name, tmux window and remote job ID are adapter locators, never the
canonical identity.

The returned handle is an immutable projection:

```ts
interface ExecutionHandleV2 {
  identity: RunnerExecutionIdentityV2;
  handleDigest: string;
  acceptedAt: string;
  capabilityDigest: string;
  lease: {
    epoch: number;
    ownerRefHash: string;
    expiresAt: string;
  };
  locatorRef: string | null;
}
```

The exact handle is persisted before a backend can perform provider work. A repeated
idempotency key with an identical request adopts the same handle; a changed request returns
conflict. It never starts a second execution.

### 2. Version and capability negotiation

Each runner exposes a signed or locally attested immutable descriptor:

```ts
interface RunnerCapabilitiesV2 {
  protocolVersions: readonly [2, ...number[]];
  runnerId: string;
  platform: 'linux' | 'macos' | 'windows' | 'wsl' | 'container' | 'remote';
  executionBackends: readonly string[];
  eventDelivery: 'durable-cursor' | 'snapshot-only';
  liveUsageBudgetSupport: 'measured-stream' | 'final-only' | 'unavailable';
  landingCapability: 'cooperative-landing' | 'checkpoint-stop' | 'unsupported';
  termination: {
    graceful: boolean;
    forced: boolean;
    exactContainment: boolean;
  };
  artifactCollection: 'manifest-digest' | 'unsupported';
  resourceEnvelope: readonly string[];
  maxLeaseMs: number;
  capabilityDigest: string;
}
```

Admission binds the exact descriptor digest. Missing version/capability is unsupported, not a
reason to infer local behavior. Capability changes after approval require a new admission
decision.

### 3. Request and resource envelope

`start()` consumes an immutable request referencing existing authorities:

```ts
interface RunnerStartRequestV2 {
  identity: RunnerExecutionIdentityV2;
  capabilityDigest: string;
  providerInvocationReceiptRef: string;
  providerReservationRef: string | null;
  approvalReceiptRef: string | null;
  executionBudgetPolicyRef: string;
  settlementAttemptRef: string;
  promptRef: string;
  scopeRef: string;
  acceptanceRef: string;
  resources: {
    cpuMillis?: number;
    memoryBytes?: number;
    wallClockMs: number;
    diskBytes?: number;
    networkPolicyRef: string;
  };
}
```

The protocol does not embed secret keys, plaintext prompts, account identities or approval
commands. References resolve only through host-controlled mounts/channels allowed for that
runner.

### 4. Lifecycle

Canonical runner lifecycle:

```text
PROPOSED
  → ACCEPTED
  → STARTING
  → RUNNING
  → LANDING_REQUESTED
  → LANDED | TERMINATING
  → TERMINATED
  → ARTIFACTS_COLLECTED
  → SETTLED
```

Additional terminal states:

- `REJECTED` — no execution accepted;
- `START_FAILED` — accepted but provider/backend work not proven started;
- `LOST` — lease/evidence unavailable; never interpreted as success;
- `RECONCILIATION_REQUIRED` — side effects may have begun and automatic replay is forbidden.

`LANDED` remains non-terminal under ADR-G-037. `SETTLED` requires the existing host settlement
authority; a runner cannot self-assert product success.

### 5. Events and cursor semantics

```ts
interface RunnerEventV2 {
  handleDigest: string;
  sequence: number;
  eventId: string;
  occurredAt: string;
  kind: string;
  payloadRef: string | null;
  previousHash: string | null;
  hash: string;
}

events(handle, afterCursor): AsyncIterable<RunnerEventV2>
```

Rules:

- sequence is strictly monotonic per handle;
- `eventId` replay is byte-identical and idempotent;
- cursor resumes after the last incorporated sequence;
- a gap returns an explicit `cursor-gap` response with a snapshot reference;
- provider usage events remain inputs to the runtime budget authority, not authority by
  themselves;
- worker text/log content is untrusted observation data;
- event retention limits are declared in capabilities.

CLI, MCP, terminal and future Desktop consume the same core cursor/snapshot service.

### 6. Lease and fencing

- One coordinator lease owns lifecycle mutations for a handle.
- Lease renewal uses runner-observed monotonic duration plus durable wall-clock evidence; a
  remote clock never becomes the sole expiry authority.
- A takeover increments the epoch and revokes every prior mutation fence.
- Old owners may read events but cannot terminate, collect or settle.
- Lease expiry never means the execution stopped. It becomes `LOST` or
  `RECONCILIATION_REQUIRED` until runner/backend evidence converges.

This follows the Goal-v2 engine-lease pattern but uses an execution-scoped ledger. The stores are
separate because mission scheduling authority and runner process authority have different
lifecycles.

### 7. Termination

```ts
terminate(handle, {
  mode: 'graceful' | 'forced';
  reasonCode: string;
  deadlineMs: number;
  authorityFence: string;
}): Promise<TerminationReceiptV2>
```

The receipt records request, observed containment, escalation, exact backend locator evidence,
timestamps and resourcesReleased. `graceful` may escalate only when policy authorizes it and the
receipt preserves both phases. Unsupported graceful termination is a typed rejection, not silent
forced kill.

Provider cancellation and runner containment are independent. Killing a process/container does
not prove a remote provider call was cancelled; provider settlement remains separate.

### 8. Artifact collection

```ts
collectArtifacts(handle, cursor): Promise<ArtifactManifestV2>
```

The manifest is append-only and binds:

- relative logical path, media type, byte length and SHA-256;
- producing handle/attempt and event sequence;
- completeness/truncation state;
- confidentiality class and retention policy;
- host import/verification outcome.

No absolute remote path becomes product identity. Scope validation and host import occur before
an artifact can influence evaluation. Missing or truncated required artifacts prevent success.

### 9. Adapter and platform matrix

| Adapter | V2 initial mode | Required proof before native V2 |
|---|---|---|
| Docker | native candidate | exact container adoption, cursor replay, checkpoint/termination and artifact manifest |
| Subprocess | compatibility first | process-group containment on POSIX; Job Object/process-tree semantics on Windows |
| tmux | compatibility/deprecated | stable pane/session locator and honest snapshot-only limitations |
| Host HTTP/API adapter | explicit non-runner or dedicated adapter | remote-call idempotency/settlement; no fabricated process handle |
| WSL | Linux runner with WSL platform evidence | Windows↔WSL path mapping, PID namespace and shutdown semantics |
| macOS | unsupported until exercised | process group, filesystem/Keychain authority and artifact permissions |
| Windows native | unsupported until exercised | Job Objects, DACL/DPAPI custody and atomic file semantics |
| SSH/remote | future | authenticated runner identity, transport replay, lease, offline reconciliation |

WSL is not native Windows authority. An unsupported adapter returns capability HOLD before
provider work.

## Compatibility and migration

### Phase 0 — Contract and conformance fixtures

- Add protocol types and pure validators behind no production consumer.
- Build one reusable conformance suite for version, identity, cursor, lease, termination and
  artifacts.
- No backend/default behavior changes.

### Phase 1 — V1 compatibility adapter

Wrap current `SpawnBackend` behind a `LegacyRunnerAdapter`:

- synthesize no capabilities it cannot prove;
- persist the V2 handle before calling legacy `spawn`;
- classify events as snapshot-only when no durable cursor exists;
- keep current settlement authority;
- block remote use.

This is migration scaffolding, not V2 completion.

### Phase 2 — Docker native V2 shadow

Run native Docker V2 observation in shadow against the existing production path:

- same request and attempt;
- no second container/provider call;
- compare lifecycle, usage, settlement and artifacts;
- persist parity evidence without deciding the product result.

### Phase 3 — Docker cutover

Cut over only after restart/crash, duplicate-start, lease takeover, event-gap, budget-stop,
landing/continuation, termination and artifact tests plus real-binary provider-free proof.
Default flip is a separate owner decision.

### Phase 4 — Subprocess and tmux

Adopt independently. A backend that cannot meet the common contract remains legacy/local or
unsupported; V2 is not weakened to obtain artificial parity.

### Phase 5 — Remote runner

Only after one local native V2 adapter and one compatibility adapter have measured parity. SSH,
WSL-host bridge, separate host and Go runner remain separate owner decisions.

## Acceptance gates

1. Identical idempotency key/request returns the same handle; changed request conflicts.
2. Crash after backend acceptance but before caller response never starts a duplicate.
3. Stale lease owner cannot mutate or settle after takeover.
4. Event replay is ordered, duplicate-free and gap-explicit.
5. Unknown capability/version/platform returns HOLD before provider work.
6. Graceful/forced termination and escalation are separately evidenced.
7. Runner containment never fabricates provider cancellation or task success.
8. Artifact manifest completeness and hashes are verified before evaluation.
9. Docker/subprocess/tmux retain their current observable behavior during compatibility mode.
10. CLI/MCP observation consumes one core semantic.
11. Linux/macOS/Windows/WSL adapters either pass the same conformance contract or declare
    unsupported behavior explicitly.
12. Targeted hermetic tests, lint, `build:all`, crash/restart real-binary proof and one finite
    Fable verifier pass before any default flip.

## Consequences

Benefits:

- local and remote execution use one durable contract;
- duplicate execution and stale-coordinator mutation become protocol-level failures;
- observation, termination and artifact behavior become capability-driven and auditable;
- new language/runtime implementations can conform without changing Deckent orchestration.

Costs:

- current backends require adapters and eventually native implementation;
- cursor, lease and artifact ledgers add storage and reconciliation work;
- cross-platform conformance requires real OS evidence;
- migration must preserve V1 behavior for a significant compatibility period.

## Explicit non-decisions

- No Go runner is approved.
- No SSH/remote runner is approved.
- No default flip is approved.
- No replacement of ProviderAuthority, InvocationReceipt, runtime budget, landing checkpoint or
  task-result settlement is approved.
- No Desktop implementation is approved.

## Owner decision requested

Approve this document as the amendment shape for ADR-G-014 and authorize Phase 0 only:
versioned TypeScript contracts, pure validation and hermetic conformance fixtures with zero
production consumer/default change.

ADR-G-014 and Brain DB remain unchanged until the owner explicitly approves the amendment and
its canonical text.
