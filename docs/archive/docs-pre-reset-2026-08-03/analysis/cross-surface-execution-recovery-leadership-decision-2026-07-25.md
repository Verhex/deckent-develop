# Cross-surface execution recovery leadership — owner decision packet

**Date:** 2026-07-25
**Altitude:** design / ADR-G-037 amendment proposal
**Scope:** non-Desktop execution roots; host crash, orphan spend, recovery
ownership and duplicate-dispatch prevention
**Source finding:** Fable K1, reconciled by M4-093 / MASTER-PLAN 623

## Current truth

The historical destructive redispatch defect is no longer current:

- `runDockerWithRetry()` adopts only a container carrying the exact
  project/task/attempt labels;
- a foreign or different-attempt collision is never removed and returns
  `OWNERSHIP_CONFLICT`;
- `reconcilePendingAttempts()` can adopt, contain and settle a valid pending
  exact attempt;
- sprint startup invokes that reconciler while it owns sprint leadership.

The remaining defect is broader:

1. one-shot, process, autonomous and API/MCP execution roots do not share a
   recovery-leadership authority;
2. a host coordinator crash removes the live token/cache observer while the
   detached Docker container can continue until its wall-clock timeout;
3. calling the existing reconciler independently from every surface would
   create competing recovery owners;
4. a project-wide run mutex would prevent legitimate multi-run and 8-worker
   concurrency.

M4-093 verified the current consumers with 8 focused files / 198 tests. It did
not run Docker, a provider, network or a paid canary.

## Negative space

- No per-surface reconciler, stale-PID heuristic or blind cleanup.
- No project-wide mutex that serializes unrelated attempts or the worker pool.
- No wall-clock-only lease takeover.
- No `docker rm -f` for an unverified attempt.
- No worker/project-mounted file as recovery authority.
- No in-container signal or checkpoint as semantic DONE/NO_GO authority.
- No provider reservation release from memory-only death evidence.
- No unsupported backend silently admitted to unattended execution.
- No key provisioning/rotation, paid canary, default flip, commit/push or
  publish in this decision.

## Four authorities that must remain distinct

| Authority | Question answered | Canonical owner |
|---|---|---|
| Attempt leadership | Which coordinator may monitor/recover this exact attempt now? | Host-global attempt lease store |
| Survival containment | What prevents spend after the coordinator disappears? | Backend/platform containment adapter |
| Semantic settlement | Did the task genuinely complete, land or fail? | Existing host `TaskResultSettlement`/landing authority |
| Provider capacity settlement | Is reserved account capacity consumed or releasable? | Existing D3 `ExecutionTerminationLedger` + provider-limit store |

Success in one column never implies success in another.

## Recommended decisions

### A — Attempt-scoped fenced leadership

Approve one host-global `ExecutionAttemptLeadershipStore`, keyed by:

`tenant / project / run / task / attempt / backend`

The store is transactional and first-writer-wins. A grant binds:

- coordinator runtime ID and process identity;
- platform/host identity and process-start evidence;
- attempt, settlement and execution-contract digests;
- acquired/heartbeat/expiry times;
- a monotonically increasing fencing epoch and private claim token hash;
- backend runtime identity once dispatch is published.

Every monitor, containment action and settlement write presents the current
fence. A stale coordinator may observe but cannot mutate after takeover.

Takeover requires both:

1. transactional lease expiry/CAS; and
2. adapter evidence that the previous owner is dead or unreachable.

Clock expiry alone is insufficient. Unknown liveness returns HOLD. The lease is
attempt-scoped, so one coordinator can own 8 or more independent worker
attempts without a project-wide serialization point.

For a single-host process, SQLite `BEGIN IMMEDIATE` plus the existing canonical
PID-liveness adapter is suitable. Multi-host enterprise mode requires an
external transactional lease adapter with server-side time; local SQLite never
claims distributed leadership.

### B — Backend survival-containment contract

Approve a separate `BackendSurvivalContainment` capability:

- `host-independent-hard-ceiling`
- `parent-death-contained`
- `external-supervisor`
- `unsupported`

Remote unattended execution requires a proved capability. `measured-stream`
alone is insufficient.

For Docker, the recommended adapter is an image-owned PID1 supervisor, outside
the writable workspace, consuming a host-authored immutable read-only execution
contract. It:

- forwards provider stdout/stderr as the existing event stream;
- applies the exact hard wall-clock/turn/token/cache ceilings;
- terminates the provider process group and itself at the hard ceiling even if
  the Deckent host process is gone;
- emits bounded containment evidence for restart reconciliation.

That evidence is defense-in-depth, not semantic authority. On restart the host
reconstructs usage from the Docker log stream and existing host ledgers,
validates the exact attempt, and writes the canonical settlement. Missing or
ambiguous evidence yields HOLD/NO_GO, never success.

Platform/backend matrix:

| Backend | Required survival adapter | Unattended rule |
|---|---|---|
| Docker | image-owned read-only-contract supervisor | HOLD until binary crash canary proves host-independent stop |
| Linux/WSL subprocess | verified parent-death/process-group adapter plus durable terminal observation | HOLD without adapter |
| macOS subprocess | launchd/native process-group containment adapter with durable observation | HOLD without adapter |
| Windows subprocess | Job Object kill-on-close/native process-tree adapter with verified handle lifecycle | HOLD without adapter |
| tmux | external supervisor with durable lease/termination evidence | Current plain tmux is unsupported for unattended work |
| API/in-process | host cancellation plus provider idempotency/terminal receipt where supported | Ambiguous remote completion is consumed/reconciliation-required; never blind retry/release |
| Multi-host/container platform | external lease + workload supervisor/Kubernetes job authority | Local PID/SQLite evidence is insufficient |

### C — One recovery composition, thin surfaces

Approve one process-scoped `ExecutionRecoveryRuntimeService`. CLI, MCP, API,
process, autonomous, Goal-v2 and sprint roots inject it; none constructs a local
lease or calls Docker recovery directly.

Before a new dispatch for an existing task/attempt lineage, the service:

1. enumerates host-owned pending attempts;
2. reads the current attempt lease;
3. adopts a still-live same-owner monitor, or takes over only with an exact
   fenced recovery grant;
4. inspects the exact backend identity;
5. contains/reconciles the attempt;
6. closes or parks every authority before permitting a new attempt.

A foreign attempt, unavailable liveness adapter, corrupt ledger, ambiguous
provider completion or lost fence remains a typed `reconciliation-required`
HOLD. There is no fallback, retry or new task ID escape.

The existing sprint lock remains sprint-lifecycle UX/state authority; it stops
being the implicit proof of Docker recovery ownership after migration.

### D — Migration and rollout

Approve this dependency order:

1. additive attempt leadership schema/store and platform liveness adapters;
2. make `reconcilePendingAttempts()` require an exact recovery grant;
3. compose one provider-free recovery runtime and migrate sprint to it;
4. migrate one-shot/task-mode/process/autonomous/API/MCP roots;
5. add Docker survival supervisor and deterministic host-crash tests;
6. prove 8 independent attempts are not serialized and one attempt cannot have
   two mutating owners;
7. provider-free real-Docker kill/restart canary;
8. separate owner-approved single-worker paid crash canary;
9. default flip only after all prior evidence is reviewed.

Old pending attempts without the new lease/fence are quarantined under an
explicit compatibility reader. They may be contained after exact Docker
identity inspection, but cannot be redispatched or reported successful from
legacy evidence.

Rollback disables new admission and returns HOLD while preserving additive
lease/evidence records. It never deletes attempt, settlement or container
history.

## Rejected alternatives

### Project-wide execution mutex

It makes takeover simpler but serializes unrelated calls and defeats the
product's multi-worker/multi-process scale contract.

### Per-surface startup reconciliation

It is easy to wire but creates several competing owners and recreates the exact
silent-authority class this program is removing.

### Wall-clock lease only

A paused, overloaded or partitioned live coordinator can be mistaken for dead;
the new actor then duplicates containment/settlement.

### Docker-only boot cleanup

It reduces local debris but neither covers every environment nor prevents spend
during the host-down interval.

## Acceptance criteria after owner approval

1. Two processes racing one attempt produce one mutating recovery grant.
2. Eight independent attempts can be owned and monitored concurrently.
3. A stale fence cannot contain, settle or release capacity.
4. Live owner, dead owner, PID reuse, clock skew, corrupt store and adapter
   unavailable cases have deterministic outcomes.
5. Host death does not leave a Docker provider process beyond its immutable hard
   ceiling.
6. Restart never trusts project-mounted output and never fabricates success.
7. Sprint, one-shot, task-mode, process, autonomous, API and MCP consume the same
   service.
8. Unsupported platforms/backends fail loudly before unattended provider work.
9. D3 capacity release remains bound to exact durable termination evidence.
10. Targeted hermetic tests, cross-platform adapter tests, lint, `build:all`,
    provider-free compiled proof and real-Docker kill/restart proof pass.
11. One finite Fable-5 verifier judges only these written criteria; paid
    provider execution requires a separate owner approval.

## Exact owner response

Implementation authority can be granted with:

> Approve A, B, C and D for M4-094. This authorizes the ADR-G-037 amendment
> implementation and provider-free Docker crash proof. Key provisioning or
> rotation, paid/provider canary, default flips, commit/push and publish remain
> separately gated.

Until that approval, MASTER-PLAN 623 remains partial and no new recovery
leadership authority will be implemented.
