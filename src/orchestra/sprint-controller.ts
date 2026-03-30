// ═══ Sprint Controller ═════════════════════════════════════════════
// Extracted from brain.ts — manages sprint lifecycle:
//   runSprint(), pauseSprint(), resumeSprint(),
//   checkAndAutoPause(), checkAndAutoResume(),
//   cleanup(), isStaleTaskFile()

// ─── Node Builtins ─────────────────────────────────────────────────
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync, unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Core (value imports — enums used at runtime) ──────────────────
import {
  TaskStatus, TaskEvaluation, SprintPhase,
  SprintStatus, DebtPriority, AgentStatus, AlertLevel,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, TaskResult, TaskScope, Sprint, SprintMetrics,
  UsageMetrics, AgentInfo, ResolvedConfig, SystemProfile,
  BrainContext, SprintSizeRecommendation,
  BrainPlanningMode, PlannerResult, ProviderName,
} from '../core/types.js';

import {
  BRAIN_DIR, TASKS_DIR, DIRECTIVES_FILE, SPRINTS_DIR,
  MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE,
  RETRO_FILE, PROJECT_IDENTITY_FILE, TASK_FILE_EXTENSIONS,
  LOCKS_DIR,
} from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { getNextSprintId, parseDebtTable, updateLastSprintId, readJsonSafe, debugLog } from '../core/utils.js';

// ─── Core — config ────────────────────────────────────────────────
import { resolveEffectiveWorkers } from '../core/config.js';

// ─── Core — system profile ────────────────────────────────────────
import { getSystemProfile } from '../core/system-profile.js';

// ─── Sprint Utilities (extracted Phase 2) ─────────────────────────
import {
  readFileSafe, now, resolveMaxWorkersNumeric,
  isDocTask, isStaleTaskFile,
  isTmuxProvider, resolveDefaultUsageCli, getDefaultProvider,
  resolveTaskProvider, getProviderAdapterForTask,
  getSubprocessWorkerLogPath, readSubprocessWorkerLog, hasSubprocessWorkerLog,
  writeSprintState, readSprintState, clearSprintState,
  detectOrphanWorkers, buildSpawnRetryHint,
  extractGoNogoCriteria,
  PAUSE_STATE_FILE,
} from './sprint-utils.js';

// Re-export for backward compatibility (previously defined in this file)
export {
  isDocTask, isStaleTaskFile, isTmuxProvider,
  resolveDefaultUsageCli, getDefaultProvider, resolveTaskProvider,
  getSubprocessWorkerLogPath, readSubprocessWorkerLog, hasSubprocessWorkerLog,
  writeSprintState, readSprintState, clearSprintState,
  detectOrphanWorkers, buildSpawnRetryHint,
};
export type { SprintState } from './sprint-utils.js';

// ─── Core — usage tracker ─────────────────────────────────────────
import { UsageTracker } from '../core/usage-tracker.js';

// ─── Core — provider abstraction ──────────────────────────────────
import type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry } from '../core/provider.js';

// ─── Spawn backend abstraction ───────────────────────────────────
import type { SpawnBackend } from './spawn-backend.js';
import { SpawnBackendFactory } from './spawn-backend.js';


// ─── Connector (provider lifecycle) ─────────────────────────────
import type { Connector } from './connector.js';
// ─── Core — skill system ─────────────────────────────────────────
import { detectProjectStack } from '../core/stack-detector.js';
import { SkillPoolManager } from '../core/skill-pool.js';
import { selectSkills } from '../core/skill-selector.js';

// ─── Planner ─────────────────────────────────────────────────────
import { callBrainPlanner } from './planner.js';

// ─── Task Router ────────────────────────────────────────────────
import { routeTask } from './task-router.js';

// ─── Wave 2 — tmux ────────────────────────────────────────────────
import { ensureSession, spawnWorker, killWorker, listWorkers } from './tmux.js';

// ─── Wave 2 — auditor ─────────────────────────────────────────────
import { resetDashboard, updateDashboard, detectDeadlocks } from '../monitor/auditor.js';

// ─── Wave 2 — worker ──────────────────────────────────────────────
import { releaseAllLocks } from '../agents/worker.js';

// ─── Result Collector (extracted Phase 3) ────────────────────────
import {
  waitForResults as waitForResultsImpl,
  resolveAgentPrompt,
  resolveSkillPrompts,
} from './result-collector.js';

// Re-export for backward compatibility (previously defined in this file)
export { resolveAgentPrompt, resolveSkillPrompts } from './result-collector.js';

// ─── Worker IPC ───────────────────────────────────────────────────
import { ChannelRegistry } from '../agents/worker-ipc.js';
import type { WorkerChannel } from '../agents/worker-ipc.js';

// ─── Agent Pool & Selection ──────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { selectAgent } from '../core/agent-selector.js';
import { routeTaskV2 } from '../core/routing-engine.js';
import type { UserOverride, TaskDNA } from '../core/routing-types.js';

// ─── Rollback (used by sprint-phases.ts — re-export kept for brain.ts backward compat) ──

// ─── Sub-module imports (used by orchestrator) ────────────────────
import { resolveTaskModel, parsePatterns, deduplicatePatterns } from './model-selector.js';
import { createTask, extractScopeFromDirective, parseStructuredDirectives, buildWorkerPrompt, plannerTaskToParams } from './task-builder.js';
import { runDecay } from './debt-manager.js';
import { writeRetrospective, writeSprintLog, calculateMetrics, updateProjectDocs, updateProjectIdentity, buildAgentPerformance } from './sprint-reporter.js';
import { validateWorkerCoverage } from './coverage-validator.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import { loadPluginHooks, runHooks, clearHooks } from '../core/plugin-hooks.js';
import type { AfterSprintContext } from '../core/plugin-hooks.js';

// ─── Rich Output ──────────────────────────────────────────────────
import { formatRichSprintSummary } from '../cli/helpers/sprint-summary-rich.js';
// ─── Sprint Phases (extracted phase functions) ──────────────────────
import {
  runPlanPhase, runSpawnPhase, runEvaluatePhase,
  runRollbackCheck, runFixPhase, runRetroPhase,
  runCleanupPhase,
} from './sprint-phases.js';


// ═══ Types ═════════════════════════════════════════════════════════

export class BrainError extends Error {
  public readonly phase?: SprintPhase;
  constructor(message: string, phase?: SprintPhase) {
    super(message);
    this.name = 'BrainError';
    this.phase = phase;
  }
}

export interface PauseState {
  sprintId: string;
  pausedAt: string;
  pausedTaskIds: string[];
  reason: string;
}

// ─── RunSprintOptions ─────────────────────────────────────────────
export interface RunSprintOptions {
  autoApprove?: boolean;
  sandboxMode?: boolean;
  testMode?: boolean;
  skipCleanup?: boolean;
  timeoutMs?: number;
  /** Fix phase timeout in milliseconds (default: 10 minutes) */
  fixPhaseTimeoutMs?: number;
  /** Optional SpawnBackend override -- defaults to SpawnBackendFactory.create() */
  spawnBackend?: SpawnBackend;
  /** Optional ProviderAdapter override -- used for usage checking */
  provider?: ProviderAdapter;
  /**
   * Enable git rollback safety mechanism.
   * When true (default): creates a safety branch before PLAN phase and
   * offers rollback when all tasks result in NO_GO.
   * When false: disables rollback entirely.
   */
  rollback?: boolean;
  /** Optional Connector instance — when provided, router uses connector.getAvailableProviders() */
  connector?: Connector;
}

// ═══ Interrupt State ════════════════════════════════════════════════

/** Tracks the currently active sprint for SIGINT/interrupt cleanup. */
interface ActiveSprintRef {
  projectRoot: string;
  sprint: Sprint;
  spawnBackend?: SpawnBackend;
}

let _activeSprint: ActiveSprintRef | null = null;
let _isInterrupted = false;

/** Register the active sprint so SIGINT handler can clean it up. @internal */
export function setActiveSprint(projectRoot: string, sprint: Sprint, spawnBackend?: SpawnBackend): void {
  _activeSprint = { projectRoot, sprint, spawnBackend };
}

/** Clear the active sprint reference (called on sprint completion). @internal */
export function clearActiveSprint(): void {
  _activeSprint = null;
}

/** Reset interrupt flag — for use in tests only. @internal */
export function resetInterruptState(): void {
  _isInterrupted = false;
  _activeSprint = null;
}

/** Returns true if the sprint was interrupted via SIGINT. */
export function isInterrupted(): boolean {
  return _isInterrupted;
}

/**
 * Interrupt the active sprint: marks in-progress tasks as INTERRUPTED,
 * writes ABORTED status to heartbeat files, releases locks, and kills workers.
 * Called from the SIGINT handler in entry.ts.
 */
export function interruptActiveSprint(): void {
  if (_isInterrupted || !_activeSprint) return;
  _isInterrupted = true;

  const { projectRoot, sprint, spawnBackend } = _activeSprint;
  const tasksDir = join(projectRoot, TASKS_DIR);

  const activeStatuses = new Set([
    TaskStatus.PENDING,
    TaskStatus.CLAIMED,
    TaskStatus.EXECUTING,
    TaskStatus.TESTING,
    TaskStatus.DOCUMENTING,
  ]);

  for (const task of sprint.tasks) {
    if (!activeStatuses.has(task.status)) continue;

    // Mark task file as INTERRUPTED
    try {
      const taskPath = join(tasksDir, `task-${task.id}.json`);
      if (existsSync(taskPath)) {
        const raw = readFileSync(taskPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        parsed['status'] = 'INTERRUPTED';
        writeFileSync(taskPath, JSON.stringify(parsed, null, 2), 'utf-8');
      }
    } catch { /* skip — non-fatal */ }

    // Mark heartbeat as ABORTED
    try {
      const hbPath = join(tasksDir, `task-${task.id}.hb`);
      if (existsSync(hbPath)) {
        const raw = readFileSync(hbPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        parsed['status'] = 'ABORTED';
        parsed['timestamp'] = new Date().toISOString();
        writeFileSync(hbPath, JSON.stringify(parsed, null, 2), 'utf-8');
      }
    } catch { /* skip — non-fatal */ }

    // Release locks for assigned workers
    if (task.assignedWorker) {
      try { releaseAllLocks(projectRoot, task.assignedWorker); } catch { /* skip */ }
    }
  }

  // Kill all active workers
  try {
    const workers = spawnBackend ? spawnBackend.list() : listWorkers();
    for (const taskId of workers) {
      try {
        if (spawnBackend) spawnBackend.kill(taskId);
        else killWorker(taskId);
      } catch { /* already dead */ }
    }
  } catch { /* non-fatal */ }
}

// ═══ IPC Channel Registry ══════════════════════════════════════════

/**
 * Module-level registry that maps taskId -> WorkerChannel.
 * Populated when workers are spawned via child_process.fork (subprocess backend).
 * tmux-based workers do not populate this registry -- they use file-based heartbeats.
 */
const _channelRegistry = new ChannelRegistry();

/**
 * Returns the module-level ChannelRegistry (used by Brain and tests).
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function getChannelRegistry(): ChannelRegistry {
  return _channelRegistry;
}

/**
 * Register a WorkerChannel for a given taskId.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function registerWorkerChannel(taskId: string, channel: WorkerChannel): void {
  _channelRegistry.register(taskId, channel);
}

/**
 * Unregister and close the WorkerChannel for a given taskId.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function unregisterWorkerChannel(taskId: string): void {
  _channelRegistry.remove(taskId);
}

// ═══ Internal Helpers ══════════════════════════════════════════════

/** Write error dashboard state -- centralizes the repeated boilerplate in runSprint phases */
function safeDashboardUpdate(
  projectRoot: string,
  sprint: Sprint,
  errorMessage: string,
): void {
  try {
    updateDashboard(projectRoot, {
      sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: sprint.tasks.length },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
      alerts: [{ level: AlertLevel.WARNING, message: errorMessage, timestamp: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    });
  } catch { /* dashboard write failed -- continue */ }
}

// Sprint state constants and persistence functions are in sprint-utils.ts
// Re-exported above for backward compatibility.

// ═══ Exported Functions ════════════════════════════════════════════

/**
 * Read the full brain context from disk: directives, memory, retro, patterns,
 * decisions, debt, existing tasks, git status, and file tree.
 * @param projectRoot - Project root directory
 * @returns Complete brain context for sprint planning
 */
export function readContext(projectRoot: string): BrainContext {
  const brainPath = join(projectRoot, BRAIN_DIR);

  const directives = readFileSafe(join(projectRoot, DIRECTIVES_FILE));
  const memory = readFileSafe(join(brainPath, MEMORY_FILE));
  const retro = readFileSafe(join(brainPath, RETRO_FILE));
  const patterns = readFileSafe(join(brainPath, PATTERNS_FILE));
  const decisions = readFileSafe(join(brainPath, DECISIONS_FILE));
  const projectIdentity = readFileSafe(join(brainPath, PROJECT_IDENTITY_FILE));

  const debtContent = readFileSafe(join(brainPath, DEBT_FILE));
  const debt = debtContent ? parseDebtTable(debtContent) : [];

  const existingTasks: Task[] = [];
  const tasksDir = join(projectRoot, TASKS_DIR);
  if (existsSync(tasksDir)) {
    const files = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.json'));
    for (const file of files) {
      const task = readJsonSafe<Task>(join(tasksDir, file));
      if (task) existingTasks.push(task);
    }
  }

  const gitResult = spawnSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf-8' });
  const gitStatus = gitResult.status === 0 ? (gitResult.stdout ?? '') : '';

  const treeResult = spawnSync('git', ['ls-files'], { cwd: projectRoot, encoding: 'utf-8' });
  const fileTree = treeResult.status === 0
    ? (treeResult.stdout ?? '').split('\n').filter(Boolean)
    : [];

  return { directives, memory, retro, debt, patterns, decisions, projectIdentity, existingTasks, projectState: { gitStatus, fileTree } };
}

// resolveDefaultUsageCli: moved to sprint-utils.ts, re-exported above

/**
 * Check current API usage by invoking the default provider CLI synchronously.
 * Tries to determine the CLI binary from the registered default provider adapter;
 * falls back to DEFAULT_USAGE_CLI if no adapter is registered.
 *
 * For provider-aware async usage checking, prefer checkUsageWithProvider() instead.
 *
 * @param _config - Resolved config (reserved for future use)
 * @returns Current usage metrics with percentage values
 */
export function checkUsage(_config: ResolvedConfig): UsageMetrics {
  // status: 'unknown' indicates measurement failed — callers should skip throttling
  const UNKNOWN_DEFAULT = { fiveHourPercent: 50, weeklyPercent: 30, measuredAt: now(), status: 'unknown' as const };
  try {
    // Determine CLI binary from provider registry; skip usage check if none available
    const cliBinary = resolveDefaultUsageCli();
    if (!cliBinary) return UNKNOWN_DEFAULT;
    const result = spawnSync(cliBinary, ['-p', '/usage'], { encoding: 'utf-8', timeout: 10_000 });
    if (result.status !== 0 || !result.stdout) return UNKNOWN_DEFAULT;

    const output = result.stdout;
    const fiveHrMatch = output.match(/5[- ]?h(?:r|our(?:ly)?)?[:\s]+(\d+(?:\.\d+)?)\s*%/i)
      ?? output.match(/(\d+(?:\.\d+)?)\s*%[^%\n]*5[- ]?h/i);
    const weeklyMatch = output.match(/week(?:ly)?[:\s]+(\d+(?:\.\d+)?)\s*%/i)
      ?? output.match(/(\d+(?:\.\d+)?)\s*%[^%\n]*week/i);

    const fiveHourPercent = fiveHrMatch?.[1] ? parseFloat(fiveHrMatch[1]) : UNKNOWN_DEFAULT.fiveHourPercent;
    const weeklyPercent = weeklyMatch?.[1] ? parseFloat(weeklyMatch[1]) : UNKNOWN_DEFAULT.weeklyPercent;
    // status: 'ok' indicates successful measurement — throttling should apply normally
    const okResult = { fiveHourPercent, weeklyPercent, measuredAt: now(), status: 'ok' as const };
    return okResult;
  } catch {
    return UNKNOWN_DEFAULT;
  }
}

/**
 * Check usage via a ProviderAdapter (async, provider-based).
 * @param provider - The provider adapter to delegate usage checking to
 * @returns Usage metrics from the provider
 */
export async function checkUsageWithProvider(provider: ProviderAdapter): Promise<UsageMetrics> {
  return provider.checkUsage();
}

// getDefaultProvider: moved to sprint-utils.ts, re-exported above

/**
 * Recommend sprint size based on current usage vs configured thresholds.
 * Returns 'minimal' (1 worker) when both thresholds exceeded, 'reduced' (half workers)
 * when one exceeded, or 'full' when usage is within limits.
 * @param config - Resolved project configuration
 * @param usage - Current usage metrics
 * @param systemProfile - Optional system profile for 'auto' worker resolution
 * @returns Sprint size recommendation with worker count and model constraint
 */
export function adjustSprintSize(config: ResolvedConfig, usage: UsageMetrics, systemProfile?: SystemProfile): SprintSizeRecommendation {
  // Skip throttling when usage measurement failed (status unknown)
  const usageStatus = (usage as unknown as Record<string, unknown>).status;
  if (usageStatus === 'unknown') {
    const fullWorkers = resolveMaxWorkersNumeric(config, systemProfile);
    return {
      size: 'full',
      maxWorkers: fullWorkers,
      modelConstraint: null,
      reason: 'Usage status unknown — skipping throttling',
    };
  }

  const thresholds = config.activeModeConfig.usage_thresholds;
  const fiveHrExceeded = usage.fiveHourPercent / 100 >= thresholds['5hr'];
  const weeklyExceeded = usage.weeklyPercent / 100 >= thresholds.weekly;

  // Resolve numeric max_workers (handles 'auto')
  const baseMaxWorkers = resolveMaxWorkersNumeric(config, systemProfile);

  if (fiveHrExceeded && weeklyExceeded) {
    return {
      size: 'minimal',
      maxWorkers: 1,
      modelConstraint: config.activeModeConfig.haiku_allowed ? 'haiku' : 'sonnet',
      reason: 'Both usage thresholds exceeded',
    };
  }
  if (fiveHrExceeded || weeklyExceeded) {
    return {
      size: 'reduced',
      maxWorkers: Math.max(1, Math.floor(baseMaxWorkers / 2)),
      modelConstraint: 'sonnet',
      reason: `${fiveHrExceeded ? '5hr' : 'Weekly'} usage threshold exceeded`,
    };
  }
  return {
    size: 'full',
    maxWorkers: baseMaxWorkers,
    modelConstraint: null,
    reason: 'No usage constraints',
  };
}

/**
 * Plan a new sprint by creating task definitions from directives.
 * Handles critical debt priority fixes, AI planner with structured fallback,
 * deadlock detection, agent selection, and skill assignment.
 * @param projectRoot - Project root directory
 * @param config - Resolved project configuration
 * @param context - Brain context with directives, memory, debt, etc.
 * @param recommendation - Sprint size recommendation from adjustSprintSize
 * @param options - Optional planning mode, draft flag, and usage metrics
 * @returns The planned sprint with all tasks
 * @throws {BrainError} When AI planner fails in 'ai' mode or circular dependencies detected
 */
export async function planSprint(
  projectRoot: string,
  config: ResolvedConfig,
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  options?: { mode?: BrainPlanningMode; asDraft?: boolean; usage?: UsageMetrics; dryRun?: boolean },
): Promise<Sprint> {
  const sprintId = getNextSprintId(projectRoot);
  const defaultModel = recommendation.modelConstraint ?? config.activeModeConfig.default_model;
  const planMode = options?.mode ?? config.activeModeConfig.brain_planning ?? 'auto';
  const initialStatus = options?.asDraft ? TaskStatus.DRAFT : TaskStatus.PENDING;
  const usageForModel: UsageMetrics = options?.usage ?? { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: now() };

  const tasks: Task[] = [];
  let seq = 1;
  let plannerResult: PlannerResult | null = null;
  let usedMode: string = 'structured';

  // CRITICAL debt -> priority fix tasks
  const criticalDebt = context.debt.filter(d => d.priority === DebtPriority.CRITICAL && !d.resolved);
  for (const debt of criticalDebt) {
    tasks.push(createTask({
      title: `Fix debt: ${debt.description}`,
      description: `Priority fix for critical debt item ${debt.id}`,
      model: defaultModel,
      effort: 'high',
      priority: 'CRITICAL',
      reason: `Critical debt open for ${debt.sprintsOpen} sprints`,
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'Debt resolved', noGoCriteria: 'Debt still present', techDebtAcceptable: '' },
      sprintId,
      isPriorityFix: true,
      fixForTaskId: debt.originTaskId,
      initialStatus,
    }, seq++));
  }

  // AI planner attempt
  if (planMode === 'ai' || planMode === 'auto') {
    // Resolve brain provider adapter — no hardcoded fallback to any specific provider.
    // Uses config.brain_provider if set, then registry default.
    let brainAdapter: ProviderAdapter | undefined;
    let brainProviderName: ProviderName | undefined = config.brain_provider;
    try {
      if (brainProviderName && providerRegistry.hasProvider(brainProviderName)) {
        brainAdapter = providerRegistry.getProvider(brainProviderName);
      } else {
        brainAdapter = providerRegistry.getDefault();
        brainProviderName = brainAdapter.name as ProviderName;
      }
    } catch {
      // No providers registered — planner will throw a clear error via resolveAdapter()
    }

    // Map brain_model through provider-aware model selector
    const brainModel = resolveTaskModel(
      'sprint-planning', 'AI planner invocation',
      { directories: [], filesRead: [], filesWrite: [] },
      config, usageForModel,
      undefined, config.activeModeConfig.brain_model,
      undefined, brainProviderName,
    );

    plannerResult = callBrainPlanner(
      context,
      recommendation,
      brainModel,
      config.projectName,
      brainAdapter,
    );

    if (plannerResult) {
      const directiveTaskCount = parseStructuredDirectives(context.directives).length;
      if (planMode === 'auto' && directiveTaskCount > 0 && plannerResult.tasks.length < directiveTaskCount) {
        console.error(
          `[Brain] AI planner returned ${plannerResult.tasks.length} tasks, ` +
          `but directives contain ${directiveTaskCount}. Falling back to structured mode.`,
        );
        plannerResult = null;
        usedMode = 'fallback';
      } else if (planMode === 'auto' && directiveTaskCount > 0 && plannerResult.tasks.length > directiveTaskCount * 2) {
        console.error(
          `[Brain] AI planner returned ${plannerResult.tasks.length} tasks (>2x of ${directiveTaskCount}). ` +
          `Falling back to structured mode.`,
        );
        plannerResult = null;
        usedMode = 'fallback';
      } else {
        usedMode = 'ai';
        for (const pt of plannerResult.tasks) {
          tasks.push(createTask(
            plannerTaskToParams(pt, sprintId, defaultModel, initialStatus),
            seq++,
          ));
        }
      }
    } else if (planMode === 'ai') {
      throw new BrainError('AI planner failed', SprintPhase.PLAN);
    } else {
      usedMode = 'fallback';
    }
  }

  // Structured fallback (mode === 'structured' || AI fail + auto)
  if (!plannerResult && (planMode === 'structured' || planMode === 'auto')) {
    const structuredTasks = parseStructuredDirectives(context.directives);
    const directiveSources: Array<{ title: string; description: string; scope: TaskScope; forceModel?: import('../core/types.js').ModelType; forceEffort?: import('../core/types.js').TaskEffort; testTarget?: string; forceAgent?: string; forceSkills?: string[]; excludeAgent?: string[]; excludeSkills?: string[] }> =
      structuredTasks.length > 0
        ? structuredTasks
        : context.directives
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#'))
            .map(l => l.replace(/^-\s+/, ''))
            .filter(Boolean)
            .map(line => ({ title: line, description: line, scope: extractScopeFromDirective(line) }));

    // Parse and deduplicate patterns from context for model selection
    const patternsRaw = typeof context.patterns === 'string' ? context.patterns : '';
    const parsedPatterns = deduplicatePatterns(parsePatterns(patternsRaw));

    for (const src of directiveSources) {
      const resolvedModel = recommendation.modelConstraint ??
        resolveTaskModel(src.title, src.description, src.scope, config, usageForModel, parsedPatterns, src.forceModel);
      const resolvedEffort = src.forceEffort ?? 'normal';
      tasks.push(createTask({
        title: src.title,
        description: src.description,
        model: resolvedModel,
        effort: resolvedEffort,
        priority: 'NORMAL',
        reason: src.forceModel
          ? `Directive (model: ${resolvedModel} -- user override)`
          : `Directive (model: ${resolvedModel} -- resolved from scope/complexity/plan/usage)`,
        scope: src.scope,
        dependencies: [],
        goNogo: extractGoNogoCriteria(src.description, src.testTarget),
        sprintId,
        initialStatus,
        forceModel: src.forceModel,
        forceEffort: src.forceEffort,
        forceAgent: src.forceAgent,
        forceSkills: src.forceSkills,
        excludeAgent: src.excludeAgent,
        excludeSkills: src.excludeSkills,
      }, seq++));
    }
  }

  // Deadlock check
  const deadlocks = detectDeadlocks(tasks);
  if (deadlocks.length > 0) {
    throw new BrainError(
      `Circular dependencies detected: ${deadlocks[0]?.detail ?? 'unknown'}`,
      SprintPhase.PLAN,
    );
  }

  // D) Safeguard: warn if AI planner produced >2x the directive task count
  const directiveTaskCountForGuard = parseStructuredDirectives(context.directives).length;
  if (directiveTaskCountForGuard > 0 && tasks.length > directiveTaskCountForGuard * 2) {
    console.error(
      `[Brain] Warning: ${tasks.length} tasks planned but directives only contain ${directiveTaskCountForGuard} tasks (>2x). ` +
      `Review the plan for excessive task generation.`,
    );
  }

  // ─── Routing: V2 (intent-based) or V1 (keyword-based) ─────────────────────
  // V1 and V2 are mutually exclusive: if-else ensures no parallel execution.
  // V2 mode: uses routeTaskV2 (intent-based 3-layer engine)
  // V1 mode: uses selectAgent + selectSkills (legacy keyword-based)
  // No code duplication or redundant calculation in V2 mode.
  const routingVersion = config.routing_engine ?? 'v1';

  if (routingVersion === 'v2') {
    // V2: Unified intent-based routing via routeTaskV2
    try {
      const agentPool = new AgentPoolManager(projectRoot);
      const pool = agentPool.loadAgents();
      const projectStackV2 = detectProjectStack(projectRoot);
      const skillPoolV2 = new SkillPoolManager(projectRoot);
      const skillsV2 = skillPoolV2.loadSkills();

      // Load learning bonuses from previous sprints
      let learningData: import('../core/routing-types.js').LearningBonus[] = [];
      try {
        const { OutcomeTracker } = await import('./outcome-tracker.js');
        const tracker = new OutcomeTracker(projectRoot);
        // Pre-calculate bonuses using a dummy DNA — bonuses are entity-level, not task-specific
        // Each task will get fresh bonuses from classifyIntent in routeTaskV2
        const { classifyIntent } = await import('../core/intent-classifier.js');
        if (tasks.length > 0) {
          const sampleDNA = classifyIntent(tasks[0]!);
          learningData = tracker.calculateBonuses(sampleDNA);
          debugLog('planSprint:learning-bonuses', `Loaded ${learningData.length} learning bonuses from previous sprints`);
        }
      } catch {
        debugLog('planSprint:learning-bonuses', 'No learning data available (first sprint or missing learnings.json)');
      }

      // Generate project conventions temp skill
      try {
        const { generateProjectConventionsSkill } = await import('./temp-skill-generator.js');
        if (projectStackV2) {
          const conventionsSkill = generateProjectConventionsSkill(projectStackV2);
          skillsV2.set(conventionsSkill.id, conventionsSkill);
          debugLog('planSprint:temp-skill', `Generated project-conventions skill for ${projectStackV2.language}`);
        }
      } catch { /* non-fatal */ }

      // Generate and persist project-specific temp agents (V2 only)
      try {
        const { generateTempAgents } = await import('./temp-skill-generator.js');
        if (projectStackV2) {
          const tempAgents = generateTempAgents(projectStackV2);
          for (const tempAgent of tempAgents) {
            agentPool.saveTempAgentToPool(tempAgent);
            pool.set(tempAgent.id.startsWith('temp-') ? tempAgent.id : `temp-${tempAgent.id}`, tempAgent);
            debugLog('planSprint:temp-agent', `Generated temp agent: ${tempAgent.id} for ${projectStackV2.language}/${projectStackV2.framework}`);
          }
        }
      } catch { /* non-fatal */ }

      for (const task of tasks) {
        try {
          const overrides: UserOverride[] = [];
          if (task.forceAgent || task.forceSkills || task.excludeSkills || task.excludeAgent) {
            overrides.push({
              source: 'task-directive',
              forceAgent: task.forceAgent,
              forceSkills: task.forceSkills,
              excludeSkills: task.excludeSkills,
              excludeAgents: task.excludeAgent,
              priority: 3,
            });
          }

          const decision = routeTaskV2(task, pool, skillsV2, {
            projectStack: projectStackV2,
            overrides,
            learningData,
            config: config.routing_config,
          });

          task.assignedAgent = decision.agentId ?? 'generic';
          task.assignedSkills = decision.skillIds;
          task.routingMeta = {
            taskDNA: decision.taskDNA,
            confidence: decision.agentConfidence,
            routingVersion: 'v2',
          };

          debugLog(
            'planSprint:routing-v2',
            `Task ${task.id} → agent=${task.assignedAgent}, skills=[${task.assignedSkills.join(', ')}], ` +
            `confidence=${decision.agentConfidence}, intent=${decision.taskDNA.intent.primary}`,
          );
        } catch (taskErr) {
          debugLog('planSprint:routing-v2', `V2 routing failed for task ${task.id}: ${taskErr}`);
        }
      }
    } catch (poolErr) {
      debugLog('planSprint:routing-v2', `V2 routing pool loading failed: ${poolErr}`);
    }
  } else {

  // V1: Agent selection (non-fatal -- if pool fails, continue with generic workers)
  try {
    const agentPool = new AgentPoolManager(projectRoot);
    const pool = agentPool.loadAgents();
    for (const task of tasks) {
      try {
        // If DIRECTIVES specified Agent: override, use it directly
        if (task.forceAgent) {
          task.assignedAgent = task.forceAgent;
          debugLog(
            'planSprint:agent-selection',
            `Task ${task.id} → forceAgent=${task.forceAgent} (DIRECTIVES override)`,
          );
        } else {
          // Agent selection runs regardless of forceModel — agent expertise is independent of model choice
          const result = selectAgent(task, pool);
          task.assignedAgent = result.agent?.id ?? 'generic';
          // Only apply agent's preferredModel when no forceModel override exists
          if (result.agent?.preferredModel && !task.forceModel) {
            task.model = result.agent.preferredModel;
          }
          // Log agent selection result for debugging persistence
          debugLog(
            'planSprint:agent-selection',
            `Task ${task.id} → agent=${task.assignedAgent}, score=${result.score}, reason=${result.reason}`,
          );
        }
      } catch (taskErr) {
        debugLog('planSprint:agent-selection', `Agent selection failed for task ${task.id}: ${taskErr}`);
      }
    }
  } catch (poolErr) {
    debugLog('planSprint:agent-pool', `Agent pool loading failed: ${poolErr}`);
  }

  // Skill selection (non-fatal -- if skill modules fail, continue without skills)
  try {
    const projectStack = detectProjectStack(projectRoot);
    const skillPool = new SkillPoolManager(projectRoot);
    const skills = skillPool.loadSkills();

    if (skills.size > 0) {
      for (const task of tasks) {
        try {
          // If DIRECTIVES specified Skills: override, use it directly (don't let auto-selection overwrite)
          if (task.forceSkills && task.forceSkills.length > 0) {
            task.assignedSkills = task.forceSkills;
            debugLog(
              'planSprint:skill-selection',
              `Task ${task.id} → forceSkills=[${task.forceSkills.join(', ')}] (DIRECTIVES override)`,
            );
          } else {
            const agentInfo = task.assignedAgent && task.assignedAgent !== 'generic'
              ? { id: task.assignedAgent, expertise: [] as string[] }
              : undefined;
            const result = selectSkills(task, projectStack, skills, agentInfo);
            if (result.skills.length > 0) {
              task.assignedSkills = result.skills.map(s => s.id);
            }
            // Log skill selection result for debugging persistence
            debugLog(
              'planSprint:skill-selection',
              `Task ${task.id} → skills=[${(task.assignedSkills ?? []).join(', ')}]`,
            );
          }
        } catch (taskErr) {
          debugLog('planSprint:skill-selection', `Skill selection failed for task ${task.id}: ${taskErr}`);
        }
      }
    }
  } catch (poolErr) {
    debugLog('planSprint:skill-pool', `Skill pool loading failed: ${poolErr}`);
  }

  } // end V1 else block

  // Write task files (skip in dry-run mode)
  if (!options?.dryRun) {
    const tasksPath = join(projectRoot, TASKS_DIR);
    mkdirSync(tasksPath, { recursive: true });
    for (const task of tasks) {
      // Verify agent/skill assignment persisted before write
      debugLog(
        'planSprint:task-write',
        `Writing ${task.id}: assignedAgent=${task.assignedAgent ?? 'undefined'}, assignedSkills=[${(task.assignedSkills ?? []).join(', ')}]`,
      );
      writeFileSync(join(tasksPath, `task-${task.id}.json`), JSON.stringify(task, null, 2), 'utf-8');
    }
  }

  return {
    id: sprintId,
    number: parseInt(sprintId.replace('sprint-', ''), 10),
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    reasoning: plannerResult?.reasoning,
    planningMode: usedMode,
  };
}

/**
 * Transition all DRAFT tasks in a sprint to PENDING status and persist changes.
 * @param projectRoot - Project root directory
 * @param sprint - Sprint whose draft tasks should be confirmed
 */
export function confirmDraftTasks(projectRoot: string, sprint: Sprint): void {
  const tasksPath = join(projectRoot, TASKS_DIR);
  for (const task of sprint.tasks) {
    if (task.status === TaskStatus.DRAFT) {
      task.status = TaskStatus.PENDING;
      writeFileSync(
        join(tasksPath, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    }
  }
}

/**
 * Remove existing DRAFT task files from .tasks/ directory.
 * Called before planning to ensure idempotency — re-running `deckent plan`
 * cleans up stale drafts from a previous plan.
 * @param projectRoot - Project root directory
 */
export function cleanupDraftTasks(projectRoot: string): void {
  const tasksPath = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksPath)) return;
  const files = readdirSync(tasksPath).filter(f => f.startsWith('task-') && f.endsWith('.json'));
  for (const file of files) {
    const filePath = join(tasksPath, file);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const task = JSON.parse(raw);
      if (task.status === TaskStatus.DRAFT) {
        unlinkSync(filePath);
      }
    } catch {
      // Ignore malformed task files
    }
  }
}

// resolveAgentPrompt, resolveSkillPrompts: moved to result-collector.ts, re-exported above

/**
 * Spawn worker agents for sprint tasks via the configured backend.
 * Respects max_workers limit; excess tasks are returned as a queue.
 * @param projectRoot - Project root directory
 * @param sprint - Sprint containing tasks to execute
 * @param config - Resolved project configuration
 * @param spawnOpts - Optional spawn settings (auto-approve, usage tracker, backend)
 * @returns Array of queued tasks that exceeded the worker limit
 */
export function spawnWorkers(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: { autoApprove?: boolean; usageTracker?: UsageTracker; spawnBackend?: SpawnBackend },
): Task[] {
  // Use provided SpawnBackend, or fall back to direct tmux calls (backward compat)
  const backend = spawnOpts?.spawnBackend;

  // Track whether we need tmux session for any Claude tasks
  let needsTmuxSession = false;

  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);
  const activeTasks = sprint.tasks.slice(0, maxWorkers);
  const queuedTasks = sprint.tasks.slice(maxWorkers);

  // Pre-check: do any active tasks need tmux (uses isTmuxProvider helper)?
  if (!backend) {
    needsTmuxSession = activeTasks.some(task => {
      const provider = resolveTaskProvider(task);
      return isTmuxProvider(provider);
    });
    if (needsTmuxSession) {
      ensureSession();
    }
  }

  for (const task of activeTasks) {
    const agentPrompt = resolveAgentPrompt(projectRoot, task);
    const taskSkillPrompts = resolveSkillPrompts(projectRoot, task);
    const prompt = buildWorkerPrompt(task, agentPrompt, taskSkillPrompts);
    const model = task.model;
    const writeTargets = ['.tasks/', ...task.scope.directories, ...task.scope.filesWrite].filter(Boolean);
    const allowedTools = writeTargets.length > 0
      ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
      : 'Read,Write,Edit,Bash,Glob,Grep';

    const taskProvider = resolveTaskProvider(task);

    // Route to adapter-based provider if task uses a non-tmux provider
    if (!isTmuxProvider(taskProvider)) {
      const adapter = getProviderAdapterForTask(taskProvider);
      if (adapter) {
        adapter.spawn(task.id, model, prompt, {
          allowedTools,
          autoApprove: spawnOpts?.autoApprove ?? false,
          projectDir: projectRoot,
        });
      }
      // If no adapter found, fall through — task will be tracked but not spawned
      // (provider registration is a precondition the caller must satisfy)
    } else if (backend) {
      // SpawnBackend abstraction path (Claude)
      backend.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else {
      // Legacy direct tmux path (Claude)
      spawnWorker(task.id, model, prompt, projectRoot, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
      });
    }

    // Update task status to EXECUTING and persist to disk
    task.status = TaskStatus.EXECUTING;
    try {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    } catch { /* non-fatal: task file may not exist in test/dry-run context */ }

    // Record spawn call in usage tracker
    if (spawnOpts?.usageTracker) {
      spawnOpts.usageTracker.recordCall(model, 5_000, task.id, sprint.id);
    }
  }

  const agents: AgentInfo[] = activeTasks.map(task => ({
    id: `w-${task.id}`,
    role: 'worker' as const,
    status: AgentStatus.EXECUTING,
    model: task.model,
    tmuxWindow: `w-${task.id}`,
    taskId: task.id,
    currentAction: `Starting [${resolveTaskProvider(task)}]`,
    spawnedAt: now(),
  }));

  updateDashboard(projectRoot, {
    sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
    agents,
    progress: { done: 0, active: activeTasks.length, blocked: 0, total: sprint.tasks.length },
    usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: now() },
    alerts: [],
    updatedAt: now(),
  });

  return queuedTasks;
}

// isTmuxProvider, getSubprocessWorkerLogPath, readSubprocessWorkerLog, hasSubprocessWorkerLog:
// moved to sprint-utils.ts, re-exported above

/**
 * Route all sprint tasks to providers using the TaskRouter.
 * Sets task.provider, task.assignedAgent, and task.assignedSkills based on routing decisions.
 * Exported for testability — called from runSprint Phase 1.5.
 * @param tasks - Array of tasks to route
 * @param config - Resolved config with skill_routing overrides
 * @param availableProviders - List of available provider names (from Connector or registry)
 */
export function routeSprintTasks(
  tasks: Task[],
  config: ResolvedConfig,
  availableProviders: ProviderName[],
): void {
  for (const task of tasks) {
    const routing = routeTask(task, config, availableProviders);
    task.provider = routing.provider;
    if (routing.agent !== 'generic') task.assignedAgent = routing.agent;
    if (routing.skills.length > 0) task.assignedSkills = routing.skills;
  }
}

// resolveTaskProvider, getProviderAdapterForTask: moved to sprint-utils.ts, re-exported above

/**
 * Wait for task result files to appear on disk using fs.watch with fallback polling.
 * Supports queued task execution: as workers finish, queued tasks are spawned.
 * Delegates to result-collector.ts (extracted Phase 3).
 * @param projectRoot - Project root directory
 * @param sprint - Sprint whose results to wait for
 * @param timeoutMs - Maximum wait time in ms (default: 30 minutes)
 * @param queue - Optional queued tasks to spawn as slots open
 * @param spawnOpts - Optional spawn settings for queued task execution
 * @returns Array of collected task results
 */
export async function waitForResults(
  projectRoot: string,
  sprint: Sprint,
  timeoutMs?: number,
  queue?: Task[],
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
): Promise<TaskResult[]> {
  return waitForResultsImpl(projectRoot, sprint, timeoutMs, queue, spawnOpts, _channelRegistry);
}

// isDocTask: moved to sprint-utils.ts, re-exported above

/**
 * Evaluate a worker's task result and return DONE, GO_WITH_TECH_DEBT, or NO_GO.
 * Checks self-assessment, test results, doc-task status, and coverage threshold (90%).
 * @param result - The worker's task result
 * @param task - The task that was executed
 * @param vitestJsonOutput - Optional raw vitest JSON for coverage validation
 * @returns The evaluation outcome
 */
export function evaluateResult(result: TaskResult, task: Task, vitestJsonOutput?: string): TaskEvaluation {
  if (result.selfAssessment === 'NO_GO') return TaskEvaluation.NO_GO;
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT') return TaskEvaluation.GO_WITH_TECH_DEBT;
  if (!result.testsPassed) return TaskEvaluation.NO_GO;
  if (isDocTask(task)) return TaskEvaluation.DONE;

  // Coverage validation: if vitest JSON output provided, validate reported vs actual
  if (vitestJsonOutput !== undefined) {
    const coverageCheck = validateWorkerCoverage({
      reportedCoverage: result.coverage,
      vitestJsonOutput,
      taskScope: { directories: task.scope?.directories ?? [] },
    });
    if (coverageCheck && coverageCheck.level === 'WARNING') {
      return TaskEvaluation.GO_WITH_TECH_DEBT;
    }
  }

  if (result.coverage < 90) return TaskEvaluation.GO_WITH_TECH_DEBT;
  return TaskEvaluation.DONE;
}

// isStaleTaskFile: moved to sprint-utils.ts, re-exported above

// extractGoNogoCriteria: moved to sprint-utils.ts, imported above

/**
 * Clean up all sprint resources: kill workers, release locks, remove task files
 * (.json, .plan, .hb, .result, .paused, .log), stale files, and lock files.
 * @param projectRoot - Project root directory
 * @param sprint - Sprint whose resources should be cleaned up
 * @param spawnBackend - Optional spawn backend for killing workers
 */
export function cleanup(projectRoot: string, sprint: Sprint, spawnBackend?: SpawnBackend): void {
  // Kill all active workers via backend or direct tmux calls
  const workers = spawnBackend ? spawnBackend.list() : listWorkers();
  for (const taskId of workers) {
    try {
      if (spawnBackend) spawnBackend.kill(taskId);
      else killWorker(taskId);
    } catch { /* already dead */ }
  }

  // Kill workers on non-tmux provider adapters
  for (const task of sprint.tasks) {
    const provider = resolveTaskProvider(task);
    if (!isTmuxProvider(provider)) {
      const adapter = getProviderAdapterForTask(provider);
      if (adapter) {
        try { adapter.kill(task.id); } catch { /* already dead */ }
      }
    }
  }

  for (const task of sprint.tasks) {
    if (task.assignedWorker) {
      try { releaseAllLocks(projectRoot, task.assignedWorker); } catch { /* skip */ }
    }
  }

  const tasksDir = join(projectRoot, TASKS_DIR);
  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir).filter(f => TASK_FILE_EXTENSIONS.some(ext => f.endsWith(ext)))) {
      try { unlinkSync(join(tasksDir, file)); } catch { /* skip */ }
    }
  }

  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir)) {
      if (TASK_FILE_EXTENSIONS.some(ext => file.endsWith(ext))) {
        const fullPath = join(tasksDir, file);
        if (isStaleTaskFile(fullPath)) {
          try { unlinkSync(fullPath); } catch { /* skip */ }
        }
      }
    }
  }

  // Clean up leftover .tasks/.prompt-* hidden tmpfiles from buildClaudeCommand
  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir)) {
      if (file.startsWith('.prompt-')) {
        try { unlinkSync(join(tasksDir, file)); } catch { /* skip */ }
      }
    }
  }

  const locksDir = join(projectRoot, LOCKS_DIR);
  if (existsSync(locksDir)) {
    for (const file of readdirSync(locksDir).filter(f => f.endsWith('.lock'))) {
      try { unlinkSync(join(locksDir, file)); } catch { /* skip */ }
    }
  }

  // Clear plugin hooks so they don't persist across sprints
  clearHooks();
}

// ═══ Finalize Sprint ══════════════════════════════════════════════

/**
 * Options for finalizeSprint.
 */
export interface FinalizeSprintOptions {
  /** Skip decay phase */
  skipDecay?: boolean;
  /** Skip plugin hooks */
  skipHooks?: boolean;
  /** Resolved config (used for updateProjectDocs) */
  config?: ResolvedConfig;
  /** Usage tracker for retro usage section */
  usageTracker?: UsageTracker;
}

/**
 * Run ALL post-sprint finalization actions. This function is idempotent-safe:
 * calling it multiple times with the same data won't corrupt state (MEMORY.md
 * may get duplicate entries if sprint learnings already exist, but trimming
 * keeps it within budget).
 *
 * Actions performed:
 * 1. Calculate metrics from evaluations + results
 * 2. Write sprint log to .brain/sprints/sprint-NNN.md
 * 3. Update MEMORY.md with sprint learnings (trimMemoryWithHeader)
 * 4. Write RETRO.md (writeRetrospective)
 * 5. Update PROJECT-IDENTITY.md "Current State" section
 * 6. Update last_sprint_id in .deckent/config.json
 * 7. Run decay if over budget
 * 8. Run afterSprint plugin hooks
 * 9. Update project docs (doc-updaters registry)
 *
 * @param projectRoot - Project root directory
 * @param sprint - The completed sprint (must have tasks populated)
 * @param evaluations - Map of task ID to evaluation result
 * @param results - Array of worker task results
 * @param opts - Optional finalization settings
 * @returns The computed sprint metrics
 */
export async function finalizeSprint(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  opts?: FinalizeSprintOptions,
): Promise<SprintMetrics> {
  // 1. Calculate metrics
  const freshDebt = parseDebtTable(readFileSafe(join(projectRoot, BRAIN_DIR, DEBT_FILE)) ?? '');
  const metrics = calculateMetrics(sprint, evaluations, results, freshDebt);
  sprint.metrics = metrics;

  // 2. Write sprint log
  try {
    writeSprintLog(projectRoot, sprint, metrics, evaluations);
  } catch { /* non-fatal: sprint log write failure */ }

  // 3 + 4. Write RETRO.md and update MEMORY.md (writeRetrospective does both)
  try {
    writeRetrospective(projectRoot, sprint, evaluations, metrics, opts?.usageTracker, undefined, undefined, results);
  } catch { /* non-fatal: retro write failure */ }

  // 5. Update PROJECT-IDENTITY.md
  try {
    // Count total sprints from .brain/sprints/ directory
    const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
    let totalSprints = 1;
    try {
      if (existsSync(sprintsPath)) {
        totalSprints = readdirSync(sprintsPath).filter(f => f.endsWith('.md')).length;
      }
    } catch { /* default to 1 */ }
    updateProjectIdentity(projectRoot, sprint.id, metrics, totalSprints);
  } catch { /* non-fatal: project identity update failure */ }

  // 6. Update last_sprint_id in config
  try {
    updateLastSprintId(projectRoot, sprint.id);
  } catch { /* non-fatal */ }

  // 7. Run decay if over budget
  if (!opts?.skipDecay) {
    try {
      runDecay(projectRoot, sprint.id);
    } catch { /* non-fatal: decay failure */ }
  }

  // 8. Run afterSprint plugin hooks
  if (!opts?.skipHooks) {
    try {
      await runHooks('afterSprint', {
        hook: 'afterSprint',
        sprint,
        projectRoot,
      } satisfies AfterSprintContext);
    } catch { /* afterSprint hook failure is non-fatal */ }
  }

  // 8b. Update agent/skill stats
  const routingVersion = (opts?.config as Record<string, unknown> | undefined)?.['routing_engine'] as string | undefined;

  if (routingVersion !== 'v2') {
    // V1: Write stats directly to agent.json manifests (legacy behavior)
    try {
      const poolManager = new AgentPoolManager(projectRoot);
      for (const task of sprint.tasks) {
        const agentId = task.assignedAgent;
        if (!agentId) continue;
        const evaluation = evaluations.get(task.id);
        if (!evaluation) continue;
        const taskResult = results.find(r => r.taskId === task.id);
        const coverage = taskResult?.coverage ?? 0;
        poolManager.updateAgentStats(agentId, evaluation, coverage, sprint.id);
      }
    } catch { /* non-fatal */ }
  } else {
    // V2: Record outcomes to learnings.json (single source of truth)
    // Agent.json manifests are NOT touched — stats live in learnings.json only
    try {
      const { OutcomeTracker } = await import('./outcome-tracker.js');
      const { assessQuality } = await import('./quality-assessor.js');
      const tracker = new OutcomeTracker(projectRoot);

      for (const task of sprint.tasks) {
        const evaluation = evaluations.get(task.id);
        if (!evaluation) continue;
        const taskResult = results.find(r => r.taskId === task.id);

        // Quality assessment — multi-dimensional scoring beyond GO/NO_GO
        let qualityScore: number | undefined;
        if (taskResult) {
          try {
            const quality = assessQuality(task, taskResult, evaluation as unknown as string);
            qualityScore = quality.overall;
          } catch { /* non-fatal */ }
        }

        tracker.recordOutcome({
          taskId: task.id,
          sprintId: sprint.id,
          taskDNA: (task.routingMeta?.taskDNA ?? { intent: { primary: 'unknown', secondary: [], confidence: 0 }, domains: [], operations: [], complexity: { fileCount: 0, moduleCount: 0, crossCutting: false, estimatedSize: 'small' }, scope: { writeRatio: {}, primaryWriteTarget: '', testWriteRatio: 0 } }) as TaskDNA,
          agentId: task.assignedAgent ?? null,
          skillIds: task.assignedSkills ?? [],
          evaluation: evaluation as unknown as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
          coverage: taskResult?.coverage ?? 0,
          qualityScore,
          routingVersion: 'v2',
        });
      }
      debugLog('finalizeSprint:routing-outcomes', `Recorded ${sprint.tasks.length} routing outcomes to learnings.json`);

      // 8d. Evolve routing rules from accumulated data
      try {
        const { RuleEvolver } = await import('./rule-evolver.js');
        const evolver = new RuleEvolver(tracker);
        const evolution = evolver.evolveRules();
        if (evolution.newRules.length > 0) {
          debugLog('finalizeSprint:rule-evolution', `${evolution.newRules.length} new rules evolved`);
          // Persist evolved rules in learnings
          tracker.saveEvolvedRules(evolution.newRules);
        }
      } catch { /* non-fatal: rule evolution failure */ }

      // 8e. Evaluate promotions/demotions
      try {
        const { PromotionPipeline } = await import('./promotion-pipeline.js');
        const pipeline = new PromotionPipeline(projectRoot);
        const promotions = pipeline.evaluatePromotions(tracker);
        const demotions = pipeline.evaluateDemotions(tracker);
        for (const p of promotions.filter(r => r.action === 'promote')) {
          debugLog('finalizeSprint:promotion', `${p.entityType} '${p.entityId}': ${p.reason}`);
        }
        for (const d of demotions.filter(r => r.action === 'demote')) {
          debugLog('finalizeSprint:demotion', `${d.entityType} '${d.entityId}': ${d.reason}`);
        }
      } catch { /* non-fatal: promotion/demotion failure */ }
    } catch (err) {
      debugLog('finalizeSprint:v2-learning', `V2 learning pipeline failed: ${err}`);
    }
  }

  // 9. Update project docs
  if (opts?.config) {
    try {
      updateProjectDocs(projectRoot, { sprint, evaluations, metrics }, opts.config);
    } catch { /* non-fatal */ }
  }

  // 10. Rich output (non-fatal — sprint completes even if formatting fails)
  try {
    const gitDiff = spawnSync('git', ['diff', '--stat', 'HEAD~1'], { encoding: 'utf-8', cwd: projectRoot }).stdout;
    // output_mode lives on DeckentConfig (raw), not ResolvedConfig — access via cast
    const rawConfig = opts?.config as Record<string, unknown> | undefined;
    const outputMode = (rawConfig?.['output_mode'] as string) ?? 'normal';
    const richInput = { id: sprint.id, number: sprint.number, tasks: sprint.tasks.map(t => ({ id: t.id, title: t.title })), metrics: sprint.metrics ? { ...sprint.metrics } : undefined };
    // Build agent performance data for the performance table
    const agentRows = buildAgentPerformance(sprint, evaluations, results);
    const agentPerf = agentRows.map(row => ({
      agentId: row.agent,
      totalTasks: row.tasks,
      doneTasks: row.done,
      successRate: row.tasks > 0 ? Math.round((row.done / row.tasks) * 100) : 0,
    }));
    // Extract learnings from evaluation results (task notes from results)
    const learnings = results
      .filter(r => r.notes && r.notes.trim().length > 0)
      .map(r => r.notes as string)
      .slice(0, 5);
    const richOutput = formatRichSprintSummary(
      richInput,
      evaluations,
      { gitDiff, agentPerf, learnings, outputMode: outputMode as 'quiet' | 'normal' | 'verbose' },
    );
    if (richOutput) console.log(richOutput);
  } catch { /* Rich output failure is non-fatal */ }

  return metrics;
}

/**
 * Master orchestrator: runs a complete sprint lifecycle through all phases
 * (PLAN, SPAWN, EXECUTE, EVALUATE, FIX, RETRO, DECAY, CLEANUP).
 * Includes rollback support when all tasks fail.
 * @param projectRoot - Project root directory
 * @param config - Resolved project configuration
 * @param opts - Optional sprint options (auto-approve, sandbox, timeout, rollback, etc.)
 * @returns The completed sprint with metrics and final status
 * @throws {BrainError} When plan or spawn phase fails
 */
export async function runSprint(
  projectRoot: string,
  config: ResolvedConfig,
  opts?: RunSprintOptions,
): Promise<Sprint> {
  const routingVersionForFix = config.routing_engine ?? 'v1';
  const usageTracker = new UsageTracker(projectRoot);

  // Use provided SpawnBackend, or create one from config.spawn_backend via SpawnBackendFactory.
  // Falls back to legacy direct-tmux path only when spawn_backend is not set and no backend provided.
  const spawnBackend: SpawnBackend | undefined = opts?.spawnBackend
    ?? (config.spawn_backend
      ? SpawnBackendFactory.create({ backend: config.spawn_backend, projectDir: projectRoot })
      : undefined);

  // Resolve provider for usage checks (use provided override or registry default)
  const activeProvider: ProviderAdapter | null = opts?.provider ?? getDefaultProvider();

  // Rollback enabled by default (unless explicitly disabled via opts.rollback === false)
  const rollbackEnabled = opts?.rollback !== false;

  // Load plugin hooks at sprint start (non-fatal)
  try {
    await loadPluginHooks(projectRoot);
  } catch { /* plugin hook loading failure is non-fatal */ }

  // Phase 1: PLAN
  const { sprint, lastUsage: initialUsage, safetyPoint } = await runPlanPhase(
    projectRoot, config, opts, activeProvider, rollbackEnabled,
  );
  let lastUsage = initialUsage;

  // Register active sprint for SIGINT interrupt cleanup
  setActiveSprint(projectRoot, sprint, spawnBackend);

  // Phase 1.5: Route tasks to providers via Connector or registry (non-fatal)
  try {
    const connector = opts?.connector;
    const availableProviders = connector
      ? connector.getAvailableProviders()
      : providerRegistry.listProviders() as ProviderName[];
    routeSprintTasks(sprint.tasks, config, availableProviders);
  } catch { /* Router failure is non-fatal — all tasks use brain_provider */ }

  // Reset dashboard for new sprint
  try {
    resetDashboard(projectRoot, sprint.id, sprint.tasks.length);
  } catch { /* dashboard reset failed -- non-fatal */ }

  // Persist sprint state for crash recovery
  writeSprintState(projectRoot, sprint);

  // Phase 2: SPAWN (1 retry with diagnostic hints)
  const { taskQueue, scanInterval: initialScanInterval } = runSpawnPhase(
    projectRoot, sprint, config, opts, usageTracker, spawnBackend,
  );
  let scanInterval = initialScanInterval;

  // Phase 3: EXECUTE
  let results: TaskResult[] = [];
  try {
    sprint.phase = SprintPhase.EXECUTE;
    writeSprintState(projectRoot, sprint);
    results = await waitForResults(projectRoot, sprint, opts?.timeoutMs, taskQueue, { autoApprove: opts?.autoApprove, spawnBackend });
  } catch (err) {
    safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Phase 4: EVALUATE
  const evaluations = new Map<string, TaskEvaluation>();
  await runEvaluatePhase(projectRoot, sprint, results, evaluations, usageTracker);

  // Rollback check: if rollback is enabled and all tasks are NO_GO, trigger rollback
  runRollbackCheck(projectRoot, sprint, evaluations, rollbackEnabled, safetyPoint);

  // Phase 5: FIX
  await runFixPhase(projectRoot, sprint, evaluations, results, config, opts, routingVersionForFix, usageTracker, spawnBackend);

  // Phase 6+7: RETRO + DECAY via finalizeSprint (skipped in testMode)
  await runRetroPhase(projectRoot, sprint, evaluations, results, config, usageTracker, opts?.testMode);

  // Phase 8: CLEANUP (skipped when skipCleanup is true)
  scanInterval = runCleanupPhase(projectRoot, sprint, config, opts, scanInterval, spawnBackend);

  sprint.status = SprintStatus.COMPLETE;
  sprint.phase = SprintPhase.COMPLETE;
  sprint.completedAt = now();

  // Clear active sprint reference — sprint completed normally
  clearActiveSprint();

  // Clear sprint state file after successful completion
  clearSprintState(projectRoot);

  // Sprint usage report
  try {
    const sprintUsage = usageTracker.getSprintUsage(sprint.id);
    sprint.usageReport = {
      totalCalls: sprintUsage.totalCalls,
      totalTokens: sprintUsage.totalTokens,
      modelBreakdown: sprintUsage.modelBreakdown,
    };
  } catch { /* non-fatal */ }

  // Re-check usage before final dashboard update for accurate end-of-sprint metrics
  try {
    const finalUsage = activeProvider
      ? await checkUsageWithProvider(activeProvider)
      : checkUsage(config);
    lastUsage = finalUsage;
  } catch { /* non-fatal — use last captured usage */ }

  updateDashboard(projectRoot, {
    sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
    agents: [],
    progress: { done: sprint.tasks.length, active: 0, blocked: 0, total: sprint.tasks.length },
    usage: lastUsage,
    alerts: [],
    updatedAt: now(),
  });

  return sprint;
}

// ═══ Pause / Resume ════════════════════════════════════════════════

/**
 * Transitions active/pending tasks to PAUSED status, writes a .paused marker
 * file for each task, saves pause state, and updates the dashboard.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function pauseSprint(
  projectRoot: string,
  sprint: Sprint,
  reason: string = 'Manual pause',
): PauseState {
  const tasksPath = join(projectRoot, TASKS_DIR);
  const pausedTaskIds: string[] = [];

  for (const task of sprint.tasks) {
    if (
      task.status === TaskStatus.PENDING ||
      task.status === TaskStatus.CLAIMED ||
      task.status === TaskStatus.EXECUTING ||
      task.status === TaskStatus.TESTING ||
      task.status === TaskStatus.DOCUMENTING
    ) {
      const prevStatus = task.status;
      task.status = TaskStatus.PAUSED;

      // Write updated task JSON
      try {
        writeFileSync(
          join(tasksPath, `task-${task.id}.json`),
          JSON.stringify(task, null, 2),
          'utf-8',
        );
      } catch { /* skip */ }

      // Write .paused marker with previous status for resume
      try {
        writeFileSync(
          join(tasksPath, `task-${task.id}.paused`),
          JSON.stringify({ taskId: task.id, previousStatus: prevStatus, pausedAt: now() }, null, 2),
          'utf-8',
        );
      } catch { /* skip */ }

      pausedTaskIds.push(task.id);

      // Send PAUSE via IPC if a channel is registered for this task (subprocess backend)
      // For tmux backend (no IPC channel), kill the worker to stop execution.
      const channel = _channelRegistry.get(task.id);
      if (channel) {
        try { channel.pause(); } catch { /* non-fatal */ }
      } else {
        // No IPC channel -> tmux backend worker -- kill the session to stop execution
        try { killWorker(task.id); } catch { /* non-fatal */ }
      }
    }
  }

  sprint.status = SprintStatus.PAUSED;

  const pauseState: PauseState = {
    sprintId: sprint.id,
    pausedAt: now(),
    pausedTaskIds,
    reason,
  };

  // Persist pause state
  try {
    const deckentDir = join(projectRoot, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    writeFileSync(
      join(projectRoot, PAUSE_STATE_FILE),
      JSON.stringify(pauseState, null, 2),
      'utf-8',
    );
  } catch { /* non-fatal */ }

  // Update dashboard to reflect PAUSED status
  try {
    updateDashboard(projectRoot, {
      sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: SprintStatus.PAUSED },
      agents: [],
      progress: {
        done: sprint.tasks.filter(t => t.status === TaskStatus.DONE).length,
        active: 0,
        blocked: pausedTaskIds.length,
        total: sprint.tasks.length,
      },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: now() },
      alerts: [{ level: AlertLevel.WARNING, message: `Sprint paused: ${reason}`, timestamp: now() }],
      updatedAt: now(),
    });
  } catch { /* dashboard update failed -- non-fatal */ }

  return pauseState;
}

/**
 * Transitions PAUSED tasks back to PENDING, removes .paused marker files,
 * clears the pause state, and restores the dashboard to ACTIVE status.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function resumeSprint(
  projectRoot: string,
  sprint: Sprint,
): PauseState | null {
  const tasksPath = join(projectRoot, TASKS_DIR);

  // Load saved pause state (if available)
  const pauseState = readJsonSafe<PauseState>(join(projectRoot, PAUSE_STATE_FILE));

  const resumedTaskIds: string[] = [];

  for (const task of sprint.tasks) {
    if (task.status === TaskStatus.PAUSED) {
      task.status = TaskStatus.PENDING;

      // Write updated task JSON
      try {
        writeFileSync(
          join(tasksPath, `task-${task.id}.json`),
          JSON.stringify(task, null, 2),
          'utf-8',
        );
      } catch { /* skip */ }

      // Remove .paused marker
      const pausedMarker = join(tasksPath, `task-${task.id}.paused`);
      if (existsSync(pausedMarker)) {
        try { unlinkSync(pausedMarker); } catch { /* skip */ }
      }

      resumedTaskIds.push(task.id);

      // Send RESUME via IPC if a channel is registered for this task (subprocess backend).
      // Tmux workers were killed on pause and must be re-spawned by the caller.
      const channel = _channelRegistry.get(task.id);
      if (channel) {
        try { channel.resume(); } catch { /* non-fatal */ }
      }
    }
  }

  sprint.status = SprintStatus.ACTIVE;

  // Remove pause state file
  const pauseStatePath = join(projectRoot, PAUSE_STATE_FILE);
  if (existsSync(pauseStatePath)) {
    try { unlinkSync(pauseStatePath); } catch { /* skip */ }
  }

  // Update dashboard to reflect ACTIVE status
  try {
    updateDashboard(projectRoot, {
      sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: SprintStatus.ACTIVE },
      agents: [],
      progress: {
        done: sprint.tasks.filter(t => t.status === TaskStatus.DONE).length,
        active: resumedTaskIds.length,
        blocked: 0,
        total: sprint.tasks.length,
      },
      usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: now() },
      alerts: [],
      updatedAt: now(),
    });
  } catch { /* dashboard update failed -- non-fatal */ }

  return pauseState;
}

/**
 * Checks usage thresholds and auto-pauses the sprint if limits are exceeded.
 * Returns true if the sprint was paused, false otherwise.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function checkAndAutoPause(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
): boolean {
  const usage = checkUsage(config);
  const thresholds = config.activeModeConfig.usage_thresholds;
  const fiveHrExceeded = usage.fiveHourPercent / 100 >= thresholds['5hr'];
  const weeklyExceeded = usage.weeklyPercent / 100 >= thresholds.weekly;

  if (fiveHrExceeded || weeklyExceeded) {
    const reason = fiveHrExceeded
      ? `5hr usage limit exceeded (${usage.fiveHourPercent.toFixed(1)}%)`
      : `Weekly usage limit exceeded (${usage.weeklyPercent.toFixed(1)}%)`;
    pauseSprint(projectRoot, sprint, reason);
    return true;
  }
  return false;
}

/**
 * Checks usage thresholds and auto-resumes the sprint when usage has dropped.
 * Hysteresis prevents rapid pause/resume oscillation.
 * Returns true if the sprint was resumed, false otherwise.
 * @internal Used only within orchestra/ — not part of the public API surface.
 */
export function checkAndAutoResume(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
): boolean {
  // Only auto-resume a PAUSED sprint
  if (sprint.status !== SprintStatus.PAUSED) {
    return false;
  }

  const usage = checkUsage(config);
  const thresholds = config.activeModeConfig.usage_thresholds;

  // Resume threshold: usage must drop to 80% of the pause threshold (hysteresis)
  const resumeThreshold5hr = thresholds['5hr'] * 0.8;
  const resumeThresholdWeekly = thresholds.weekly * 0.8;

  const fiveHrSafe = usage.fiveHourPercent / 100 < resumeThreshold5hr;
  const weeklySafe = usage.weeklyPercent / 100 < resumeThresholdWeekly;

  if (fiveHrSafe && weeklySafe) {
    resumeSprint(projectRoot, sprint);
    return true;
  }
  return false;
}
