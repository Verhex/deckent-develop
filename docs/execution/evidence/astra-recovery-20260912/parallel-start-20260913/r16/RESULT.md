# 760 terminal authority — ölçülmüş tekrar maliyeti

MASTER3178 / parent120, owner-approved continuation. UTC2026-09-14. Read-only diagnostic, no production mutation/provider/start/build. Exact760 checkpoint authority references passed to existing built production revalidator; create:false Store, no raw memory/auth access. Canonical source preserved. Live retained authority was read through the product API, not copied/resealed or fabricated.

## Baseline
One createExactDockerTerminalAuthorityRevalidator call:41971.269ms, current/DONE,exit0; maxRSS874512KiB. CPU profile sampling total43248ms includes module startup; captured native call wrapper18926ms sampled self-time. Raw38MB profile remains at /tmp/deckent-760-followup with hash in cpu-profile-reference.json.

Second call with process-local Store method instrumentation:40109.464ms,current/DONE,exit0. readAdmission870/uncached870; readArtifactReceipt733/uncached733; readDurableEffectMarker13762; readVerifiedSnapshot2286; readFirstWriterSnapshot1771; readChain52. Inclusive method times overlap/recursive and MUST NOT be summed. Instrumentation calls originals unchanged; actual read count, not profiler sample count.

## Existing snapshot experiment
Same task/expected authority and compiled backend; diagnostic constructs one recovery Store and injects it only into that process-local backend. Calls existing store.withVerifiedReadSnapshot around one synchronous terminal authority operation. Bounds100000entries/64MiB/10s are diagnostic limits, not a production config decision. No memoization survives the operation. Existing snapshot.verify native reread fences complete before return; no security check removed.

Result1824.444ms,current/DONE,exit0; maxRSS324420KiB.231 distinct observations;204observationHits,181semanticHits;20,951,065 retained bytes. Uncached admission870→1; uncached artifact receipts733→44; readChain52→6uncached. Marker uncached232 includes final rereads. Approximately22x faster on this one instrumented retained-task diagnostic; NOT p95, platform matrix, whole history10s or end-to-end production claim.

## Decision / exact next production package
Evidence changes priority: first wire existing verified snapshot into one terminal-revalidation boundary; do NOT implement lower-level shared native handles based solely on depth fixture. Existing mechanism already supplies identity reread + bounded lifetime. Entry: scheduler registry→Docker backend.readExactDockerAcceptedTaskTerminalAuthority; cold restart wrapper and live reader path must both consume the same operation. Capture Store once; no nested snapshot; operation ends before caller receives authority. No cross-task/project/attempt/global cache.

Exact candidate production files: src/orchestra/spawn-backend-docker.ts; only if safe nesting requires an explicit existing-operation contract, src/core/task-attempt-custody-store.ts + tests/core/custody-read-snapshot.test.ts. Consumer regressions: tests/orchestra/exact-accepted-result-terminal-authority.test.ts, existing restart/mount tests; same result representation, changed-after-read rejection, missing receipt HOLD, foreign identity HOLD, deadline/budget HOLD, release/revoke guarantees. No provider launch in read proof.

Registered host-proof remains required: dedicated native-custody terminal revalidation observer and scripts/production-wiring-host-proof-harness.mjs registration in same approved closure DAG, exact built asset hashes/identity/results/timing. Do not borrow unrelated profiles. Dogfood worker may implement only after this closure contract is admitted by planner. Typed foundation/recovery route if profile bootstrap itself cannot be admitted; no silent test-only workaround.

After wiring: targeted tests/tsc + compiled one-task authority read comparison + real bounded start and final settlement. Windows/macOS evidence remains HOLD; actual diagnostic Linux x64 only. Formal XVerify not performed. Performance outcome remains OPEN. No new sprint or commit/push this slice.
