# God Analysis: tests/ batch 5 — integration/ + e2e/ + dashboard/
**Task ID:** 142-034 | **Model:** opus | **Effort:** max | **Analyst:** test-writer agent

## Overview

| Category | Files | Total LoC | Describe Blocks | It/Test Blocks | Memory V2 Real | Orphan Functions |
|----------|-------|-----------|-----------------|----------------|----------------|------------------|
| integration/ | 30 | ~13,250 | ~140 | ~490 | 1 (memory-v2.test.ts) | 3 files |
| e2e/ | 10 | ~5,264 | ~35 | ~250 | 0 | 0 |
| dashboard/ | 16 | ~3,579 | ~52 | ~392 | N/A | 0 |
| **TOTAL** | **56** | **~22,093** | **~227** | **~1,132** | **1** | **3 files** |

---

# SECTION A: INTEGRATION TESTS (30 files)

## A1. Per-File Analysis

### 1. agent-selection.test.ts (288 LoC, 16 tests)
- **Coverage:** Local helper functions `selectAgent()`, `buildAgentPrompt()` — NOT imported from src/
- **Mocks:** None
- **Memory V2:** N/A
- **Orphan Status:** CRITICAL — functions defined locally, don't exist in src/
- **Edge Cases:** Agent with empty triggers, all disabled agents, case-insensitive matching
- **Determinism:** Hardcoded date `'2026-03-22T00:00:00.000Z'`
- **Verdict:** ORPHAN — tests validate logic that doesn't correspond to actual codebase functions

### 2. cascade-block-live.test.ts (326 LoC, 4 tests)
- **Coverage:** `src/orchestra/dependency-scheduler.ts`, `src/orchestra/event-stream.ts`
- **Mocks:** None (real filesystem I/O)
- **Memory V2:** N/A
- **Edge Cases:** Transitive cascade, full lifecycle BLOCKED→UNBLOCKED, ADR-035 protocol compliance
- **Determinism:** GOOD — properly randomized temp dirs
- **Verdict:** EXCELLENT — real I/O, proper ADR-035 channel validation

### 3. collaboration-adaptive.test.ts (441 LoC, 28 tests)
- **Coverage:** `src/orchestra/parallel-pipeline.ts`, `src/agents/adaptive-agent.ts`, `src/agents/prompt-version.ts`, `src/agents/prompt-rollback.ts`, `src/agents/prompt-ab-test.ts`, `src/agents/prompt-metrics.ts`
- **Mocks:** None (real temp dirs)
- **Memory V2:** N/A
- **Edge Cases:** Circular deps, empty tasks, version pruning (last 10), rollback triggers
- **Determinism:** GOOD
- **Verdict:** GOOD — comprehensive adaptive agent pipeline coverage

### 4. config-layers.test.ts (413 LoC, 30 tests)
- **Coverage:** `src/core/config.ts` (loadConfig, loadGlobalConfig, saveGlobalConfig, mergeConfigs, validateConfig, deepMerge, createDefaultConfig)
- **Mocks:** None (real filesystem)
- **Memory V2:** N/A
- **Edge Cases:** Missing config files, invalid modes/languages, negative max_workers, empty configs
- **Determinism:** GOOD — proper env var save/restore
- **Verdict:** GOOD — thorough config validation

### 5. decision-engine.test.ts (469 LoC, 20 tests)
- **Coverage:** `src/orchestra/decision-engine.ts`, `src/orchestra/pattern-recorder.ts`, `src/orchestra/pattern-reader.ts`
- **Mocks:** None (real temp dirs)
- **Memory V2:** N/A
- **Edge Cases:** Empty pools, null stack, unknown language, filesWrite security boundary
- **Determinism:** GOOD
- **Verdict:** GOOD — 6-step decision flow well tested

### 6. e2e-init.test.ts (368 LoC, 9 tests)
- **Coverage:** `src/core/config.ts`, `src/orchestra/brain.ts` (planSprint, readContext)
- **Mocks:** tmux, child_process, auditor, worker (4 heavy mocks)
- **Memory V2:** N/A
- **Edge Cases:** Multiple independent projects, config preservation
- **Determinism:** WEAK — mocked spawnSync always returns status 0
- **Verdict:** ACCEPTABLE — heavy mocking reduces integration value

### 7. e2e-sprint.test.ts (577 LoC, 20 tests)
- **Coverage:** `src/orchestra/brain.ts` (evaluateResult, handleEvaluation, handleCrossDependencies, escalateDebt, writeRetrospective, writeSprintLog, calculateMetrics, decay, cleanup), `src/agents/worker.ts`
- **Mocks:** tmux, child_process
- **Memory V2:** N/A
- **Edge Cases:** NO_GO→fix task, GO_WITH_TECH_DEBT→debt entry, cross-deps, cleanup
- **Determinism:** GOOD — intentional randomization in coverage values
- **Verdict:** GOOD — full lifecycle test

### 8. error-recovery.test.ts (578 LoC, 26 tests)
- **Coverage:** `src/orchestra/decision-engine.ts`, `src/orchestra/pattern-recorder.ts`, `src/orchestra/pattern-reader.ts`
- **Mocks:** None
- **Memory V2:** N/A
- **Edge Cases:** Empty pools, corrupted learning data, non-existent dirs, force overrides, batch processing
- **Determinism:** GOOD
- **Verdict:** EXCELLENT — comprehensive fallback/recovery scenarios

### 9. full-sprint-cycle.test.ts (452 LoC, 13 tests)
- **Coverage:** `src/orchestra/brain.ts`, `src/agents/worker.ts`
- **Mocks:** tmux, child_process, **MemoryStore** (CRITICAL)
- **Memory V2:** MOCKED — mockMemStore for all insert/upsert/decay
- **Edge Cases:** NO_GO→fix, debt escalation, cross-deps, decay force/budget
- **Determinism:** PROBLEMATIC — mocking removes DB behavior realism
- **Verdict:** ACCEPTABLE — MemoryStore mock tests flow, not real DB

### 10. full-sprint-e2e.test.ts (819 LoC, 20 tests)
- **Coverage:** `src/orchestra/decision-engine.ts` (6-task simulation)
- **Mocks:** None
- **Memory V2:** N/A
- **Edge Cases:** 6 task types, skill cap at 3, model constraints, multi-sprint learning
- **Determinism:** EXCELLENT
- **Verdict:** EXCELLENT — real decision orchestration, no mocks

### 11. lifecycle.test.ts (934 LoC, 48 tests)
- **Coverage:** `src/core/config.ts`, `src/agents/worker.ts`, `src/monitor/auditor.ts`, `src/orchestra/brain.ts`, CLI commands (doctor, init)
- **Mocks:** tmux, child_process, readline/promises, **MemoryStore** (4 heavy mocks)
- **Memory V2:** MOCKED — full mockMemStore
- **Edge Cases:** Config validation, missing tasks, lock ownership, stale detection, multi-IDE locks
- **Determinism:** PROBLEMATIC — heavy mocking reduces realism
- **Verdict:** ACCEPTABLE — 7 scenario groups but MemoryStore completely mocked

### 12. mcp-flow.test.ts (474 LoC, 11 tests)
- **Coverage:** `src/mcp/tools/init.ts`, `src/mcp/tools/directives.ts`, `src/mcp/tools/doctor.ts`
- **Mocks:** tmux, child_process, auditor, worker, utils (countBrainLines→50), doctor
- **Memory V2:** N/A
- **Edge Cases:** Init directories, directives parsing, doctor enriched metadata
- **Determinism:** ACCEPTABLE
- **Verdict:** GOOD — MCP tool chain validated

### 13. memory-v2.test.ts (297 LoC, 10 tests)
- **Coverage:** `src/core/memory-store.ts`, `src/core/memory-query.ts`, `src/core/memory-export.ts`, `src/core/memory-import.ts`
- **Mocks:** NONE — real SQLite database
- **Memory V2:** FULLY COMPATIBLE — the only test using real MemoryStore V2
- **Edge Cases:** Roundtrip (insert→search→export→reimport→verify), Turkish i18n (ISIK/isik/isik), decay preserves exempt, upsert history, soft delete
- **Determinism:** GOOD
- **Verdict:** BEST PRACTICE — gold standard Memory V2 integration test

### 14. multi-agent-pipeline.test.ts (321 LoC, 16 tests)
- **Coverage:** Local `runPipeline()` function — NOT from src/
- **Mocks:** mockExecutor (vi.fn())
- **Memory V2:** N/A
- **Orphan Status:** CRITICAL — runPipeline() defined locally, doesn't exist in src/
- **Edge Cases:** Sequential execution, abort on failure, continue on error, empty pipeline
- **Determinism:** GOOD
- **Verdict:** ORPHAN — tests validate local implementation, not codebase

### 15. multi-env.test.ts (387 LoC, 18 tests)
- **Coverage:** `src/core/environment.ts`, `src/cli/helpers/codex-config.ts`, `src/cli/helpers/gemini-config.ts`, `src/cli/helpers/cursor-config.ts`, `src/core/stack-detector.ts`, `src/core/multi-ide.ts`, `src/cli/helpers/agent-templates.ts`
- **Mocks:** Process env (intentional)
- **Memory V2:** N/A
- **Edge Cases:** Codex/Gemini/Cursor env detection, Python/Flask/Go/Rust stacks, stale lock cleanup
- **Determinism:** EXCELLENT — proper env var save/restore
- **Verdict:** EXCELLENT — real multi-environment testing

### 16. notification-flow.test.ts (614 LoC, 27 tests)
- **Coverage:** `src/core/notifications.ts`, `src/core/notification-providers/webhook.ts`, `src/core/notification-providers/discord.ts`, `src/core/notification-providers/slack.ts`, `src/core/notification-config.ts`
- **Mocks:** None (manual mock helpers for HTTP clients)
- **Memory V2:** N/A
- **Edge Cases:** Invalid URLs, invalid event types, retry failure, one failing provider doesn't prevent others, fallback with no config
- **Determinism:** Uses `new Date()` without mocking — potential midnight flakiness
- **Verdict:** GOOD — comprehensive notification flow

### 17. npm-install-sim.test.ts (173 LoC, 10 tests)
- **Coverage:** package.json structure, dist/cli/index.js setup
- **Mocks:** child_process (execSync, spawnSync), fs (existsSync, readFileSync, etc.)
- **Memory V2:** N/A
- **Edge Cases:** Shebang presence, engines>=18, ESM module type, exports field
- **Determinism:** GOOD — fully mocked
- **Verdict:** WEAK — tests validate mock returns, not real package.json

### 18. plan-sprint.test.ts (314 LoC, 8 tests)
- **Coverage:** `src/orchestra/brain.ts` (planSprint, readContext)
- **Mocks:** tmux, child_process, auditor, worker
- **Memory V2:** Uses DEBT_TABLE_HEADER from constants correctly
- **Edge Cases:** Task files on disk, PENDING vs DRAFT status, empty directives, sequential IDs
- **Determinism:** GOOD
- **Verdict:** GOOD — real file I/O for task JSON

### 19. plugin-lifecycle.test.ts (262 LoC, 10 tests)
- **Coverage:** `src/core/plugin.ts` (removePlugin, listPlugins, enablePlugin, disablePlugin, loadPlugin)
- **Mocks:** None (real filesystem)
- **Memory V2:** N/A
- **Edge Cases:** Full lifecycle, enable/disable non-existent, re-enable after disable
- **Determinism:** GOOD
- **Verdict:** EXCELLENT — pure integration, no mocks

### 20. progress-summary.test.ts (843 LoC, 33 tests)
- **Coverage:** `src/cli/helpers/worker-status.ts`, `src/cli/helpers/eta-calculator.ts`, `src/cli/helpers/progress.ts`, `src/cli/helpers/sprint-summary.ts`, `src/cli/helpers/sprint-comparison.ts`, `src/cli/helpers/change-categorizer.ts`, `src/cli/helpers/agent-performance.ts`, `src/cli/helpers/recommendations.ts`
- **Mocks:** None
- **Memory V2:** N/A
- **Edge Cases:** Stale workers, empty heartbeat, all done ETA, first sprint comparison, recommendation limit
- **Determinism:** Uses `Date.now()` for heartbeat timestamps — potential flakiness
- **Verdict:** GOOD — comprehensive but some determinism issues

### 21. project-types/monorepo.test.ts (546 LoC, 16 tests)
- **Coverage:** `src/orchestra/decision-engine.ts` (Turborepo monorepo scenario)
- **Mocks:** None
- **Memory V2:** N/A
- **Edge Cases:** Scope restriction (UI task doesn't expand to API), cross-package tasks, haiku_allowed=false
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — but boundary test could pass on empty filesWrite

### 22. project-types/python-fastapi.test.ts (466 LoC, 14 tests)
- **Coverage:** `src/orchestra/decision-engine.ts` (Python FastAPI scenario)
- **Mocks:** None
- **Memory V2:** N/A
- **Edge Cases:** TS-expert NOT selected for Python, security task (OAuth2), pytest detection
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — proper negative skill selection tests

### 23. project-types/typescript-react.test.ts (457 LoC, 14 tests)
- **Coverage:** `src/orchestra/decision-engine.ts` (TypeScript React scenario)
- **Mocks:** None
- **Memory V2:** N/A
- **Edge Cases:** Python-expert NOT selected, react-specialist priority, multiple component tasks
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — consistent project-type testing pattern

### 24. provider-flow.test.ts (280 LoC, 22 tests)
- **Coverage:** `src/core/provider.ts` (ProviderRegistry), `src/orchestra/spawn-backend.ts`
- **Mocks:** Docker backend (isDockerAvailable → false)
- **Memory V2:** N/A
- **Edge Cases:** Duplicate registration, no providers, non-existent provider, auto fallback
- **Determinism:** GOOD
- **Verdict:** ACCEPTABLE — but CRITICAL: line 185-196 mutates TmuxBackend.prototype directly

### 25. review-flow.test.ts (689 LoC, 24 tests)
- **Coverage:** `src/cli/helpers/review-actions.ts`, `src/cli/helpers/selective-retry.ts`, `src/cli/helpers/review-summary.ts`
- **Mocks:** None (real filesystem)
- **Memory V2:** N/A
- **Edge Cases:** Re-review changes decision, complete detection, unknown task IDs, full workflow
- **Determinism:** Uses `new Date().toISOString()` for review timestamps
- **Verdict:** GOOD — real fs, but missing persistence test (approve→reload→verify)

### 26. security-flow.test.ts (411 LoC, 14 tests)
- **Coverage:** `src/api/server.ts`, `src/agents/worker.ts`, `src/monitor/auditor.ts`
- **Mocks:** None (real implementations)
- **Memory V2:** N/A
- **Edge Cases:** Invalid bearer token, missing auth header, lock contention, idempotent re-acquire, concurrent locks
- **Determinism:** GOOD
- **Verdict:** GOOD — but MISSING path traversal attack tests (../../..)

### 27. skill-selection.test.ts (515 LoC, 21 tests)
- **Coverage:** Local scoring/selection logic — NOT imported from src/
- **Mocks:** None
- **Memory V2:** N/A
- **Orphan Status:** CRITICAL — lines 8-169 define selectAgent/scoreSkill/selectSkills/buildSkillPrompt/updateSkillStats locally
- **Edge Cases:** All disabled, maxSkills limit, truncation flag, empty pool
- **Determinism:** EXCELLENT
- **Verdict:** ORPHAN — tests self-contained logic, not actual codebase

### 28. sprint-044-modules.test.ts (415 LoC, 13 tests)
- **Coverage:** Multiple Sprint 044/045 modules: environment.ts, connector.ts, task-router.ts, splash.ts, sprint-summary-rich.ts, config.ts, deck-file.ts, sprint-reporter.ts, sync.ts, explain.ts
- **Mocks:** ProviderAdapter mock
- **Memory V2:** N/A
- **Edge Cases:** Missing env vars, NO_COLOR suppression, config roundtrip, autoResolveDebt with no fix tasks
- **Determinism:** Proper env var save/restore
- **Verdict:** ACCEPTABLE — 7 separate feature tests bundled together

### 29. stack-detection.test.ts (444 LoC, 20 tests)
- **Coverage:** Local stack detection/caching logic — NOT imported from src/
- **Mocks:** None
- **Memory V2:** N/A
- **Orphan Status:** CRITICAL — lines 4-144 define detectProjectStack/getCachePath/readCachedStack/writeCachedStack/isStackStale/getProjectStack locally
- **Edge Cases:** Malformed package.json, cache staleness, force refresh, Next.js over React
- **Determinism:** EXCELLENT
- **Verdict:** ORPHAN — tests self-contained logic, not actual src/core/stack-detector.ts

### 30. zero-config-flow.test.ts (314 LoC, 13 tests)
- **Coverage:** `src/cli/commands/quick-start.ts`, `src/orchestra/rollback.ts`
- **Mocks:** None
- **Memory V2:** N/A
- **Edge Cases:** Cleanup doesn't throw if deleted, special characters in description, all rollback policies
- **Determinism:** GOOD
- **Verdict:** GOOD — full zero-config→rollback→cleanup flow

---

## A2. Integration Test Summary Table

| File | LoC | Tests | Mocks | Mem V2 | Quality |
|------|-----|-------|-------|--------|---------|
| agent-selection | 288 | 16 | 0 | N/A | ORPHAN |
| cascade-block-live | 326 | 4 | 0 | N/A | EXCELLENT |
| collaboration-adaptive | 441 | 28 | 0 | N/A | GOOD |
| config-layers | 413 | 30 | 0 | N/A | GOOD |
| decision-engine | 469 | 20 | 0 | N/A | GOOD |
| e2e-init | 368 | 9 | 4 | N/A | ACCEPTABLE |
| e2e-sprint | 577 | 20 | 2 | N/A | GOOD |
| error-recovery | 578 | 26 | 0 | N/A | EXCELLENT |
| full-sprint-cycle | 452 | 13 | 3 | MOCKED | ACCEPTABLE |
| full-sprint-e2e | 819 | 20 | 0 | N/A | EXCELLENT |
| lifecycle | 934 | 48 | 4 | MOCKED | ACCEPTABLE |
| mcp-flow | 474 | 11 | 6 | N/A | GOOD |
| memory-v2 | 297 | 10 | 0 | REAL DB | BEST PRACTICE |
| multi-agent-pipeline | 321 | 16 | 1 | N/A | ORPHAN |
| multi-env | 387 | 18 | 0 | N/A | EXCELLENT |
| notification-flow | 614 | 27 | 0 | N/A | GOOD |
| npm-install-sim | 173 | 10 | 5 | N/A | WEAK |
| plan-sprint | 314 | 8 | 4 | partial | GOOD |
| plugin-lifecycle | 262 | 10 | 0 | N/A | EXCELLENT |
| progress-summary | 843 | 33 | 0 | N/A | GOOD |
| monorepo | 546 | 16 | 0 | N/A | GOOD |
| python-fastapi | 466 | 14 | 0 | N/A | GOOD |
| typescript-react | 457 | 14 | 0 | N/A | GOOD |
| provider-flow | 280 | 22 | 1 | N/A | ACCEPTABLE |
| review-flow | 689 | 24 | 0 | N/A | GOOD |
| security-flow | 411 | 14 | 0 | N/A | GOOD |
| skill-selection | 515 | 21 | 0 | N/A | ORPHAN |
| sprint-044-modules | 415 | 13 | 1 | N/A | ACCEPTABLE |
| stack-detection | 444 | 20 | 0 | N/A | ORPHAN |
| zero-config-flow | 314 | 13 | 0 | N/A | GOOD |

---

# SECTION B: E2E TESTS (10 files)

## B1. Per-File Analysis

### 1. docker-backend.test.ts (983 LoC, 20+ tests)
- **Coverage:** `src/orchestra/spawn-backend-docker.ts`, `src/monitor/auditor.ts`, `src/core/file-lock.ts`
- **Mocks:** None (real Docker containers)
- **Memory V2:** N/A — clean, no old references
- **Edge Cases:** Container cleanup, exit trap .result, orphan HB detection/cleanup, lock contention, stale lock, invalid JSON resilience, FAILED exitCode reconciliation (exit 137 + DONE → DONE), prompt persistence
- **Determinism:** Date.now() collision risk in task ID (line 375); 500ms polling sleeps
- **Verdict:** EXCELLENT — real Docker integration, atomic write safety, comprehensive state machine

### 2. docker-hb-shutdown.test.ts (435 LoC, 25 tests)
- **Coverage:** `src/agents/worker.ts` (atomicWriteFileSync, fsyncResultFile, writeResult, finalizeHeartbeatOnShutdown), `src/orchestra/spawn-backend-docker.ts`
- **Mocks:** None
- **Memory V2:** N/A
- **Edge Cases:** Large files >64KB, no .tmp left after write, overwrite atomically, fsync returns false when missing, GO_WITH_TECH_DEBT handling, NO_GO doesn't finalize HB, missing .result
- **Determinism:** EXCELLENT — no hardcoded dates/timers
- **Verdict:** EXCELLENT — crash-safety pattern thoroughly tested (temp→fsync→rename)

### 3. event-stream-runtime.test.ts (470 LoC, 10 tests)
- **Coverage:** `src/orchestra/event-stream.ts` (writeEvent, readEvents, reconstructState, readSequence, getCurrentSprintId)
- **Mocks:** None
- **Memory V2:** N/A
- **Edge Cases:** Corrupted JSONL, multi-sprint isolation, incremental reads (afterSequence), 50+ events, source/channel filtering
- **Determinism:** GOOD — monotonic sequence verified
- **Verdict:** EXCELLENT — ADR-035 compliance, all 14+ channels tested

### 4. first-sprint.test.ts (509 LoC, 25 tests)
- **Coverage:** `src/orchestra/brain.ts`, `src/cli/commands/status.ts`, `src/cli/commands/doctor.ts`
- **Mocks:** tmux, child_process, auditor, worker (4 mocks)
- **Memory V2:** Uses DEBT_TABLE_HEADER correctly
- **Edge Cases:** Empty task dir, non-task files ignored, single/multi-task directives, doctor on fresh project
- **Determinism:** GOOD — deterministic mock returns
- **Verdict:** GOOD — brain planning flow well tested

### 5. install-flow.test.ts (406 LoC, 25 tests)
- **Coverage:** `src/cli/commands/init.ts` (formatters), `src/cli/commands/doctor.ts`
- **Mocks:** tmux, child_process, auditor, worker
- **Memory V2:** Creates memory files correctly (MEMORY_FILE, DECISIONS_FILE, DEBT_FILE)
- **Edge Cases:** Language variations (en, tr), .gitignore entries, i18n file creation, doctor on fresh project
- **Determinism:** GOOD
- **Verdict:** GOOD — comprehensive init flow with 20+ files

### 6. provider-smoke.test.ts (463 LoC, 30 tests)
- **Coverage:** `src/providers/claude.ts`, `src/providers/codex.ts`, `src/providers/gemini.ts`, `src/core/provider.ts`, `src/core/model-equivalence.ts`
- **Mocks:** None (real adapters)
- **Memory V2:** N/A
- **Edge Cases:** Fallback chains (claude→codex, codex→gemini), model tier mapping, ProviderUnavailableError, missing API key
- **Determinism:** GOOD
- **Issue:** TEST_DIR hardcoded as `/tmp/deckent-provider-smoke-test` (not isolated)
- **Verdict:** GOOD — all 3 providers smoke tested

### 7. single-provider.test.ts (468 LoC, 25 tests)
- **Coverage:** `src/core/provider.ts` (ProviderRegistry, resolveProviderWithFallback)
- **Mocks:** Mock adapter factory
- **Memory V2:** N/A
- **Edge Cases:** Codex-only, Gemini-only, no providers→throws, fallback unavailable→throws, model tier fallback
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — each provider scenario independently tested

### 8. sprint-lifecycle.test.ts (257 LoC, 13 tests)
- **Coverage:** `src/orchestra/spawn-backend-mock.ts`, `src/orchestra/result-collector.ts`, `src/orchestra/sprint-reporter.ts`
- **Mocks:** MockSpawnBackend (instant simulation)
- **Memory V2:** N/A
- **Edge Cases:** Single DONE, mixed results (no double-counting), timeout→NO_GO, 6-task queue, empty sprint
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — full lifecycle spawn→wait→evaluate→metrics

### 9. subprocess-backend.test.ts (660 LoC, 45 tests)
- **Coverage:** `src/providers/subprocess.ts`, `src/orchestra/spawn-backend.ts`
- **Mocks:** None (real subprocess spawning)
- **Memory V2:** N/A
- **Edge Cases:** Duplicate spawn throws, kill unknown throws, timeout auto-kill, fallback .result (exit 0→GO_WITH_TECH_DEBT, non-zero→NO_GO), doesn't overwrite existing .result, stdin prompt, log capture, concurrent tracking
- **Determinism:** 50ms polling with 5000ms timeout — potential flakiness on slow systems
- **Verdict:** EXCELLENT — 20 test categories, real subprocess execution

### 10. tmux-backend.test.ts (613 LoC, 35 tests)
- **Coverage:** `src/orchestra/tmux.ts`, `src/orchestra/spawn-backend.ts`
- **Mocks:** None (Section A: unit; Section B: real tmux with skipIf)
- **Memory V2:** N/A
- **Edge Cases:** Session create/destroy, window naming, kill non-existent window, list filtering, pipe-pane, has-session, concurrent workers, prompt file I/O, stdin redirect
- **Determinism:** EXCELLENT — skipIf(!tmuxAvailable), unique session per PID
- **Verdict:** EXCELLENT — first tmux E2E since Sprint 123

## B2. E2E Test Summary Table

| File | LoC | Tests | Mocks | Quality |
|------|-----|-------|-------|---------|
| docker-backend | 983 | 20+ | 0 | EXCELLENT |
| docker-hb-shutdown | 435 | 25 | 0 | EXCELLENT |
| event-stream-runtime | 470 | 10 | 0 | EXCELLENT |
| first-sprint | 509 | 25 | 4 | GOOD |
| install-flow | 406 | 25 | 4 | GOOD |
| provider-smoke | 463 | 30 | 0 | GOOD |
| single-provider | 468 | 25 | 0 | GOOD |
| sprint-lifecycle | 257 | 13 | 0 | GOOD |
| subprocess-backend | 660 | 45 | 0 | EXCELLENT |
| tmux-backend | 613 | 35 | 0 | EXCELLENT |

---

# SECTION C: DASHBOARD TESTS (16 files)

## C1. Per-File Analysis

### 1. AgentDetail.test.tsx (321 LoC, 18 tests)
- **Coverage:** `src/dashboard/src/components/AgentDetail.tsx`
- **Mocks:** globalThis.fetch + fake timers
- **Edge Cases:** Fetch error, null log, empty scope, custom apiBase, missing model
- **Determinism:** GOOD — fake timers with explicit advanceTimersByTime(3000)
- **Issue:** Line 174 renders without LanguageProvider (inconsistent)
- **Verdict:** GOOD — comprehensive polling behavior tests

### 2. SprintSummary.test.tsx (543 LoC, 67 tests)
- **Coverage:** `src/dashboard/src/components/SprintSummary.tsx`
- **Mocks:** fetch in beforeEach
- **Edge Cases:** Empty array→0, estimateTimeRemaining edge cases, zero tasks, 100% completion, no provider breakdown
- **Determinism:** PROBLEMATIC — Date.now() for elapsed time; "timing-dependent rounding" comment at line 293
- **Verdict:** GOOD — most comprehensive dashboard test but flaky timing

### 3. TaskCard.test.tsx (394 LoC, 59 tests)
- **Coverage:** `src/dashboard/src/components/TaskCard.tsx`
- **Mocks:** fetch in beforeEach
- **Edge Cases:** Unknown status, missing model badge, zero failed tests, expandable with no details, dependency waiting, retry attempt
- **Determinism:** EXCELLENT — pure rendering tests
- **Verdict:** EXCELLENT — thorough UI state coverage

### 4. api.test.ts (103 LoC, 7 tests)
- **Coverage:** `src/dashboard/src/lib/api.ts`
- **Mocks:** mockFetch vi.fn()
- **Edge Cases:** Non-ok→ApiError, correct status property, POST without body, POST failure
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — minimal but focused

### 5. api/output-stream.test.ts (490 LoC, 27 tests)
- **Coverage:** `src/dashboard/api/output-stream.ts`
- **Mocks:** vi.mock OutputCollector + fake timers
- **Edge Cases:** Missing taskId→400, undefined req.url, empty query, whitespace trim, response ended/destroyed, done event on worker exit, max connection timeout, client disconnect
- **Determinism:** EXCELLENT — explicit timer advancement
- **Verdict:** GOOD — complex SSE event testing

### 6. components.test.ts (263 LoC, 36 tests)
- **Coverage:** `src/dashboard/src/components/SprintChart.tsx`, `src/dashboard/src/components/DebtTable.tsx`, `src/dashboard/src/components/ui/tabs.tsx`
- **Mocks:** None (file inspection + pure function tests)
- **Edge Cases:** Empty array, missing fields, non-numeric tasks, empty debt string, header-only table, fewer columns, whitespace trimming
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — thorough parseChartData/parseDebtMarkdown edge cases

### 7. config-integration.test.ts (263 LoC, 16 tests)
- **Coverage:** `src/dashboard/src/lib/api.ts`
- **Mocks:** mockFetch
- **Edge Cases:** 404, 422, 400, 500 errors, network errors for GET/POST, nested key preservation
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — round-trip config testing

### 8. config-page.test.tsx (104 LoC, 12 tests)
- **Coverage:** `src/dashboard/src/pages/ConfigPage.tsx`
- **Mocks:** None (FILE INSPECTION ONLY)
- **Edge Cases:** All config field types (select, boolean, number, text), 13 categories, 20+ config keys
- **Determinism:** EXCELLENT
- **Issue:** No actual React component rendering — only source file inspection
- **Verdict:** WEAK — file inspection ≠ behavioral testing

### 9. dashboard-page.test.ts (291 LoC, 35 tests)
- **Coverage:** `src/dashboard/src/pages/DashboardPage.tsx`, `src/dashboard/src/components/NewSprintModal.tsx`, `src/dashboard/src/pages/ConfigPage.tsx`
- **Mocks:** None (file inspection)
- **Edge Cases:** Error in modal, 6 modal states
- **Determinism:** EXCELLENT
- **Verdict:** ACCEPTABLE — mixed coverage, file inspection pattern

### 10. i18n-coverage.test.ts (174 LoC, 6 tests)
- **Coverage:** Multiple component files, `src/dashboard/src/i18n/en.ts`, `src/dashboard/src/i18n/tr.ts`
- **Mocks:** None
- **Edge Cases:** Hardcoded English detection with helper export exclusion, key parity EN↔TR, no empty translations
- **Determinism:** EXCELLENT
- **Verdict:** EXCELLENT — sophisticated i18n completeness validation

### 11. layout.test.ts (322 LoC, 50 tests)
- **Coverage:** `src/dashboard/src/components/Layout.tsx`, ThemeProvider, Sheet, ScrollArea, App, CSS
- **Mocks:** None (file inspection)
- **Edge Cases:** Mobile hamburger, escape key, body scroll prevention
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — 50 tests covering 6 files

### 12. live-data.test.ts (248 LoC, 41 tests)
- **Coverage:** `src/dashboard/src/hooks/useSSE.ts`, WorkerCard, ActivityFeed, SprintPhaseTimeline
- **Mocks:** None (file inspection)
- **Edge Cases:** Error/disconnect with 3s reconnect, empty activity, no sprint state, MAX_ENTRIES=50
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — SSE hook + live component coverage

### 13. pages.test.ts (148 LoC, 22 tests)
- **Coverage:** `src/dashboard/src/pages/HistoryPage.tsx`, `src/dashboard/src/pages/MemoryPage.tsx`
- **Mocks:** None (file inspection)
- **Edge Cases:** Loading state, error state, empty history, memory tab loading/error
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — but no actual rendering

### 14. scaffold.test.ts (155 LoC, 15 tests)
- **Coverage:** Project-wide scaffold validation
- **Mocks:** None
- **Edge Cases:** CI node_modules graceful skip
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — validates 18 required dashboard files + configs

### 15. types.test.ts (93 LoC, 6 tests)
- **Coverage:** `src/dashboard/src/types/index.ts`
- **Mocks:** None
- **Edge Cases:** Undefined optional fields, partial objects
- **Determinism:** EXCELLENT
- **Verdict:** ACCEPTABLE — runtime type checks, minimal coverage

### 16. utils.test.ts (38 LoC, 8 tests)
- **Coverage:** `src/dashboard/src/lib/utils.ts`
- **Mocks:** None
- **Edge Cases:** Undefined/null inputs, empty string, array inputs, object inputs, Tailwind dedup
- **Determinism:** EXCELLENT
- **Verdict:** GOOD — small focused test for small utility

## C2. Dashboard Test Summary Table

| File | LoC | Tests | Mocks | Rendering | Quality |
|------|-----|-------|-------|-----------|---------|
| AgentDetail.test.tsx | 321 | 18 | fetch+timers | YES | GOOD |
| SprintSummary.test.tsx | 543 | 67 | fetch | YES | GOOD (flaky) |
| TaskCard.test.tsx | 394 | 59 | fetch | YES | EXCELLENT |
| api.test.ts | 103 | 7 | fetch | N/A | GOOD |
| api/output-stream.test.ts | 490 | 27 | collector+timers | N/A | GOOD |
| components.test.ts | 263 | 36 | none | NO (inspect) | GOOD |
| config-integration.test.ts | 263 | 16 | fetch | N/A | GOOD |
| config-page.test.tsx | 104 | 12 | none | NO (inspect) | WEAK |
| dashboard-page.test.ts | 291 | 35 | none | NO (inspect) | ACCEPTABLE |
| i18n-coverage.test.ts | 174 | 6 | none | NO (inspect) | EXCELLENT |
| layout.test.ts | 322 | 50 | none | NO (inspect) | GOOD |
| live-data.test.ts | 248 | 41 | none | NO (inspect) | GOOD |
| pages.test.ts | 148 | 22 | none | NO (inspect) | GOOD |
| scaffold.test.ts | 155 | 15 | none | N/A | GOOD |
| types.test.ts | 93 | 6 | none | NO | ACCEPTABLE |
| utils.test.ts | 38 | 8 | none | N/A | GOOD |

---

# SECTION D: CROSS-CUTTING FINDINGS

## D1. CRITICAL ISSUES (P0)

### 1. Orphan Test Functions (3 files)
Tests that define and validate local implementations NOT from src/:
- **agent-selection.test.ts** — `selectAgent()`, `buildAgentPrompt()` defined locally (288 LoC)
- **multi-agent-pipeline.test.ts** — `runPipeline()` defined locally (321 LoC)
- **skill-selection.test.ts** — `selectSkills()`, `scoreSkill()`, `buildSkillPrompt()`, `updateSkillStats()` defined locally (515 LoC)
- **stack-detection.test.ts** — `detectProjectStack()`, `getCachePath()`, `readCachedStack()` etc. defined locally (444 LoC)

**Impact:** ~1,568 LoC of tests that validate self-contained logic, not actual source code. These tests will pass even if the real implementations in `src/` are completely different or broken.

**Recommendation:** Import from actual src/ modules or delete/reclassify as spec/prototype tests.

### 2. Memory V2 Integration Gap
Only **1 out of 56 files** (memory-v2.test.ts) tests real MemoryStore V2 with SQLite.
- `full-sprint-cycle.test.ts` — MemoryStore MOCKED
- `lifecycle.test.ts` — MemoryStore MOCKED
- All other files — N/A (don't touch memory)

**Impact:** Brain sprint lifecycle (plan→evaluate→retro→decay) is never tested with a real database in integration/e2e tests.

**Recommendation:** Add at least one full sprint lifecycle test with real MemoryStore (not mocked).

### 3. Missing Path Traversal Security Test
`security-flow.test.ts` tests scope enforcement by array membership but does NOT test:
- `../../../etc/passwd` traversal
- Symlink escape
- Null byte injection

**Impact:** Scope boundary could be bypassed via path manipulation.

## D2. HIGH ISSUES (P1)

### 4. Dashboard File Inspection vs Behavioral Testing
10 out of 16 dashboard tests use file inspection (readFileSync + string matching) instead of actual React component rendering:
- config-page.test.tsx, dashboard-page.test.ts, layout.test.ts, live-data.test.ts, pages.test.ts, components.test.ts (partial)

**Impact:** Tests verify source code strings exist, not that components actually render or behave correctly. A renamed CSS class or refactored JSX structure could break functionality while all tests still pass.

### 5. Prototype Mutation Anti-Pattern
`provider-flow.test.ts` line 185-196 directly mutates `TmuxBackend.prototype.isAvailable` — this can leak state to other tests if not properly restored.

**Recommendation:** Use `vi.spyOn(TmuxBackend.prototype, 'isAvailable')` instead.

### 6. SprintSummary Timing Flakiness
`SprintSummary.test.tsx` uses `Date.now()` for elapsed/remaining time calculations without fake timers:
- Line 293: "timing-dependent rounding" acknowledged in comment
- Result varies: "~10-11 min remaining" depending on execution speed

**Recommendation:** Use `vi.useFakeTimers()` with fixed `Date.now()`.

## D3. MEDIUM ISSUES (P2)

### 7. npm-install-sim Tests Mock, Not Reality
Tests mock fs.readFileSync to return test data, then verify that test data. Never reads real package.json.

### 8. Determinism Concerns in Integration Tests
- `notification-flow.test.ts` — `new Date()` without mocking
- `progress-summary.test.ts` — heartbeat timestamps use `Date.now()`
- `docker-backend.test.ts` — `Date.now()` in task ID (collision risk)
- `review-flow.test.ts` — `new Date().toISOString()` for timestamps

### 9. Missing Persistence Tests
- `review-flow.test.ts` — No test for approve→reload→verify persistence
- `config-layers.test.ts` — No test for config survival across restarts

### 10. Provider Smoke Test Path Not Isolated
`provider-smoke.test.ts` uses hardcoded `/tmp/deckent-provider-smoke-test` — not unique per test run, potential collision in parallel CI.

## D4. LOW ISSUES (P3)

### 11. E2E Polling Flakiness
- `subprocess-backend.test.ts` — 50ms polling with 5000ms timeout
- `docker-backend.test.ts` — 500ms polling sleeps

### 12. Dashboard useApi Hook Not Behaviorally Tested
Only file inspection tests exist for `useApi.ts` — no actual hook rendering/lifecycle tests.

### 13. ConfigPage Has No Rendering Tests
`config-page.test.tsx` is 100% file inspection — no component mounting, form interaction, or state testing.

---

# SECTION E: MEMORY V2 COMPLIANCE MATRIX

| File | Uses MemoryStore | Real DB | Mocked | countBrainLines | parseDebtTable | Status |
|------|-----------------|---------|--------|-----------------|----------------|--------|
| memory-v2.test.ts | YES | YES | NO | NO | NO | COMPLIANT |
| full-sprint-cycle.test.ts | YES | NO | YES | NO | NO | PARTIALLY COMPLIANT |
| lifecycle.test.ts | YES | NO | YES | NO | NO | PARTIALLY COMPLIANT |
| mcp-flow.test.ts | NO | N/A | N/A | YES (mocked→50) | NO | LEGACY REFERENCE |
| All other 52 files | NO | N/A | N/A | NO | NO | N/A |

**Key Finding:** `mcp-flow.test.ts` still mocks `countBrainLines` from utils.js — this is a V1 legacy reference. The function may still exist in utils.ts but should be checked for Memory V2 migration completeness.

---

# SECTION F: TEST-TO-SOURCE COVERAGE MAP

## F1. src/ modules WITH integration/e2e/dashboard tests

| src/ Module | Test File(s) | Type |
|-------------|-------------|------|
| src/core/config.ts | config-layers, lifecycle, first-sprint | integration |
| src/core/environment.ts | multi-env | integration |
| src/core/file-lock.ts | docker-backend | e2e |
| src/core/memory-store.ts | memory-v2 | integration |
| src/core/memory-query.ts | memory-v2 | integration |
| src/core/memory-export.ts | memory-v2 | integration |
| src/core/memory-import.ts | memory-v2 | integration |
| src/core/model-equivalence.ts | provider-smoke | e2e |
| src/core/multi-ide.ts | multi-env | integration |
| src/core/notifications.ts | notification-flow | integration |
| src/core/notification-config.ts | notification-flow | integration |
| src/core/notification-providers/*.ts | notification-flow | integration |
| src/core/plugin.ts | plugin-lifecycle | integration |
| src/core/provider.ts | provider-flow, provider-smoke, single-provider | integration+e2e |
| src/core/stack-detector.ts | multi-env | integration |
| src/orchestra/brain.ts | e2e-init, e2e-sprint, full-sprint-cycle, lifecycle, plan-sprint, first-sprint | integration+e2e |
| src/orchestra/decision-engine.ts | decision-engine, error-recovery, full-sprint-e2e, monorepo, python-fastapi, typescript-react | integration |
| src/orchestra/dependency-scheduler.ts | cascade-block-live | integration |
| src/orchestra/event-stream.ts | cascade-block-live, event-stream-runtime | integration+e2e |
| src/orchestra/pattern-recorder.ts | decision-engine, error-recovery, full-sprint-e2e | integration |
| src/orchestra/pattern-reader.ts | decision-engine, error-recovery, full-sprint-e2e | integration |
| src/orchestra/result-collector.ts | sprint-lifecycle | e2e |
| src/orchestra/rollback.ts | zero-config-flow | integration |
| src/orchestra/spawn-backend.ts | provider-flow, subprocess-backend, tmux-backend | integration+e2e |
| src/orchestra/spawn-backend-docker.ts | docker-backend, docker-hb-shutdown | e2e |
| src/orchestra/spawn-backend-mock.ts | sprint-lifecycle | e2e |
| src/orchestra/sprint-reporter.ts | sprint-lifecycle | e2e |
| src/orchestra/tmux.ts | tmux-backend | e2e |
| src/agents/adaptive-agent.ts | collaboration-adaptive | integration |
| src/agents/worker.ts | lifecycle, e2e-sprint, security-flow, docker-hb-shutdown | integration+e2e |
| src/monitor/auditor.ts | lifecycle, security-flow | integration |
| src/providers/claude.ts | provider-smoke | e2e |
| src/providers/codex.ts | provider-smoke | e2e |
| src/providers/gemini.ts | provider-smoke | e2e |
| src/api/server.ts | security-flow | integration |
| src/cli/commands/doctor.ts | first-sprint, install-flow | e2e |
| src/cli/commands/init.ts | install-flow | e2e |
| src/cli/commands/quick-start.ts | zero-config-flow | integration |
| src/cli/commands/status.ts | first-sprint | e2e |
| src/cli/helpers/*.ts (8 modules) | progress-summary | integration |
| src/cli/helpers/codex-config.ts | multi-env | integration |
| src/cli/helpers/gemini-config.ts | multi-env | integration |
| src/cli/helpers/cursor-config.ts | multi-env | integration |
| src/cli/helpers/review-actions.ts | review-flow | integration |
| src/cli/helpers/selective-retry.ts | review-flow | integration |
| src/cli/helpers/review-summary.ts | review-flow | integration |
| src/mcp/tools/init.ts | mcp-flow | integration |
| src/mcp/tools/directives.ts | mcp-flow | integration |
| src/mcp/tools/doctor.ts | mcp-flow | integration |
| src/dashboard/src/components/AgentDetail.tsx | AgentDetail.test.tsx | dashboard |
| src/dashboard/src/components/SprintSummary.tsx | SprintSummary.test.tsx | dashboard |
| src/dashboard/src/components/TaskCard.tsx | TaskCard.test.tsx | dashboard |
| src/dashboard/src/lib/api.ts | api.test.ts, config-integration | dashboard |
| src/dashboard/api/output-stream.ts | output-stream.test.ts | dashboard |
| src/dashboard/src/lib/utils.ts | utils.test.ts | dashboard |
| src/dashboard/src/types/index.ts | types.test.ts | dashboard |
| src/dashboard/src/i18n/*.ts | i18n-coverage.test.ts | dashboard |

## F2. src/ modules WITHOUT integration/e2e/dashboard tests (GAPS)

Notable modules with no integration-level testing in these 56 files:
- `src/core/activation-engine.ts` — no integration test
- `src/core/routing-engine.ts` — no integration test (unit tests may exist elsewhere)
- `src/core/condition-evaluator.ts` — no integration test
- `src/core/credential-encryption.ts` — no integration test
- `src/core/token-counter.ts` — no integration test
- `src/orchestra/authority-enforcer.ts` — no integration test (ADR-037)
- `src/orchestra/self-modifying-detector.ts` — no integration test (ADR-039)
- `src/orchestra/sprint-checkpoint.ts` — no integration test (resume capability)
- `src/orchestra/mid-sprint-adapter.ts` — no integration test
- `src/orchestra/promotion-pipeline.ts` — no integration test
- `src/orchestra/managed-docs/*.ts` — no integration test
- `src/api/rate-limiter.ts` — no integration test
- `src/api/auth.ts` — partial (security-flow covers generateApiToken/checkAuth)
- `src/mcp/tools/memory-query.ts` — no integration test (0 tests noted in DIRECTIVES)
- `src/dashboard/src/hooks/useApi.ts` — file inspection only
- `src/dashboard/src/hooks/useSSE.ts` — file inspection only
- `src/dashboard/src/pages/ConfigPage.tsx` — file inspection only
- `src/dashboard/src/pages/HistoryPage.tsx` — file inspection only
- `src/dashboard/src/pages/MemoryPage.tsx` — file inspection only

---

# SECTION G: METRICS SUMMARY

## G1. Overall Quality Distribution

| Quality Rating | Integration | E2E | Dashboard | Total |
|---------------|-------------|-----|-----------|-------|
| EXCELLENT | 6 | 5 | 3 | 14 (25%) |
| GOOD | 14 | 5 | 9 | 28 (50%) |
| ACCEPTABLE | 6 | 0 | 2 | 8 (14%) |
| WEAK | 1 | 0 | 1 | 2 (4%) |
| ORPHAN | 3 | 0 | 0 | 3 (5%) |
| BEST PRACTICE | 1 | 0 | 0 | 1 (2%) |

## G2. Mock Intensity

| Mock Level | Files | % |
|------------|-------|---|
| No mocks (real I/O) | 36 | 64% |
| Light mocks (1-2) | 7 | 13% |
| Heavy mocks (3+) | 8 | 14% |
| File inspection only | 5 | 9% |

## G3. Determinism Score

| Score | Files | % |
|-------|-------|---|
| EXCELLENT | 35 | 63% |
| GOOD | 14 | 25% |
| PROBLEMATIC | 4 | 7% |
| WEAK | 3 | 5% |

## G4. Issue Severity Count

| Severity | Count | Key Examples |
|----------|-------|-------------|
| P0 (Critical) | 3 | Orphan functions, Memory V2 integration gap, missing path traversal test |
| P1 (High) | 3 | Dashboard inspection pattern, prototype mutation, SprintSummary flakiness |
| P2 (Medium) | 4 | npm-install mock-only, determinism concerns, missing persistence, path isolation |
| P3 (Low) | 3 | Polling flakiness, useApi not tested, ConfigPage no rendering |

---

# SECTION H: RECOMMENDATIONS FOR SPRINT 142+

## Priority 1 (P0 — Sprint 142)
1. **Fix orphan tests:** Import actual functions from src/ in agent-selection, multi-agent-pipeline, skill-selection, stack-detection tests — or delete/reclassify
2. **Add real MemoryStore sprint lifecycle test:** At least one integration test that exercises plan→evaluate→retro→decay with a real SQLite database
3. **Add path traversal security tests:** Test `../../` escape, symlink escape, null byte in security-flow.test.ts

## Priority 2 (P1 — Sprint 142-143)
4. **Convert dashboard file-inspection tests to rendering tests:** At minimum ConfigPage, HistoryPage, MemoryPage
5. **Fix prototype mutation:** Use vi.spyOn in provider-flow.test.ts
6. **Fix SprintSummary timing:** Use vi.useFakeTimers() with controlled Date.now()

## Priority 3 (P2 — Sprint 143+)
7. **Add integration tests for:** mcp/tools/memory-query.ts, authority-enforcer.ts, self-modifying-detector.ts, sprint-checkpoint.ts
8. **Fix determinism:** Mock Date.now() in notification-flow, progress-summary, docker-backend
9. **Isolate provider-smoke test path:** Use mkdtempSync instead of hardcoded /tmp/
10. **Add persistence round-trip tests:** review-flow (approve→reload→verify), config (save→restart→load)

## Priority 4 (P3 — Backlog)
11. Add useApi/useSSE behavioral hook tests
12. ConfigPage form interaction tests
13. Reduce polling flakiness in subprocess/docker backend tests
14. Remove countBrainLines legacy mock from mcp-flow.test.ts

---

**Analysis completed: 56 files, ~22,093 LoC, ~1,132 tests analyzed.**
**Verdict: ANALYZED**
