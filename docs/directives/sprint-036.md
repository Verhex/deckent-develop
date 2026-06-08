# DIRECTIVES — Sprint 036 (Beta Cleanup Wave 3+4: brain.ts Split + Architectural Cleanup)

## Goal: Split brain.ts God Object into focused sub-modules, fix architectural violations, refactor non-null assertions and type casts, clean up barrel exports. All changes must maintain backward compatibility — brain.ts re-exports everything. 11 tasks.

---

## Task 1: Extract sprint-controller.ts
- Model: opus
- Effort: high
- Files: src/orchestra/sprint-controller.ts (new), tests/orchestra/sprint-controller.test.ts (new), src/orchestra/brain.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
P1-001a. Extract from brain.ts: `runSprint()`, `pauseSprint()`, `resumeSprint()`, `checkAndAutoPause()`, `checkAndAutoResume()`, `cleanup()`, `isStaleTaskFile()`, `RunSprintOptions` interface. sprint-controller.ts imports from core/ and other orchestra sub-modules (model-selector, task-builder, debt-manager, sprint-reporter). brain.ts re-exports all extracted functions for backward compatibility. Existing tests must pass without modification. 15+ new tests for extracted module. CRITICAL: Do not break any existing import paths.

### Tests
- All extracted functions work identically to brain.ts originals
- brain.ts re-exports maintain backward compatibility
- brain-integration.test.ts still passes
- runSprint full lifecycle works from sprint-controller
- pauseSprint/resumeSprint state transitions correct
- cleanup releases all resources
- 15+ tests

---

## Task 2: Extract result-evaluator.ts
- Model: opus
- Effort: high
- Files: src/orchestra/result-evaluator.ts (new), tests/orchestra/result-evaluator.test.ts (new), src/orchestra/brain.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
P1-001b. Extract from brain.ts: `evaluateResult()`, `isDocTask()`, `waitForResults()`. result-evaluator.ts is a pure evaluation module — no side effects, no file writes. Takes TaskResult + Task, returns TaskEvaluation. brain.ts re-exports for backward compatibility. 10+ new tests.

### Tests
- evaluateResult returns DONE for passing task
- evaluateResult returns NO_GO when selfAssessment=DONE but testsPassed=false
- evaluateResult returns GO_WITH_TECH_DEBT when coverage < 90
- isDocTask correctly identifies documentation tasks
- waitForResults collects all results with timeout
- brain.ts re-exports work
- 10+ tests

---

## Task 3: Extract usage-manager.ts
- Model: opus
- Effort: high
- Files: src/orchestra/usage-manager.ts (new), tests/orchestra/usage-manager.test.ts (new), src/orchestra/brain.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
P1-001c. Extract from brain.ts: `checkUsage()`, `checkUsageWithProvider()`, `getDefaultProvider()`, `adjustSprintSize()`. usage-manager.ts handles all usage/quota logic. brain.ts re-exports. 10+ new tests.

### Tests
- checkUsage returns safe defaults on CLI failure
- checkUsageWithProvider delegates to adapter
- adjustSprintSize reduces workers when usage high
- adjustSprintSize returns minimal when both thresholds exceeded
- brain.ts re-exports work
- 10+ tests

---

## Task 4: brain.ts Slim-Down + Backward Compat Verification
- Model: opus
- Effort: high
- Files: src/orchestra/brain.ts, tests/orchestra/brain-integration.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
P1-001d. After Tasks 1-3, brain.ts should be ~400 lines (down from 1,312). Remaining in brain.ts: readContext(), planSprint(), spawnWorkers(), confirmDraftTasks(), IPC channel registry, BrainError class, re-exports from sprint-controller, result-evaluator, usage-manager, model-selector, task-builder, debt-manager, sprint-reporter. Update brain-integration.test.ts to verify all re-exported functions are identical to their source modules. Update orchestra/index.ts barrel. Run full test suite — zero regressions.

### Tests
- brain.ts line count < 500
- All re-exports verified (same function reference)
- Full test suite passes (7,177+ tests)
- No new circular dependencies
- orchestra/index.ts exports correct

---

## Task 5: Move spawn-backend.ts to orchestra/
- Model: sonnet
- Effort: normal
- Files: src/core/spawn-backend.ts -> src/orchestra/spawn-backend.ts, all importers
- Scope: src/core/, src/orchestra/, src/cli/, tests/

### Description
P2-005. spawn-backend.ts imports from orchestra/tmux.ts, violating core/ -> orchestra/ layer boundary. Move spawn-backend.ts from core/ to orchestra/. Update all import paths (grep for 'spawn-backend' across codebase). Verify no circular dependencies introduced. 5+ tests.

### Tests
- No core/ -> orchestra/ imports remain
- All existing spawn-backend functionality works
- Import paths updated everywhere
- Zero circular dependencies
- 5+ tests

---

## Task 6: Barrel Export Cleanup
- Model: sonnet
- Effort: normal
- Files: src/orchestra/index.ts
- Scope: src/orchestra/

### Description
P2-006. orchestra/index.ts re-exports too many internal symbols. Audit all exports: keep only public API (functions called from cli/, mcp/, api/). Mark internal-only functions with @internal JSDoc. Remove unnecessary re-exports. Document the public API surface in a comment block at top of index.ts. 5+ tests.

### Tests
- Only public API functions exported
- CLI/MCP/API imports still resolve
- Internal functions not accessible via barrel
- 5+ tests

---

## Task 7: Non-Null Assertion Refactor
- Model: opus
- Effort: high
- Files: 19 files (see audit report Section 1.3)
- Scope: src/

### Description
P1-002. Replace 48 non-null assertions (`!`) with safe alternatives:
- Array access: `arr[0]!` -> `arr.at(0) ?? fallback` or `arr[0] as T` with prior length check
- Map.get(): `map.get(key)!` -> `safeMapGet(map, key, default)` (from Task 13's utility)
- Keep assertion only where TypeScript narrowing genuinely guarantees non-null
Every replacement must preserve runtime behavior. 15+ tests.

### Tests
- All 48 assertions replaced or justified
- No runtime behavior changes
- Edge cases (empty arrays, missing map keys) handled gracefully
- 15+ tests

---

## Task 8: Type Cast Improvement
- Model: opus
- Effort: normal
- Files: 15 files (see audit report Section 1.2)
- Scope: src/

### Description
P2-002. Review 42 `as` cast instances. For post-JSON-parse casts, add Zod validation or type guard where feasible. For casts that are genuinely safe (post-validation), add explaining comment. Goal: zero unsafe casts, every cast has either a runtime check or a justification comment. 10+ tests.

### Tests
- All casts have runtime validation or justification
- Zod schemas added for critical parse points
- 10+ tests

---

## Task 9: Auditor Pattern Queue Fix
- Model: sonnet
- Effort: low
- Files: src/monitor/auditor.ts
- Scope: src/monitor/

### Description
P2-013. auditor.ts:345 uses `shift()` on pattern array — O(n) per operation. Replace with reverse-then-pop pattern or use a proper queue implementation. Pattern array can grow unbounded over many sprints. 5+ tests.

### Tests
- Queue performance improved (no O(n) shift)
- Pattern eviction still works correctly
- 5+ tests

---

## Task 10: types.ts Split
- Model: opus
- Effort: high
- Files: src/core/types.ts -> src/core/task-types.ts, src/core/config-types.ts, src/core/agent-types.ts, src/core/sprint-types.ts
- Scope: src/core/

### Description
P3-009. Split 523-line types.ts into domain-specific files. Create barrel re-export in types.ts for backward compatibility:
- task-types.ts: Task, TaskResult, TaskPlan, TaskScope, TaskStatus, TaskEvaluation, etc.
- config-types.ts: DeckentConfig, ResolvedConfig, ModeConfig, etc.
- agent-types.ts: AgentInfo, AgentDefinition, AgentStatus, etc.
- sprint-types.ts: Sprint, SprintMetrics, SprintPhase, SprintStatus, etc.
types.ts becomes: `export * from './task-types.js'; export * from './config-types.js'; ...`
Zero import path changes in any consuming file. 10+ tests.

### Tests
- All existing imports from types.ts still work
- Each sub-file is self-contained (no circular deps)
- Type count matches original
- 10+ tests

---

## Task 11: Prompt Analytics Merge
- Model: sonnet
- Effort: normal
- Files: src/agents/prompt-metrics.ts + src/agents/prompt-ab-test.ts -> src/agents/prompt-analytics.ts
- Scope: src/agents/

### Description
P3-011. Merge prompt-metrics.ts and prompt-ab-test.ts into single prompt-analytics.ts module. Both handle prompt performance analysis — metrics records effectiveness, ab-test compares variants. Create unified PromptAnalytics class that combines both. Update all imports. 5+ tests.

### Tests
- All existing functionality preserved
- Single import path for prompt analytics
- No duplicate logic
- 5+ tests
