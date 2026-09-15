# R35 — R34 follow-up corrections (PARTIAL / HOLD)

UTC: 2026-09-15T04:59:03.303329+00:00
Authority: existing admitted ADR-D-007 package, MASTER 3178 / parent 120.

Implemented:
- ExecutionLockError held -> replayInProgress, not replayBudgetExhausted; no invented receipt or publication failure. Automatic retry predicate refuses a replay already in progress.
- observeExactDockerCompletionAcceptance no longer clears the live custody lookup on capture-hold alone. A held completion does not prove container absence. This is lookup retention, not result acceptance or complete IPC recovery.

Validation: two focused test files 40/40 PASS exit 0 (tests.log), npx tsc --noEmit exit 0 (tsc.log). Tests inject lock contention and held completion; NOT a real Docker concurrency/restart proof.

Outstanding:
- replayInProgress is currently backend-local metadata; full typed consumer propagation remains E3/E4.
- Claim without outcome remains unclassified HOLD. E4/E5 must park unavailable evidence instead of equating missing evidence with contradiction. Existing E077 behavior is not yet changed.
- Persistent cache NOT implemented: admission/outcome digests identify immutable artifacts but do not establish current cleanup progress after operator recovery. Need a verified invalidation/current-progress boundary and measured read costs, not a stale authority cache.
- E4 collector/IPC held set and E5 checkpoint/controller/lifecycle/restore/barrier still open. Retained lookup alone does not close them.
- Real A->C / B Docker chain, restart, operator recovery, final settlement outstanding. No new sprint/build/runtime mutation/commit/push.
