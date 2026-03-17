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
  calculateMetrics, decay, cleanup, runSprint, runDecay,
  BrainError,
} from './brain.js';
export type { BrainContext, ProjectState, SprintSizeRecommendation, CreateTaskParams, RunDecayOptions } from './brain.js';
