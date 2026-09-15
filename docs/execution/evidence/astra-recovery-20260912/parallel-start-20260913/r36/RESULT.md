# R36 — Acceptance lookup retention (PARTIAL / HOLD)

UTC 2026-09-15T07:43:45.636782+00:00. Existing ADR-D-007 package, MASTER 3178 / parent 120.

The public acceptExactDockerCustodyResult API now clears live lookup only after accepted-result; held or rejected responses retain recovery lookup. Monitor non-accepted and exception paths likewise no longer use failure as absence evidence. Acceptance setup promises still retire in finally, so retry is not pinned to the completed setup promise.

Verification: targeted release-recovery and scheduler-spawn-executor suites 41/41 PASS, exit 0. npx tsc --noEmit exit 0. New public acceptance test injects internal HOLD; it is not a production Docker acceptance proof.

Read-only IPC finding: retained completion is found at spawn-backend-docker.ts resolveExactAttemptIpcAuthority, but the resolver continues to read private IPC capture/cursor/output artifacts; its catch returns PRIVATE_IPC_AUTHORITY_UNAVAILABLE. result-collector.ts:549 still throws for authority-hold; the IPC holds consumer at :3035 also throws. Thus lookup preservation alone does not solve E4.

E4 collector held set, typed unavailable-vs-contradiction disposition, IPC exclusion justified by exact evidence, and E5 resumable checkpoint/controller/lifecycle remain unimplemented. No weakened authority guards, fake TaskResult or task DONE. Missing outcome evidence must remain unresolved HOLD in the completed chain. Cache work remains subject to current-progress verification.

No new sprint, build, MCP reconnect, runtime state mutation, commit or push. Real A->C/B restart/recovery/settlement proof still outstanding. This record does not close E4 or the recovery package.
