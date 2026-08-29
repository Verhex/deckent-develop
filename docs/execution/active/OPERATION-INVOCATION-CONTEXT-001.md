# OPERATION-INVOCATION-CONTEXT-001 — Outcome Capsule

OUTCOME_ID: OPERATION-INVOCATION-CONTEXT-001
DOGFOOD_MODE: ON
BASE_SHA: 0fb4e13c1

## Authority

- MASTER row: `4033 OPERATION-INVOCATION-CONTEXT-001`; parent `4030 OPERATION-001`
- Dependency: authenticated `4032 OPERATION-CATALOG-CONVERGENCE-001 = DONE`
- Owner admission: child DAG accepted; continue to the next plan
- Owner orchestration correction: Deckent is a parallel-agent ecosystem; task count is derived from
  the dependency graph and may exceed twenty, never forced to one
- Mode/execution: `DOGFOOD_MODE=ON`, Codex authority, root `main`, `DIRECT_MAIN`
- Commit authorized; push is not authorized; XVerify remains owner-deferred

## Admission Snapshot

- Base `0fb4e13c1`; `main` twelve commits ahead of `origin/main` at admission
- Runtime `IDLE/READY`; no sprint/coordinator/worker/container; current-dist bot PID `490006`
- `.tasks` has zero files/children after exact evidence-backed retirement
- `sprint-711` and `sprint-712` remain truthfully `ABORTED`
- Approved guard has no reusable APPROVED flow; force-replan is mandatory
- Unrelated pre-existing worktree/runtime changes are preserved

## ADR-D-007 Manual Recovery Record

- Authority: Alperen live approval on 2026-08-29 to force-finalize, repair manually, continue the
  dependency DAG, verify, build, and commit; push remains unauthorized and XVerify deferred
- Failed execution: `sprint-713`, durable terminal outcome `ABORTED`, event seq 40
  `SPRINT_TERMINAL_ABORTED`, logical settlement digest
  `6a6b9c9ab0bb210f2495e39789d93667a33729ad2a415f4b81f03cc2a98db264`
- Containment: coordinator generation 4 retired with verified-dead PID `1177608`; no 713
  coordinator, evaluator, worker, or container remains; archive manifest/seal and all 100 artifacts
  verify without mismatch
- Truth boundary: the aborted run is never rewritten, resumed, or represented as successful. Its
  first three worker outputs are inputs to a separate manual recovery and receive no acceptance
  credit until independent review and fresh verification pass
- Recovery scope: the seventeen 4033 product paths, the exact blocking compatibility repair recorded
  below, this authority capsule, and authenticated settlement projections; 4034+ consumer/effect
  work remains closed
- Runtime residue: `.tasks` retains exact terminal hot-state artifacts under cleanup `HOLD`; no
  broad or manual deletion is authorized

## Outcome and Authority Boundary

4033 owns a neutral versioned invocation context: exact operation, invocation/transaction/operation-
attempt/correlation/tagged-causation, lossless principal, explicit tenant/project/resource/environment,
catalog-bound idempotency, caller-supplied time, canonical transport, and bounded in-process async
scope. It neither decides permission/approval nor wires ingress/effect consumers.

Excluded: 4034 durable-effect causality; 4035–4038 registries; 4039 and 4041–4049 live propagation/
migration; 4040 permission/enforcement; 4050 approval authority; catalog/baseline/package mutation;
MASTER/Closure settlement during workers; XVerify; push/publish/auth mutation.

## Decomposition-Derived Parallel DAG

Ten nodes result from the contract responsibilities, not a task cap:

1. `4033-CTX-IDENTITY` — identity, tagged causation, transition algebra
2. `4033-CTX-SUBJECT` — lossless principal and explicit neutral scope
3. `4033-CTX-IDEMPOTENCY` — exact catalog-bound idempotency
4. `4033-CTX-ENVELOPE` — joins 1+2+3 into schema v1
5. `4033-CTX-ASYNC` — lifetime-bounded ALS after 4
6. `4033-CTX-TRANSPORT` — canonical bounded codec after 4
7. `4033-PROOF-CHILD-PROCESS` — async process boundary after 6
8. `4033-PROOF-WORKER-THREAD` — thread isolation after 5+6
9. `4033-PROOF-PLATFORM` — platform determinism after 2+6
10. `4033-VERIFY-FANIN` — direct dependency on all nine upstream nodes; sole sink

Expected waves: `{1,2,3}` → `{4}` → `{5,6}` → `{7,8,9}` → `{10}`. Effective concurrency is
config/capacity/collision resolved; no worker count is authored.

## Exact Product Mutation Authority

1. `src/core/operation-invocation-identity.ts`
2. `tests/core/operation-invocation-identity.test.ts`
3. `src/core/operation-invocation-subject.ts`
4. `tests/core/operation-invocation-subject.test.ts`
5. `src/core/operation-invocation-idempotency.ts`
6. `tests/core/operation-invocation-idempotency.test.ts`
7. `src/core/operation-invocation-context.ts`
8. `tests/core/operation-invocation-context.test.ts`
9. `src/core/operation-invocation-async-scope.ts`
10. `tests/core/operation-invocation-async-scope.test.ts`
11. `src/core/operation-invocation-transport.ts`
12. `tests/core/operation-invocation-transport.test.ts`
13. `tests/core/operation-invocation-child-process.test.ts`
14. `tests/core/operation-invocation-worker-thread.test.ts`
15. `tests/core/operation-invocation-platform.test.ts`
16. `tests/core/operation-invocation-conformance.test.ts`
17. `scripts/lint-test-hermeticity.mjs` (source-derived fingerprint projection only)

All incomparable-task write sets are disjoint; task 10 alone writes conformance/fingerprint files.

## Blocking Compatibility Repair Amendment

- Later owner authority: finish the admitted work without leaving a known failing required test and
  complete verification before transfer.
- Independent diagnosis: both read-only reviewers classified the four failing ingress-audit fixtures
  as `BLOCKS_CURRENT_DONE`; the regression was introduced by 4032 commit `fa5bcd319`, not by the
  4033 implementation. Moving canonical `Op.*` declarations from `index.ts` to generated
  `generated.ts` left the 4031 auditor accepting only the old declaration provenance.
- Exact additional write authority: `scripts/audit-operation-ingress.mjs` and
  `tests/scripts/audit-operation-ingress.test.ts`; the already-authorized
  `scripts/lint-test-hermeticity.mjs` may ratchet only its source-derived fingerprints.
- Contract: canonical export authority remains `index.ts`; only the exact realpath-resolved canonical
  generated declaration file may supply an operation ID, catalog membership/taxonomy remains
  fail-closed, and a generated-file lookalike must be rejected.
- This amendment does not reopen or rewrite sprint-713, expand 4033 into 4034+, or alter the 4031/4032
  terminal history. It repairs their live compatibility as a prerequisite of truthful 4033 closure.

## Contract Decisions

- Exact operation resolution reuses the canonical catalog; no copied identifiers or id-only upgrade.
- IDs are branded/validated and caller-supplied; operation attempt has its own namespace.
- Root causation is `null`; other causation is exact tagged data, never a naked string.
- Retry keeps invocation/transaction/correlation/idempotency and replaces attempt; child/sibling gets
  new invocation+attempt; new transaction gets new transaction/invocation/attempt.
- `VerifiedPrincipal` remains lossless. Tenant/resource differences remain policy inputs, not verdicts.
- Scope has no cwd/env/local/transport fallback and reuses `darwin|linux|win32|wsl`.
- Idempotency exactly matches catalog `NONE|KEYED|NATURAL` without executing deduplication.
- Context is exact-schema, JSON-only, deeply copied/frozen, policy/approval/effect-free.
- Transport is bounded canonical UTF-8 with domain-separated digest and original-byte validation.
- ALS uses `run`, explicit absence, isolation, and post-settlement invalidation; it does not cross
  process/thread boundaries. Those boundaries use the codec.
- Simulation proves deterministic semantics only; native execution is separately evidenced or HOLD.

## Plan Admission Gate

1. Invoke the actual planner only through current dist with `start --dry-run --force-replan
   --force-scope`; never consume a stale approved flow.
2. Obtain a fresh durable approved snapshot with the exact seventeen-path allowlist.
3. Verify snapshot and `.tasks` projection equality from disk.
4. Require exactly the ten authored titles/dependencies, topology `PASS`, findings/synthetic edges
   empty, five waves with real parallel width, pairwise-disjoint incomparable writes, exact allowlist
   union, one verification command per task, one terminal sink named `4033-VERIFY-FANIN`, and every
   node reaching it.
5. Reject any mismatch canonically; never hand-edit task projections. Start only the exact verified
   flow prefix, never bare `start`.

## DONE Criteria and Stop Conditions

Workers run scoped commands only. After terminal quiescence the supervisor runs full targeted proof,
catalog/4031 invariants, lint, canonical bot stop/build/compiled entrypoint/native checks/current-dist
restart, exact diff/runtime remeasurement, independent read-only verification, and authenticated
Closure OS settlement. Technical success cannot rewrite an aborted run or directly mark MASTER DONE.

Stop `NO_GO/HOLD` for topology/scope mismatch, shared incomparable writer, second sink, implicit
identity/scope authority, permissive parsing, policy/approval output, fake native proof, stale-flow
reuse, live writer conflict, auth mutation, build during sprint, unrelated dirt mutation, or required
out-of-scope change.
