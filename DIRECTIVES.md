# MASTER 4033: OPERATION-INVOCATION-CONTEXT-001

> Owner-admitted 2026-08-29 child of `4030 OPERATION-001`, dependent on authenticated
> `4032 OPERATION-CATALOG-CONVERGENCE-001 = DONE`. Exact outcome capsule:
> `docs/execution/active/OPERATION-INVOCATION-CONTEXT-001.md`. This run owns one product
> outcome. Its ten-node DAG is derived from ten independently testable responsibilities;
> ten is neither a platform cap nor a precedent for later outcomes.

## Goal

Create the canonical, versioned, provider-neutral operation invocation context that later CLI,
REPL, MCP, Desktop, Terminal, API, autonomous, process, connector, and internal-effect wiring can
carry. The immutable contract binds exact `operationId@version`, invocation/transaction/attempt/
correlation/causation identity, lossless principal, explicit tenant/project/resource/environment,
catalog-consistent idempotency, and caller-supplied time. It defines data and lineage only: it does
not grant permission, decide approval, dispatch an operation, bind an ingress, or claim a durable
effect.

## Execution Contract

- Preserve the authored ten-node DAG and exact dependencies below. Wave 1 has three independent
  branches; `4033-CTX-ENVELOPE` joins them; async scope and transport then separate; three boundary
  proofs run independently; `4033-VERIFY-FANIN` is the sole terminal sink and directly depends on
  every upstream node. Same-wave write sets are disjoint.
- Provider, model, effort, auth, backend, worker pool, and attained concurrency are resolved from
  effective config and capacity. Do not hardcode them or mutate login/auth state.
- Reuse `resolveOperationReference`, `VerifiedPrincipal`, and `GlobalScopePlatform`. Do not create a
  second operation catalog, principal authority, platform enum, permission model, approval model,
  receipt authority, tracing system, or audit authority.
- Do not widen `InvocationReceipt`, `ExecutionRequest`, capability runtime/broker, run-flow,
  event/audit, approval, ingress, registry, or effect-writer contracts. Their later migration belongs
  to 4034–4039 and 4041–4049. This dependency-bound foundation cannot close parent 4030 alone.
- All authority-bearing IDs are opaque, bounded, control-character-free, namespace-distinct values.
  Operation attempt identity is not a task, run, provider, settlement, or generation attempt.
  Factories, entropy, clocks, cwd, env, locale, transport labels, and implicit `local` defaults are
  outside the canonical contract; callers provide identity and time explicitly.
- Causation is an exact tagged union, never an unqualified string. Root causation is explicit `null`;
  operation causation identifies the exact upstream invocation and attempt. Other accepted namespaces,
  if any, must be enumerated and exact rather than open metadata.
- Retry retains invocation, transaction, correlation, operation, and idempotency identity while
  replacing only the operation attempt. Child/sibling operations use new invocation and attempt IDs,
  retain the intended transaction/correlation, and identify the upstream attempt as causation. A new
  transaction replaces transaction/invocation/attempt and preserves correlation only explicitly.
- Principal, tenant, project, resource ownership, environment, adapter, and platform are lossless
  policy inputs. Cross-field differences are not silently repaired and do not become allow/deny
  decisions. The context contains no grant, role mapping, risk verdict, approval state, enforcement
  posture, arbitrary metadata, secret, credential, or host-absolute path.
- Idempotency binding must match the exact catalog class `NONE|KEYED|NATURAL`; it validates shape but
  performs no deduplication or effect.
- Context input is exact-schema, JSON-only, deeply copied, deeply frozen, and deterministic. Reject
  extra/missing keys, unsupported schema, unsafe/non-finite numbers, cycles, accessors, `toJSON`,
  prototypes, malformed RFC3339 instants, catalog drift, and invalid identities with typed failures.
- Cross-boundary transport is a bounded canonical envelope
  `{schemaVersion,contextSha256,context}`. SHA-256 is domain-separated; decode checks exact keys,
  UTF-8 size, digest, schema, canonical byte equality, and complete context validation. Tamper,
  truncation, duplicate/extra keys, noncanonical bytes, and catalog drift fail closed.
- Async propagation uses `AsyncLocalStorage.run`, never `enterWith` or module-global fallback.
  Absence is explicit/typed; nesting and concurrency isolate exactly; scope lifetime is invalidated
  after callback settlement so detached continuations cannot retain stale authority.
- Child-process and worker-thread transfer use only the transport codec. ALS is never claimed to
  cross a process, thread, tmux, Docker, connector, or provider boundary.
- Platform fixtures cover canonical `darwin|linux|win32|wsl` without host path semantics. Simulated
  fixtures prove deterministic contracts only; terminal supervisor proof must label genuinely
  unreachable native adapters `HOLD`, never claim native coverage from simulation.
- Tests are hermetic: injected data, async process/thread APIs, no `spawnSync`, network, external
  services, real user config, shared mutable fixtures, shell-dependent quoting, or hidden host state.
- Workers run only their scoped `Test` command. Full lint/build, real compiled-entrypoint checks,
  native-adapter proof, bot restart/reconnect, runtime remeasurement, MASTER disposition, and Closure
  OS settlement belong to the supervisor after terminal run state.
- No package/dependency/script/catalog/baseline change, consumer wiring, docs/MASTER mutation, commit,
  push, publish, XVerify, or file outside the exact task union is authorized.
- Missing/extra tasks or edges, a second sink, shared incomparable writer, scope expansion, implicit
  authority fallback, permissive parse, policy/approval output, live sprint conflict, or necessary
  out-of-scope mutation is typed `NO_GO/HOLD`; do not repair projections by hand.

## Task 1: 4033-CTX-IDENTITY — Operation identity and causal transition algebra
- Files: src/core/operation-invocation-identity.ts, tests/core/operation-invocation-identity.test.ts
- Reads: src/core/run-flow-contract.ts, src/core/work-model.ts, src/core/event-stream.ts, src/core/audit-writer.ts, src/core/invocation-receipt.ts
- Dependencies: none
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-identity.test.ts --reporter=dot

### Description

Define branded, runtime-validated invocation, transaction, operation-attempt, correlation, and
idempotency-key identities plus an exact tagged causation union. Define pure root, retry, child,
sibling, and new-transaction transition inputs/results with explicit retain/replace invariants.
All IDs and timestamps are caller-supplied; no import-time or ambient generation exists.

### goNogo
- goCriteria: Identity namespaces cannot be interchanged at compile time or runtime; root causation is null; operation causation names exact invocation+attempt; transition tables prove retry/child/sibling/new-transaction invariants; malformed, padded, control-bearing, oversized, collision, or wrong-namespace values fail with stable typed errors
- nogo: Plain strings become canonical without validation; causation is untagged; retry changes invocation or reuses attempt; builders read clock/random/process/env; malformed values are trimmed or repaired
- techDebtAcceptable: None

## Task 2: 4033-CTX-SUBJECT — Lossless principal and explicit neutral scope
- Files: src/core/operation-invocation-subject.ts, tests/core/operation-invocation-subject.test.ts
- Reads: src/core/principal.ts, src/core/global-scope-resolver.ts, src/core/tenant-context.ts, src/core/work-model.ts, src/core/capability-runtime.ts, src/core/capability-broker.ts
- Dependencies: none
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-subject.test.ts --reporter=dot

### Description

Define an immutable, lossless invocation subject carrying `VerifiedPrincipal` and explicit tenant,
project, neutral resource ownership/type/id, environment id, adapter id, and canonical
`GlobalScopePlatform`. Preserve facts without calling ambient tenant resolution or embedding
capability/enforcement state. Differences between principal, invocation, and resource tenants remain
lossless policy inputs for 4040 rather than decisions in 4033.

### goNogo
- goCriteria: verifiedBy and all principal facts survive; tenant/project/resource/environment/adapter/platform are explicit and bounded; darwin/linux/win32/wsl fixtures round-trip; nested values are immutable; missing, extra, malformed, padded, or control-bearing data fails deterministically without policy output
- nogo: ActorContext replaces VerifiedPrincipal; cwd/env/local/transport supplies scope; capability ResourceRef or authorityMode leaks in; mismatched tenancy is silently normalized or decided
- techDebtAcceptable: None

## Task 3: 4033-CTX-IDEMPOTENCY — Exact catalog-bound idempotency contract
- Files: src/core/operation-invocation-idempotency.ts, tests/core/operation-invocation-idempotency.test.ts
- Reads: src/core/operation-catalog/index.ts, src/core/operation-catalog/generated.ts, src/core/operation-catalog/catalog.v1.json
- Dependencies: none
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-idempotency.test.ts --reporter=dot

### Description

Resolve only exact `operationId@version` through the canonical catalog and construct the matching
tagged `NONE`, `KEYED`, or `NATURAL` idempotency binding. Validate authority data without executing
deduplication, choosing current versions, or copying catalog identities into local constants.

### goNogo
- goCriteria: exact operation resolution distinguishes unknown ID and version mismatch; every catalog idempotency class has one exact binding shape; KEYED validates a branded key; NONE forbids a key; NATURAL carries only its exact declared identity material; all results are immutable and policy/effect-free
- nogo: a copied catalog list or id-only lookup receives credit; current version is inferred; mismatched/unknown class is accepted; validation performs storage, dispatch, permission, approval, or deduplication
- techDebtAcceptable: None

## Task 4: 4033-CTX-ENVELOPE — Canonical immutable context schema v1
- Files: src/core/operation-invocation-context.ts, tests/core/operation-invocation-context.test.ts
- Reads: src/core/operation-invocation-identity.ts, src/core/operation-invocation-subject.ts, src/core/operation-invocation-idempotency.ts, src/core/operation-catalog/index.ts
- Dependencies: Task 1, Task 2, Task 3
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-context.test.ts --reporter=dot

### Description

Define the sole public operation invocation context schema v1 and exact validator/builder. Atomically
bind identities, causation, exact operation reference, subject/scope, catalog-consistent idempotency,
and caller-supplied RFC3339 creation instant. Deep-copy/freeze JSON-only input and enforce structural
and identity invariants without interpreting authorization or approval.

### goNogo
- goCriteria: one exact versioned envelope contains every required dimension; input mutation cannot alter it; root/retry/child/sibling/new-transaction contexts remain unambiguous; exact-key, JSON-safety, timestamp, identity, catalog, and idempotency validation fail closed with typed diagnostics
- nogo: any required authority field is optional/defaulted; arbitrary metadata or secret fields are admitted; operation version upgrades silently; mutable aliases/accessors/toJSON/prototypes survive; allow/deny/approval/grant state appears
- techDebtAcceptable: None

## Task 5: 4033-CTX-ASYNC — Lifetime-bounded in-process async scope
- Files: src/core/operation-invocation-async-scope.ts, tests/core/operation-invocation-async-scope.test.ts
- Reads: src/core/operation-invocation-context.ts, src/core/tenant-context.ts
- Dependencies: Task 4
- Priority: HIGH
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-async-scope.test.ts --reporter=dot

### Description

Provide an `AsyncLocalStorage.run` carrier for already validated contexts with explicit current/
required semantics, nested restoration, concurrent isolation, rejection cleanup, and post-settlement
lifetime invalidation. No global fallback, implicit synthesis, `enterWith`, or cross-boundary claim.

### goNogo
- goCriteria: sync/async/nested/concurrent/rejection tests prove exact propagation and restoration; absence has a typed result/error; detached timers after callback settlement cannot recover authority; only validated frozen contexts enter storage
- nogo: enterWith/module-global/tenant fallback is used; missing context is fabricated; nested, rejected, concurrent, or detached continuations leak context; raw objects are accepted
- techDebtAcceptable: None

## Task 6: 4033-CTX-TRANSPORT — Bounded canonical cross-boundary envelope
- Files: src/core/operation-invocation-transport.ts, tests/core/operation-invocation-transport.test.ts
- Reads: src/core/operation-invocation-context.ts, src/core/audit-writer.ts, src/core/output-digest.ts, src/core/invocation-receipt.ts
- Dependencies: Task 4
- Priority: CRITICAL
- Agent: implementer
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-transport.test.ts --reporter=dot

### Description

Implement the only 4033 cross-process codec as exact bounded
`{schemaVersion,contextSha256,context}` canonical UTF-8. Domain-separate its SHA-256, verify the
original bytes are canonical on decode, and reconstruct a fully validated frozen context. Reject
extra/duplicate/missing keys, invalid UTF-8/JSON, oversize, tamper, truncation, noncanonical order,
unsupported schema, and catalog drift.

### goNogo
- goCriteria: encode/decode is byte-deterministic, bounded, lossless, and digest-complete; every authority-bearing field changes the digest; decode proves hash, original-byte canonical equality, exact envelope/context schema, and catalog identity before returning frozen data
- nogo: JSON.parse output is trusted; unknown/duplicate fields or versions are ignored; decoder reserializes and accepts noncanonical originals; locale/path/platform/order affects bytes; malformed data is repaired
- techDebtAcceptable: None

## Task 7: 4033-PROOF-CHILD-PROCESS — Async process-boundary transport proof
- Files: tests/core/operation-invocation-child-process.test.ts
- Reads: src/core/operation-invocation-context.ts, src/core/operation-invocation-transport.ts, tests/core/invocation-receipt-store.test.ts
- Dependencies: Task 6
- Priority: HIGH
- Agent: test-guardian
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-child-process.test.ts --reporter=dot

### Description

Prove canonical bytes cross an asynchronous Node child-process boundary and are decoded into the
same immutable context. The child receives only explicit bounded transport input. Tamper/truncation,
stderr/exit, timeout, and cleanup paths settle deterministically without shell, sync spawn, network,
user config, ambient ALS, or host-path assumptions.

### goNogo
- goCriteria: async process round-trip preserves exact bytes/digest/context; malformed/tampered/oversize input fails typed; timeout/early exit/cleanup settles once and leaves no child; test is portable and hermetic
- nogo: spawnSync or shell interpolation is used; environment/user config/temporary global state carries authority; ALS is claimed across process; process leakage or platform-only quoting exists
- techDebtAcceptable: None

## Task 8: 4033-PROOF-WORKER-THREAD — Worker-thread transport and isolation proof
- Files: tests/core/operation-invocation-worker-thread.test.ts
- Reads: src/core/operation-invocation-context.ts, src/core/operation-invocation-transport.ts, src/core/operation-invocation-async-scope.ts
- Dependencies: Task 5, Task 6
- Priority: HIGH
- Agent: test-guardian
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-worker-thread.test.ts --reporter=dot

### Description

Prove worker threads receive only codec bytes, never inherited ALS authority, and reconstruct an
independent frozen context. Concurrent workers, malformed messages, errors, termination, and cleanup
must settle deterministically with no shared mutable fixture.

### goNogo
- goCriteria: worker starts without ambient context, exact transport round-trip succeeds, concurrent workers isolate, tamper fails typed, and all success/error/termination paths close once without leaked workers
- nogo: structured-cloned raw context bypasses codec; ALS is claimed to cross the thread; workers share mutable authority; error/termination hangs or leaks
- techDebtAcceptable: None

## Task 9: 4033-PROOF-PLATFORM — Every-environment deterministic contract matrix
- Files: tests/core/operation-invocation-platform.test.ts
- Reads: src/core/global-scope-resolver.ts, src/core/operation-invocation-subject.ts, src/core/operation-invocation-context.ts, src/core/operation-invocation-transport.ts
- Dependencies: Task 2, Task 6
- Priority: HIGH
- Agent: test-guardian
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-platform.test.ts --reporter=dot

### Description

Exercise darwin/linux/win32/wsl subject and adapter fixtures, Unicode, locale/timezone variants, and
POSIX/Windows/WSL-looking opaque resource IDs. Prove host-neutral canonical bytes without claiming
simulated fixtures are native execution. Unsupported platform tags fail honestly.

### goNogo
- goCriteria: canonical platform values and adapters round-trip; insertion order, locale, timezone, newline, Unicode, and path-looking opaque IDs have specified deterministic behavior; unsupported platform tags fail; assertions explicitly distinguish simulation from native proof
- nogo: another platform enum is invented; path normalization mutates opaque identity; current host controls expected bytes; simulated fixtures are reported as Windows-native/WSL execution
- techDebtAcceptable: None

## Task 10: 4033-VERIFY-FANIN — Full conformance and hermetic integration seal
- Files: tests/core/operation-invocation-conformance.test.ts, scripts/lint-test-hermeticity.mjs
- Reads: src/core/operation-invocation-identity.ts, src/core/operation-invocation-subject.ts, src/core/operation-invocation-idempotency.ts, src/core/operation-invocation-context.ts, src/core/operation-invocation-async-scope.ts, src/core/operation-invocation-transport.ts, tests/core/operation-invocation-identity.test.ts, tests/core/operation-invocation-subject.test.ts, tests/core/operation-invocation-idempotency.test.ts, tests/core/operation-invocation-context.test.ts, tests/core/operation-invocation-async-scope.test.ts, tests/core/operation-invocation-transport.test.ts, tests/core/operation-invocation-child-process.test.ts, tests/core/operation-invocation-worker-thread.test.ts, tests/core/operation-invocation-platform.test.ts
- Dependencies: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9
- Priority: CRITICAL
- Agent: test-guardian
- Test: VITEST_MAX_FORKS=2 npx vitest run tests/core/operation-invocation-identity.test.ts tests/core/operation-invocation-subject.test.ts tests/core/operation-invocation-idempotency.test.ts tests/core/operation-invocation-context.test.ts tests/core/operation-invocation-async-scope.test.ts tests/core/operation-invocation-transport.test.ts tests/core/operation-invocation-child-process.test.ts tests/core/operation-invocation-worker-thread.test.ts tests/core/operation-invocation-platform.test.ts tests/core/operation-invocation-conformance.test.ts --reporter=dot && node scripts/lint-test-hermeticity.mjs

### Description

Compose the public contracts into root→retry→child/sibling→new-transaction lifecycles, canonical
transport, async isolation, process/thread transfer, catalog idempotency, principal preservation,
platform determinism, and adversarial exact-schema rejection. Prove the context cannot express or
produce permission, approval, grant, enforcement, dispatch, or effect results. Update hermeticity
fingerprints only from the source-derived scanner without weakening its rules or inventory.

### goNogo
- goCriteria: all nine upstream branches compose through public APIs; lifecycle and boundary proofs preserve exact identity/causation/digest/immutability; adversarial input cannot enter a valid context; no authority outcome is representable; all targeted tests and the hermetic scanner pass with source-derived fingerprints and zero new violations
- nogo: fan-in omits an upstream node or deep-imports a competing contract; any policy/approval/effect output is produced; boundary proof uses hidden ambient state; hermetic rules/counts are weakened or hand-forged
- techDebtAcceptable: None

## Terminal Supervisor Proof

After terminal run state and runtime quiescence, the supervisor proves exact topology/projections and
scope, every targeted test, catalog/4031 invariants, `npm run lint`, then stops the bot canonically,
runs `npm run build`, exercises compiled real entrypoints, performs reachable Windows-native plus
WSL2/POSIX checks (unreachable native adapters = typed `HOLD`), restarts/reconnects current dist,
remeasures process/container/worktree state, obtains one independent read-only verification, and
settles through authenticated Closure OS. XVerify remains owner-deferred.
