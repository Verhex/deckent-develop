# MASTER3178 — pre-worker startup latency map (764-001)

**Status:** measurement/design readiness only. No latency fix, runtime change, provider launch, or completion claim is made. **Observation date:** 2026-09-14 UTC. This is a bounded read of the two supplied evidence artifacts and five supplied source files; no live history scan, raw `memory.db`, credentials, custody, or auth state was read.

## TR executive finding

R17 measures **start→assignment = 550.222 s (9m10s)** and explicitly names “start preflight” as the next attribution target; it also says there is no whole-start/8-task performance closure. R16 separately measures one terminal-authority call at **41,971.269 ms**, a second at **40,109.464 ms**, and one process-local verified-read snapshot at **1,824.444 ms**. Those are not startup timings and cannot be substituted for them.

The 762 retention repair is therefore distinct from the remaining startup scan: the verified-read snapshot reduced repeated retained-observation work in a bounded diagnostic, while startup still contains an approved-flow/history discovery scan and a recovery admission scan whose production cost is unmeasured at the boundary. The smallest safe repair is not to remove or parallelize history. First add an admitted, bounded startup-discovery profile; then optimize only the measured producer or consumer while preserving authority and HOLD semantics.

**Decision:** HOLD implementation. Require a measurement-only profile and exact host-proof registration before any optimization. No timing target or causal closure is asserted.

## Evidence ledger and hashes

| Ref | Measured/observed fact | Time domain and limit | Meaning / non-meaning |
|---|---|---|---|
| `r17/dogfood/ANALYSIS.md` | R17 monotonic CLI `1865.271 s`; start→assignment `550.222 s`; assignment→result `179.017 s`; 1/1 DONE, CLI exit 0 | R17 report; different-task comparison to R16 | Real interval; no component attribution, p95, or whole-start closure |
| `r17/dogfood/ANALYSIS.md` | “Start preflight 9min” and repeated reconciliation/other reads are next targets | Narrative priority, not a component timer | Investigation target, not causal proof |
| `r16/RESULT.md` | 41,971.269 ms and 40,109.464 ms terminal-authority calls; profiler sample total 43,248 ms | Process-local wall-clock/profiler domains; inclusive methods overlap | Repeated custody observation is expensive in that diagnostic; method times must not be summed |
| `r16/RESULT.md` | Snapshot 1,824.444 ms; 231 distinct observations, 204 observation hits, 181 semantic hits | Bounded Linux x64 diagnostic; max 100,000 entries/64 MiB/10 s | Supports the existing retention boundary; not startup latency, p95, platform matrix, or end-to-end proof |
| R23 recovery RESULT | Not available in declared read scope; bounded startup directory was empty | No observation made | No R23 timing/state may be inferred |

SHA256 references:

- `r16/RESULT.md`: `dc2a676d1fab8842515fc8e6ee6106b57b4b6145ab8c800de317573d384339c0`
- `r17/dogfood/ANALYSIS.md`: `58fa0302e79a08a56bfcc1cbdd16d2d23bf3b3641ad6edcc392c28069d3c121c`
- `src/cli/commands/start.ts`: `675264f02b851f466ca68f9b2abd33c4045c2090dd46c41244eee04123d63a38`
- `src/orchestra/exact-plan-start-service.ts`: `33264a45207461cc9c5356ec431716abd36a42c03cff05c91b0d062442a2e863`
- `src/orchestra/spawn-backend-docker.ts`: `4ad9bd8eba622915b656e9ff68b895eb0d313719a9e15a72b2e12f6f9cc924dd`
- `src/orchestra/sprint-controller.ts`: `02acb776e7f0d92112febb1653e2cf09c83e009c6dda136759771550cbdaaf42`

## Producer → consumer map (exact source paths)

1. **CLI provider gate:** `src/cli/commands/start.ts:479-500` loads config and calls `preflightCliBrainProviderAuthority`; typed HOLD returns before continuation. This is an authority gate, not the history timer.
2. **Environment preflight:** `src/cli/commands/start.ts:940-943` calls `runStartEnvironmentPreflight` and returns on failure. Its internals are outside the allowed read scope; no sub-check is blamed.
3. **Approved-flow/history producer:** `src/cli/commands/start.ts:945-985` runs `listFlowIds(root)` → `loadApprovedSnapshot` → `loadRunHandle` → coordinator `getFlow`/terminal-state check → sort. Source comments at `:967-976` record a prior 21-retired-flow mismatch. This is a source hypothesis, not measured attribution.
4. **Exact admission consumer:** `src/orchestra/exact-plan-start-service.ts:1596-1642` executes the prepared plan and calls `admitExactRunAttempt` in `onExecutionAdmitted`; lifecycle publication follows admission. Preserve this ordering and duplicate/terminal behavior.
5. **Recovery producer:** `src/orchestra/spawn-backend-docker.ts:5515-5567` calls `listDispatchAdmissionsForRecovery` with `maxEntries:100_000`, `maxNameBytes:128`, and a 10-second deadline, then iterates held/admitted/reserved-pending entries and emits typed unresolved issues.
6. **Retention consumer:** `src/orchestra/spawn-backend-docker.ts:5569-5572` optionally wraps the same operation in `withVerifiedReadSnapshot` (100,000 entries, 64 MiB, 10 seconds). R16 measured this boundary in a separate diagnostic, not startup admission.
7. **Worker spawn:** `src/orchestra/spawn-backend-docker.ts:22210-22235` probes Docker before image lookup. This is post-admission preparation, not history discovery.
8. **Downstream proof boundaries:** `src/orchestra/sprint-controller.ts:3079-3114` runs the pre-spawn scope gate; `:3830-3845` evaluates discovered results before dependency handoff and treats missing receipts as hard HOLD. Neither proves the earlier scan is fast.

## Smallest repair package

### Phase A: measurement only

- Profile the existing startup discovery boundary without changing predicates, ordering, fail-soft behavior, authority decisions, or limits.
- Record only operation name, monotonic start/end, bounded counts, tenant/project identity, flow/sprint identity already available, typed outcome (`ready`, `hold`, `fail-soft-empty`), and exact source/build digest. Do not record raw snapshots, credentials, or tenant payloads.
- Register a dedicated host-proof harness in the same closure DAG. It must call the real compiled startup path and bind the profile to exact asset hashes and runtime identity.

### Phase B: one hypothesis at a time

After Phase A, choose exactly one: (a) producer repair using an authoritative bounded index/query while preserving terminal-state filtering, approval identity, tenant/project isolation, and fail-soft semantics; or (b) consumer repair capturing one verified-read snapshot for the complete operation and preventing nested/repeated rereads, as R16 recommends for terminal revalidation. Do not remove history discovery, weaken bounds, cache across tasks/projects/attempts, or infer `ready` from incomplete data.

### Bounded file list (not authorization to edit)

1. `src/cli/commands/start.ts` — only if the measured producer is the CLI scan.
2. `src/orchestra/spawn-backend-docker.ts` — only if recovery discovery/snapshot is measured.
3. `src/orchestra/exact-plan-start-service.ts` — only for an explicit existing-operation contract; preserve CAS and duplicate-terminal behavior.
4. `src/orchestra/sprint-controller.ts` — only if controller handoff is the measured boundary; preserve receipt HOLD.
5. Dedicated targeted tests and `scripts/production-wiring-host-proof-harness.mjs` — exact names to be admitted by the planner.

No source/config/runtime/task/provider/host-proof file was changed in this task.

## Admission, profile, and proof contract

**Admission:** this document does not admit implementation. The planner must bind exact scope, dependency settlement, tenant/project, attempt identity, and file list. An unsettled dependency is HOLD; do not busy-wait or call `processQueue`.

**Profile:** missing, stale, foreign, or malformed profile evidence is typed HOLD. A profile is diagnostic evidence, never authority to bypass provider, custody, approval, scope, or receipt gates.

**Host proof:** register one production-wiring proof checking source/build identity, real binary path, startup invocation, exact boundary, tenant/project namespace, bounded limits, typed HOLD/fail-soft cases, and durable evidence hashes. Test-only mocks are supporting evidence only.

Future acceptance commands, to be named exactly by the admitted planner:

```text
npx vitest run <exact targeted startup/profile test files>
npx tsc --noEmit
node scripts/production-wiring-host-proof-harness.mjs <exact admitted arguments>
<exact compiled real-binary bounded-start command>
```

These commands were not run here. No live start, build, provider launch, cleanup, or full test suite was run.

## Negative/security/platform/tenant scope

- Do not turn R17's 550.222-second interval into a component timing; do not turn R16's 1.824-second snapshot into startup latency; do not sum overlapping instrumentation; do not claim p95, 8-task, cross-platform, or end-to-end improvement.
- Do not read/expose raw `memory.db`, credentials, auth state, real custody, provider receipts, or worker payloads.
- Preserve fail-soft advisory flow reads, but keep hard exact-plan CAS authoritative; preserve approval binding, terminal-state semantics, tenant/project/attempt isolation, and existing count/size/deadline bounds.
- No global, cross-tenant, cross-project, or cross-attempt cache; no cache lifetime beyond the exact operation.
- Evidence is Linux x64 only. Windows/macOS and other Docker/runtime combinations remain HOLD until real-binary evidence exists.

## Remaining unknowns

1. Which sub-operation dominates start→assignment: provider/config preflight, environment preflight, flow enumeration, coordinator reads, recovery admission, or an out-of-scope caller?
2. How many flow IDs, snapshots, handles, coordinator reads, and recovery entries occurred, with per-operation monotonic durations?
3. Does production startup invoke recovery discovery before worker admission for the tested mode?
4. Is the latest R23 recovery RESULT available to the planner? It was not in this task's read scope.
5. What platform/tenant matrix and maximum history remain within the verified snapshot bounds?

The next worker should answer these with bounded instrumentation and registered host proof. This wave is not completion of latency or observability fixes.
