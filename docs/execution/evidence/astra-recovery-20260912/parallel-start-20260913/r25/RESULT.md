# 764 findings and single / twenty-task comparison

MASTER3178 / parent120 OPEN. 2026-09-14 UTC. Observation and executable plan preparation only; no product code, config, runtime, receipt or auth mutation in this turn. No new run launched.

## What actually failed

R24 repaired coordinator publication order and real764 passed it. The later failure is host acceptance, not a return of that same mismatch. Main CLI exit1 after1295.374s (21m35s), peakRSS4858896KiB. Actual provider-exit receipts for001,002,004 all report exitCode0. This proves process exit, not task correctness/settlement.

001: cold canonical reader reproduces `EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID` in `src/orchestra/spawn-backend-docker.ts:16323` onward. Bound work/baseline/attempt, prompt agent/skills and diskVerified agree; no boundary violations. Yet canonical result.filesChanged includes two derived parent directories in addition to the one declared file. The strict scope predicate rejects the generated parents. This producer/consumer disagreement does not require parallel execution. Diagnostic instrumented only the external read-only process to record arguments and called the original unchanged reader; no validation bypass or runtime write. See work-authority-diagnostic.json and attempts.json stack.

002: provider exit0, file exists in main, but exact planning inspector returns unresolved; runtime reported EFFECT_RELEASE_HOLD. The official `recover --retain-committed-unsettled ... --dry-run --json` exits1 with EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED. The precise lease/release predicate remains unknown. No automatic disposition was written.

003: admission record terminal NOT_DISPATCHED, attemptCount0, PRE_MOUNT_ABORTED, no-effect evidence; recovery reader resolves it. Persistent engine log records Docker helper SOURCE_MANIFEST_MISMATCH during preparation at15:42:27Z. No dependency wait. The supervisor appended current-flow.md while this run was active; that is a possible interfering source mutation, not yet proven as the differing manifest entry. Future comparison MUST freeze the entire source checkout including current-flow.md; all interim notes/metrics go outside the checkout. Do not attribute this particular mismatch to worker concurrency until differing entries are established.

004: provider exit0, task coordinator snapshot NO_GO; exact history inspector resolves it. Do not infer task success from exit0 or resolved historical custody.

## Actual gate for the next run

003 and004 resolve;002 remains unresolved;001's immutable accepted-result reader throws. Thus the requested single-worker control cannot yet be admitted safely on this project. Twenty-task execution is also pending. No failed repeat start is presented as a concurrency experiment; no registry/history guard was bypassed. No full new production health scan claimed: these are exact-entry reads using the existing bounded verified snapshot in a read-only diagnostic process.

## Prepared comparison sequence

1. Restore current764 terminal/effect consistency through product-authorized paths and exact evidence. Required before both experiments; do not delete tasks/history or label worker outputs accepted by hand.
2. Single control: one task, effective max_workers1, same current Docker/provider policy and a new derived-directory output. It produces a narrow acceptance-contract evidence document. Capture request→plan→admission→Docker→provider start/first output/exit→effect→accepted result→settlement→archive. All notes external until terminal. Do not precreate parents to hide the discovered defect.
3. Twenty-task comparison: at most4 active workers (effective capacity may be lower),20 disjoint output files,27 dependency edges. Same root principles; do not simultaneously change provider, runtime or binary. Roots1–4; chains5–8; pairwise joins9–12; proof packets13–16; fan-in17–18; integrated ranking19; final decision20. Exact-title dependency references avoid numeric drift from injected debt tasks.
4. Compare task-shape/critical-path-normalized intervals and CPU/RSS/provider usage, not raw20task walltime against1task. Capture ready-but-queued separately from dependency-blocked. Verify each successor consumes the accepted exact predecessor output digest. Failed parent must block descendants honestly; independent branches follow current admitted policy, no fabricated skip/success. Provider quota UNKNOWN stays unknown.
5. Determine final repairs from actual runs. Today only001's directory/file contract contradiction is exact;002 release and003 differing-manifest entries need more evidence. Full-history latency already measured but not fixed.

DIRECTIVES-single.md and DIRECTIVES-twenty.md were generated with production buildDirectives and parsed with parseStructuredDirectives. Strict production resolveTaskDependenciesLoud verifies all27 edges and exact ordering; exit0. This is plan validation, not run evidence. No live DIRECTIVES/config change was made. DAG.json records scopes and dependencies.

No claim of a flawless workflow before runtime evidence. Formal cross-provider verification and global MASTER DONE remain unclaimed.
