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
  BrainError, confirmDraftTasks,
} from './brain.js';
export type { BrainContext, ProjectState, SprintSizeRecommendation, PlannerResult, PlannerTask, BrainPlanningMode } from '../core/types.js';
export type { CreateTaskParams, RunDecayOptions } from './brain.js';

export { buildPlanPrompt, parsePlannerResponse, callBrainPlanner } from './planner.js';
