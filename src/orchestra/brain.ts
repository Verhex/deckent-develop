// ═══ Brain — Master Orchestrator (Slim Re-export Layer) ═══════════
// Sprint 036: brain.ts is now a thin backward-compatibility layer.
// All implementations live in dedicated sub-modules:
//   sprint-controller.ts — runSprint, pause/resume, cleanup, planning, spawning
//   result-evaluator.ts  — evaluateResult, isDocTask, waitForResults (DI version)
//   usage-manager.ts     — checkUsage, adjustSprintSize, provider helpers
//   model-selector.ts    — model inference and selection
//   task-builder.ts      — task creation, scope extraction, directive parsing
//   debt-manager.ts      — debt lifecycle, escalation, decay
//   sprint-reporter.ts   — retrospective, sprint log, metrics, doc updates

// ─── Sprint Controller (primary orchestration) ─────────────────────
export {
  BrainError,
  readContext,
  checkUsage,
  checkUsageWithProvider,
  getDefaultProvider,
  adjustSprintSize,
  planSprint,
  confirmDraftTasks,
  cleanupDraftTasks,
  spawnWorkers,
  waitForResults,
  evaluateResult,
  isDocTask,
  isStaleTaskFile,
  cleanup,
  runSprint,
  finalizeSprint,
  pauseSprint,
  resumeSprint,
  checkAndAutoPause,
  checkAndAutoResume,
  getChannelRegistry,
  registerWorkerChannel,
  unregisterWorkerChannel,
} from './sprint-controller.js';
export type { PauseState, RunSprintOptions, FinalizeSprintOptions } from './sprint-controller.js';

// ─── Type re-exports (backward compat) ─────────────────────────────
export type { BrainContext, ProjectState, SprintSizeRecommendation } from '../core/types.js';
export type { SprintUsage, TotalUsage, ModelBreakdown } from '../core/usage-tracker.js';
export type { ProviderAdapter } from '../core/provider.js';
export type { SpawnBackend } from './spawn-backend.js';
export { SpawnBackendFactory } from './spawn-backend.js';
export type { SafetyPoint, RollbackResult, RollbackPolicy } from './rollback.js';
export { createSafetyPoint, rollback, getRollbackPolicy, recordRollbackInDebt, isCleanWorkingTree, safetyBranchExists } from './rollback.js';
export type { SprintResult } from '../core/types.js';

// ─── Sub-modules (re-export for backward compatibility) ─────────────
export { calculateModelScore, inferModelFromDirective, resolveTaskModel, parsePatterns, deduplicatePatterns, suggestModelFromPatterns } from './model-selector.js';
export { createTask, extractScopeFromDirective, parseStructuredDirectives, buildWorkerPrompt, plannerTaskToParams, resolveWorkerEffort } from './task-builder.js';
export type { CreateTaskParams, ParsedDirectiveTask } from './task-builder.js';
export { handleEvaluation, handleCrossDependencies, escalateDebt, resolveDebt, runDecay, decay } from './debt-manager.js';
export type { RunDecayOptions } from './debt-manager.js';
export { trimMemoryWithHeader, writeRetrospective, writeSprintLog, calculateMetrics, updateProjectDocs, compareWithPreviousSprint, readPreviousSprintMetrics, buildAgentPerformance, formatAgentPerformanceTable, buildSkillPerformance, formatSkillPerformanceTable, generateProjectIdentity, updateProjectIdentity } from './sprint-reporter.js';
export type { SprintComparison, AgentPerformanceRow, SkillPerformanceRow, ProjectIdentityInfo } from './sprint-reporter.js';
export { parseCoverageFromVitest, validateCoverage, validateWorkerCoverage, isDocOnlyTask } from './coverage-validator.js';
export type { CoverageResult, CoverageWarningLevel, ParsedVitestOutput, VitestCoverageSummary, VitestCoverageData } from './coverage-validator.js';
