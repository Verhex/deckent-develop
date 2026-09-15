# Exact EXECUTE deadline / live task continuation — bounded read-only review

Context: MASTER 3178 / parent 120, ADR-D-007 recovery R31–R41. R41 accepted. No implementation, new run, config mutation, budget extension, auth mutation or cleanup requested from reviewer. This is design clarification, not formal XVerify closure.

Verified in R42:
- Production containment inspect routes via resolveExactDockerObservationRunner to exact-docker-container-observation-worker; deadline and close share the isolated thread. Actual Docker absent probe: 12 s parent stall, 10 s timeout, child ~135 ms, status 1 / error false / reason exit. Build all exit0; binary identity MATCH.
- result-collector waitForResults: timeout = explicit or 30 min default, zero unlimited; loop at ~2910 exits solely on elapsed wall time. Final sweep returns no result for pending-settlement (~569). No heartbeat-aware expiry decision.
- controller resolves opts.timeoutMs over config.sprint_timeout_minutes (~1272), invokes waitForResults (~3543), reconciles backend post-collect, then ~3929 calls runEvaluatePhase. exactTaskRequiresTerminalAuthority (~1457) requires authority for pending-settlement. consumeExactTerminalAuthorities (sprint-phases ~305) throws E077 if required authority absent.
- On-disk project config says sprint_timeout_minutes=300; this is not an assertion about every effective config or explicit invocation override.

Resolve the producer→consumer path and exact design before mutation:
1. Can post-collect reconciliation change a live pending-settlement task into an authority-bearing resumable HOLD, or does the identified E077 path remain? Identify exact intervening side effects and preserve live worker custody.
2. Find existing finite-budget authority, worker liveness/heartbeat and coordinator lease contracts. Choose a bounded existing continuation/drain or durable pause/resume seam: no new retry engine, no silently increased paid/execution budget, no synthetic result, no authority based only on fresh heartbeat. A living worker must retain an observer/owner while its provider/execution budget independently remains enforceable.
3. Describe treatment of A alive, B settled, C dependent unrun when collector deadline expires; known dead vs unknown liveness; explicit cancellation, provider budget exhaustion, restart. Locate exact changes necessary across collector/controller/checkpoint/recovery, and do not relax contradiction guards.
4. Distinguish IPC poll unavailability from global budget expiry. IPC resolver reads sequence-scoped question bin + seal, plus durable conversation cursor. Check native snapshot inventory can observe normal concurrent publication as CAPABILITY_UNVERIFIED/ARTIFACT_CHANGED. Do not claim immutable artifacts and mutable inventories share the same retry classification without producer evidence.
5. Supply one connected regression/proof contract covering actual registry→collector→controller boundary (not manual assembly only), then actual Docker A→C/B with restart and operator recovery. State what is BLOCKS_CURRENT_DONE vs related, no fresh sprint until preconditions are satisfied.

Return precise code-backed recommendation with negative cases and residual uncertainty. Preserve all runtime/evidence; no provider receipts or closure fabricated. No communication.md use.
