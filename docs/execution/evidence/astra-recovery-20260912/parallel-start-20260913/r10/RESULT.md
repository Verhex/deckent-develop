# R10 — D bounded read coalescing candidate: latency HOLD

UTC: 2026-09-13T22:05:24.509323+00:00. MASTER3178 / parent120 OPEN. Owner-approved D recovery, DOGFOOD ON / DEGRADED. Scope: SCOPE.json. Candidate remains only in /tmp/deckent-r4-757-repair; main source hashes match baseline (CUSTODY.json). No commit/push, new sprint, kill/cleanup, auth or receipt mutation.

## Evidence and candidate

R6 real coordinator profile /tmp/deckent-parallel-start-20260913-profile/CPU.20260913.164948.118385.0.001.cpuprofile records714.542 sampled seconds in native captured calls out of2031.04 total sampled seconds (includes idle; not CPU wall-clock attribution). Ancestors repeatedly reopen roots/directories and inspect native handles. R10 fresh bounded profile records4.830 sampled seconds in captured during the10s candidate window. This narrows the cost beyond manifest-only parsing.

Candidate changes: operation-local first-writer/verified physical read sharing; full requested proof comparison remains, mismatch invalidates snapshot even if caught; semantic dispatch admission memo after exact argument/policy validation. Native final rereads and discovery-membership fences remain. Old-epoch discovery rejection probes and ordinary/default readers retain their original path. No persistent authority cache or larger10s/64MiB budget.

## Results

- Initial tests185passed/1failed exit1: spy installed after adapter methods were captured. Fixture corrected.
- Full targeted snapshot+Store186/186 PASS exit0. After preserving the cold/default entry path,3focused tests exit0; old-epoch/operation parity10focused tests exit0. These focused counts are subsets, not additional unique test counts.
- Isolated final npm run build (includes tsc) exit0. No main build needed because candidate did not land.
- Real-history candidate BEFORE:10030.826ms, exit1 DISPATCH_DISCOVERY_DEADLINE_EXCEEDED, maxRSS433396KiB.
- Real-history candidate AFTER:10029.452ms, exit1 same HOLD, maxRSS451288KiB.
- These are CPU-profiled diagnostics, not uninstrumented latency acceptance or p95. Both stopped at the deadline: the1.374ms difference is NOT a demonstrated speed gain. Full historical readiness remains unproven. Candidate remains defaultOFF.

## Additional exact finding for next bounded repair

`src/core/task-attempt-custody-posix-adapter.ts:2388` reopens root and every parent for each read. At2406, openDirectoryComponents unconditionally calls apply-private even for OPEN_EXISTING. `native/exec-authority/src/custody_posix.c:3245` performs fchmod and clears resource durability metadata. Thus this nominally read-only path has a permission-metadata write side effect; this predates R10. The full cost of removing it is NOT measured or claimed. `validate_owner_private` at native custody_posix.c:760 already enforces the private identity contract; do not replace validation with silent chmod repair.

Next exact package: separate read-only OPEN_EXISTING directory traversal from writer privacy application, preserve owner/private/native identity rejection, verify no chmod/metadata write on real temporary native reads and preserve writer behavior. Then reassess the remaining native traversal/call multiplication from a new profile; any bounded descriptor sharing/batching must retain replacement detection, cross-platform contracts, closure and final native fences. Do not loosen guards or enable the failed candidate.

R10 finite measurement budget is exhausted and the latency fingerprint is unchanged; no repeat probe or blind E eight-task start was launched. R9 remains main's last verified build. D and E are not complete; no XVerify or product DONE claim.
