# DIRECTIVES — Recovery Residual Closure Implementation Slice

## Goal

Close the four source-level residuals discovered by Sprint 490 before any new live replay:
terminal `SPRINT-LOG` projection completeness, redundant repair-descendant cancellation,
run-owned provider-observation retirement and fail-closed controller fixture parity.

This is an implementation sprint only. Provider, model, effort and effective concurrency are
resolved exclusively from effective config, registry, role policy, auth/reachability evidence,
usage/limit authority and host admission. No instruction-level provider or model override exists.

## Execution Contract

- Preserve canonical terminal receipts and the persisted run-status read model as authority;
  `docs/SPRINT-LOG.md` remains a human-readable projection only.
- Every production change must close producer → consumer → entrypoint/policy wiring in this same
  dependency DAG. A unit-green but unwired helper is `UNWIRED/HOLD`, never DONE.
- Repair cancellation is lineage-scoped and generation-fenced. It must not cap retries, cancel an
  unrelated lineage or infer success from file presence.
- Provider observations are forensic evidence. Never delete history or close an interval from
  USD, container absence or task-name heuristics; only exact run/attempt/fence authority may retire
  or scope it.
- Tests are exact scoped Vitest files only. Workers must not run `npm run build`, `npm test`, a full
  suite, provider login/auth mutation, sprint lifecycle commands, git commit or cleanup.
- New user-facing text is forbidden in mechanism modules; any required CLI text must use the
  existing i18n message authority.

---

## Task 1: Make terminal sprint-log projection an atomic idempotent upsert

- Files: src/orchestra/doc-updaters/sprint-log.ts, tests/orchestra/doc-updaters/sprint-log.test.ts
- Scope: src/orchestra/doc-updaters/sprint-log.ts, tests/orchestra/doc-updaters/sprint-log.test.ts
- Dependencies: none

Refactor the existing Tier-1 sprint-log updater around one exact sprint-section identity. A repeat
write for the same sprint must replace/coalesce that sprint's section instead of appending a
duplicate, preserve unrelated sections byte-for-byte, write by same-directory temporary file plus
atomic rename and accept receipt-backed terminal COMPLETE or ABORTED status as explicit input.
The existing retrospective detail payload and parse-compatible metric labels must be preserved.

**Test:** `npx vitest run tests/orchestra/doc-updaters/sprint-log.test.ts`

**NO-GO:** Append-only duplicate remains possible, unrelated sprint text changes, write is
non-atomic, or the projection is treated as settlement authority.

## Task 2: Wire COMPLETE and ABORTED terminal authorities to the shared sprint-log upsert

- Files: src/orchestra/sprint-finalizer.ts, tests/orchestra/sprint-finalizer-terminal-wire.test.ts
- Scope: src/orchestra/sprint-finalizer.ts, tests/orchestra/sprint-finalizer-terminal-wire.test.ts
- Dependencies: Task 1

Invoke the shared projection only after the exact terminal receipt and canonical lifecycle
authority have been published. Normal, completed-checkpoint recovery and force-abort paths must all
converge: COMPLETE replaces RETROSPECTIVE, ABORTED creates or updates its exact section, repeated
publication stays idempotent, and a projection failure cannot fabricate or reverse canonical
settlement. Preserve current notification and read-model ordering.

**Test:** `npx vitest run tests/orchestra/sprint-finalizer-terminal-wire.test.ts`

**NO-GO:** Any call occurs before receipt/state authority, recovery bypasses the wire, ABORTED is
still absent, or the solution reruns all doc updaters at terminal publication.

## Task 3: Prove sprint-log terminal projection on a real temporary filesystem

- Files: tests/orchestra/sprint-log-terminal-projection.integration.test.ts
- Scope: tests/orchestra/sprint-log-terminal-projection.integration.test.ts
- Dependencies: Task 2

Add a hermetic real-filesystem integration contract covering RETROSPECTIVE→COMPLETE reconciliation,
first-write ABORTED, repeat COMPLETE/ABORTED idempotency, exact-section duplicate coalescing,
unrelated-section preservation and atomic-write failure behavior. Do not mock the filesystem writer.

**Test:** `npx vitest run tests/orchestra/sprint-log-terminal-projection.integration.test.ts`

**NO-GO:** Mock-only proof, duplicate section, foreign-section mutation, or canonical receipt/state
is inferred from the Markdown projection.

## Task 4: Define lineage-scoped redundant repair cancellation authority

- Files: src/core/task-lineage.ts, src/core/task-types.ts, tests/core/task-lineage.test.ts
- Scope: src/core/task-lineage.ts, src/core/task-types.ts, tests/core/task-lineage.test.ts
- Dependencies: none

Add one pure decision contract that, from explicit root/FIX/XFIX edges, current accepted resolving
attempt and exact statuses, identifies only redundant queued descendants and produces typed active
descendant cancellation decisions. A later stale leaf must never replace or reopen a settled root.
The decision must be deterministic, idempotent and independent of provider/model names.

**Test:** `npx vitest run tests/core/task-lineage.test.ts`

**NO-GO:** Retry count is globally reduced, unrelated roots are selected, file existence becomes
success authority, or later attempt depth automatically outranks accepted causal settlement.

## Task 5: Gate every repair dispatch against accepted lineage settlement

- Files: src/orchestra/sprint-spawner.ts, tests/orchestra/redundant-fix-dispatch-gate.test.ts
- Scope: src/orchestra/sprint-spawner.ts, tests/orchestra/redundant-fix-dispatch-gate.test.ts
- Dependencies: Task 4

Wire the pure cancellation authority into the canonical spawn executor used by initial, refill,
FIX, XFIX, dependency-respawn and recovery triggers. Immediately before claim/spawn, re-read the
fenced lineage authority; atomically supersede redundant pending descendants and report them as
non-dispatched rather than consuming a worker slot or FIX budget. Collision and dependency gates
must retain their existing order for non-redundant work.

**Test:** `npx vitest run tests/orchestra/redundant-fix-dispatch-gate.test.ts`

**NO-GO:** One dispatch ingress bypasses the gate, superseded work counts as spawned/failed,
unrelated ready work is delayed, or a time-of-check/time-of-use window remains.

## Task 6: Settle already-active redundant repair descendants with typed cancellation

- Files: src/orchestra/sprint-controller.ts, src/core/event-stream.ts, tests/orchestra/redundant-fix-active-cancellation.test.ts
- Scope: src/orchestra/sprint-controller.ts, src/core/event-stream.ts, tests/orchestra/redundant-fix-active-cancellation.test.ts
- Dependencies: Task 4

When an accepted repair settles a logical root, publish one generation-fenced cancellation decision
for any already-active redundant descendant and route it through the existing backend containment
authority. Its eventual stale result remains forensic attempt evidence but cannot mutate logical
DONE, reopen dependencies or inflate progress. Do not terminate unrelated work.

**Test:** `npx vitest run tests/orchestra/redundant-fix-active-cancellation.test.ts`

**NO-GO:** Cancellation is an unfenced process kill, stale result changes the logical verdict,
events claim cancellation without an effect decision, or another lineage is touched.

## Task 7: Prove repair cancellation across refill, dependency and recovery dispatch

- Files: tests/orchestra/redundant-fix-lineage.integration.test.ts
- Scope: tests/orchestra/redundant-fix-lineage.integration.test.ts
- Dependencies: Task 5, Task 6

Add a hermetic integration matrix with one accepted FIX, one prequeued redundant XFIX, one active
redundant descendant, one unrelated repair and one dependent task. Prove the redundant descendants
settle as superseded/cancelled, unrelated work refills the free slot, the dependent unblocks once,
and logical progress remains one DONE for the repaired root.

**Test:** `npx vitest run tests/orchestra/redundant-fix-lineage.integration.test.ts`

**NO-GO:** Raw attempts inflate the denominator, a dependent unblocks twice, a redundant worker is
born after settlement, or unrelated repair capacity is lost.

## Task 8: Bind provider execution observations to exact run ownership

- Files: src/core/provider-execution-observation.ts, src/core/provider-execution-observation-store.ts, tests/core/provider-execution-observation.test.ts, tests/core/provider-execution-observation-store.test.ts
- Scope: src/core/provider-execution-observation.ts, src/core/provider-execution-observation-store.ts, tests/core/provider-execution-observation.test.ts, tests/core/provider-execution-observation-store.test.ts
- Dependencies: none

Extend the versioned observation/store contract so every interval carries exact run identity in
addition to task, attempt, principal and fence. Provide backward-compatible migration/read behavior
that preserves legacy rows as explicitly unowned forensic evidence. Add bounded selectors and
idempotent retirement/scoping operations keyed by run+attempt+fence; never delete foreign history.

**Test:** `npx vitest run tests/core/provider-execution-observation.test.ts tests/core/provider-execution-observation-store.test.ts`

**NO-GO:** Task-name parsing stands in for run identity, legacy rows disappear, foreign principal
data can be closed, or migration is destructive/non-idempotent.

## Task 9: Propagate exact run ownership through provider observation producers

- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-provider-execution-observation.test.ts, tests/orchestra/docker-provider-observation-wire.test.ts
- Scope: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-provider-execution-observation.test.ts, tests/orchestra/docker-provider-observation-wire.test.ts
- Dependencies: Task 8

Pass exact run identity through the Docker provider-runtime start/end producer, host ingestion and
store write without trusting worker prose. Keep start/end identity equality and principal/fence
validation fail-closed. If another backend uses the shared producer contract, preserve parity or
emit a typed unsupported/HOLD outcome rather than silently omitting ownership.

**Test:** `npx vitest run tests/orchestra/docker-provider-execution-observation.test.ts tests/orchestra/docker-provider-observation-wire.test.ts`

**NO-GO:** Only tests know the run ID, the container can forge host ownership, start/end identity
drifts, or unsupported backends silently claim parity.

## Task 10: Retire exact-run provider intervals at terminal authority and scope status holds

- Files: src/orchestra/sprint-finalizer.ts, src/core/run-status-read-model.ts, tests/core/run-status-read-model.test.ts, tests/orchestra/provider-observation-terminal-retirement.test.ts
- Scope: src/orchestra/sprint-finalizer.ts, src/core/run-status-read-model.ts, tests/core/run-status-read-model.test.ts, tests/orchestra/provider-observation-terminal-retirement.test.ts
- Dependencies: Task 2, Task 8, Task 9

After COMPLETE or ABORTED receipt authority, reconcile only intervals owned by that exact
run/attempt generation and project IDLE/current-run holds from the same ownership selector. Foreign
or legacy-unowned intervals remain queryable forensic evidence but cannot impose an admission HOLD
on an unrelated run. Repeat finalize/cleanup must be idempotent.

**Test:** `npx vitest run tests/core/run-status-read-model.test.ts tests/orchestra/provider-observation-terminal-retirement.test.ts`

**NO-GO:** Terminalization closes foreign intervals, status hides a current-run open interval,
historical evidence is deleted, or COMPLETE is published before receipt authority.

## Task 11: Repair legacy controller fixtures without weakening production truth

- Files: tests/orchestra/sprint-controller.test.ts
- Scope: tests/orchestra/sprint-controller.test.ts
- Dependencies: Task 6, Task 10

Bring the monolithic controller fixture harness up to the current production contracts: complete
atomic filesystem mocks including rename, real temporary DB directory setup, exact attempt/work
attribution, provider-observation ownership and current retrospective/finalizer seams. Remove stale
mock expectations; do not alter production code merely to satisfy legacy fixtures.

**Test:** `npx vitest run tests/orchestra/sprint-controller.test.ts`

**NO-GO:** Ambient/synthetic DONE returns, status publication becomes fail-open, tests skip cases,
or assertions are weakened instead of supplying required authority evidence.

## Task 12: Close the implementation sprint with one cross-slice wiring contract

- Files: tests/orchestra/recovery-residual-wiring.integration.test.ts
- Scope: tests/orchestra/recovery-residual-wiring.integration.test.ts
- Dependencies: Task 3, Task 7, Task 10, Task 11

Create one hermetic integration contract that executes the real production call graph for terminal
COMPLETE and ABORTED log projection, accepted-repair descendant cancellation, exact-run provider
interval retirement and canonical status publication. Assert production imports/callers rather
than fixture-local reimplementations and verify no unrelated tracked file is written.

**Test:** `npx vitest run tests/orchestra/recovery-residual-wiring.integration.test.ts`

**NO-GO:** Any feature is reachable only from tests, the four slices use conflicting settlement
identity, a projection becomes authority, or proof requires build/full-suite/provider calls.
