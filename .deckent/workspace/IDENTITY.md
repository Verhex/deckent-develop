# Project Identity
Name: deckent
Type: AI agent orchestration CLI
Language: TypeScript (ESM)
Test: vitest
Build: tsc
Runtime: Node.js >=18
Platform: macOS, Linux, WSL2
Tests: 12,485 pass + 16 skipped (505 files)
Dashboard Tests: 413
Coverage: 89.33%
Sprints: 139+ (Sprint 139 manuel finalize Seçenek C — GO_WITH_TECH_DEBT)
CLI Commands: 36+ (Sprint 138 `deckent resume` eklendi)
MCP: 21 tools, 8 resources
Agents: 16 built-in
Skills: 21 built-in
Providers: Claude, Codex, Gemini
Features: Sprint Timeout Reform, Heartbeat Daemon, Human Checkpoints, Checkpoint CLI/MCP, Agent/Skill Evolution Pipeline, Adaptive Thresholds, ModelRegistry (13 models, 3 providers, tier-based routing), Docker Backend (live-verified, 10 e2e tests, configurable timeout), Context-Aware Routing, Token Usage Tracker, Task Dependency Pipeline (Sprint 134 T-001), Local Observability Seviye 2 (Sprint 134 T-011), Brain Self-Audit Gate (Sprint 134 T-014), Sprint-Reporter 4-Way Split (Sprint 134 T-009), Product-Not-Service Vision (Sprint 134 ADR-033/034), Coordinator Resilience (Sprint 135 T-001), Docker Graceful Shutdown (Sprint 135 T-003), askBrain IPC Registry (Sprint 135 T-004), Planner Priority/Dependencies (Sprint 135 T-005 + Sprint 136 T-006 wire fix), Brain Budget Auto-Decay (Sprint 135 T-013), sprint-controller.ts Slim 1890→209 LoC (Sprint 136 T-008), Brain Spurious NO_GO Reconciliation Helper (Sprint 136 T-003 + Sprint 137 wire live-confirmed), **ADR Governance Integration (Sprint 138 Task 1 — MADR v3 hibrit + 37 ADR migration + ADR-036 self-referential + scripts/adr-validator.mjs + DECKENT.md mandatory read + worker prompt injection)**, **ADR-035 Verification Protocol Standard (Sprint 138 Task 2 — 15 channel codes V1.0)**, **Auditor Authority Extension 3-Pipeline (Sprint 138 Task 3 — verifyWorkerResult + verifyFunctional + validateTechDebt + checkADRCompliance pilot ADR-006/008/010)**, **Structured Event Stream + Plan-Time Scope Collision Detection (Sprint 138 Task 4 — event-stream.ts 305 LoC + file-lock.ts 30→267 real implementation + detectScopeCollisions + buildCollisionAwareWaves)**, **Layer 4 Runtime Wire Forensic Fix (Sprint 138 Task 6 — ADR-006 canlı enforcement + fail-safe fallback + breadcrumb logging)**, **Auto-Archive ArchiveOrphanTasks Extension (Sprint 138 Task 7)**, **Worker Honest Assessment Calibration v2 (Sprint 138 Task 8 — Honest Self-Assessment block + verify-delta baseline + applyTechDebtDowngrade çift katman)**, **Long-Running Sprint Resume Capability MVP (Sprint 138 Task 9 — sprint-checkpoint.ts + resume.ts + CHECKPOINT_INTERVAL=5)**, **Docker HB Core Fix 5-sprint P0 (Sprint 139 Task 13 — atomicWriteFileSync + SIGTERM fsync handler + 15s grace period, +382 LoC)**, **Chain Dependency Scheduler Wave 1 Early Wire Bootstrap (Sprint 139 Task 28 — Kahn's algorithm topological + detectScopeCollisions, +620 LoC, Sprint 135 T-005 5. canlı dogfood)**, **Backend Parity 3/3 (Sprint 139 Tasks 17-19 — Docker + tmux + subprocess E2E test suite, Sprint 120'den beri ilk subprocess E2E 19 sprint gap)**, **ADR-037 Brain-Auditor-Worker Authority Matrix RBAC V1.0 (Sprint 139 Task 34/35 — +1370 LoC, runtime scope enforcement)**, **ADR-038 Self-Modifying Task Detection (Sprint 139 Task 51/52 — +789 LoC, self-modifying-detector.ts, Sprint 139 catastrophic lesson mimari koruma)**, **Worker Event Hook + Notification Dispatcher (Sprint 139 Task 41 — src/core/notification-dispatcher.ts + notify-adapters/, DECKENT→USER:NOTIFY canal deploy)**, **Event Stream Runtime E2E Test (Sprint 139 Task 44 — tests/e2e/event-stream-runtime.test.ts, full pipeline simulation)**

## Project Status
| Metrik | Değer |
|--------|-------|
| Version | 0.4.0-beta.1 |
| Sprint | sprint-139 (manuel finalize GO_WITH_TECH_DEBT, next: sprint-140) |
| MCP Tools | 21 |
| MCP Resources | 8 |
| CLI Commands | 37+ |
| Dashboard Pages | 6 |
| Agents | 16 built-in + 2 custom |
| Skills | 21 built-in |
| Providers | 3 (Claude, Codex, Gemini) |
