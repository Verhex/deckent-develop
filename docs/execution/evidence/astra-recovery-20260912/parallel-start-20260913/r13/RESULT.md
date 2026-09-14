# R13 first coordinator projection — LOCAL_VERIFIED; dogfood returned zero-work NO_GO

MASTER3178 / parent120, bounded ADR-D-007 engine repair. R12 actual start failed before worker birth with Coordinator status snapshot authority mismatch.

Producer runSprint/activateCoordinatorSnapshotWriter publishes before task/lifecycle materialization. setActiveSprint is in-memory only. publishCanonicalRunStatusReadModel previously called readCanonicalRunStatus without the exact new sprint hint, choosing prior dashboard or no sprint. The writer now passes coordinatorSnapshot.sprintId through the existing hint option. Persisted sprint-state/active identity still outranks this hint; coordinator liveness and lease/run/task identity fences are unchanged. No injected unconditional ACTIVE or forged authority.

Files: src/core/run-status-read-model.ts and tests/core/run-status-read-model.test.ts.16/16 targeted tests exit0, isolated build exit0, before compiled live-PID fixture exit1, after isolated/main same fixture exit0, main build:all exit0, separate tsc exit0, scoped diff-check exit0. Fixture proves real current-process PID publication, not worker execution or XVerify. Foreign leases and conflicting active run still reject.

Two source/test files landed by baseline SHA CAS, uncommitted. No runtime or auth edits/cleanup. Main was inactive before build. One actual canonical start is now in dogfood/start.log with its own resource/exit evidence. Product performance, worker execution and formal closure remain open pending actual evidence.

## Actual dogfood result

Observed UTC 2026-09-13T23:49:55.115143+00:00. Flow46f767ec-8734-4f10-b12c-983656320967, sprint759. First-snapshot defect passed in actual start: RUN_STARTED and current759 ACTIVE/SPAWN projection observed. The admitted test-only task materialized with codex/gpt-5.6-sol/test-guardian. Worker never started.

Initial spawn-skip PRE_MOUNT_ABORTED, followed by one product-owned NOT_DISPATCHED redispatch with capture preparation LIFECYCLE:ADAPTER_UNAVAILABLE. Both yielded no provider work. Final task NO_GO / DISPATCH_EXHAUSTED with host terminal zero-work receipt; exact worker test file SHA unchanged. No worker test execution or feature completion.

CLI exit0; elapsed1342.110s monotonic (22m22s). Aggregate child usage: maxRSS4839448KiB (~4.62GiB), userCPU961.221s/systemCPU162.921s. UTC launch-to-exit and monotonic differ by ~80s; preserve clocks separately, do not present per-phase UTC differences as monotonic timings. Durable START_REQUESTED→RUN_STARTED timestamps span393.004s. Product job duration11m16s excludes earlier admission and delayed cleanup, so it is not total CLI elapsed. Finalizer explicitly delayed cleanup180000ms.

Final canonical status: active=false, lifecycle=COMPLETE, resumable=false, coordinator=absent, conflicts=[]; durable terminal publication present. This is lifecycle termination with0/1 task success, NOT product DONE. .tasks retains only pre-existing repair queue/heartbeat authority entries, no759 task. Cleanup was product-owned; no manual runtime edits, kill, auth mutation, commit or push. Only local-llm container remains live.

Additional evidence: shared read-model temporarily published total0 while coordinator snapshot retained one pending task; heartbeat stalled during synchronous historical verification. These remain BLOCKS_CURRENT_DONE monitoring/latency findings within3178. Formal XVerify remains unclaimed.

## Next exact work, no automatic retry

1. Diagnose the capture preparation adapter failure from retained exact759 attempts and typed diagnostics; preserve zero-work settlement and current custody. Do not conflate it with R7 final-capture closure.
2. Repair shared publication replacing full coordinator DAG with empty materialized-task state.
3. Remove repeated historical traversal/event-loop blocking within exact proof/identity/discovery fences; no deadline increase or permanent success cache.
4. Native-history runtime-change task still needs its own registered production host-proof profile, excluded from worker write authority. Then return the actual repair to Deckent; current test-only task was preparation, not disguised runtime implementation.

No new retry authorized by this result; same failure fingerprint is exhausted for this package. Existing owner outcome scope persists.
