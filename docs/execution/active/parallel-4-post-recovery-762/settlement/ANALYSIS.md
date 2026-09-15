# 764-002 — Post-task settlement latency map

**Status:** measurement/design readiness only. This document does not claim a latency fix, a production optimization, a successful provider receipt, or sprint completion.

## TR executive finding summary

The remaining latency is most plausibly in the work performed **after an individual task has reached terminal settlement and before cleanup is allowed to finish**, not in the identity fence itself. R16 measured one terminal-authority operation at 41,971.269 ms and a second at 40,109.464 ms, while the same operation under one bounded, process-local verified-read snapshot took 1,824.444 ms. Those are diagnostic observations for one retained-task/Linux run, not a percentile, a platform matrix, or an end-to-end production result. The inclusive method times overlap and must not be summed (R16 RESULT, `Baseline` and `Existing snapshot experiment`).

R17's dogfood comparison records task-settlement→sprint-finalizer at 1,019.787 s versus 709.579 s, but explicitly says the whole effect is not causally attributed. It also identifies the remaining target as synchronous post-settlement orchestration and repeated reconciliation/other reads, while warning that startup preflight was worse in R17. The R17 record says the lifecycle journal's apparent `EXECUTE→EVALUATE` timestamp is actually finalizer entry; it must not be used as evaluation-start timing. Therefore this slice maps producers and consumers and defines a bounded measurement package; it does not convert those observations into a timing claim about any single code path.

R16's retention/snapshot repair should be treated as a separate concern from still-unoptimized startup and post-settlement scanning. A snapshot can bound repeated reads within one operation; it is not permission to cache authority across tasks, attempts, tenants, projects, processes, or lifecycle boundaries. Identity fences, task settlement, and sprint settlement remain distinct.

## Evidence and exact observation sources

| Source | What it establishes | Time domain / limitation | SHA-256 |
|---|---|---|---|
| `docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/RESULT.md` | R16 measured terminal-authority read counts, method instrumentation, one snapshot experiment, candidate production boundary, and Linux-only proof limits | Reported wall-clock timings and process-local instrumentation; profiler sample includes startup; not p95 or end-to-end | `dc2a676d1fab8842515fc8e6ee6106b57b4b6145ab8c800de317573d384339c0` |
| `docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/ANALYSIS.md` | R17 lifecycle comparison, remaining post-result target, startup caveat, and fake phase-event timestamp correction | CLI/stage timestamps are separate domains; different worker tasks; no causal attribution | `58fa0302e79a08a56bfcc1cbdd16d2d23bf3b3641ad6edcc392c28069d3c121c` |
| `src/orchestra/scheduler-effects.ts` | Exact accepted-result settlement performs a backend settlement followed by a terminal-authority reread; registry recovery awaits result authority and can rescan backend state | Current source snapshot; no runtime timing was taken in this investigation | `5f02dbeec9f38de61b3f43a858458490f547cb01738a55f4c9098a2383dc7185` |
| `src/orchestra/sprint-controller.ts` | Cold-recovery loop reads task result authority, settles accepted results, rereads terminal authority, and uses a memoized owning-run scan only as a final predicate | Current source snapshot; memoization is per invocation/per sprint, not cross-run | `02acb776e7f0d92112febb1653e2cf09c83e009c6dda136759771550cbdaaf42` |
| `src/orchestra/sprint-finalizer.ts` | Finalizer builds caller and authoritative result indexes, loads attempt tasks, projects logical results, runs gates, publishes fenced receipt, then performs retention/job/hook work | Current source snapshot; source inspection is not a timing measurement | `7a0335087c09153a7f39fc344da337c8fb3082a04faff049fb5c10e061a3f22e` |
| `src/orchestra/sprint-phases.ts` | Result polling has an in-loop authority read plus a final authority read; RETRO validates authorities and rereads each non-exact task; CLEANUP applies a fixed configurable delay before cleanup | Current source snapshot; no configured delay or runtime duration was read | `172ef81ed6aea45111385699d2e28b2632e52555b5cf22d150e723726d6d79c9` |

The latest R23 recovery `RESULT.md` was not present in the permitted settlement directory and was not included in the exact read-file authority for this worker. No R23 fact is inferred here; the R16/R17 evidence above is the complete evidence used.

## Producer → consumer map

1. **Provider/backend settlement producer:** the exact registry invokes `settleExactDockerAcceptedResult`; after success it calls `readExactDockerAcceptedTaskTerminalAuthority` with both expected identities (`scheduler-effects.ts:796-828`). The consumer is the registry's returned `current`/`hold` state. This reread is mandatory evidence, not disposable overhead.
2. **Task-result authority producer/consumer:** `readTaskResultAuthority` delegates to the authoritative result reader (`scheduler-effects.ts:691-724`); `awaitTaskResultAuthority` waits the terminal promise and reads again (`scheduler-effects.ts:1307-1310`). Cold recovery consumes it in `settleRecoveredExactTerminalAuthorities` (`sprint-controller.ts:1788-1794`), then reads terminal authority again (`sprint-controller.ts:1838-1850` in the current source).
3. **Recovery reconciliation producer:** `reconcileExactLifecycle` calls each backend's `reconcilePendingAttempts`, rehydrates the registry, processes holds, and may check worker inventory (`scheduler-effects.ts:1245-1305`). This is a startup/recovery scan and must not be conflated with task settlement.
4. **Evaluation producer/consumer:** result polling reads authoritative task results on every poll and once after the final sleep (`sprint-phases.ts:2031-2060`). EVALUATE entry asserts authority readiness (`sprint-phases.ts:2149-2153`) and builds a result map (`sprint-phases.ts:2221-2225`).
5. **RETRO/finalizer producer/consumer:** RETRO asserts non-exact task authorities and then reads each authoritative result for the honest-sentinel pass (`sprint-phases.ts:4918-5005`); it calls `finalizeSprint` (`sprint-phases.ts:5011-5019`). The finalizer then builds multiple result projections and indexes (`sprint-finalizer.ts:4764-4851`), runs outcome gates (`4900-4912`), and publishes the fenced terminal receipt (`4914-4931`).
6. **Post-settlement consumers:** finalizer retention/job-summary/post-finalize work follows receipt publication; scheduler-shadow retention reads config and archives journals (`sprint-finalizer.ts:5688-5711`), while the job summary builds per-task projections (`5714-5818`). These are candidates for attribution, not proven latency causes.
7. **Cleanup consumer:** cleanup first clears the scan interval and, when configured, sleeps `cleanup_delay_ms` before deleting task metadata and tool inventory (`sprint-phases.ts:5077-5113`). The delay is a deliberate readability window. It must be measured separately from authority reads and must not be removed merely to improve a wall-clock number.

## R17 timestamp correction and measurement contract

Do not use a journal event labelled `EXECUTE→EVALUATE` as the evaluation-start timestamp: R17 says that event was emitted at finalizer entry. Use only stage timestamps whose producer and clock domain are known, and report wall-clock, monotonic/process instrumentation, profiler sample time, and lifecycle-event time as separate fields. A future probe must place paired markers at: task terminal settlement return; first and last post-settlement authority/result read; terminal receipt publication; fixed cleanup-wait start/end; cleanup return; and sprint terminal publication. It must record task ID, attempt ID, logical root, sprint ID, tenant/project scope, backend, and whether the read was cache-hit or uncached—without exposing payloads.

The R17 comparison is different-task evidence. It can prioritize measurement but cannot establish causality. The R16 22x snapshot comparison is likewise a one-operation diagnostic, not a production speedup claim.

## Bounded repair file list (proposal only)

- `src/orchestra/spawn-backend-docker.ts`: first candidate boundary for wiring one existing verified-read snapshot around the terminal revalidation operation, as R16 recommends.
- `src/core/task-attempt-custody-store.ts`: touch only if the existing snapshot contract requires explicit safe nesting/operation ownership; do not redesign custody or weaken reread fences.
- `src/orchestra/sprint-controller.ts` and `src/orchestra/sprint-phases.ts`: only for measured instrumentation at the producer/consumer boundaries and to correct event timestamp provenance; no behavioral optimization until evidence identifies a specific repeat.
- `src/orchestra/sprint-finalizer.ts`: only for bounded post-receipt phase markers or a measured scan boundary; preserve receipt-before-cleanup ordering.
- Matching targeted tests and the existing host-proof harness files named by R16 are required in the admitted implementation task; they are not changed by this analysis.

No repair file is admitted by this document. Any implementation must preserve task/attempt identity, tenant/project/run lineage, terminal reread, receipt publication, cleanup eligibility, and sprint-level settlement as separate contracts.

## Admission, profiling, negative/security, and platform contracts

Admission requires an owner-approved bounded outcome with the exact production boundary, an explicit observation budget, and a profile plan that distinguishes cold startup from warm operation and uncached from snapshot-hit reads. The diagnostic bounds in R16 (100,000 entries, 64 MiB, 10 s) are not production configuration. A profile must include exact built-asset hashes and custody identity; no borrowed or test-only profile is sufficient.

Negative/security scope: no cross-task, cross-attempt, cross-project, cross-tenant, global, or process-lifetime cache; no removal of identity rereads, generation checks, receipt checks, release/revoke checks, or hold behavior; no task-result projection substituted for sprint settlement; no raw result, credential, auth, custody, or provider payload logging. A changed-after-read, missing receipt, foreign identity, budget/deadline, incomplete containment, or unavailable reconciliation path must remain HOLD/fail-closed.

Platform contract: available evidence is Linux x64 only. Windows and macOS remain unproven/HOLD. Tenant contract: all observations and any future snapshot keying must remain scoped to the exact tenant/project/run/task/attempt identity; tenant or project fields must not be disclosed by a review surface.

## Real proof and acceptance commands

The implementation task must run only bounded, targeted checks, not the full suite: the R16 candidate checks (`tests/orchestra/exact-accepted-result-terminal-authority.test.ts`, custody snapshot tests, restart/mount tests), `npx tsc --noEmit`, and the registered `scripts/production-wiring-host-proof-harness.mjs` with the exact built asset hashes and result identity. The real-binary proof must compare one-task uncached versus one-operation snapshot behavior, include changed-after-read rejection and missing/foreign receipt HOLD cases, and exercise bounded start and final settlement without provider fallback. A real-binary pass is not a test-only mock pass and is not sprint completion.

This documentation task did not execute the TypeScript command or any test/live-binary command; no test count or timing is claimed here.

## Remaining unknowns

- Which exact post-settlement read(s) dominate R17's 709.579 s finalizer interval after excluding startup and the fixed cleanup wait.
- Whether the R16 snapshot benefit survives cold restart, larger histories, multiple tasks, and real Docker custody on non-Linux platforms.
- The configured cleanup delay and the independent duration of cleanup metadata/tool-inventory scans in the R17 run.
- Whether finalizer projection, retention, job-summary, hooks, or backend reconciliation are serially repeated in the observed path.
- The unavailable R23 result content and any newer recovery evidence it may contain.
- Whether a safe snapshot can be entered exactly once at the existing boundary without nested snapshots or altered release/revoke semantics.

**Conclusion:** measure the bounded producer-to-consumer path first. Preserve all identity fences and settlement boundaries. This wave is not a latency fix and does not authorize DONE.
