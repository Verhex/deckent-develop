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
  evaluateResult, handleEvaluation, handleCrossDependencies,
  escalateDebt, writeRetrospective, writeSprintLog,
  calculateMetrics, decay, cleanup, runSprint,
  BrainError,
} from './brain.js';
export type { BrainContext, ProjectState, SprintSizeRecommendation, CreateTaskParams } from './brain.js';
