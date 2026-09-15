# DIRECTIVES — Four independent diagnostic lanes for approved dogfood repair

## Goal
MASTER3178 / parent120. Owner requests max4 workers and parallel progress. This wave delivers exact evidence-backed repair specifications, not product closure or implementation claims. Source edits belong to subsequent dependency-bound dogfood repair tasks.

## Task 1: Map and bound pre-worker startup latency
- Effort: high
- Files: docs/execution/active/parallel-4-760-followup/startup/ANALYSIS.md
- Reads: src/orchestra/exact-plan-start-service.ts, src/orchestra/spawn-backend-docker.ts, src/orchestra/sprint-controller.ts, src/cli/commands/start.ts, docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/ANALYSIS.md, docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/RESULT.md
- Scope: docs/execution/active/parallel-4-760-followup/startup/
- Dependencies: none
### Description
Trace preflight/history discovery before worker admission. Distinguish measured evidence from source hypotheses; no live history scan. Define smallest producer/consumer repair and exact host-proof registration needed. Write only the declared ANALYSIS.md. This is an independent read-only production investigation and docs-only deliverable in the accepted MASTER3178 repair DAG. Include TR executive finding summary, path:line and SHA256 references, exact observation sources/time domains, producer-to-consumer map, bounded repair file list, admission/profile needs, negative/security scopes, platform and tenant contract, test and real-binary acceptance commands, and remaining unknowns. Do not invent timings, run results, provider receipts, or DONE. Read existing actual761/760 evidence; do not read raw memory.db, credentials, real custody, or auth state. No source/config/runtime/task mutation, no build/start/kill/cleanup/commit/push/subagents/provider fallback. Do not run the full test suite or expensive live reads. Keep evidence references rather than dumping transcripts. This wave is measurement/design readiness, not completion of latency or observability fixes. In result notes report document hash, UTC and validation honestly; docs-only no fabricated test counts. Preserve all unrelated work.
### goNogo
- goCriteria: Written document names exact source and evidence-backed findings.; Repair scope and real proof contract distinguish measured facts from hypotheses.; Only assigned document is changed with explicit remaining gaps.
- nogo: Unsupported closure or timing claims.; Any mutation outside declared document scope.

## Task 2: Map remaining post-task settlement latency
- Effort: high
- Files: docs/execution/active/parallel-4-760-followup/settlement/ANALYSIS.md
- Reads: src/orchestra/sprint-phases.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-finalizer.ts, src/orchestra/scheduler-effects.ts, docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/ANALYSIS.md, docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/RESULT.md
- Scope: docs/execution/active/parallel-4-760-followup/settlement/
- Dependencies: none
### Description
Trace repeated authority/result reads after task settlement and the fixed cleanup wait. Include R17 snapshot scope; do not propose removing identity fences or conflating task versus sprint settlement. Correct fake phase-event timestamps. Write only the declared ANALYSIS.md. This is an independent read-only production investigation and docs-only deliverable in the accepted MASTER3178 repair DAG. Include TR executive finding summary, path:line and SHA256 references, exact observation sources/time domains, producer-to-consumer map, bounded repair file list, admission/profile needs, negative/security scopes, platform and tenant contract, test and real-binary acceptance commands, and remaining unknowns. Do not invent timings, run results, provider receipts, or DONE. Read existing actual761/760 evidence; do not read raw memory.db, credentials, real custody, or auth state. No source/config/runtime/task mutation, no build/start/kill/cleanup/commit/push/subagents/provider fallback. Do not run the full test suite or expensive live reads. Keep evidence references rather than dumping transcripts. This wave is measurement/design readiness, not completion of latency or observability fixes. In result notes report document hash, UTC and validation honestly; docs-only no fabricated test counts. Preserve all unrelated work.
### goNogo
- goCriteria: Written document names exact source and evidence-backed findings.; Repair scope and real proof contract distinguish measured facts from hypotheses.; Only assigned document is changed with explicit remaining gaps.
- nogo: Unsupported closure or timing claims.; Any mutation outside declared document scope.

## Task 3: Design authoritative result usage and log projection
- Effort: high
- Files: docs/execution/active/parallel-4-760-followup/archive/ANALYSIS.md
- Reads: src/core/sprint-archive.ts, src/orchestra/task-result-authority.ts, src/orchestra/spawn-backend-docker.ts, docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/ANALYSIS.md, docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/RESULT.md
- Scope: docs/execution/active/parallel-4-760-followup/archive/
- Dependencies: none
### Description
Map .local custody result/accepted-result/provider usage/log to project archive and read-only completed .tasks visibility. Specify retention, no duplicate execution authority, privacy/redaction, digest binding, terminal ownership and restart behavior. Do not copy real logs/secrets or change state. Write only the declared ANALYSIS.md. This is an independent read-only production investigation and docs-only deliverable in the accepted MASTER3178 repair DAG. Include TR executive finding summary, path:line and SHA256 references, exact observation sources/time domains, producer-to-consumer map, bounded repair file list, admission/profile needs, negative/security scopes, platform and tenant contract, test and real-binary acceptance commands, and remaining unknowns. Do not invent timings, run results, provider receipts, or DONE. Read existing actual761/760 evidence; do not read raw memory.db, credentials, real custody, or auth state. No source/config/runtime/task mutation, no build/start/kill/cleanup/commit/push/subagents/provider fallback. Do not run the full test suite or expensive live reads. Keep evidence references rather than dumping transcripts. This wave is measurement/design readiness, not completion of latency or observability fixes. In result notes report document hash, UTC and validation honestly; docs-only no fabricated test counts. Preserve all unrelated work.
### goNogo
- goCriteria: Written document names exact source and evidence-backed findings.; Repair scope and real proof contract distinguish measured facts from hypotheses.; Only assigned document is changed with explicit remaining gaps.
- nogo: Unsupported closure or timing claims.; Any mutation outside declared document scope.

## Task 4: Map dashboard event and KPI truth repairs
- Effort: high
- Files: docs/execution/active/parallel-4-760-followup/dashboard/ANALYSIS.md
- Reads: src/dashboard/src/components/ActivityFeed.tsx, src/core/observability.ts, src/core/run-status-read-model.ts, src/orchestra/sprint-spawner.ts, docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r17/dogfood/ANALYSIS.md, docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/r16/RESULT.md
- Scope: docs/execution/active/parallel-4-760-followup/dashboard/
- Dependencies: none
### Description
Trace browser-created spawn/writing events, timestamps, phase inversion, completion percentage1.0% for1/1, token/cache unit discrepancy. Propose exact existing-source changes, multi-surface parity, event IDs/replay/freshness, and meaningful regression plus real surface proof. Do not touch Cursor terminal lane. Write only the declared ANALYSIS.md. This is an independent read-only production investigation and docs-only deliverable in the accepted MASTER3178 repair DAG. Include TR executive finding summary, path:line and SHA256 references, exact observation sources/time domains, producer-to-consumer map, bounded repair file list, admission/profile needs, negative/security scopes, platform and tenant contract, test and real-binary acceptance commands, and remaining unknowns. Do not invent timings, run results, provider receipts, or DONE. Read existing actual761/760 evidence; do not read raw memory.db, credentials, real custody, or auth state. No source/config/runtime/task mutation, no build/start/kill/cleanup/commit/push/subagents/provider fallback. Do not run the full test suite or expensive live reads. Keep evidence references rather than dumping transcripts. This wave is measurement/design readiness, not completion of latency or observability fixes. In result notes report document hash, UTC and validation honestly; docs-only no fabricated test counts. Preserve all unrelated work.
### goNogo
- goCriteria: Written document names exact source and evidence-backed findings.; Repair scope and real proof contract distinguish measured facts from hypotheses.; Only assigned document is changed with explicit remaining gaps.
- nogo: Unsupported closure or timing claims.; Any mutation outside declared document scope.
