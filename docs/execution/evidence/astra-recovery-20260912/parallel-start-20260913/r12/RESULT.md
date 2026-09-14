# R12 — actual dogfood start blocked before worker

UTC: 2026-09-13T23:25:59.301090+00:00. MASTER3178 / parent120 OPEN.

Mixed test/docs task: start exit1 after15.059s, E_PRODUCTION_WIRING_REQUIRED. Correct cause homogeneous-only exception in task-types.ts:468. Revised genuine test-only task entered planning, but start exited1 after435.898 monotonic seconds (7m16s), maximum process RSS4652028KiB. UTC timestamps differ from monotonic elapsed; do not conflate wall and elapsed time.

Exact final error: EXACT_RUNTIME_FAILED_AFTER_ADMISSION:Coordinator status snapshot authority mismatch. The real retained sprint-759.snapshot.json has task759-001 PENDING and the exact coordinator lease. No worker container appeared, no task result/provider output was observed, and the scoped test file is unchanged from pre-run baseline: True. No implementation or dogfood success claimed.

After exit CLI status still projects758 ABORTED inactive/nonresumable; this is the prior durable sprint, not proof759 completed. .tasks has no759 task. Canonical process stopped itself; no manual cleanup or auth/state mutation. No worker tests/tsc/build ran during this attempt. Cost preview subscription quota UNKNOWN is not provider availability proof.

Root cause reproduced with compiled live-PID fixture in sibling r13: first publisher resolves generic disk status before a fresh lifecycle/task projection exists, so old dashboard or no sprint wins. Current coordinator identity needs to be supplied through the existing canonical hint while preserving persisted authority and lease checks. R13 bounded recovery records the exact scope and return-to-dogfood boundary.
