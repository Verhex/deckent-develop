// ═══ orchestra/index.ts — Public API Barrel ════════════════════════
//
// PUBLIC API SURFACE
// ──────────────────
// This barrel exports ONLY the symbols consumed by cli/, mcp/, and api/.
// Internal orchestra functions (marked @internal in their source files)
// are NOT re-exported here; they are imported directly within orchestra/.
//
// Public functions (cli/ + mcp/ + api/ consumers):
//   runSprint          — execute a full sprint (start.ts, test-run.ts, server.ts, mcp/start.ts)
//   readContext        — read brain context (plan.ts, server.ts, mcp/plan.ts)
//   planSprint         — plan sprint tasks (plan.ts, server.ts, mcp/plan.ts)
//   confirmDraftTasks  — prompt user to confirm draft tasks (plan.ts)
//   buildWorkerPrompt  — build a worker's task prompt (run.ts)
//   cleanup            — clean up task files and locks (cleanup.ts)
//   finalizeSprint     — run all post-sprint actions (finalize.ts, start.ts)
//   runDecay           — run memory/debt decay (cleanup.ts)
//   BrainError         — error class for orchestration failures
//
// Public tmux API (cli/ + api/ consumers):
//   isSessionActive    — check if tmux session exists (attach.ts, start.ts, watch.ts)
//   ensureSession      — create tmux session if needed (spawn.ts, run.ts)
//   spawnWorker        — spawn a worker in a tmux window (spawn.ts, run.ts)
//   killWorker         — kill a worker tmux window (kill.ts, server.ts)
//   attach             — attach to tmux session (attach.ts)
//   destroy            — destroy tmux session (cleanup.ts)
//   setupWatchWindow   — set up watch window in session (start.ts)
//   createWatchLayout  — create watch layout and attach (watch.ts)
//   attachToWorkerPane — attach to a specific worker pane (watch.ts)
//   TmuxError          — error class for tmux operations (attach.ts, kill.ts, watch.ts)
//   SpawnOptions       — options for spawnWorker (run.ts, spawn.ts)
//
// Public doc-updater API (sprint-reporter.ts internal + external plugin authors):
//   registerUpdater    — register a doc updater plugin
//   runAllUpdaters     — run all registered doc updaters
//   DocUpdater         — doc updater plugin interface
//   DocUpdateContext   — context passed to doc updaters
//   DocUpdateResult    — result returned by doc updaters
//
// ─────────────────────────────────────────────────────────────────────

// ─── Tmux Backend (public: spawn/kill workers, session management) ──
export {
  isSessionActive,
  ensureSession,
  spawnWorker,
  killWorker,
  attach,
  destroy,
  setupWatchWindow,
  createWatchLayout,
  attachToWorkerPane,
  TmuxError,
} from './tmux.js';
export type { SpawnOptions } from './tmux.js';

// ─── Brain API (public: sprint lifecycle functions) ─────────────────
export {
  BrainError,
  readContext,
  planSprint,
  confirmDraftTasks,
  cleanupDraftTasks,
  buildWorkerPrompt,
  cleanup,
  runSprint,
  finalizeSprint,
  runDecay,
} from './brain.js';

// ─── Key types for public consumers ─────────────────────────────────
export type {
  BrainContext,
  ProjectState,
  SprintSizeRecommendation,
  PlannerResult,
  PlannerTask,
  BrainPlanningMode,
  SprintResult,
} from '../core/types.js';
export type { CreateTaskParams, RunDecayOptions, FinalizeSprintOptions } from './brain.js';
export type { RunSprintOptions } from './sprint-controller.js';

// ─── Doc Updater plugin API (public: for external plugin authors) ────
export {
  registerUpdater,
  runAllUpdaters,
} from './doc-updaters/index.js';
export type {
  DocUpdater,
  DocUpdateContext,
  DocUpdateResult,
} from './doc-updaters/index.js';

// ─── Routing Engine v2 (public: learning, quality, routing) ──────────
export { OutcomeTracker } from './outcome-tracker.js';
export type { RoutingOutcome, LearningsData, SynergyEntry } from './outcome-tracker.js';
export { assessQuality, assessSkillRelevance } from './quality-assessor.js';
export type { QualityScore } from './quality-assessor.js';
export { RuleEvolver } from './rule-evolver.js';
export { PromotionPipeline } from './promotion-pipeline.js';
export { MidSprintAdapter } from './mid-sprint-adapter.js';
export { generateProjectConventionsSkill, generateDataDrivenSkills } from './temp-skill-generator.js';

// ─── Prompt Token Optimizer (public: V2 skill prompt filtering) ───────
export { filterSkillPrompts, filterSkillPromptsByDNA, computeSkillRelevance } from './prompt-token-optimizer.js';

// ─── Ecosystem Intelligence (public: auto-generate activation rules) ──
export { analyzeNewSkill, persistSkillActivation } from './ecosystem-intelligence.js';
