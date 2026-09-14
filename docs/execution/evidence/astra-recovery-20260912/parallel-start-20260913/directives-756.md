# DIRECTIVES — Parallel start dogfood observation

## Goal
MASTER3178 / parent120: resolve the next exact performance and monitoring repairs using eight disjoint evidence artifacts while measuring real parallel start execution. Owner authorized start dogfood, Sol/Terra/Luna, and progressive 8/15/30-task observation on 2026-09-13. This run is analysis-only; production repair is the next evidence-bound start run.

## Task 1: Document Historical verification amplification
- Provider: codex
- Model: gpt-5.6-sol
- Effort: low
- Files: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/history/REPORT.md
- Scope: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/history/
- Reads: src/orchestra/spawn-backend-docker.ts, src/core/custody-read-snapshot.ts, src/orchestra/exact-docker-container-observation.ts, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json
- Dependencies: none
### Description
Trace repeated retained-history verification in the start admission and finalization call graph. Identify repeated parsing/hash/semantic passes and their input identities. Use the preserved 755 timing evidence. Propose an exact bounded repair in the existing authority with invalidation and tamper/restart semantics; separate measured time from static hypotheses. Do not run full-history loops in your worker.
MASTER3178 / parent120. This is one bounded documentation/analysis artifact, not a production runtime change or product closure. Read the current source and preserved successful755 evidence. Source, tests, runtime, auth, real custody and all other report files are read-only. Do not access raw memory DB or secrets. No commit, push, build, live start/stop/recover/cleanup or provider fallback. Do not spawn agents. Use bounded targeted reads. Write only your declared report. Include UTC, source path:line and sha256, evidence versus inference, exact producer/consumer/ingress/policy chain, proposed repair files and failure boundaries, and Linux/WSL/macOS/Windows plus tenant implications. Report unknown evidence as unavailable, never invent measurements, receipts, provider usage or XVerify. Complete the host-bound result protocol for your own attempt only. Turkish prose; technical identifiers unchanged.
### goNogo
- goCriteria: The declared report contains independently inspected source references and hashes.; Observations and hypotheses are explicitly separated.; The proposed next repair has exact file scope and preserves canonical authority.; Only the declared report changes and no product closure is claimed.
- nogo: Fabricated execution or measurements, source mutation, missing report, or unbounded history scan.

## Task 2: Document Lifecycle duration accounting
- Provider: codex
- Model: gpt-5.6-terra
- Effort: low
- Files: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/timers/REPORT.md
- Scope: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/timers/
- Reads: src/orchestra/sprint-controller.ts, src/orchestra/sprint-phases.ts, src/orchestra/resource-report.ts, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json
- Dependencies: none
### Description
Map intake, planning, admission, queue, provider execution, host verification, evaluation and cleanup timer definitions. Explain the 36m57 CLI versus 115s provider and 26m49 job metrics without conflating intervals. Trace the cleanup delay policy and justified removal or scheduling alternatives.
MASTER3178 / parent120. This is one bounded documentation/analysis artifact, not a production runtime change or product closure. Read the current source and preserved successful755 evidence. Source, tests, runtime, auth, real custody and all other report files are read-only. Do not access raw memory DB or secrets. No commit, push, build, live start/stop/recover/cleanup or provider fallback. Do not spawn agents. Use bounded targeted reads. Write only your declared report. Include UTC, source path:line and sha256, evidence versus inference, exact producer/consumer/ingress/policy chain, proposed repair files and failure boundaries, and Linux/WSL/macOS/Windows plus tenant implications. Report unknown evidence as unavailable, never invent measurements, receipts, provider usage or XVerify. Complete the host-bound result protocol for your own attempt only. Turkish prose; technical identifiers unchanged.
### goNogo
- goCriteria: The declared report contains independently inspected source references and hashes.; Observations and hypotheses are explicitly separated.; The proposed next repair has exact file scope and preserves canonical authority.; Only the declared report changes and no product closure is claimed.
- nogo: Fabricated execution or measurements, source mutation, missing report, or unbounded history scan.

## Task 3: Document Parallel admission and dependency scheduling
- Provider: codex
- Model: gpt-5.6-sol
- Effort: low
- Files: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/scheduler/REPORT.md
- Scope: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/scheduler/
- Reads: src/orchestra/dependency-scheduler.ts, src/orchestra/scheduler-driver.ts, src/orchestra/scheduler-reducer.ts, src/orchestra/scheduler-effects.ts, src/core/provider-concurrency-runtime-reader.ts, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json
- Dependencies: none
### Description
Trace max_workers versus activeModeConfig.max_workers precedence, resource admission, provider limits, DAG readiness, file collision, queue fairness and fan-in. Explain behavior for 8,15,30 tasks without claiming unrun benchmarks. Identify the exact execution path for this start run and actionable bottlenecks.
MASTER3178 / parent120. This is one bounded documentation/analysis artifact, not a production runtime change or product closure. Read the current source and preserved successful755 evidence. Source, tests, runtime, auth, real custody and all other report files are read-only. Do not access raw memory DB or secrets. No commit, push, build, live start/stop/recover/cleanup or provider fallback. Do not spawn agents. Use bounded targeted reads. Write only your declared report. Include UTC, source path:line and sha256, evidence versus inference, exact producer/consumer/ingress/policy chain, proposed repair files and failure boundaries, and Linux/WSL/macOS/Windows plus tenant implications. Report unknown evidence as unavailable, never invent measurements, receipts, provider usage or XVerify. Complete the host-bound result protocol for your own attempt only. Turkish prose; technical identifiers unchanged.
### goNogo
- goCriteria: The declared report contains independently inspected source references and hashes.; Observations and hypotheses are explicitly separated.; The proposed next repair has exact file scope and preserves canonical authority.; Only the declared report changes and no product closure is claimed.
- nogo: Fabricated execution or measurements, source mutation, missing report, or unbounded history scan.

## Task 4: Document Worker resource visibility inventory
- Provider: codex
- Model: gpt-5.6-luna
- Effort: low
- Files: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/resources/REPORT.md
- Scope: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/resources/
- Reads: src/orchestra/resource-monitor.ts, src/orchestra/resource-report.ts, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json
- Dependencies: none
### Description
Identify container selection filters and correlate deckent-w versus deckent-x observability coverage. Map current CPU, RAM, host versus worker counters and units. Propose exact consumer corrections using canonical identity, no rename. Use 755 resource-summary as measured baseline; unavailable remote inference hardware stays unavailable.
MASTER3178 / parent120. This is one bounded documentation/analysis artifact, not a production runtime change or product closure. Read the current source and preserved successful755 evidence. Source, tests, runtime, auth, real custody and all other report files are read-only. Do not access raw memory DB or secrets. No commit, push, build, live start/stop/recover/cleanup or provider fallback. Do not spawn agents. Use bounded targeted reads. Write only your declared report. Include UTC, source path:line and sha256, evidence versus inference, exact producer/consumer/ingress/policy chain, proposed repair files and failure boundaries, and Linux/WSL/macOS/Windows plus tenant implications. Report unknown evidence as unavailable, never invent measurements, receipts, provider usage or XVerify. Complete the host-bound result protocol for your own attempt only. Turkish prose; technical identifiers unchanged.
### goNogo
- goCriteria: The declared report contains independently inspected source references and hashes.; Observations and hypotheses are explicitly separated.; The proposed next repair has exact file scope and preserves canonical authority.; Only the declared report changes and no product closure is claimed.
- nogo: Fabricated execution or measurements, source mutation, missing report, or unbounded history scan.

## Task 5: Document Main status freshness contract
- Provider: codex
- Model: gpt-5.6-terra
- Effort: low
- Files: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/status/REPORT.md
- Scope: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/status/
- Reads: src/core/run-status-read-model.ts, src/core/run-status-authority.ts, src/cli/commands/status.ts, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json
- Dependencies: none
### Description
Trace canonical status producer and main CLI consumers from pre-worker intake to task DONE and outer COMPLETE. Explain freshness/revision/event versus cached projection. Identify exact files and minimal dependency-bound repair for delayed upper-phase projection without forging ACTIVE or DONE.
MASTER3178 / parent120. This is one bounded documentation/analysis artifact, not a production runtime change or product closure. Read the current source and preserved successful755 evidence. Source, tests, runtime, auth, real custody and all other report files are read-only. Do not access raw memory DB or secrets. No commit, push, build, live start/stop/recover/cleanup or provider fallback. Do not spawn agents. Use bounded targeted reads. Write only your declared report. Include UTC, source path:line and sha256, evidence versus inference, exact producer/consumer/ingress/policy chain, proposed repair files and failure boundaries, and Linux/WSL/macOS/Windows plus tenant implications. Report unknown evidence as unavailable, never invent measurements, receipts, provider usage or XVerify. Complete the host-bound result protocol for your own attempt only. Turkish prose; technical identifiers unchanged.
### goNogo
- goCriteria: The declared report contains independently inspected source references and hashes.; Observations and hypotheses are explicitly separated.; The proposed next repair has exact file scope and preserves canonical authority.; Only the declared report changes and no product closure is claimed.
- nogo: Fabricated execution or measurements, source mutation, missing report, or unbounded history scan.

## Task 6: Document Auditor and Nervous supervision coverage
- Provider: codex
- Model: gpt-5.6-sol
- Effort: low
- Files: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/supervision/REPORT.md
- Scope: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/supervision/
- Reads: src/nervous/bootstrap.ts, src/orchestra/sprint-controller.ts, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json
- Dependencies: none
### Description
Trace effective enabled/disabled/delegated states, owner heartbeat, scan, adopted decision and durable outcome consumers. Distinguish configured existence from proof of working supervision. Identify read-only evidence needed during the current parallel run and exact missing bindings; do not start another monitor or coordinator.
MASTER3178 / parent120. This is one bounded documentation/analysis artifact, not a production runtime change or product closure. Read the current source and preserved successful755 evidence. Source, tests, runtime, auth, real custody and all other report files are read-only. Do not access raw memory DB or secrets. No commit, push, build, live start/stop/recover/cleanup or provider fallback. Do not spawn agents. Use bounded targeted reads. Write only your declared report. Include UTC, source path:line and sha256, evidence versus inference, exact producer/consumer/ingress/policy chain, proposed repair files and failure boundaries, and Linux/WSL/macOS/Windows plus tenant implications. Report unknown evidence as unavailable, never invent measurements, receipts, provider usage or XVerify. Complete the host-bound result protocol for your own attempt only. Turkish prose; technical identifiers unchanged.
### goNogo
- goCriteria: The declared report contains independently inspected source references and hashes.; Observations and hypotheses are explicitly separated.; The proposed next repair has exact file scope and preserves canonical authority.; Only the declared report changes and no product closure is claimed.
- nogo: Fabricated execution or measurements, source mutation, missing report, or unbounded history scan.

## Task 7: Document Cross-process event delivery contract
- Provider: codex
- Model: gpt-5.6-terra
- Effort: low
- Files: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/events/REPORT.md
- Scope: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/events/
- Reads: src/api/run-flow-event-stream.ts, src/api/run-flow-routes.ts, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json
- Dependencies: none
### Description
Trace CLI child durable writes to API SSE and Dashboard/Desktop consumption; find live notification/backfill/reconnect/sequence paths. Identify exact gaps and a shared-service repair contract. Do not start an API server or make network calls. Do not claim live cross-surface parity from static code.
MASTER3178 / parent120. This is one bounded documentation/analysis artifact, not a production runtime change or product closure. Read the current source and preserved successful755 evidence. Source, tests, runtime, auth, real custody and all other report files are read-only. Do not access raw memory DB or secrets. No commit, push, build, live start/stop/recover/cleanup or provider fallback. Do not spawn agents. Use bounded targeted reads. Write only your declared report. Include UTC, source path:line and sha256, evidence versus inference, exact producer/consumer/ingress/policy chain, proposed repair files and failure boundaries, and Linux/WSL/macOS/Windows plus tenant implications. Report unknown evidence as unavailable, never invent measurements, receipts, provider usage or XVerify. Complete the host-bound result protocol for your own attempt only. Turkish prose; technical identifiers unchanged.
### goNogo
- goCriteria: The declared report contains independently inspected source references and hashes.; Observations and hypotheses are explicitly separated.; The proposed next repair has exact file scope and preserves canonical authority.; Only the declared report changes and no product closure is claimed.
- nogo: Fabricated execution or measurements, source mutation, missing report, or unbounded history scan.

## Task 8: Document Worker environment parameter inventory
- Provider: codex
- Model: gpt-5.6-luna
- Effort: low
- Files: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/environment/REPORT.md
- Scope: docs/execution/evidence/astra-recovery-20260912/parallel-start-20260913/reports/environment/
- Reads: Dockerfile.worker, assets/Dockerfile.worker, package.json, src/orchestra/exact-docker-workspace-command.ts, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/R3-RESULT.md, docs/execution/evidence/astra-recovery-20260912/chain-752-repair/755-resource-summary.json
- Dependencies: none
### Description
Inspect worker image source/version/provider/dependency parameter resolution. Identify hardcoded version versus intentionally pinned reproducibility contracts. Compare the two Docker recipes and startup assumptions. List platform-supported and unsupported paths honestly. No image build, package install or auth access.
MASTER3178 / parent120. This is one bounded documentation/analysis artifact, not a production runtime change or product closure. Read the current source and preserved successful755 evidence. Source, tests, runtime, auth, real custody and all other report files are read-only. Do not access raw memory DB or secrets. No commit, push, build, live start/stop/recover/cleanup or provider fallback. Do not spawn agents. Use bounded targeted reads. Write only your declared report. Include UTC, source path:line and sha256, evidence versus inference, exact producer/consumer/ingress/policy chain, proposed repair files and failure boundaries, and Linux/WSL/macOS/Windows plus tenant implications. Report unknown evidence as unavailable, never invent measurements, receipts, provider usage or XVerify. Complete the host-bound result protocol for your own attempt only. Turkish prose; technical identifiers unchanged.
### goNogo
- goCriteria: The declared report contains independently inspected source references and hashes.; Observations and hypotheses are explicitly separated.; The proposed next repair has exact file scope and preserves canonical authority.; Only the declared report changes and no product closure is claimed.
- nogo: Fabricated execution or measurements, source mutation, missing report, or unbounded history scan.
