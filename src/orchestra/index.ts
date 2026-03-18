export {
  isSessionActive,
  ensureSession,
  spawnWorker,
  killWorker,
  listWorkers,
  startAuditor,
  attach,
  destroy,
  sendKeys,
  TmuxError,
} from './tmux.js';
export type { SpawnOptions } from './tmux.js';

export {
  readContext, checkUsage, adjustSprintSize, createTask,
  planSprint, spawnWorkers, waitForResults,
  evaluateResult, isDocTask, handleEvaluation, handleCrossDependencies,
  escalateDebt, writeRetrospective, writeSprintLog,
  calculateMetrics, decay, cleanup, runSprint, runDecay,
  BrainError, confirmDraftTasks, updateProjectDocs,
} from './brain.js';
export type { BrainContext, ProjectState, SprintSizeRecommendation, PlannerResult, PlannerTask, BrainPlanningMode, SprintResult } from '../core/types.js';
export type { CreateTaskParams, RunDecayOptions } from './brain.js';

export { buildPlanPrompt, parsePlannerResponse, callBrainPlanner } from './planner.js';

// ─── Doc Updaters ─────────────────────────────────────────────────
export { registerUpdater, getRegisteredUpdaters, clearUpdaters, runAllUpdaters } from './doc-updaters/index.js';
export type { DocUpdater, DocUpdateContext, DocUpdateResult } from './doc-updaters/index.js';
export { changelogUpdater } from './doc-updaters/changelog.js';
export { sprintLogUpdater } from './doc-updaters/sprint-log.js';
export { readmeMetricsUpdater } from './doc-updaters/readme-metrics.js';
export { healthCheckUpdater } from './doc-updaters/health-check.js';
