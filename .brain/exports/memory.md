# Sprint Learnings (auto-generated)

## Sprint sprint-152 Learnings
- Sprint sprint-152 Learnings: ## Sprint sprint-152 Learnings
- `deckent doctor` Derin Audit: NO_GO — READ-ONLY audit task per Sprint 152 DIRECTIVES. Report written to docs/audits/sprint-152/T-152-002-doctor-deep-audit.md 
- CLI Smoke Part 1 — Core Lifecycle (15 komut): NO_GO — READ-ONLY audit sprint. 15 CLI core lifecycle commands smoke-tested via `node dist/cli/entry.js <cmd>`. Result: 14/15 PA
- CLI Smoke Part 2 — Memory + Checkpoint + Run (10 komut): NO_GO — CLI Smoke Part 2 audit complete. 12 commands exercised (recall family 5, memory subcommands 9, remember 1, memory-query 
- CLI Smoke Part 3 — Agent + Skill + Plugin (12 komut): NO_GO — Read-only CLI smoke audit of agent + skill + plugin command families. 12 main commands + 6 bonus sub-help spot checks ra
- CLI Smoke Part 4 — Nervous System + Audit + Feature + Mode (12+ komut): NO_GO — CLI Smoke Part 4 — Nervous/Audit/Features/Recover/Mode + 19 residual commands. 46/46 top-level command --help coverage (
- MCP Smoke Part 1 — Lifecycle Tools (8 tool): NO_GO — READ-ONLY MCP smoke audit completed for 8 lifecycle tools (deckent_init, set_directives, plan, start, status, review, re
- MCP Smoke Part 2 — Observational + Advanced (10 tool): NO_GO — MCP Smoke Part 2 — Observational + Advanced (10 tool) audit complete. CLI-MCP parity matrix delivered for doctor, analyz
- MCP Smoke Part 3 — Docs + Agent/Skill + Nervous + Beta Trio (9 tool): NO_GO — READ-ONLY audit of 12 MCP tools (deckent_docs, deckent_agent_list, deckent_skill_list, deckent_kill, deckent_nervous_sub
- MCP 8 Resource Fetch Test: NO_GO — READ-ONLY MCP 8 resource fetch audit. Live stdio JSON-RPC 2.0 invocation of dist/mcp/server.js inside docker worker cont
- Memory V2 DB Integrity + FTS5 Recall Test: NO_GO — Memory V2 DB integrity audit completed. 464-line report written to docs/audits/sprint-152/T-152-011-memory-v2-integrity.

## Sprint sprint-151 Learnings
- Sprint sprint-151 Learnings: ## Sprint sprint-151 Learnings
- Public Repo Flip — VerhexIO/deckent-dev → VerhexIO/deckent: GO_WITH_TECH_DEBT — DURUM: ../deckent-public dizini mevcut değil — Alperen'in önce git clone yapması gerekiyor. Handoff dökümanı bu senaryoy
- Discord Bot Deploy + Smoke Test: GO_WITH_TECH_DEBT — ## Tamamlanan İşler

**scripts/deploy-discord.sh** (yeni, ~185 satır):
- Prereq kontrolü: Node >= 18, .deck dosyası, DIS
- Nervous System 6-10 Detector Activation (Sprint 147 Plan): GO_WITH_TECH_DEBT — 5 yeni nervous system detector oluşturuldu (6→11 toplam): BuildFailureRecurrenceDetector, TokenSpikeDetector, AgentRouti

## Sprint sprint-150 Learnings
- Sprint sprint-150 Learnings: ## Sprint sprint-150 Learnings
- Docker Worker Exit Pattern Final Fix (Sprint 146+148 Debt): GO_WITH_TECH_DEBT — Docker Worker Exit Pattern Final Fix completed. 3 changes: (1) containers Map now stores {containerId, model} so host-si
- Scope Sanitizer Code Snippet False Positive Fix (Sprint 148 Debt): NO_GO — All requirements from Sprint 148 debt already implemented in Sprint 149. Verified: (1) isPlaceholderPath() rejects foo/b
- Auditor Stale Alert Race Condition Fix (Sprint 148 Debt): GO_WITH_TECH_DEBT — Auditor stale alert race condition fix was already implemented in Sprint 149 (auditor.ts lines 293-316 + heartbeat-types
- VerhexIO/deckent-hub Repo Create + Templates: GO_WITH_TECH_DEBT — deckent-hub/ local dizin scaffold tamamlandı. Docker worker tarafından önceden yazılmış tüm dosyalar doğrulandı ve eksik
- AGENTS.md Refresh (39 Sprint Behind): NO_GO — AGENTS.md dosyası incelendi. Sprint 149'da zaten güncel durumda: 15 built-in agent (ADR-041 reform sonrası), 'test-write
- npm pack --dry-run + Version Bump 1.0.0-beta.1: GO_WITH_TECH_DEBT — npm pack --dry-run PASSES: tarball 1.08MB (<2MB limit), no secrets, no sensitive dirs, all 6 package.json metadata field
- `cleanOrphanIpcDirs` Wire-Up with Live-PID Check: NO_GO — cleanOrphanIpcDirs function updated: new sync API with live-PID check support (opts: { checkLivePid, minAgeMs }). Old as
- Feature Manifest Canlılaştırma (Tam Scope): GO_WITH_TECH_DEBT — Feature Manifest Canlılaştırma — 7 adımlı plan tamamlandı:

1. scripts/sync-manifest.mjs (~230 LoC): 31 feature tanımlı,
- `deckent audit` + `deckent recover` User-Facing CLI + MCP Yüzeyi: GO_WITH_TECH_DEBT — Implemented `deckent audit` + `deckent recover` CLI commands and `deckent_audit` + `deckent_recover` MCP tools. Full ADR

## Sprint sprint-149 Learnings
- Sprint sprint-149 Learnings: ## Sprint sprint-149 Learnings
- `deckent mode` CLI Command: GO_WITH_TECH_DEBT — Created `deckent mode` CLI command with 5 subcommands: show, sprint, task, auto, global. Follows ADR-012 register<Name>(

## Sprint sprint-148 Learnings
- Sprint sprint-148 Learnings: ## Sprint sprint-148 Learnings
- Vitest Triage — 135 Fail → < 50 Fail: NO_GO — Docker worker exited without writing result file
- Sprint 146 T-146-011 Docker Worker Exit Pattern Root Cause Fix: GO_WITH_TECH_DEBT — Docker Worker Exit Pattern root cause fixed. Problem: Container SIGKILL (exit 137, OOM kill) bypasses all shell traps — 

## Sprint sprint-147 Learnings
- Sprint sprint-147 Learnings: ## Sprint sprint-147 Learnings

## Sprint sprint-146 Learnings
- Sprint sprint-146 Learnings: ## Sprint sprint-146 Learnings
- Agent Truncation Bug Fix: GO_WITH_TECH_DEBT — Root cause: task-builder.ts:761 had `agentPrompt.slice(0, 2000)` which truncated agent prompts to 2000 chars. This cause
- ADR Relevance Scoring Engine: GO_WITH_TECH_DEBT — ADR Relevance Scoring Engine implemented. Created src/orchestra/adr-selector.ts (~330 LoC) with: selectRelevantAdrs() sc
- Scope Sanitizer: GO_WITH_TECH_DEBT — Created scope-sanitizer.ts with 8 filter rules (absolute path reject, path traversal reject, dist/ remove, extension-onl
- Generative Useful God Template — buildTaskPrompt Single Entry: GO_WITH_TECH_DEBT — buildTaskPrompt() implemented as single entry point in prompt-god-template.ts (~270 LoC). Pipeline: agent block → skill 
- DIRECTIVES.md Mid-Sprint Silme Bug Fix: GO_WITH_TECH_DEBT — Phase guard added to archiveDirectives() — rejects calls outside CLEANUP/COMPLETE phase. Emergency restore function adde
- Rubric System Consolidation: GO_WITH_TECH_DEBT — Rubric system consolidated: (1) Removed rubricScores spec from worker prompt in prompt-god-template.ts — workers no long
- Sprint 145 vitest Regression Fix: NO_GO — Docker worker exited without writing result file

## Sprint sprint-145 Learnings
- Sprint sprint-145 Learnings: ## Sprint sprint-145 Learnings
- Brain Heuristic Timeout Estimator: NO_GO — Brain Heuristic Timeout Estimator implemented as specified. New file timeout-estimator.ts (~170 LoC) with brainEstimateT
- EventBus Abstraction + Subscribe API: GO_WITH_TECH_DEBT — EventBus Abstraction + Subscribe API implemented as specified.

1. NEW: src/orchestra/event-bus.ts (~250 LoC) — EventBus
- ADR-037 RBAC Runtime Wire — checkWorkerAuthority: GO_WITH_TECH_DEBT — ADR-037 RBAC Runtime Wire completed. Changes:

1. Fixed checkWorkerAuthority() bug — was always returning true even on v
- CHANNELS.NOTIFY writeEvent Emit Wire: GO_WITH_TECH_DEBT — Added emitNotify() helper to event-stream.ts (source='deckent', target='user', channel=CHANNELS.NOTIFY). Added 4 strateg
- NotifyDispatcher Wire + 3 Adapter: GO_WITH_TECH_DEBT — NotifyDispatcher successfully wired in both MCP server and CLI entry points. 3 adapters (MCP, CLI, File) connected via e
- ADR-038 Self-Modifying Detector Runtime Wire: GO_WITH_TECH_DEBT — ADR-038 Self-Modifying Detector Runtime Wire completed. Three changes: (1) Added alias exports to self-modifying-detecto
- registerResume CLI Wire + CLI Registration Test Harness: GO_WITH_TECH_DEBT — Fixed registerResume (audit finding #5) + registerHelp (also unregistered, found during investigation). Added tests/cli/
- T-144-002 Helper Migration — countDebtItems → store.getByType: GO_WITH_TECH_DEBT — DB-first debt counting migration complete. Created src/cli/helpers/debt-counter.ts with MemoryStore.getByType('debt') im
- worker.sh Template Update — TASK_TIMEOUT Env Var: GO_WITH_TECH_DEBT — All 3 backends updated with adaptive timeout wiring:

1. DockerSpawnBackend: worker.sh template now uses `TIMEOUT=${TASK
- Result Atomicity Guarantee — TIMEOUT_WITH_WORK Partial Result: GO_WITH_TECH_DEBT — TIMEOUT_WITH_WORK partial result mechanism implemented across 4 source files + 1 test file (14 tests). Changes: (1) Dock

## Sprint sprint-144 Learnings
- Sprint sprint-144 Learnings: ## Sprint sprint-144 Learnings
- worker.ts Split (1669 → 4 dosya): NO_GO — Worker timeout — process exceeded time limit and was killed
- Ölü Kod Silme Wave A (Agent + V1 Routing, 17 dosya, 2780 LoC): NO_GO — Worker timeout — process exceeded time limit and was killed
- Ölü Kod Silme Wave B (Orchestra Sahipsiz + Feature Flag, 12 dosya, 2139 LoC): NO_GO — Docker worker exited without writing result file
- Event Stream Emit Wire: GO_WITH_TECH_DEBT — Sprint 138 event-stream.ts foundation wired into Brain, Worker, and Auditor. 7 new CHANNELS constants added: SPRINT_STAR
- Retro sprint-id Normalize: GO_WITH_TECH_DEBT — Retro sprint-id normalize completed: (1) sprint-retro-writer.ts already used canonical `retro-${sprint.id}` format → no 

## Sprint sprint-143 Learnings
- Sprint sprint-143 Learnings: ## Sprint sprint-143 Learnings
- Memory V2 Tam Migrasyon (ci-reporter + managed-docs): NO_GO — Docker worker exited without writing result file
- MCP Disconnect Fix (Background Sprint Runner): GO_WITH_TECH_DEBT — MCP Disconnect Fix implemented. sprint-runner-entry.ts provides a detached child process entry point for running sprints

## Sprint sprint-142 Learnings
- Sprint sprint-142 Learnings: ## Sprint sprint-142 Learnings
- src/core/ batch 1 — Memory V2 modulleri: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 files completed. 10 per-file reports written to .deckent/sprint-god-analysis/src/core/. Al
- src/core/ batch 2 — Types + Routing: GO_WITH_TECH_DEBT — Read-only deep analysis completed for 10 files in src/core/ batch 2 (Types + Routing). All 10 files analyzed with 16-sec
- src/core/ batch 4 — Provider + Model + Notification: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 assigned files + 1 bonus (webhook.ts) = 11 analysis reports. All reports follow the 16-sec
- src/core/ batch 5 — Utils + Security + Remaining: GO_WITH_TECH_DEBT — Read-only deep analysis completed for all 10 assigned files. Key findings:

**P0 Findings:**
- deck-file.ts: createDeckT
- src/core/ batch 6 — Remaining core files: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 src/core/ files completed. All 10 reports written with 16-section template. Key findings: 
- src/core/ batch 7 — Final core files: GO_WITH_TECH_DEBT — Read-only deep analysis of 13 source files completed. 13 per-file reports written, each ≥40 lines with full 16-section t
- src/orchestra/ batch 1 — Brain + Sprint lifecycle: GO_WITH_TECH_DEBT — Read-only deep analysis of 6 sprint lifecycle core files completed. All 6 reports written with 16-section template, each
- src/orchestra/ batch 2 — Debt + Result + Retro: GO_WITH_TECH_DEBT — Read-only deep analysis of 8 orchestra files (debt-manager, sprint-retro-writer, sprint-reporter, result-evaluator, resu
- src/orchestra/ batch 3 — Task + Routing + Spawn: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 src/orchestra/ files (task-builder, task-router, task-analyzer, task-retry, planner, spawn
- src/orchestra/ batch 4 — Event stream + Pattern + Decision: GO_WITH_TECH_DEBT — Read-only deep analysis of 10 orchestra files completed. 10 per-file reports written using 16-section template. All repo

## Sprint sprint-141 Learnings
- Sprint sprint-141 Learnings: ## Sprint sprint-141 Learnings
- src/orchestra/ Analysis (82 dosya): NO_GO — Docker worker exited without writing result file
- src/cli/ Analysis (75 dosya): GO_WITH_TECH_DEBT — src/cli/ analizi tamamlandı. 75 rapor dosyası oluşturuldu (.deckent/sprint-140-analysis/src/cli/ altında). Tüm dosyalar 
- src/agents/ + src/providers/ + src/monitor/ + src/api/ + src/extensions/ Analysis (30 dosya): NO_GO — Docker worker exited without writing result file
- tests/ Category Analysis (28 kategori): GO_WITH_TECH_DEBT — 28 test kategorisi READ-ONLY analizi tamamlandı. Tüm raporlar .deckent/sprint-140-analysis/tests/ altında. Toplam 5133 s
- docs/ Analysis (260 markdown): GO_WITH_TECH_DEBT — Batch analysis of 260 markdown docs across 8 categories. Read-only analysis completed successfully. Produced 7 detailed 
- META — Architecture Graph + Circular Dependency: GO_WITH_TECH_DEBT — Comprehensive architecture graph and circular dependency analysis completed. 354 TypeScript files analyzed across 11 mod
- META — Dead Code + Type Safety + Security: GO_WITH_TECH_DEBT — Read-only cross-cutting analysis completed: (1) Dead Code — 4 fully dead modules (~360 LoC), 14+ unused exports, ADR-038
- META — ADR Compliance + CLI/MCP Parity + i18n: GO_WITH_TECH_DEBT — Comprehensive 3-section cross-cutting analysis completed: (1) ADR Compliance: 40/40 ADRs audited — 36 COMPLIANT, 2 PARTI
- META — Test Coverage Map + Performance + Error Handling + TODO inventory: GO_WITH_TECH_DEBT — Completed all 4 cross-cutting analyses. Report at .deckent/sprint-140-analysis/meta/coverage-perf-errors-todo.md (563 li
- META — Memory V2 Integrity Verification: GO_WITH_TECH_DEBT — Memory V2 Integrity Verification completed. 482-line report covering all 7 dimensions: (1) DB Schema: 5/5 tables + FTS5 

## Sprint sprint-139 Learnings
- Sprint 139 Learnings: ## Sprint sprint-139 Learnings

## Sprint sprint-138 Learnings
- Sprint 138 Learnings: - ADR-035 Verification Protocol Standard: GO_WITH_TECH_DEBT — ADR-035 Brain ↔ Worker ↔ Auditor Verification Protocol Standard başarıyla .brain/DECISIONS.md dosyasına eklendi. 15 kana
- Worker Honest Assessment Calibration v2: GO_WITH_TECH_DEBT — Worker Honest Assessment Calibration v2 tamamlandı. 3 alt-iş uygulandı:

1. Alt-iş A (task-builder.ts): buildWorkerPromp

## Sprint sprint-137 Learnings
- Sprint 137 Learnings: - Brain Budget Decay No-Op Bug Fix: GO_WITH_TECH_DEBT — Fixed brain budget decay no-op bug in runDecay() (debt-manager.ts). Root cause: shouldRun guard used total linesBefore (

## Sprint sprint-136 Learnings
- Sprint 136 Learnings: - 5 Test Regression Fix (Sprint 136 Opener): GO_WITH_TECH_DEBT — 5 target test files (start-sandbox, start, i18n-integration, docker-backend, error-handling-unification) all pass (262 t
- Async I/O İlk Kademe (Hot Path fs.promises Migration): NO_GO — Docker worker exited without writing result file
- Brain Spurious NO_GO Evaluation Reconciliation (Sprint 135 N9): GO_WITH_TECH_DEBT — Brain Spurious NO_GO Evaluation Reconciliation implemented. Added tryCodeVerifiedDone() helper to result-evaluator.ts wi
- `.deckent/sprint-NNN-gate.json` Output Wiring (Sprint 135 N5): GO_WITH_TECH_DEBT — gate.json wiring implemented. Added `import { promises as fsPromises } from 'node:fs'` to sprint-finalizer.ts. Inside th
- `load-test-report.md` Auto-Generation (Sprint 135 N6): GO_WITH_TECH_DEBT — Wired generateLoadReport() into finalizeSprint() in sprint-finalizer.ts. Added import of generateLoadReport from core/ob
- T-005 Dep Pipeline Canlı Dogfood Rerun (Sprint 135 Chicken-Egg): NO_GO — Fix A (sprint-controller.ts): Added 'priority?' and 'dependencies?' fields to directiveSources type annotation (line 505
- ErrorRegistry Lint Rule Enforcement: NO_GO — Docker worker exited without writing result file
- sprint-controller.ts Full Slim (Sprint 134 T-010 Final): NO_GO — Docker worker exited without writing result file
- Rubric Field Null Fix for Test-Writer Tasks (Sprint 135 N7): GO_WITH_TECH_DEBT — Added rubric requirement to test-writer agent systemPrompt and worker prompt building in task-builder.ts. Fixed test thr
- sprint-docs-helpers.ts Test Coverage (Sprint 135 T-010 Debt): GO_WITH_TECH_DEBT — Wrote comprehensive unit tests for sprint-docs-helpers.ts module. 61 test cases covering all 8 exported functions: build

## Sprint sprint-135 Learnings
- Sprint 135 Learnings: - Docker Backend Graceful Shutdown (Docker Bug Offensive Root Cause Fix): GO_WITH_TECH_DEBT — Docker graceful shutdown offensive root cause fix implemented. Changes: (1) spawn-backend-docker.ts kill() method: docke
- askBrain() Extraction Finish — Conservative Move + Re-Export Shim: NO_GO — Docker worker exited without writing result file
- Structured Planner Priority + Dependencies Parsing: GO_WITH_TECH_DEBT — parseStructuredDirectives() and parseBulletOrNumberedTasks() now parse '- Priority: CRITICAL|HIGH|NORMAL|LOW' lines. New
- GO_WITH_GATE_FAILURE Status Propagation Wire: GO_WITH_TECH_DEBT — GO_WITH_GATE_FAILURE status propagation wire implemented:
1. Added `import { getRecentSprintStats, GO_WITH_GATE_FAILURE 
- Dashboard vs MCP State Divergence Fix: NO_GO — Created src/monitor/sprint-state.ts with getCurrentSprintId() that reads .deckent/sprint-state.json (source 1: sprint-ac
- Brain Memory Budget Enforcement + Config Sync: GO_WITH_TECH_DEBT — Brain Memory Budget Enforcement + Config Sync tamamlandı. (1) DECAY_EXEMPT constant: DECISIONS.md ve PROJECT-IDENTITY.md

## Sprint sprint-133 Learnings
- Sprint 133 Learnings: - HTTP API Bearer Token Auth: GO_WITH_TECH_DEBT — HTTP API Bearer Token Authentication implemented. Changes:

1. NEW FILE: src/api/auth.ts — bearerAuthMiddleware with res
- loadConfig() Module-Level Cache: GO_WITH_TECH_DEBT — loadConfig() module-level cache implemented. Changes: (1) Added module-level cachedConfig/cacheStamp/cachedProjectRoot v
- Sprint 131 ADR'leri Yazımı (ADR-029..032): GO_WITH_TECH_DEBT — 4 ADR yazıldı (ADR-029 through ADR-032), her biri ≥50 satır. ADR-029 (51 lines): Managed-Docs Universalization — kullanı
- Competitive Analysis Güncelleme: GO_WITH_TECH_DEBT — Competitive analysis fully updated for April 2026. Changes: (1) competitive-analysis.md — title updated 'March 2026' → '

## Sprint sprint-132 Learnings
- Sprint 132 Learnings: 
