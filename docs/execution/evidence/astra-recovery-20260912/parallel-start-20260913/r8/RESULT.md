# R8 collector / fatal authority drain — LOCAL_VERIFIED

UTC 2026-09-13T21:00:07.668542+00:00. MASTER3178 RECOVERY-DO-DOGFOOD-001 / parent120 OPEN. Owner-approved A→B→C→D→E sequence; bounded ADR-D-007 C slice. Main landed with original-file SHA comparison; no commit/push. Existing mixed custody retained.

## Root causes and production repair

1. result-collector.ts initial collection previously rethrew provider ingress errors but swallowed other E077 authority failures, then called the initial scheduler. The initial gate now propagates E077 before any scheduler dispatch (current :2745).
2. The first authority HOLD previously aborted the task scan, so later accepted siblings could be missed. Ready siblings now pass the existing parse/evaluation/terminal revalidation boundary before the first error propagates (:1672–:2026). Failed authority tasks are remembered and never re-settled during the drain.
3. The controller assigned results only after waitForResults resolved. A later rejection discarded its access to already committed collector results. onResultCommitted now projects each committed result to the existing controller result array (:1393 collector; sprint-controller.ts:3519). The callback is progress only, not a new authority or receipt; legacy synthetic results keep their existing semantics and do not gain exact authority.
4. Fatal authority handling awaits the exact registry's already-owned terminal promises and performs a ready-only sweep (:2029). It starts no work, creates no provider calls, performs no timeout-result synthesis, reconciliation or kill. Waiting is bounded by the existing collector deadline; unlimited collection relies on existing attempt execution budgets. If that deadline is exhausted, unresolved work stays unresolved.
5. Watcher and final-sweep error paths use the same drain policy (:3077, :3134). Final scanning preserves later healthy results even when an earlier authority fails.
6. sprint-controller.ts:3543 now propagates result/IPC E077 before post-collect recovery, continuation, EVALUATE or FIX. Existing provider-ingress / Normal-Docker-IPC containment handling is unchanged; this patch adds no kill authority. No absent/ABORTED/COMPLETE assertion is created over an unproven worker.

## Verification and limits

- Final affected suites: collector 15/15 + execute/FIX integration 1/1; exit 0. Existing unchanged containment tests: 5/5, exit 0 in initial pass. Do not add repeated runs to unique counts.
- New ready/deferred sibling cases use the real collector and hermetic exact accepted/terminal fixtures. They assert one committed result, one settlement, no spawn/kill, queued task remains PENDING, and no fabricated failed-task result file. These are hermetic execution proofs, not paid provider receipts or a fresh dogfood run.
- Initial validation exposed a premature questionBridgeWire cleanup reference (7 test failures and TypeScript TDZ errors); corrected. Final sweep was subsequently checked and brought under the same drain behavior; affected suites and TypeScript rerun green. Initial and final logs retained.
- tsc --noEmit exit 0; isolated final build exit 0; main build:all exit 0; scoped diff --check exit 0. Main build emitted its existing dashboard chunk-size advisory.
- Real compiled readCanonicalRunStatus after landing: 2026-09-13T20:58:36.169Z, sprint758 ABORTED, active=false, resumable=false, coordinator=absent, conflicts=[]. Command exit 0. This verifies retained state, not execution success of the new error path.
- No fresh XVerify call or receipt; no cross-provider closure claimed. No new sprint, provider call, .tasks/runtime/receipt/auth mutation or retained-resource cleanup was performed.

## Remaining approved work

C is not declared fully closed: canonical task/worker/result HOLD and terminal read-model projection still need an exact audit and repair. A budget-exhausted drain must remain visibly unresolved rather than look completed. D must address repeated historical verification amplification and phase/resource timing. E then provides the bounded real eight-task start and durable settlement proof. Do not promote to 15/30 tasks or mark outer MASTER3178/120 DONE yet. Historical 758 evidence and ABORTED retention stay intact.

Evidence: SCOPE.json, CHANGE.patch, LANDING.json, test/build logs, 758-status-after.json and MANIFEST.json.
