# R5 — recovery diagnostic persistence

2026-09-13T16:48:05.594641+00:00

MASTER3178 / parent120 OPEN. src/orchestra/exact-plan-start-service.ts runtime catch now uses the existing bounded path-free recovery formatter. Durable settlement and lifecycle publication preserve typed task/reason evidence for both pre/post admission failure. Non-recovery errors unchanged; no state transition or permission change.

28 tests PASS exit0; tsc exit0; main build:all exit0; diff check exit0. Real start/recovery was NOT run in this package; no product closure claimed. Source hashes in LANDING.json. R4 budget unchanged/exhausted.

Next: exact757 canonical partial reconciliation with skip-audit; new bounded live admission contract needed. Preserve accepted results and compensation evidence.
