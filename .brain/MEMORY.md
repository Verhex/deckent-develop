## Sprint sprint-132 Learnings
## Sprint sprint-133 Learnings
- HTTP API Bearer Token Auth: GO_WITH_TECH_DEBT — HTTP API Bearer Token Authentication implemented. Changes:

1. NEW FILE: src/api/auth.ts — bearerAuthMiddleware with res
- loadConfig() Module-Level Cache: GO_WITH_TECH_DEBT — loadConfig() module-level cache implemented. Changes: (1) Added module-level cachedConfig/cacheStamp/cachedProjectRoot v
- Sprint 131 ADR'leri Yazımı (ADR-029..032): GO_WITH_TECH_DEBT — 4 ADR yazıldı (ADR-029 through ADR-032), her biri ≥50 satır. ADR-029 (51 lines): Managed-Docs Universalization — kullanı
- Competitive Analysis Güncelleme: GO_WITH_TECH_DEBT — Competitive analysis fully updated for April 2026. Changes: (1) competitive-analysis.md — title updated 'March 2026' → '
## Sprint sprint-135 Learnings
- Docker Backend Graceful Shutdown (Docker Bug Offensive Root Cause Fix): GO_WITH_TECH_DEBT — Docker graceful shutdown offensive root cause fix implemented. Changes: (1) spawn-backend-docker.ts kill() method: docke
- askBrain() Extraction Finish — Conservative Move + Re-Export Shim: NO_GO — Docker worker exited without writing result file
- Structured Planner Priority + Dependencies Parsing: GO_WITH_TECH_DEBT — parseStructuredDirectives() and parseBulletOrNumberedTasks() now parse '- Priority: CRITICAL|HIGH|NORMAL|LOW' lines. New
- GO_WITH_GATE_FAILURE Status Propagation Wire: GO_WITH_TECH_DEBT — GO_WITH_GATE_FAILURE status propagation wire implemented:
1. Added `import { getRecentSprintStats, GO_WITH_GATE_FAILURE 
- Dashboard vs MCP State Divergence Fix: NO_GO — Created src/monitor/sprint-state.ts with getCurrentSprintId() that reads .deckent/sprint-state.json (source 1: sprint-ac
- Brain Memory Budget Enforcement + Config Sync: GO_WITH_TECH_DEBT — Brain Memory Budget Enforcement + Config Sync tamamlandı. (1) DECAY_EXEMPT constant: DECISIONS.md ve PROJECT-IDENTITY.md
## Sprint sprint-136 Learnings
- 5 Test Regression Fix (Sprint 136 Opener): GO_WITH_TECH_DEBT — 5 target test files (start-sandbox, start, i18n-integration, docker-backend, error-handling-unification) all pass (262 t
- Async I/O İlk Kademe (Hot Path fs.promises Migration): NO_GO — Docker worker exited without writing result file
- Brain Spurious NO_GO Evaluation Reconciliation (Sprint 135 N9): GO_WITH_TECH_DEBT — Brain Spurious NO_GO Evaluation Reconciliation implemented. Added tryCodeVerifiedDone() helper to result-evaluator.ts wi
- `.deckent/sprint-NNN-gate.json` Output Wiring (Sprint 135 N5): GO_WITH_TECH_DEBT — gate.json wiring implemented. Added `import { promises as fsPromises } from 'node:fs'` to sprint-finalizer.ts. Inside th
- `load-test-report.md` Auto-Generation (Sprint 135 N6): GO_WITH_TECH_DEBT — Wired generateLoadReport() into finalizeSprint() in sprint-finalizer.ts. Added import of generateLoadReport from core/ob
- T-005 Dep Pipeline Canlı Dogfood Rerun (Sprint 135 Chicken-Egg): NO_GO — Fix A (sprint-controller.ts): Added 'priority?' and 'dependencies?' fields to directiveSources type annotation (line 505
- ErrorRegistry Lint Rule Enforcement: NO_GO — Docker worker exited without writing result file
- sprint-controller.ts Full Slim (Sprint 134 T-010 Final): NO_GO — Docker worker exited without writing result file
- Rubric Field Null Fix for Test-Writer Tasks (Sprint 135 N7): GO_WITH_TECH_DEBT — Added rubric requirement to test-writer agent systemPrompt and worker prompt building in task-builder.ts. Fixed test thr
- sprint-docs-helpers.ts Test Coverage (Sprint 135 T-010 Debt): GO_WITH_TECH_DEBT — Wrote comprehensive unit tests for sprint-docs-helpers.ts module. 61 test cases covering all 8 exported functions: build
## Sprint sprint-137 Learnings
- Brain Budget Decay No-Op Bug Fix: GO_WITH_TECH_DEBT — Fixed brain budget decay no-op bug in runDecay() (debt-manager.ts). Root cause: shouldRun guard used total linesBefore (