# Analysis: src/orchestra/sprint-spawner.ts
**Task ID:** 142-010 | **Model:** opus | **LoC:** 800 | **Effort:** max

## 1. Amaci (detayli)
Sprint spawner — sprint-controller.ts'den extract edilmiş worker spawn fonksiyonları. spawnWorkers() ile aktif task'ları backend'e gönderir. respawnEligibleTasks() ile dependency pipeline'da yeni eligible task'ları spawn eder. Scope path normalizasyonu (ADR-013 koruma), collision detection (ADR-035), dependency graph enforcement (Sprint 139 Kahn's algorithm), worker lifecycle state machine (Sprint 139 Task 015), cascade failure classification (Sprint 139 Task 024/029), ve event stream integration içerir.

## 2. Public API
- `normalizeScopePath(rawPath)` → string | null — JSDoc ✓ (detailed)
- `buildAllowedWriteTargets(task)` → string[] — JSDoc ✓
- `spawnWorkers(root, sprint, config, opts?)` → Promise<Task[]> — JSDoc ✓
- `respawnEligibleTasks(root, sprint, config, opts?, onWave?)` → Promise<string[]> — JSDoc ✓
- `validateTaskDependencies(tasks)` → ExecutionWave[] — JSDoc ✓
- `routeSprintTasks(tasks, config, available)` — JSDoc ✓
- `stopWorkerIfStoppable(taskId, backend?)` → {stopped, state} — JSDoc ✓
- `transitionWorkerState(root, taskId, newState)` → boolean — JSDoc ✓
- `evaluateFailureCascade(root, taskId, ctx)` → CascadeDecision — JSDoc ✓
- `applyCascadeToSprint(root, sprint, failedId, ctx)` → {decision, blockedIds[]} — JSDoc ✓
- `applyUnblockToSprint(root, sprint, resolvedId)` → string[] — JSDoc ✓
- Re-exports: detectScopeCollisions, buildCollisionAwareWaves, buildDependencyGraph, enforceWaveDependency, cascadeBlockDependents, unblockDependents, applyFailureCascade — JSDoc via source modules
- Re-exported types: CollisionResult, CollisionMap, DependencyGraph, DependencyWave, etc.

## 3. Ic Bagimliliklar
- `../core/types.js` (Task, Sprint, ResolvedConfig, TaskStatus, AgentStatus, etc.)
- `../core/constants.js` (TASKS_DIR)
- `../core/utils.js` (debugLog)
- `../core/config.js` (resolveEffectiveWorkers)
- `../core/system-profile.js` (getSystemProfile)
- `../core/observability.js` (metric)
- `./sprint-utils.js` (now, isTmuxProvider, resolveTaskProvider, getProviderAdapterForTask)
- `./spawn-backend.js` (SpawnBackend)
- `./tmux.js` (ensureSession, spawnWorker)
- `../monitor/auditor.js` (updateDashboard)
- `./result-collector.js` (resolveAgentPrompt, resolveSkillPrompts)
- `./task-builder.js` (buildWorkerPrompt)
- `./parallel-pipeline.js` (ParallelPipelineManager)
- `./task-router.js` (routeTask)
- `./conflict-resolver.js` (detectScopeCollisions, buildCollisionAwareWaves)
- `./event-stream.js` (writeEvent, CHANNELS, getCurrentSprintId, readSequence)
- `./dependency-scheduler.js` (buildDependencyGraph, enforceWaveDependency, applyFailureCascade, unblockDependents)
- `./sprint-checkpoint.js` (writeCheckpoint)
- `../agents/worker.js` (worker state machine functions)
- `./result-evaluator.js` (decideCascadeAction, FailureContext, CascadeDecision)
- **23 imports** — en yoğun import chain'e sahip modül. ADR-008 boundary: imports both core/ and orchestra/ — acceptable (sprint-spawner is part of orchestra).
- Döngüsel bağımlılık riski: `../monitor/auditor.js` import — auditor imports from core/ only, so no cycle. ✓ But close to ADR-008 boundary: sprint-spawner (orchestra) imports auditor (monitor). Not technically a violation (ADR-008 is about brain.ts), but worth monitoring.

## 4. Dis Bagimliliklar
- `node:fs` (writeFileSync)
- `node:path` (join)
- ADR-010 uyumu: ✓

## 5. Complexity
- Fonksiyon sayısı: 11 exported + 0 private
- Max cyclomatic complexity: `spawnWorkers()` (satır 186-353) ≈ CC 12 — collision detection, dependency pipeline, tmux/backend/adapter branching, worker state machine
- `respawnEligibleTasks()` (satır 361-493) ≈ CC 8
- `applyCascadeToSprint()` (satır 681-725) ≈ CC 4
- `normalizeScopePath()` (satır 121-147) ≈ CC 5
- En karmaşık: spawnWorkers — 168 satır, multi-concern (spawn + observe + event stream + state machine)

## 6. Type Safety
- `as const` — satır 549 (`'UNKNOWN'`) — acceptable
- `as string[]` — implicit in readdirSync usage (none in this file)
- `any` sayısı: 0 ✓
- `@ts-ignore`: 0 ✓
- Non-null `!`: 0 ✓
- Import type for return type: satır 500 `import('./parallel-pipeline.js').ExecutionWave[]` — dynamic import type, valid TypeScript

## 7. ADR Compliance
- **ADR-006**: No spawnSync in this file ✓ (delegated to backends)
- **ADR-008 brain import**: Imports auditor.js (monitor/) and worker.js (agents/) — not a strict ADR-008 violation (ADR-008 says "Brain is the ONLY module that imports from tmux, auditor, worker" — sprint-spawner was extracted FROM brain.ts, so it inherits this right). ✓ acceptable.
- **ADR-010**: Node.js built-ins ✓
- **ADR-013 Protected Paths**: Implemented via ADR013_PROTECTED_PATHS Set + normalizeScopePath ✓
- **ADR-035 Event Stream**: writeEvent calls for TASK_ASSIGN, HEARTBEAT, SCOPE_COLLISION, FIX_REQUEST, METRIC_EMITTED, DEPENDENCY_BLOCKED/UNBLOCKED ✓ comprehensive.
- **ADR-037 RBAC**: Brain → Worker, Worker → Brain, Auditor → Brain channel naming ✓
- **ADR-039**: N/A (no self-modifying detection here — it's in self-modifying-detector.ts)
- **Memory V2**: N/A (no direct DB access — memory context provided via buildWorkerPrompt → queryRelevantADRs chain)

## 8. Test Coverage
- `tests/orchestra/sprint-spawner.test.ts` — EXISTS ✓
- 1 test file for 800 LoC — coverage may be thin
- Complex async functions (spawnWorkers, respawnEligibleTasks) require mock backends
- normalizeScopePath: well-suited for unit testing (pure function)
- buildAllowedWriteTargets: well-suited for unit testing (pure function)
- State machine transitions: integration test territory

## 9. TODO/FIXME/HACK inventory
- NONE ✓

## 10. Dead Code
- `ADR013_PROTECTED_PATHS` — used by normalizeScopePath ✓
- `EXTENSION_ONLY_RE` — used by normalizeScopePath ✓
- Re-exports at bottom (satır 777-799) — used by external consumers (sprint-controller, etc.)
- No unused exports detected
- `buildCollisionAwareWaves` re-exported — verify external callers exist

## 11. Security
- `buildAllowedWriteTargets` — constructs --allowedTools string from task scope. Normalized to prevent path traversal (EXTENSION_ONLY_RE, ADR013 exclusion). ✓
- allowedTools string (satır 258-259): `Read,Write(${targets}),Edit(${targets}),Bash,Glob,Grep` — targets are path strings, no injection possible in this format.
- writeFileSync for task JSON (satır 324-328) — writes to .tasks/ only, scoped ✓
- Event stream writes: writeEvent is append-only JSONL — no injection risk ✓
- Worker state machine transitions: `sm.transition()` validates state transitions — prevents invalid lifecycle states ✓

## 12. Memory V2 Uyumu
- No direct memory DB access ✓
- ADR context injection happens via buildWorkerPrompt → queryRelevantADRs (DB-first chain) ✓

## 13. i18n
- Event channel names: English (`BRAIN→WORKER:DEPENDENCY_BLOCKED`) — acceptable for protocol
- debugLog messages: English — acceptable
- No user-facing strings

## 14. Dokumantasyon Tutarliligi
- JSDoc coverage: 11/11 exported functions — EXCELLENT ✓
- Every function has detailed JSDoc with @param, @returns
- Sprint references in JSDoc (Sprint 138, 139) — accurate ✓
- Internal code comments reference ADR numbers ✓

## 15. Performance
- spawnWorkers: iterates tasks with async resolveAgentPrompt/resolveSkillPrompts per task — sequential await in a loop. Could be parallelized with Promise.all, but task count is typically ≤max_workers (4-8). **P3** optimization opportunity.
- writeFileSync for task JSON status update (satır 324) — sync write per task. In a 48-task sprint, this is 48 × ~5ms = 240ms. Acceptable.
- respawnEligibleTasks: similar sequential pattern
- detectScopeCollisions: called once per spawnWorkers invocation — O(n²) per task pair, n ≤ max_workers. Acceptable.
- buildDependencyGraph: called per respawn — Kahn's algorithm O(V+E). Acceptable.

## 16. Oneriler
- **P2**: spawnWorkers + respawnEligibleTasks have significant code duplication in the spawn loop (satır 251-308 vs 410-451). Extract a `spawnSingleTask()` helper to DRY up the 3-way backend branching.
- **P2**: 23 imports — highest import count in the 10 analyzed files. Consider splitting: scope utilities (normalizeScopePath, buildAllowedWriteTargets) could move to a `scope-utils.ts` module.
- **P3**: spawnWorkers sequential await for agent/skill prompt resolution — consider batch parallel resolution
- **P3**: Re-exports at bottom (satır 777-799) — growing list, document which modules are expected consumers
- **P1**: respawnEligibleTasks channel name 'BRAIN→WORKER:DEPENDENCY_BLOCKED' (satır 389) — hardcoded string, not in CHANNELS constant. Should use CHANNELS.DEPENDENCY_BLOCKED or equivalent for consistency. Similarly 'BRAIN→WORKER:DEPENDENCY_UNBLOCKED' (satır 752).

## Verdict: ANALYZED
