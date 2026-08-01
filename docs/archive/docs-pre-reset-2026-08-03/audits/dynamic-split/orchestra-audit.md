# src/orchestra/ — Consolidated Audit Report

**Task:** Sprint 185 / 185-002 — Dynamic-split codebase audit
**Auditor:** doc-writer (worker `w-185-002`, model `opus`)
**Date:** 2026-05-21
**Scope:** `src/orchestra/` — 97 `.ts` files, ~33,428 LoC (root: 80 files + 3 subdirs: `decision-steps/` 2 files, `doc-updaters/` 8 files, `managed-docs/` 9 files)
**Output mode:** Single consolidated report (per DIRECTIVES Sprint 185 task scope — `orchestra-audit.md`, not 76+ per-file reports)

> **Methodology note.** The original 9-section template ("Inventory + Bağlam + Debt Risk + Dead Code + Documentation Gaps + ADR Compliance + Refactor Recommendations + Sprint 187 Follow-up + Summary") is applied at the *report* level, not per file: with 97 modules and ~33K LoC, a 9× per-file expansion would exceed any reasonable audit budget and obscure cross-cutting findings. Per-module observations are folded into Section 1 (Inventory) and the thematic sections that follow. Where a finding is module-specific, the file path is cited inline (`file:line` format).

---

## 1. Inventory

### 1.1 Sub-tree shape

| Path | Files | Notes |
|---|---|---|
| `src/orchestra/` (root) | 80 | Sprint lifecycle, planner, evaluator, routing, IPC, RBAC, scheduling, conflict resolution |
| `src/orchestra/decision-steps/` | 2 | Step plug-ins for `DecisionOrchestrator` (V1 routing pipeline — deprecated) |
| `src/orchestra/doc-updaters/` | 8 | Plug-in registry for managed-docs phase (sprint-log, changelog, README metrics, health-check, registry, types) |
| `src/orchestra/managed-docs/` | 9 | Template-driven doc-render pipeline (ADR-029/030/031/032) |
| **Total** | **97** | wc -l: 33,428 lines |

### 1.2 Module catalog (by role)

**A. Public barrel + thin re-export layer (2 files, 162 LoC)**
- `index.ts` (109) — public API surface; re-exports for `cli/`, `mcp/`, `api/` consumers only (`runSprint`, `planSprint`, `readContext`, `buildWorkerPrompt`, `cleanup`, `finalizeSprint`, tmux backend, doc-updaters, OutcomeTracker, RuleEvolver, PromotionPipeline, …). Explicit `@internal` boundary comment.
- `brain.ts` (53) — **Slim re-export layer**. No implementation; re-exports from `sprint-controller.js`, `model-selector.js`, `task-builder.js`, `debt-manager.js`, `sprint-reporter.js`, `coverage-validator.js`, `rollback.js`. Header comment cites Sprint 036 split.

**B. Sprint lifecycle core (12 files, ~6,900 LoC)**
- `sprint-controller.ts` (984) — `runSprint()` orchestrator + lazy nervous-system bootstrap + crash-recovery resume + plan-time collision wire (`consultCollisionDecision`, `readTaskJsonFresh`). Sprint 136 slim layer (from 1,894 LoC).
- `sprint-phases.ts` (1,368) — `runPlanPhase`, `runSpawnPhase`, `runEvaluatePhase`, `runRollbackCheck`, `runFixPhase`, `runRetroPhase`, `runCleanupPhase`. Note: safe circular dep with `sprint-controller.ts` (cross-refs are deferred inside function bodies).
- `sprint-spawner.ts` (1,084) — `spawnWorkers()`, `respawnEligibleTasks()`, `validateTaskDependencies()`, `routeSprintTasks()`. ADR-045 + ADR-064 wave/TOPP runtime wire; consumes `dependency-scheduler` + `handleScopeCollision`.
- `sprint-finalizer.ts` (1,310) — `finalizeSprint()`, `applyAdaptiveThresholds()`, `runHonestyCheck()`, `writeRubricDetail()`, `runSelfAuditGate()`, hooks for managed-docs phase.
- `sprint-planner.ts` (846) — `readContext()`, `planSprint()`, `confirmDraftTasks()`, `cleanupDraftTasks()`. Uses Memory V2 / MemoryStore via core.
- `sprint-lifecycle.ts` (603) — pause/resume/abort, `interruptActiveSprint`, `setActiveSprint`/`clearActiveSprint`, `safeDashboardUpdate`, `waitForHumanApproval`.
- `sprint-checkpoint.ts` (643) — phase-transition checkpoints, dependency-graph embed, atomic rename (Sprint 139 Task 030).
- `sprint-utils.ts` (361) — `isDocTask`, `isStaleTaskFile`, `getDefaultProvider`, `resolveTaskProvider`, `writeSprintState`/`readSprintState`/`clearSprintState`, `detectOrphanWorkers`, `buildSpawnRetryHint`.
- `sprint-state-tracker.ts` (113) — `getSprintStateSnapshot()`, the late-binding target consumed by `sprint-controller.loadSprintStateProvider`.
- `sprint-pid-manager.ts` (251) — `writePid`/`clearPid`/`writeStateSnapshot` for crash detection.
- `sprint-lifecycle.ts` (603) — see above.
- `sprint-metrics.ts` (614) — sprint-level metric aggregation.

**C. Sprint reporting + managed docs (5 files, ~2,100 LoC + 9 managed-docs files ~1,800 LoC)**
- `sprint-reporter.ts` (184) — public surface `writeRetrospective`, `writeSprintLog`, `calculateMetrics`, `updateProjectDocs`, `buildAgentPerformance`, `buildSkillPerformance`, `archiveDirectives`, `archiveOrphanTasks`, `generateProjectIdentity`/`updateProjectIdentity`.
- `sprint-retro-writer.ts` (743) — retrospective content composition.
- `sprint-docs-updater.ts` (834) — managed-docs runner entry from finalizer + `cleanTasksArchive`.
- `sprint-docs-helpers.ts` (349) — shared helpers for sprint-docs-updater.
- `sprint-runner-entry.ts` (333) — CLI / subprocess entrypoint shim.
- `managed-docs/` (9) — see Section 1.3.

**D. Task creation, routing, evaluation (8 files, ~5,300 LoC)**
- `task-builder.ts` (1,161) — `createTask`, `extractScopeFromDirective`, `parseStructuredDirectives`, `buildWorkerPrompt`, `plannerTaskToParams`, `resolveWorkerEffort`. Includes ADR-injection + skill-prompt filtering integration.
- `task-router.ts` (318) — `routeTask()` plus `detectTaskType` (code/test/doc/design/unknown) for skill_routing.
- `task-analyzer.ts` (140) — `TaskAnalyzer` class for V1 decision pipeline (deprecated path).
- `task-restoration.ts` (268) — re-construct/repair task state on resume.
- `task-retry.ts` (92) — retry-classifier helpers.
- `task-mode-runner.ts` (122) — single-task (non-sprint) execution shim (`deckent_style === 'task'`).
- `result-evaluator.ts` (2,085) — `evaluateResult`, `isDocTask`, `evaluateWithRubric`, `classifyFailure`, `decideCascadeAction`, `tryCodeVerifiedDone` re-export, `getRecentSprintStats`, `GO_WITH_GATE_FAILURE`. **Largest module** in `orchestra/`.
- `quality-assessor.ts` (210) — `assessQuality()`, `isCoverageEscapeHatchTask()` (W4-1 escape hatch).

**E. Planner pipeline (3 files, ~870 LoC)**
- `planner.ts` (671) — `buildPlanPrompt`, `parsePlannerResponse`, `buildPlannerSpawnArgs`, `callBrainPlanner`, `buildZeroConfigPlanPrompt`. **Only imports `core/`** — never `brain` (ADR-008 cited in CLAUDE.md is honored at module level).
- `adr-selector.ts` (388) — `selectRelevantAdrs()`, `buildAdrPromptSection()`. ADR-036 governance integration.
- `prompt-god-template.ts` (639) — `buildTaskPrompt`, sprint-context-aware prompt composition, `DEPENDENCY_ENTRY_MAX_CHARS` cap (Sprint 183 W1-3).

**F. Provider / spawn backends (5 files, ~1,900 LoC)**
- `spawn-backend.ts` (372) — `SpawnBackend` interface, `TmuxBackend`, `SubprocessBackend`, `SpawnBackendFactory`, `resolveBackend`, deprecation warning, `LARGE_PROMPT_THRESHOLD_CHARS`/`isLargePrompt` (Sprint 183 W1-3).
- `spawn-backend-docker.ts` (1,058) — Docker isolated-container worker spawn.
- `spawn-backend-mock.ts` (107) — test-only mock backend.
- `tmux.ts` (400) — `ensureSession`, `spawnWorker`, `killWorker`, `listWorkers`, `attach`, `destroy`, `setupWatchWindow`, `createWatchLayout`, `attachToWorkerPane`, `TmuxError`. **Deprecated** per `spawn-backend.ts:247`.
- `connector.ts` (7) — Connector interface stub.

**G. Routing engine V1 (decision-engine deprecated, kept for reference) (4 files, ~410 LoC)**
- `decision-engine.ts` (227) — `DecisionOrchestrator` (V1 pipeline) **DEPRECATED Sprint 066**. New exception: `handleScopeCollision()` is *not* deprecated — pure decision function for Sprint 168 C0c collision wire (used in production by `sprint-controller.consultCollisionDecision` + `sprint-spawner`).
- `decision-steps/agent-step.ts` (82) — V1 step impl.
- `decision-steps/scope-step.ts` (91) — V1 step impl.
- `decision-logger.ts` (149) — decision logging stub.
- `decision-replay.ts` (149) — decision replay/audit stub.
- `model-selector.ts` (282) — `calculateModelScore`, `inferModelFromDirective`, `resolveTaskModel`, `parsePatterns`, `deduplicatePatterns`, `suggestModelFromPatterns`. Used by both V1 and runtime.

**H. Authority, scheduling, conflict resolution (4 files, ~1,700 LoC)**
- `authority-enforcer.ts` (673) — **ADR-037 RBAC matrix** for Brain/Auditor/Worker. `checkAuthority()`, `enforceAdrCompliance()` for ADR-006/008/010, `emitAuthorityViolation()`. Currently *soft* (V1.0).
- `dependency-scheduler.ts` (687) — Kahn's topological sort, wave assignment, `enforceWaveDependency`, `cascadeBlockDependents`, `unblockDependents`, `applyFailureCascade`, `applyResolutionUnblock`, `persistDependencyGraph`/`loadDependencyGraph`, Mermaid diagram (ADR-045).
- `parallel-pipeline.ts` (124) — `ParallelPipelineManager`, `DependencyCycleError`. Topological dependency-wave builder (older, narrower than `dependency-scheduler`).
- `conflict-resolver.ts` (276) — `ConflictResolver.detectConflicts()`, `detectScopeCollisions()` for plan-time/spawn-time collision detection (Sprint 138 ADR-035).
- `self-modifying-detector.ts` (163) — ADR-039 deckent-dogfood vs user-project discriminator (`detectDeckentRepo`, `DECKENT_SOURCE_PATTERNS`, per-projectRoot cache).
- `scope-sanitizer.ts` (154) — scope normalization helpers.
- `sensitive-redactor.ts` (61) — redact secrets in event payloads.

**I. IPC + event stream (5 files, ~1,140 LoC)**
- `event-stream.ts` (527) — append-only JSONL event log (ADR-035 Protocol V1.0), `writeEvent`, `readEvents`, `CHANNELS` constants, `reconstructState`, `clearDependencyBlockedState`. Sequence stored in `.deckent/sprint-NNN-seq`.
- `event-bus.ts` (253) — in-process pub/sub on top of `event-stream`. `eventBus` singleton, `subscribe`/`publish`/`tail`/`watchFile` cross-process detection.
- `ipc-registry.ts` (270) — `ChannelRegistry` for subprocess `WorkerChannel`, file-based question/answer IPC for tmux/docker. Sprint 135 T-004 consolidation.
- `result-collector.ts` (752) — `waitForResults`/`processQueue`/`createWorkerSpawnFn`/`maybeRespawn`. **Hosts the TOPP B continuous-dispatch tick (ADR-064)**.
- `result-watcher.ts` (72) — `createResultWatcher()` fs.watch wrapper.
- `result-merger.ts` (100) — multi-result aggregation helper.

**J. Cross-cutting / supporting (16+ files)**
- `debt-manager.ts` (598) — `handleEvaluation`, `handleCrossDependencies`, `escalateDebt`, `resolveDebt`, `runDecay`, `decay`. DEBT.md / Memory V2 integration.
- `mid-sprint-adapter.ts` (632) — `reconcileSpuriousNoGo`, `reconcileRubricNoGo`, mid-sprint real-time rerouting (FIX phase).
- `outcome-tracker.ts` (501) — `OutcomeTracker`, `RoutingOutcome`, `LearningsData`, `SynergyEntry`, learning-bonus + synergy matrix.
- `rule-evolver.ts` (278) — auto-generate activation rules from outcome data.
- `promotion-pipeline.ts` (286) — temp→permanent agent/skill promotion + demotion.
- `temp-skill-generator.ts` (391) — `generateProjectConventionsSkill`, `generateDataDrivenSkills` (template-based project-conventions skill generation).
- `prompt-token-optimizer.ts` (153) — `filterSkillPromptsByDNA`, `computeSkillRelevance`.
- `pattern-reader.ts` (163) — read PATTERNS.md / violation patterns.
- `pattern-recorder.ts` (95) — append patterns to PATTERNS.md.
- `coverage-validator.ts` (323) — `parseCoverageFromVitest`, `validateCoverage`, `validateWorkerCoverage`, `isDocOnlyTask`.
- `rollback.ts` (353) — `createSafetyPoint`/`rollback`/`getRollbackPolicy`/`recordRollbackInDebt`/`isCleanWorkingTree`/`safetyBranchExists`/`isGitRepo`/`cleanOrphanSafetyPoint`.
- `rubric-registry.ts` (315) — `getRubric`, `coverageOptional`, rubric definitions per task type.
- `evaluation-audit-trail.ts` (191) — evaluation audit trail writer.
- `baseline-tracker.ts` (280) — `captureVitestBaseline`, `writeBaseline` (pre-sprint test baseline capture).
- `timeout-estimator.ts` (185) — `brainEstimateTimeout` heuristic + `SprintHistory` type.
- `timeout-watcher.ts` (305) — worker-side timeout watch loop (Sprint 145).
- `sprint-estimator.ts` (277) — sprint size recommendation.
- `heartbeat-daemon.ts` (307) — heartbeat daemon helper.
- `multi-agent.ts` (120) — multi-agent coordination stub.
- `shared-memory.ts` (142) — in-process memory cache.
- `handoff-protocol.ts` (151) — agent handoff protocol stub.
- `monitor-adapter.ts` (211) — adapter to `monitor/` from `orchestra/`.
- `ci-reporter.ts` (243) — CI regression reporter.
- `ecosystem-intelligence.ts` (193) — `analyzeNewSkill`, `persistSkillActivation`.
- `post-sprint-smoke.ts` (313) — post-sprint smoke test runner.
- `batch-stats.ts` (140) — batch aggregation stats.
- `brain-context.ts` (267) — `BrainContext` builders (memory/debt/patterns/retro/identity composition).

### 1.3 `managed-docs/` and `doc-updaters/` and `decision-steps/`

**`managed-docs/`** (9 files, ~1,750 LoC) — ADR-029/030/031/032 implementation
- `index.ts` (8) — barrel
- `managed-doc-runner.ts` (198) — entry from `sprint-reporter.updateProjectDocs`
- `docs-config.ts` (169) — `.deckent/docs.json` schema + loader
- `template-renderer.ts` (135) — Mustache-like template rendering
- `section-updater.ts` (145) — preserve manually authored sections, replace `<!-- AUTO:section -->` zones
- `plugin-loader.ts` (112) — load user-defined generators (`.deckent/managed-docs/*.{js,ts}`)
- `content-generators.ts` (671) — built-in content generators (metrics, agent table, skill table, sprint history, debt table, ADR list, …)
- `doc-cache.ts` (138) — content-hash skip cache (ADR-031)
- `types.ts` (74) — managed-docs types

**`doc-updaters/`** (8 files, ~480 LoC) — sprint-finalize doc-updater plug-in registry
- `index.ts` (18) — barrel + auto-registers built-in updaters
- `registry.ts` (28) — `registerUpdater`/`getRegisteredUpdaters`/`clearUpdaters`/`runAllUpdaters`
- `types.ts` (28) — `DocUpdater`/`DocUpdateContext`/`DocUpdateResult`/`SprintResult` types
- `changelog.ts` (91) — CHANGELOG.md updater
- `sprint-log.ts` (63) — `.brain/sprints/sprint-NNN.md` updater
- `readme-metrics.ts` (57) — README badge/metrics updater
- `health-check.ts` (77) — `.dashboard` health-check snapshot updater
- `metrics-updater.ts` (91) — auxiliary metrics updater

**`decision-steps/`** (2 files, ~173 LoC) — V1 DecisionOrchestrator step plug-ins, *only used by tests* per `decision-engine.ts:11-14`.

---

## 2. Bağlam (Context)

The `orchestra/` package is Deckent's **sprint lifecycle engine**. Every other top-level package (`cli/`, `mcp/`, `api/`, `agents/`, `monitor/`, `nervous/`) calls into `orchestra/` through `index.ts` to start a sprint, plan tasks, evaluate worker results, or manage the agent/skill pool. The package crystallizes Deckent's central abstraction: the *sprint phase machine* — **PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP** — encoded in `sprint-controller.runSprint()` and the phase functions in `sprint-phases.ts`.

**Architectural style.** Heavy use of *thin orchestrator + extracted helpers* (ADR-026). `brain.ts` (53 LoC) is purely a re-export shim. `sprint-controller.ts` shrank from ~1,894 LoC pre-Sprint-136 to 984 LoC by delegating to dedicated `sprint-planner.ts`, `sprint-spawner.ts`, `sprint-lifecycle.ts`, `sprint-finalizer.ts`, `sprint-phases.ts`, `result-collector.ts`, `ipc-registry.ts`. The split is *not finished* — `result-evaluator.ts` at 2,085 LoC and `sprint-phases.ts` at 1,368 LoC are now the largest god-object candidates.

**Sprint lineage references.** Inline comments in nearly every file annotate provenance: "Sprint 036 split", "Sprint 072 / ADR-024", "Sprint 076 / ADR-026", "Sprint 138 ADR-035", "Sprint 139 Task 030", "Sprint 145 T-002", "Sprint 168 C0c RC2", "Sprint 178 / ADR-064". This gives strong forensic traceability but also produces dense headers that border on stale-comment debt (see §5).

**External coupling.** `orchestra/` is consumed by:
- `cli/` — every command in `cli/commands/` that runs a sprint (`start`, `plan`, `cleanup`, `finalize`, `kill`, `run`, …)
- `mcp/` — `mcp/start.ts`, `mcp/plan.ts`, etc., wrap the same entry points
- `api/server.ts` — HTTP API server triggers sprints
- `nervous/observer.ts` + `nervous/bootstrap.ts` — meta-orchestrator hooks into `eventBus` and `runSprint`'s late-binding loader

**Memory model.** Brain knowledge (ADRs, patterns, debt, retros) lives in `.brain/memory.db` (SQLite + FTS5). `orchestra/` modules query through `core/memory-store.ts` and `core/memory-query.ts`; markdown exports under `.brain/exports/` are read-only generated artifacts. `task-builder.ts`, `debt-manager.ts`, and `sprint-planner.ts` are the main consumers.

---

## 3. Debt Risk

### 3.1 High-priority debt (sized, repeatable)

| # | Module | LoC | Symptom | Recommendation |
|---|---|---|---|---|
| D1 | `result-evaluator.ts` | 2,085 | Largest file in `orchestra/`. Mixes `evaluateResult` (deprecated path), `evaluateWithRubric`, `classifyFailure`, `decideCascadeAction`, `getRecentSprintStats`, `tryCodeVerifiedDone` re-export, `GO_WITH_GATE_FAILURE`, multiple reconciliation helpers. Multiple "Sprint 145 — Step 1a", "Sprint 138 path-extension" inserts visible in evaluation order. | Split: `evaluation-core.ts` (evaluateWithRubric pure decision), `failure-classifier.ts` (CODE/RUNTIME/AMBIGUOUS + cascade decision), `sprint-stats.ts` (getRecentSprintStats, GO_WITH_GATE_FAILURE). Mirror the ADR-026 god-object split. |
| D2 | `sprint-phases.ts` | 1,368 | Hosts seven `runXxxPhase()` functions. Each phase already has its own narrative; phases share no live state apart from `sprint`/`evaluations`/`results` parameters. **Safe-circular dep** with `sprint-controller.ts` flagged in header (lines 1–9). | Split per-phase into `phases/{plan,spawn,evaluate,fix,retro,cleanup,rollback}.ts`. Keep `sprint-phases.ts` as a re-export barrel until callers migrate. |
| D3 | `sprint-spawner.ts` | 1,084 | `spawnWorkers`, `respawnEligibleTasks`, `validateTaskDependencies`, `routeSprintTasks`, plus the lazy-loaded ADR-064 TOPP helpers shared with `result-collector.ts`. Includes inline `handleScopeCollision` re-wire (lines 67–74) to dodge a sprint-controller cycle. | Extract `wave-execution.ts` + `respawn-helpers.ts`; move route-on-spawn into `task-router.ts`. Document the cycle that is *not* a violation (the cycle is **intentional**, but is currently only explained in a comment). |
| D4 | `sprint-finalizer.ts` | 1,310 | `finalizeSprint`, `applyAdaptiveThresholds`, `runHonestyCheck`, `writeRubricDetail`, `runSelfAuditGate`, plus ADR-029 managed-docs trigger. | Extract `self-audit-gate.ts`, `adaptive-thresholds.ts`. |
| D5 | `task-builder.ts` | 1,161 | Directive parsing, scope extraction, worker-prompt building, ADR-injection, skill-prompt token optimizer integration, Memory V2 lookup. | Split: `directive-parser.ts` (Zod schemas + parseStructuredDirectives), `worker-prompt-builder.ts` (buildWorkerPrompt + ADR/skill composition). Keep `createTask` + `plannerTaskToParams` in `task-builder.ts`. |
| D6 | `spawn-backend-docker.ts` | 1,058 | All Docker logic in one file — `DockerSpawnBackend` class + lifecycle helpers + container args builder + graceful-shutdown loop. | Extract `docker-args-builder.ts`, `docker-shutdown.ts`. |

### 3.2 Architectural debt (named but unsized)

- **D7 — Soft RBAC enforcement (ADR-037 V1.0 Layer-2 explicit gap).** `authority-enforcer.checkAuthority()` returns `mode: 'soft'` unconditionally (line 326, 333, 350, 365 etc.); violations emit `AUDITOR→BRAIN:AUTHORITY_VIOLATION` but never block. CLAUDE.md and `worker-default.md` both confirm this is *intentional* until hard-flip post-GA (V2). Risk: every sprint accumulates breadcrumb violations that no enforcer pipeline currently consumes for auto-fix.
- **D8 — V1 routing engine in tree.** `decision-engine.ts` is marked `@deprecated since Sprint 066` (line 1–8), still imported by `tests/orchestra/` and `tests/integration/`, and exports the non-deprecated `handleScopeCollision()` from the same file. The mix invites accidental V1 re-adoption. `decision-steps/`, `decision-logger.ts`, `decision-replay.ts`, `task-analyzer.ts` are V1 satellites.
- **D9 — Dual dependency-graph implementations.** `parallel-pipeline.ts:ParallelPipelineManager` (older, Kahn-style waves, throws `DependencyCycleError`) and `dependency-scheduler.ts` (Sprint 139 Task 028/029/030, full cascade + persist + Mermaid) coexist. Only the latter is wired in `sprint-spawner.ts`; the former is exported via `sprint-controller.ts:export { DependencyCycleError } from './parallel-pipeline.js'` and still has tests.
- **D10 — Stale fallback paths.** `evaluateResult()` in `result-evaluator.ts` carries a `@deprecated` header (line 82-86) yet remains exported via `brain.ts` and `sprint-controller.evaluateResult`. CLI `finalize` is cited as last consumer. Eliminate or rename.
- **D11 — Magic constants embedded in `sprint-controller.runSprint()`.** `GRACE_PERIOD_MS = 5 * 60 * 1000` (line 798), `setInterval(..., 30_000)` snapshot cadence (line 699), `LARGE_PROMPT_THRESHOLD_CHARS = 50_000` (`spawn-backend.ts:88`). Hoist into `core/constants.ts` or `core/config.ts` so they become tunable without recompile.

### 3.3 Stylistic debt

- **D12 — Multi-language inline comments.** Mix of English + Turkish in same comment block (see `sprint-controller.ts:738-744`, `task-builder.ts:74-94`). For an OSS launch this drift is a contributor onboarding hazard.
- **D13 — Sprint-number tagged sections.** Many `// Sprint 168 C0c RC2` markers attach to flow control. When the underlying bug fix matures these become noise (the audit trail belongs in `git log` / `.brain/`).

---

## 4. Dead Code

### 4.1 Confirmed deprecated, present at runtime

- `decision-engine.ts:1-15` — `@deprecated since Sprint 066`, in-source comment confirms it is **only used by tests** (`tests/orchestra/`, `tests/integration/`). The pure helper `handleScopeCollision()` is the lone non-deprecated export and lives in the same module.
- `decision-steps/agent-step.ts`, `decision-steps/scope-step.ts` — V1 step impls, same story (cited in `decision-engine.ts:13`).
- `decision-logger.ts`, `decision-replay.ts` — V1 audit-trail helpers, no callers found in `cli/`/`mcp/`/`api/`.
- `task-analyzer.ts` — V1 only consumer is `decision-engine.ts`.
- `result-evaluator.evaluateResult()` (line 87) — `@deprecated Use evaluateWithRubric() instead`. CLI `finalize` cited as last consumer. Verify and remove.
- `tmux.ts` — full backend marked deprecated, **scheduled for removal Sprint 178** (`spawn-backend.ts:247`). Currently still selectable when `spawn_backend=tmux` (with one-time console warning). The deprecation deadline has passed and the file is still in tree as of Sprint 185.

### 4.2 Suspected dead / very low-use

- `mid-sprint-adapter.MidSprintAdapter` exported via `index.ts:102`. The `reconcileSpuriousNoGo`/`reconcileRubricNoGo` helpers are used by `result-evaluator.ts`; class form may be unreferenced. Grep before deleting.
- `connector.ts` (7 LoC) — empty stub; `Connector` type used only by `sprint-controller.ts:43` (`import type`). If `Connector` only ever appears as a type-import surface, fold into `core/`.
- `parallel-pipeline.ts:ParallelPipelineManager` — superseded by `dependency-scheduler.buildDependencyGraph()`. Keep `DependencyCycleError` if cited by error catalogue; rest can go.
- `multi-agent.ts` (120 LoC) — name suggests speculative scaffolding for ADR-040 (nervous) or future capability. Verify caller count.
- `handoff-protocol.ts` (151 LoC) — same suspicion; document or delete.
- `shared-memory.ts` (142 LoC) — appears to overlap with `core/memory-store.ts`. Check whether anything outside `orchestra/` still imports.
- `monitor-adapter.ts` (211 LoC) — bridge between `orchestra/` and `monitor/auditor.ts`; ensure not stale.

### 4.3 Cleanup-only modules

- `sensitive-redactor.ts` (61 LoC), `scope-sanitizer.ts` (154 LoC) — small, single-purpose, likely fine.

---

## 5. Documentation Gaps

### 5.1 Module-level header inconsistency

Many modules have rich provenance headers (`sprint-controller.ts:1-11`, `sprint-checkpoint.ts:1-6`, `event-stream.ts:1-9`) but a sizable minority have *only* a top-line comment or none:
- `connector.ts` — 7 LoC, no doc.
- `multi-agent.ts`, `handoff-protocol.ts`, `shared-memory.ts` — name reveals nothing; module purpose missing.
- `decision-replay.ts`, `decision-logger.ts` — purpose untouched after V1 deprecation.

**Recommendation.** Every `orchestra/` module should start with a comment block stating: (a) responsibility, (b) primary callers, (c) ADR or sprint cross-ref, (d) deprecation status if any.

### 5.2 Public vs internal boundary partly enforced

`index.ts` is explicit ("PUBLIC API SURFACE … Internal orchestra functions are NOT re-exported here"). However:
- `brain.ts` *still* re-exports many internals (Sprint 036 backward-compat). New consumers may import from `brain.ts` instead of `index.ts` and bypass the public-surface contract.
- `sprint-controller.ts` itself re-exports `runTaskMode` etc. (line 126) which is also re-exported by `brain.ts` → `index.ts`. Three-hop re-export is hard for IDEs and treeshakers.

**Recommendation.** Add ESLint rule (or doc-only convention) that disallows `import … from '../orchestra/brain.js'` outside `orchestra/`. External consumers must use `'./index.js'` only.

### 5.3 Channel inventory not co-located with grant matrix

`event-stream.CHANNELS` (lines 51+) lists ~25 channel codes. `authority-enforcer.AUTHORITY_MATRIX` (line 112+) lists per-role emit/consume allowlists. The two **drift**: e.g. `SPAWN_BLOCKED` exists in `CHANNELS` (line 92) and emitted by Brain (`sprint-controller.consultCollisionDecision` line 437-445) — yet `brain` `emitChannels` array (lines 140-146) does not list `BRAIN→SPAWN:BLOCKED`. The authority-enforcer therefore tags this as **warn** even though it is an intentional, documented event.

**Recommendation.** Either generate the matrix from `CHANNELS` constants + role tags, or add a unit test asserting that every channel constant has a producer + consumer in the matrix.

### 5.4 ADR-039 self-modifying detector not surfaced in barrel

`self-modifying-detector.ts` exports `detectDeckentRepo`, `isSelfModifyingTask`, `DECKENT_SOURCE_PATTERNS`, `clearDetectionCache`. None are in `index.ts`. Callers either import directly from `orchestra/self-modifying-detector` (cross-package import) or duplicate the patterns. Add to `index.ts` if external consumers exist.

### 5.5 Managed-docs vs doc-updaters: two registries doing the same job

The header in `doc-updaters/index.ts` reads "Auto-register all updaters", but managed-docs has *its own* plug-in loader (`managed-docs/plugin-loader.ts`). Newcomers can't tell from doc alone which one to extend.

**Recommendation.** A `docs/architecture/doc-updaters-vs-managed-docs.md` page that draws the boundary, or unify the registries.

---

## 6. ADR Compliance

> Note: This section evaluates `orchestra/` against the six ADRs flagged in the task spec (`ADR-008`, `ADR-024/026`, `ADR-037`, `ADR-045`, `ADR-046`, `ADR-064`) plus opportunistic checks against `ADR-006`, `ADR-010`, `ADR-035`, `ADR-038`, `ADR-039`, `ADR-040`, `ADR-041`, `ADR-047`, `ADR-048`.

### 6.1 ADR-008 — Brain Merkezi Import / `core/ → orchestra/` ban — **PARTIAL**

- ✅ `brain.ts` is a re-export-only file (53 LoC), implementations live in `sprint-controller.ts` and friends. `planner.ts:1-15` explicitly comments "NO brain.ts imports". ✓
- ✅ The lint enforcer is implemented at `authority-enforcer.checkAdr008()` (line 499-524). Soft mode, emits warn.
- ❌ **Active violation:** `src/core/notify.ts:17` imports `eventBus` from `../orchestra/event-bus.js`. This is the **exact** pattern ADR-008 forbids (`core/` depending on `orchestra/`). The enforcer would flag it on any `package.json`/file change passing through `enforceAdrCompliance()`. The violation is documented in `notify.ts` header as a deliberate "global lifecycle entry point" but it is still a direct ADR-008 contradiction. Either:
  - (a) extract a `core/event-bus-interface.ts` and have `notify.ts` depend on the interface (inversion); `orchestra/event-bus.ts` implements it and registers itself at boot.
  - (b) move the `eventBus` singleton out of `orchestra/` (since both `orchestra/` and `core/` already use it).
  - (c) amend ADR-008 to whitelist this specific cross-boundary singleton + add the file path to an allow-list in the enforcer.
- ⚠ **Audit-time soft-flag only.** The CLAUDE.md note on ADR-008 confirms enforcement is advisory and does not block. Per Sprint 185 task NO_GO criteria (this audit is doc-only), this finding is recorded for Sprint 187 follow-up rather than emitted as a worker NO_GO.

### 6.2 ADR-024 / ADR-026 — God Object Split — **PARTIAL / DRIFT**

- ✅ `brain.ts` is a thin re-export layer (53 LoC) — Sprint 036 split confirmed.
- ✅ `sprint-controller.ts` shrunk from 1,894 LoC to 984 LoC — Sprint 136 split confirmed.
- ✅ `sprint-phases.ts`, `sprint-utils.ts`, `result-collector.ts` all extracted — Faz 1-3 (ADR-026) confirmed.
- ⚠ **New god objects in 2024-2026.** Post-Sprint-076 the codebase grew new large files:
  - `result-evaluator.ts` — 2,085 LoC (D1)
  - `sprint-phases.ts` — 1,368 LoC (D2)
  - `sprint-finalizer.ts` — 1,310 LoC (D4)
  - `task-builder.ts` — 1,161 LoC (D5)
  - `sprint-spawner.ts` — 1,084 LoC (D3)
  - `spawn-backend-docker.ts` — 1,058 LoC (D6)
  
  ADR-026 names the split "complete through Faz 3" — but ADR-026's "Note (verified / evolution)" already acknowledges the orchestra module count is "drift-prone" and "split continued past Faz 3". Recommend formalizing a **Faz 4 ADR amendment** scoping the splits above.

### 6.3 ADR-037 — RBAC Authority Matrix — **OK (V1.0 soft, by design)**

- ✅ `authority-enforcer.ts` implements full matrix with `checkAuthority()`, `enforceAdrCompliance()`, `emitAuthorityViolation()`.
- ✅ Worker dynamic scope check (lines 339-381) honors `scope.filesWrite`/`scope.directories`.
- ✅ ADR-038 self-modifying exception wired (`authority-enforcer.ts:301-311`) using `self-modifying-detector.detectDeckentRepo`.
- ✅ Channels integrated with `event-stream.CHANNELS.AUTHORITY_VIOLATION` (event-stream.ts:79).
- ⚠ Layer-2 runtime hard-flip still pending (see D7). This matches CLAUDE.md "**ihlal warn+emit bloke ETMEZ, hard-flip post-GA V2**" — V1.0 *intentional* gap, not a violation.
- ⚠ Matrix-vs-CHANNELS drift on `BRAIN→SPAWN:BLOCKED` (see §5.3).

### 6.4 ADR-045 — Wave-Based Execution / `respawnEligibleTasks` runtime wire — **OK**

- ✅ `dependency-scheduler.ts:buildDependencyGraph()` performs Kahn topological sort with collision-aware wave assignment.
- ✅ `sprint-spawner.respawnEligibleTasks()` exported and consumed by `result-collector.maybeRespawn()` (`result-collector.ts:49-90` lazy-load to break init cycle).
- ✅ ADR-064 TOPP B continuous-dispatch (Sprint 178) layers on top — `result-collector.ts:113-150` doc block describes pure dispatch planner.
- ✅ ADR-045 cited explicitly at `result-collector.ts:49-53`.
- ℹ `parallel-pipeline.ParallelPipelineManager` is the *older* wave-builder; superseded but still in tree (D9).

### 6.5 ADR-046 — Brain Self-Update Hook — **OK (limited surface)**

- ✅ `sprint-finalizer.ts` and `sprint-docs-updater.ts` reference ADR-046 (`grep -i ADR-046|self-update`).
- ✅ Step Ordering Contract (Sprint 166) — `IDENTITY.md` mentions `ADR-046 Step Ordering Contract`; `sprint-utils.now()`, `writeSprintState`, and `sprint-pid-manager.writeStateSnapshot` form the persistence layer.
- ℹ The "Brain auto retro" step that ADR-046 covers lives mostly in `sprint-reporter.ts` + `sprint-retro-writer.ts` + `sprint-docs-updater.ts`. Coverage is fine but the hook lifecycle could use an ADR-046 reference comment in the relevant `runRetroPhase` body for traceability.

### 6.6 ADR-064 — TOPP / Continuous Dispatch / Wave-Barrier Removal — **OK**

- ✅ `result-collector.ts:113-150` defines the pure dispatch planner.
- ✅ `result-collector.ts:497-522` short-circuits `maybeRespawn` under TOPP.
- ✅ `result-collector.ts:646-710` "unified dispatch tick — replaces dual…" — replaces older wave-barrier loop.
- ✅ `sprint-spawner.ts` consumes the helpers via lazy import to break the init cycle.
- ✅ ADR-064 cited inline at `result-collector.ts:113`, `497`, `522`, `646`, `710`.
- ℹ TOPP B is a *flag-gated* feature (see `result-collector.ts:150` "flag-agnostic core"). Verify the feature flag is exercised by sprint tests; otherwise risk of code path rotting.

### 6.7 Opportunistic checks

- **ADR-006 (spawnSync security pattern).** `tmux.ts:36` calls `spawnSync('tmux', args, { encoding: 'utf-8' })` — no `shell: true`. ✓. `planner.ts:388`, `sprint-controller.ts:13` — all spawn calls pass an args array. ✓. Lint enforcer at `authority-enforcer.ts:473-493`. ✓.
- **ADR-035 (Verification Protocol Standard).** `event-stream.ts` Protocol V1.0 is the canonical impl. `CHANNELS` constants present (line 51+). ✓.
- **ADR-038 (Self-Modifying Task Detection).** `self-modifying-detector.ts` implements detection; `authority-enforcer.ts:301-311` honors the exception. ✓.
- **ADR-039 (Deckent Dogfood vs User Project).** Implemented in same `self-modifying-detector.ts`. ✓.
- **ADR-047 (Manuel Subagent Dispatch).** Implementation lives outside `orchestra/` (likely `nervous/dispatcher.ts`). Not under scope — no `orchestra/` violation found.
- **ADR-048 (Prompt Lifecycle Contract).** `tmux.ts:55-65` references "ADR-048 §Negative closure"; `result-collector.ts:43` cites "ADR-048, Sprint 182 F4". ✓.
- **ADR-010 (single runtime dep — commander).** Enforced at `authority-enforcer.ts:462-468` whitelist `{commander, better-sqlite3, @modelcontextprotocol/sdk, zod}`. ✓.

---

## 7. Refactor Recommendations

### 7.1 P0 — must do before next major (Sprint 187/188)

| # | Action | Why |
|---|---|---|
| R1 | **Fix or amend ADR-008** for `core/notify.ts → orchestra/event-bus.ts` | Audit-detected live violation (§6.1). Either invert the dependency or whitelist + comment. |
| R2 | **Update ADR-026 with Faz 4 amendment** scoping splits of `result-evaluator.ts` (D1), `sprint-phases.ts` (D2), `sprint-spawner.ts` (D3), `sprint-finalizer.ts` (D4), `task-builder.ts` (D5), `spawn-backend-docker.ts` (D6) | New god objects are not covered by current ADR; team will keep accumulating LoC. |
| R3 | **Generate the authority matrix from `CHANNELS` constants** (or add a test that asserts every channel has a producer + consumer in the matrix) | Drift between `event-stream.CHANNELS` and `authority-enforcer.AUTHORITY_MATRIX` already exists (§5.3, `SPAWN_BLOCKED`). |
| R4 | **Tmux deprecation closeout** — `spawn-backend.ts:247` promised removal in Sprint 178; we are past Sprint 184. Either delete `tmux.ts`/`TmuxBackend`/related re-exports, or amend the deprecation timeline ADR. | Stale removal promise erodes trust in future deprecation notices. |
| R5 | **Delete or guard V1 decision engine** — `decision-engine.ts` (minus `handleScopeCollision`), `decision-steps/`, `decision-logger.ts`, `decision-replay.ts`, `task-analyzer.ts`. Pull `handleScopeCollision()` into its own module (`scope-collision-handler.ts`) so the rest can be removed without touching the live path. | `@deprecated since Sprint 066`, 18 sprints later it's still importable. |

### 7.2 P1 — strongly recommended

| # | Action | Why |
|---|---|---|
| R6 | Extract `result-evaluator.ts` into 3-4 files (D1) | Largest god object in `orchestra/`. |
| R7 | Extract `sprint-phases.ts` per phase (D2) | Each phase is independently testable; current safe-circular dep is hidden technical contract. |
| R8 | Hoist magic constants (`GRACE_PERIOD_MS`, snapshot interval, `LARGE_PROMPT_THRESHOLD_CHARS`) into `core/config.ts` (D11) | Tunable without recompile, surfaces as documented configuration. |
| R9 | Replace mixed-language comments (D12) with English-only + Turkish doc in user-facing surfaces only | OSS contributor onboarding. |
| R10 | Add ESLint rule disallowing `import … from '../orchestra/brain.js'` outside `orchestra/` (§5.2) | Enforces `index.ts` as the only external entry point. |
| R11 | Choose one of `parallel-pipeline.ts` or `dependency-scheduler.ts` (D9) | Two wave builders confuse readers; keep `dependency-scheduler` + the `DependencyCycleError` class. |
| R12 | Delete `result-evaluator.evaluateResult` (D10, line 87) once CLI `finalize` migrates | Removes deprecation drift. |

### 7.3 P2 — cleanup / opportunistic

| # | Action |
|---|---|
| R13 | Add module headers to `connector.ts`, `multi-agent.ts`, `handoff-protocol.ts`, `shared-memory.ts`, `monitor-adapter.ts` (§5.1). |
| R14 | Add ADR-064 feature-flag test for `result-collector.ts:113-150` (§6.6). |
| R15 | Surface `self-modifying-detector` in `index.ts` (§5.4). |
| R16 | Write `docs/architecture/doc-updaters-vs-managed-docs.md` (§5.5). |
| R17 | Audit `mid-sprint-adapter.MidSprintAdapter` class form — keep only the helper functions if class is unused (§4.2). |
| R18 | Add an `orchestra/README.md` summarizing the eight-bucket taxonomy from §1.2 to make new contributors orient quickly. |

---

## 8. Sprint 187 Follow-up

Concrete tickets ready to drop into the Sprint 187 DIRECTIVES:

1. **ADR-008-fix** — Resolve `core/notify.ts → orchestra/event-bus.ts` violation (R1). Decide invert vs whitelist; update `authority-enforcer.checkAdr008()` accordingly. (`bug-fixer` + `architect`, opus, normal effort.)
2. **ADR-026-faz4** — Author "Faz 4 God Object Split" amendment covering R2 splits. (`architecture-planner`, opus, normal.)
3. **result-evaluator-split** — Implement R6 split. (`refactorer`, opus, high effort.)
4. **sprint-phases-split** — Implement R7 split. (`refactorer`, opus, high.)
5. **tmux-removal-or-extend** — R4 closeout. (`bug-fixer` + `architect`, sonnet, normal.)
6. **decision-engine-cleanup** — R5 cleanup. Move `handleScopeCollision()` out, delete V1. (`refactorer`, sonnet, normal.)
7. **authority-matrix-channel-test** — R3 test that asserts each `CHANNELS` constant appears in `AUTHORITY_MATRIX`. (`code-reviewer`, sonnet, low.)
8. **eslint-brain-import-rule** — R10 ESLint rule. (`devops-engineer`, sonnet, low.)
9. **magic-constants-hoist** — R8 hoist. (`refactorer`, sonnet, low.)
10. **orchestra-readme** — R18. (`doc-writer`, sonnet, normal.)
11. **module-headers** — R13 module-header doc batch. (`doc-writer`, haiku, low.)

If Sprint 186 capacity is tight, the **minimum viable response** is R1 + R3 + R4 + R5 (live correctness + drift containment).

---

## 9. Summary

`src/orchestra/` is **structurally healthy** — the ADR-026 god-object split is real, `brain.ts` is a true thin shim, `planner.ts` honors its `core/`-only import contract, ADR-037 RBAC matrix is wired (even if soft), and ADR-045/064 wave + TOPP execution is live. The codebase shows strong forensic discipline (every nontrivial branch carries a sprint-tagged provenance comment) and a mature ESM module boundary.

**Three primary concerns:**

1. **One real ADR-008 violation** at `src/core/notify.ts:17` (`core/` → `orchestra/event-bus.js`). The lint enforcer in `authority-enforcer.ts:499-524` would flag it; current soft-mode swallows the warn. **Pick a resolution path before Sprint 187.**
2. **God-object regrowth.** Six modules now exceed 1,000 LoC — `result-evaluator.ts` (2,085), `sprint-phases.ts` (1,368), `sprint-finalizer.ts` (1,310), `task-builder.ts` (1,161), `sprint-spawner.ts` (1,084), `spawn-backend-docker.ts` (1,058). ADR-026 Faz 4 amendment is overdue.
3. **Deprecated code still in path.** `tmux.ts` past its Sprint-178 removal deadline; V1 `decision-engine.ts` deprecated since Sprint 066 yet still importable; `result-evaluator.evaluateResult` deprecated yet exported through `brain.ts`/`sprint-controller.ts`. Cleanup is low-risk and high-clarity.

**Going forward.** Treat the 11 Sprint-187 follow-up tickets in §8 as the actionable surface of this audit. Items R1/R3/R4/R5 are the minimum-viable closeout; R6-R12 graduate the package to a state where a single contributor can hold the lifecycle model in their head; R13-R18 are polish for OSS readiness (Sprint 184-189 launch initiative). No NO_GO is required from this audit — all findings are debt-of-the-known-kind, not active correctness regressions.
