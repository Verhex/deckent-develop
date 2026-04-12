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
  Task, TaskResult, TaskScope, Sprint,
  AgentInfo, ResolvedConfig,
  BrainContext, SprintSizeRecommendation,
  BrainPlanningMode, PlannerResult, ProviderName,
} from '../core/types.js';

import {
  BRAIN_DIR, TASKS_DIR, DIRECTIVES_FILE,
  MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE,
  RETRO_FILE, PROJECT_IDENTITY_FILE, TASK_FILE_EXTENSIONS,
  LOCKS_DIR, DECISIONS_LOG_DIR,
} from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { getNextSprintId, parseDebtTable, updateLastSprintId, readJsonSafe, debugLog } from '../core/utils.js';

// ─── Core — config ────────────────────────────────────────────────
import { resolveEffectiveWorkers } from '../core/config.js';

// ─── Core — system profile ────────────────────────────────────────
import { getSystemProfile } from '../core/system-profile.js';

// ─── Sprint Utilities (extracted Phase 2) ─────────────────────────
import {
  readFileSafe, now,
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

// ─── Core — sprint lock ───────────────────────────────────────────
import { acquireSprintLock, releaseSprintLock } from '../core/multi-ide.js';

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

// ─── Worker IPC (extracted to ipc-registry.ts) ───────────────────

// ─── Agent Pool & Selection ──────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { selectAgent } from '../core/agent-selector.js';
import { routeTaskV2 } from '../core/routing-engine.js';
import type { UserOverride } from '../core/routing-types.js';

// ─── Rollback (used by sprint-phases.ts — re-export kept for brain.ts backward compat) ──

// ─── Sub-module imports (used by orchestrator) ────────────────────
import { resolveTaskModel, parsePatterns, deduplicatePatterns } from './model-selector.js';
import { createTask, extractScopeFromDirective, parseStructuredDirectives, buildWorkerPrompt, plannerTaskToParams } from './task-builder.js';
import { ParallelPipelineManager } from './parallel-pipeline.js';
export { DependencyCycleError } from './parallel-pipeline.js';
// runDecay: moved to sprint-finalizer.ts imports
// writeRetrospective, writeSprintLog, calculateMetrics, updateProjectDocs, updateProjectIdentity,
// buildAgentPerformance, archiveDirectives: moved to sprint-finalizer.ts imports
// getRecentSprintStats: moved to sprint-finalizer.ts imports
import { validateWorkerCoverage } from './coverage-validator.js';

// ─── Baseline Tracker (Sprint 134 — honesty verification) ───────
import { captureVitestBaseline, writeBaseline } from './baseline-tracker.js';

// ─── PID Manager (Sprint 135 — coordinator resilience) ──────────
import {
  writePid, clearPid, writeStateSnapshot,
} from './sprint-pid-manager.js';
import type { SprintStateSnapshot } from './sprint-pid-manager.js';

// ─── Observability (Sprint 134 — local metrics) ─────────────────
import { metric, trace, structuredLog, initObservability } from '../core/observability.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import { loadPluginHooks, clearHooks } from '../core/plugin-hooks.js';

// ─── Rich Output (moved to sprint-finalizer.ts) ──────────────────
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
  /** Optional ProviderAdapter override */
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
    } catch (e) { debugLog('interruptActiveSprint:markTaskInterrupted', e); }

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
    } catch (e) { debugLog('interruptActiveSprint:markHeartbeatAborted', e); }

    // Release locks for assigned workers
    if (task.assignedWorker) {
      try { releaseAllLocks(projectRoot, task.assignedWorker); } catch (e) { debugLog('interruptActiveSprint:releaseAllLocks', e); }
    }
  }

  // Kill all active workers
  try {
    const workers = spawnBackend ? spawnBackend.list() : listWorkers();
    for (const taskId of workers) {
      try {
        if (spawnBackend) spawnBackend.kill(taskId);
        else killWorker(taskId);
      } catch (e) { debugLog('interruptActiveSprint:killWorker', e); }
    }
  } catch (e) { debugLog('interruptActiveSprint:listWorkers', e); }

  // Release sprint lock on interrupt
  try { releaseSprintLock(projectRoot); } catch (e) { debugLog('interruptActiveSprint:releaseSprintLock', e); }
}

// ═══ IPC Channel Registry (extracted to ipc-registry.ts) ═══════════
// Re-export for backward compatibility — all implementation in ipc-registry.ts
export { getChannelRegistry, registerWorkerChannel, unregisterWorkerChannel } from './ipc-registry.js';
import { getChannelRegistry } from './ipc-registry.js';

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
      alerts: [{ level: AlertLevel.WARNING, message: errorMessage, timestamp: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    });
  } catch (e) { debugLog('safeDashboardUpdate:updateDashboard', e); }
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

// getDefaultProvider: moved to sprint-utils.ts, re-exported above

/**
 * Plan a new sprint by creating task definitions from directives.
 * Handles critical debt priority fixes, AI planner with structured fallback,
 * deadlock detection, agent selection, and skill assignment.
 * @param projectRoot - Project root directory
 * @param config - Resolved project configuration
 * @param context - Brain context with directives, memory, debt, etc.
 * @param recommendation - Sprint size recommendation
 * @param options - Optional planning mode, draft flag, and usage metrics
 * @returns The planned sprint with all tasks
 * @throws {BrainError} When AI planner fails in 'ai' mode or circular dependencies detected
 */
export async function planSprint(
  projectRoot: string,
  config: ResolvedConfig,
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  options?: { mode?: BrainPlanningMode; asDraft?: boolean; dryRun?: boolean },
): Promise<Sprint> {
  const sprintId = getNextSprintId(projectRoot);
  const defaultModel = recommendation.modelConstraint ?? config.activeModeConfig.default_model;
  const planMode = options?.mode ?? config.activeModeConfig.brain_planning ?? 'auto';
  const initialStatus = options?.asDraft ? TaskStatus.DRAFT : TaskStatus.PENDING;

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
    } catch (e) {
      debugLog('planSprint:resolveProvider', e);
      // No providers registered — planner will throw a clear error via resolveAdapter()
    }

    // Map brain_model through provider-aware model selector
    const brainModel = resolveTaskModel(
      'sprint-planning', 'AI planner invocation',
      { directories: [], filesRead: [], filesWrite: [] },
      config,
      undefined, config.activeModeConfig.brain_model,
      undefined, brainProviderName,
    );

    // Fetch worst agent+skill combinations from OutcomeTracker to inject into planner prompt
    let worstCombinations: string | undefined;
    try {
      const { OutcomeTracker: OT } = await import('./outcome-tracker.js');
      const ot = new OT(projectRoot);
      const worst = ot.getWorstCombinations(5);
      if (worst) worstCombinations = worst;
    } catch (e) {
      debugLog('planSprint:worstCombinations', e);
    }

    plannerResult = callBrainPlanner(
      context,
      recommendation,
      brainModel,
      config.projectName,
      brainAdapter,
      undefined,
      worstCombinations,
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
        resolveTaskModel(src.title, src.description, src.scope, config, parsedPatterns, src.forceModel);
      const resolvedEffort = src.forceEffort ?? 'normal';
      tasks.push(createTask({
        title: src.title,
        description: src.description,
        model: resolvedModel,
        effort: resolvedEffort,
        priority: 'NORMAL',
        reason: src.forceModel
          ? `Directive (model: ${resolvedModel} -- user override)`
          : `Directive (model: ${resolvedModel} -- resolved from scope/complexity/plan)`,
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
      } catch (e) {
        debugLog('planSprint:learning-bonuses:No learning data available (first sprint or missing learnings.json)', e);
      }

      // Generate project conventions temp skill
      try {
        const { generateProjectConventionsSkill } = await import('./temp-skill-generator.js');
        if (projectStackV2) {
          const conventionsSkill = generateProjectConventionsSkill(projectStackV2);
          skillsV2.set(conventionsSkill.id, conventionsSkill);
          debugLog('planSprint:temp-skill', `Generated project-conventions skill for ${projectStackV2.language}`);
        }
      } catch (e) { debugLog('planSprint:generateProjectConventionsSkill', e); }

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
      } catch (e) { debugLog('planSprint:generateTempAgents', e); }

      // Inject evolved rules into agent/skill activation configs (in-memory only)
      try {
        const { OutcomeTracker: OT } = await import('./outcome-tracker.js');
        const ot = new OT(projectRoot);
        const allLearnings = ot.getLearnings();
        const evolvedRules = (allLearnings.evolvedRules ?? []) as import('./rule-evolver.js').EvolvedRule[];
        const autoApplied = evolvedRules.filter(r => r.status === 'auto-applied');
        let injectedCount = 0;

        for (const evolved of autoApplied) {
          if (evolved.entityType === 'agent') {
            const agent = pool.get(evolved.entityId);
            if (!agent) continue;
            if (!agent.activation) {
              agent.activation = { rules: [], exclude: [], minScore: 0 };
            }
            if (evolved.type === 'activation') {
              const rule = evolved.rule as import('../core/routing-types.js').ActivationRule;
              const hasDuplicate = agent.activation.rules.some(r => r.name && rule.name && r.name === rule.name);
              if (!hasDuplicate) {
                agent.activation.rules.push(rule);
                injectedCount++;
              }
            } else if (evolved.type === 'exclusion') {
              const rule = evolved.rule as import('../core/routing-types.js').ExclusionRule;
              const hasDuplicate = agent.activation.exclude.some(r => r.name && rule.name && r.name === rule.name);
              if (!hasDuplicate) {
                agent.activation.exclude.push(rule);
                injectedCount++;
              }
            }
          } else if (evolved.entityType === 'skill') {
            const skill = skillsV2.get(evolved.entityId);
            if (!skill) continue;
            if (!skill.activation) {
              skill.activation = { rules: [], exclude: [], minScore: 0 };
            }
            if (evolved.type === 'activation') {
              const rule = evolved.rule as import('../core/routing-types.js').ActivationRule;
              const hasDuplicate = skill.activation.rules.some(r => r.name && rule.name && r.name === rule.name);
              if (!hasDuplicate) {
                skill.activation.rules.push(rule);
                injectedCount++;
              }
            } else if (evolved.type === 'exclusion') {
              const rule = evolved.rule as import('../core/routing-types.js').ExclusionRule;
              const hasDuplicate = skill.activation.exclude.some(r => r.name && rule.name && r.name === rule.name);
              if (!hasDuplicate) {
                skill.activation.exclude.push(rule);
                injectedCount++;
              }
            }
          }
        }

        if (injectedCount > 0) {
          debugLog('planSprint:evolved-rules', `Injected ${injectedCount} auto-applied evolved rules into activation configs`);
        }
      } catch (e) {
        debugLog('planSprint:evolved-rules', e);
      }

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
            config: { ...config.routing_config, agentMinScore: config.agent_min_score },
            sprintId,
            taskId: task.id,
            projectRoot,
          });

          task.assignedAgent = decision.agentId ?? 'generic';
          task.assignedSkills = decision.skillIds;
          task.routingMeta = {
            taskDNA: decision.taskDNA,
            confidence: decision.agentConfidence,
            routingVersion: 'v2',
          };

          // Persist decision trail via DecisionLogger so routing decisions are traceable
          try {
            const { DecisionLogger } = await import('./decision-logger.js');
            const decisionLogger = new DecisionLogger(projectRoot);
            const entries = decision.reasoning.map((r, i) => ({
              step: i + 1,
              name: `routing-step-${i + 1}`,
              input: {} as Record<string, unknown>,
              output: {} as Record<string, unknown>,
              durationMs: 0,
              reasoning: r,
            }));
            decisionLogger.log(sprintId, task.id, entries);
          } catch (logErr) {
            debugLog('planSprint:decision-trail', logErr);
          }

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
    } catch (e) {
      debugLog('cleanupDraftTasks:parseTaskFile', e);
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
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
): Task[] {
  // Use provided SpawnBackend, or fall back to direct tmux calls (backward compat)
  const backend = spawnOpts?.spawnBackend;

  // Track whether we need tmux session for any Claude tasks
  let needsTmuxSession = false;

  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);

  // Dependency pipeline guard: when enabled, only spawn tasks whose dependencies are all DONE
  let activeTasks: Task[];
  let queuedTasks: Task[];
  if (config.dependency_pipeline_enabled) {
    const doneTasks = new Set(
      sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
    );
    const eligibleTasks = sprint.tasks.filter(t => {
      if (t.status !== TaskStatus.PENDING) return false;
      if (!t.dependencies || t.dependencies.length === 0) return true;
      return t.dependencies.every(dep => doneTasks.has(dep));
    });
    activeTasks = eligibleTasks.slice(0, maxWorkers);
    queuedTasks = eligibleTasks.slice(maxWorkers);
  } else {
    // Legacy behavior: spawn in order, no dependency or status check
    activeTasks = sprint.tasks.slice(0, maxWorkers);
    queuedTasks = sprint.tasks.slice(maxWorkers);
  }

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

  // Observability: wave start metric
  const waveId = config.dependency_pipeline_enabled ? 'dep-pipeline' : 'legacy';
  metric('wave.start', 0, { wave: waveId, count: String(activeTasks.length) });

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

    // Single spawn path — NEVER spawn the same task twice.
    // Priority: SpawnBackend > adapter > legacy tmux
    if (backend) {
      // SpawnBackend abstraction path (Docker, tmux, subprocess)
      backend.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else if (!isTmuxProvider(taskProvider)) {
      // Non-tmux provider (Codex, Gemini) — use adapter
      const adapter = getProviderAdapterForTask(taskProvider);
      if (adapter) {
        adapter.spawn(task.id, model, prompt, {
          allowedTools,
          autoApprove: spawnOpts?.autoApprove ?? false,
          projectDir: projectRoot,
        });
      }
    } else {
      // Legacy direct tmux path (Claude, no SpawnBackend)
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
    } catch (e) { debugLog('spawnWorkers:writeTaskFile', e); }

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
    alerts: [],
    updatedAt: now(),
  });

  return queuedTasks;
}

// isTmuxProvider, getSubprocessWorkerLogPath, readSubprocessWorkerLog, hasSubprocessWorkerLog:
// moved to sprint-utils.ts, re-exported above

/**
 * Re-evaluate and spawn tasks that are now eligible because their dependencies are DONE.
 * Called after a task completes (finalizeTaskResult) when dependency_pipeline_enabled is true.
 * Each respawn event can optionally emit a wave.transition metric via the provided callback.
 * @returns Array of newly spawned task IDs
 */
export function respawnEligibleTasks(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
  onWaveTransition?: (durationMs: number, fromWave: string, toWave: string) => void,
): string[] {
  if (!config.dependency_pipeline_enabled) return [];

  const waveStart = Date.now();

  const doneTasks = new Set(
    sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
  );

  // Find tasks that are PENDING and whose deps are now all DONE
  const nowEligible = sprint.tasks.filter(t => {
    if (t.status !== TaskStatus.PENDING) return false;
    if (!t.dependencies || t.dependencies.length === 0) return false;
    return t.dependencies.every(dep => doneTasks.has(dep));
  });

  if (nowEligible.length === 0) return [];

  // Count currently executing tasks to respect maxWorkers
  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);
  const currentlyExecuting = sprint.tasks.filter(
    t => t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED || t.status === TaskStatus.TESTING,
  ).length;
  const slotsAvailable = Math.max(0, maxWorkers - currentlyExecuting);

  const toSpawn = nowEligible.slice(0, slotsAvailable);
  if (toSpawn.length === 0) return [];

  const backend = spawnOpts?.spawnBackend;

  for (const task of toSpawn) {
    const agentPrompt = resolveAgentPrompt(projectRoot, task);
    const taskSkillPrompts = resolveSkillPrompts(projectRoot, task);
    const prompt = buildWorkerPrompt(task, agentPrompt, taskSkillPrompts);
    const writeTargets = ['.tasks/', ...task.scope.directories, ...task.scope.filesWrite].filter(Boolean);
    const allowedTools = writeTargets.length > 0
      ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
      : 'Read,Write,Edit,Bash,Glob,Grep';

    const taskProvider = resolveTaskProvider(task);

    if (backend) {
      backend.spawn(task.id, task.model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else if (!isTmuxProvider(taskProvider)) {
      const adapter = getProviderAdapterForTask(taskProvider);
      if (adapter) {
        adapter.spawn(task.id, task.model, prompt, {
          allowedTools,
          autoApprove: spawnOpts?.autoApprove ?? false,
          projectDir: projectRoot,
        });
      }
    } else {
      spawnWorker(task.id, task.model, prompt, projectRoot, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
      });
    }

    task.status = TaskStatus.EXECUTING;
    try {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    } catch (e) { debugLog('respawnEligibleTasks:writeTaskFile', e); }
  }

  const waveDuration = Date.now() - waveStart;
  // Observability: wave transition metric
  metric('wave.transition', waveDuration, { from_wave: 'dep-wait', to_wave: `wave-${toSpawn.length}` });
  if (onWaveTransition) {
    try {
      onWaveTransition(waveDuration, 'dep-wait', `wave-${toSpawn.length}`);
    } catch (e) { debugLog('respawnEligibleTasks:onWaveTransition', e); }
  }

  debugLog('respawnEligibleTasks', `Spawned ${toSpawn.length} newly eligible tasks: ${toSpawn.map(t => t.id).join(', ')}`);
  return toSpawn.map(t => t.id);
}

/**
 * Validate task dependencies using topological sort.
 * Throws DependencyCycleError (DECKENT_E049) if circular dependencies are detected.
 * @returns ExecutionWave[] for informational purposes
 */
export function validateTaskDependencies(tasks: Task[]): import('./parallel-pipeline.js').ExecutionWave[] {
  const pipeline = new ParallelPipelineManager();
  return pipeline.createPipeline(
    tasks.map(t => ({ id: t.id, dependencies: t.dependencies ?? [] })),
  );
}

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
  return trace('wait_results', () =>
    waitForResultsImpl(projectRoot, sprint, timeoutMs, queue, spawnOpts, getChannelRegistry()),
  );
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
export function evaluateResult(result: TaskResult, task: Task, vitestJsonOutput?: string, coverageThreshold = 90): TaskEvaluation {
  const evalStart = Date.now();
  try {
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

  if (result.coverage < coverageThreshold) return TaskEvaluation.GO_WITH_TECH_DEBT;
  return TaskEvaluation.DONE;
  } finally {
    metric('eval.duration_ms', Date.now() - evalStart, { taskId: task.id });
  }
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
    } catch (e) { debugLog('cleanup:killWorker', e); }
  }

  // Kill workers on non-tmux provider adapters
  for (const task of sprint.tasks) {
    const provider = resolveTaskProvider(task);
    if (!isTmuxProvider(provider)) {
      const adapter = getProviderAdapterForTask(provider);
      if (adapter) {
        try { adapter.kill(task.id); } catch (e) { debugLog('cleanup:adapterKill', e); }
      }
    }
  }

  for (const task of sprint.tasks) {
    if (task.assignedWorker) {
      try { releaseAllLocks(projectRoot, task.assignedWorker); } catch (e) { debugLog('cleanup:releaseAllLocks', e); }
    }
  }

  const tasksDir = join(projectRoot, TASKS_DIR);
  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir).filter(f => TASK_FILE_EXTENSIONS.some(ext => f.endsWith(ext)))) {
      try { unlinkSync(join(tasksDir, file)); } catch (e) { debugLog('cleanup:unlinkTaskFile', e); }
    }
  }

  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir)) {
      if (TASK_FILE_EXTENSIONS.some(ext => file.endsWith(ext))) {
        const fullPath = join(tasksDir, file);
        if (isStaleTaskFile(fullPath)) {
          try { unlinkSync(fullPath); } catch (e) { debugLog('cleanup:unlinkStaleTaskFile', e); }
        }
      }
    }
  }

  // Clean up leftover .tasks/.prompt-* and .worker-*.sh hidden tmpfiles from Docker/tmux backends
  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir)) {
      if (file.startsWith('.prompt-') || (file.startsWith('.worker-') && file.endsWith('.sh'))) {
        try { unlinkSync(join(tasksDir, file)); } catch (e) { debugLog('cleanup:unlinkTmpFile', e); }
      }
    }
  }

  // Clean up decision trail files from .deckent/decisions/
  const decisionsDir = join(projectRoot, DECISIONS_LOG_DIR);
  if (existsSync(decisionsDir)) {
    for (const file of readdirSync(decisionsDir)) {
      if (file.startsWith('decision-') && file.endsWith('.json')) {
        try { unlinkSync(join(decisionsDir, file)); } catch (e) { debugLog('cleanup:unlinkDecisionFile', e); }
      }
    }
  }

  const locksDir = join(projectRoot, LOCKS_DIR);
  if (existsSync(locksDir)) {
    for (const file of readdirSync(locksDir).filter(f => f.endsWith('.lock'))) {
      try { unlinkSync(join(locksDir, file)); } catch (e) { debugLog('cleanup:unlinkLockFile', e); }
    }
  }

  // Release sprint lock on cleanup
  try { releaseSprintLock(projectRoot); } catch (e) { debugLog('cleanup:releaseSprintLock', e); }

  // Clear plugin hooks so they don't persist across sprints
  clearHooks();
}

// ═══ Finalize Sprint (extracted to sprint-finalizer.ts) ═══════════
// Re-export for backward compatibility — all implementation in sprint-finalizer.ts
export { finalizeSprint, applyAdaptiveThresholds, runHonestyCheck, writeRubricDetail, runSelfAuditGate } from './sprint-finalizer.js';
export type { FinalizeSprintOptions, SelfAuditResult } from './sprint-finalizer.js';

// applyAdaptiveThresholds: moved to sprint-finalizer.ts, re-exported above

// finalizeSprint: moved to sprint-finalizer.ts, re-exported above
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

// ─── Human Checkpoint Support ────────────────────────────────────

/** Valid checkpoint phases that can require human approval. */
export type CheckpointPhase = 'plan' | 'evaluate' | 'fix';

interface CheckpointFile {
  phase: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

/**
 * Wait for human approval at a sprint checkpoint.
 * Writes a checkpoint JSON file to `.deckent/checkpoints/` and polls every 5s
 * until the status is changed to 'approved' or 'rejected'.
 * @returns true if approved, false if rejected
 */
export async function waitForHumanApproval(
  projectRoot: string,
  sprintId: string,
  phase: CheckpointPhase,
  summary: string,
): Promise<boolean> {
  const checkpointsDir = join(projectRoot, '.deckent', 'checkpoints');
  mkdirSync(checkpointsDir, { recursive: true });

  const checkpointPath = join(checkpointsDir, `checkpoint-${sprintId}-${phase}.json`);
  const checkpoint: CheckpointFile = {
    phase,
    summary,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
  debugLog('waitForHumanApproval', `Checkpoint written: ${checkpointPath} — waiting for approval`);

  // Poll every 5 seconds until approved or rejected
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 5_000));

    // Check for interrupt
    if (_isInterrupted) return false;

    try {
      const raw = readFileSync(checkpointPath, 'utf-8');
      const current = JSON.parse(raw) as CheckpointFile;
      if (current.status === 'approved') {
        debugLog('waitForHumanApproval', `Checkpoint ${phase} approved`);
        return true;
      }
      if (current.status === 'rejected') {
        debugLog('waitForHumanApproval', `Checkpoint ${phase} rejected`);
        return false;
      }
    } catch (e) {
      debugLog('waitForHumanApproval:readCheckpoint', e);
    }
  }
}

/**
 * Execute a full sprint lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP.
 * Supports human checkpoints, configurable timeout, and provider routing.
 */
export async function runSprint(
  projectRoot: string,
  config: ResolvedConfig,
  opts?: RunSprintOptions,
): Promise<Sprint> {
  const routingVersionForFix = config.routing_engine ?? 'v1';

  // Use provided SpawnBackend, or create one from config.spawn_backend via SpawnBackendFactory.
  // Falls back to legacy direct-tmux path only when spawn_backend is not set and no backend provided.
  const spawnBackend: SpawnBackend | undefined = opts?.spawnBackend
    ?? (config.spawn_backend
      ? SpawnBackendFactory.create({
          backend: config.spawn_backend,
          projectDir: projectRoot,
          dockerImage: config.docker_image,
          dockerTimeoutSeconds: config.docker_timeout,
        })
      : undefined);

  // Resolve provider (use provided override or registry default)
  const activeProvider: ProviderAdapter | null = opts?.provider ?? getDefaultProvider();

  // Rollback enabled by default (unless explicitly disabled via opts.rollback === false)
  const rollbackEnabled = opts?.rollback !== false;

  // Initialize local observability (Sprint 134)
  initObservability(projectRoot);
  structuredLog('info', 'Sprint starting', { sprintPhase: 'INIT' });

  // Load plugin hooks at sprint start (non-fatal)
  try {
    await loadPluginHooks(projectRoot);
  } catch (e) { debugLog('runSprint:loadPluginHooks', e); }

  // ─── PID Manager (Sprint 135 — coordinator resilience) ────────
  // We don't have sprintId yet (generated in PLAN phase), so we defer
  // writePid to after PLAN. Snapshot interval and beforeExit cleanup
  // are set up after PLAN phase below.

  // ─── Sprint Lock ──────────────────────────────────────────────────
  // Acquire sprint lock to prevent concurrent sprints on the same project.
  // Uses PID-based locking: stale locks (dead PIDs) are auto-cleared.
  const sprintLockId = `sprint-${Date.now()}`;
  const lockAcquired = acquireSprintLock(projectRoot, sprintLockId);
  if (!lockAcquired) {
    throw new BrainError(
      'Another sprint is already running in this project. Use --force or wait for the active sprint to complete.',
      SprintPhase.PLAN,
    );
  }

  // Phase 1: PLAN
  const { sprint, safetyPoint } = await runPlanPhase(
    projectRoot, config, opts, activeProvider, rollbackEnabled,
  );

  // ─── Human Checkpoint: PLAN ────────────────────────────────────
  if (config.human_checkpoints?.includes('plan')) {
    const taskSummary = `${sprint.tasks.length} task planlandı: ${sprint.tasks.map(t => t.title).join(', ')}`;
    const approved = await waitForHumanApproval(projectRoot, sprint.id, 'plan', taskSummary);
    if (!approved) {
      sprint.status = SprintStatus.ABORTED;
      sprint.completedAt = now();
      clearActiveSprint();
      releaseSprintLock(projectRoot);
      clearSprintState(projectRoot);
      return sprint;
    }
  }

  // Register active sprint for SIGINT interrupt cleanup
  setActiveSprint(projectRoot, sprint, spawnBackend);

  // ─── PID + Snapshot Setup (Sprint 135) ────────────────────────
  // Write PID file so orphan detection can find us if we crash
  try {
    writePid(projectRoot, sprint.id);
  } catch (e) { debugLog('runSprint:writePid', e); }

  // Periodic state snapshot (every 30s) for crash recovery diagnostics
  let snapshotInterval: ReturnType<typeof setInterval> | null = null;
  const writePeriodicSnapshot = (): void => {
    try {
      const snap: SprintStateSnapshot = {
        sprintId: sprint.id,
        pid: process.pid,
        startedAt: sprint.startedAt ?? new Date().toISOString(),
        currentWave: 0, // updated by phases if needed
        taskStatuses: Object.fromEntries(sprint.tasks.map(t => [t.id, t.status])),
        metricsJsonlSize: 0,
        lastHeartbeat: new Date().toISOString(),
      };
      // Try to get metrics.jsonl size
      try {
        const metricsPath = join(projectRoot, '.deckent', 'metrics.jsonl');
        if (existsSync(metricsPath)) {
          snap.metricsJsonlSize = readFileSync(metricsPath, 'utf-8').split('\n').filter(Boolean).length;
        }
      } catch { /* non-fatal */ }
      writeStateSnapshot(projectRoot, sprint.id, snap);
    } catch (e) { debugLog('runSprint:writeStateSnapshot', e); }
  };

  // Write initial snapshot immediately, then every 30s
  writePeriodicSnapshot();
  snapshotInterval = setInterval(writePeriodicSnapshot, 30_000);

  // beforeExit handler: flush observability + write final snapshot
  const beforeExitHandler = (): void => {
    try { writePeriodicSnapshot(); } catch { /* best effort */ }
    try { clearPid(projectRoot, sprint.id); } catch { /* best effort */ }
  };
  process.on('beforeExit', beforeExitHandler);

  // Phase 1.5: Route tasks to providers via Connector or registry (non-fatal)
  try {
    const connector = opts?.connector;
    const availableProviders = connector
      ? connector.getAvailableProviders()
      : providerRegistry.listProviders() as ProviderName[];
    routeSprintTasks(sprint.tasks, config, availableProviders);
  } catch (e) { /* Router failure is non-fatal — all tasks use brain_provider */ debugLog('runSprint:routeSprintTasks', e); }

  // Update last_sprint_id early so `deckent status` shows the current sprint
  try {
    updateLastSprintId(projectRoot, sprint.id);
  } catch (e) { debugLog('runSprint:updateLastSprintId', e); }

  // Reset dashboard for new sprint
  try {
    resetDashboard(projectRoot, sprint.id, sprint.tasks.length);
  } catch (e) { debugLog('runSprint:resetDashboard', e); }

  // Persist sprint state for crash recovery
  writeSprintState(projectRoot, sprint);

  // Phase 1.9: Capture pre-sprint test baseline for honesty verification (non-fatal)
  try {
    const captured = captureVitestBaseline(projectRoot);
    if (captured) {
      writeBaseline(projectRoot, sprint.id, captured);
      debugLog('runSprint:baseline', `Pre-sprint baseline captured: pass=${captured.pass} fail=${captured.fail} files=${captured.files}`);
    } else {
      debugLog('runSprint:baseline', 'Could not capture pre-sprint baseline (vitest parse failed or unavailable)');
    }
  } catch (e) { debugLog('runSprint:baseline', e); }

  // Phase 2: SPAWN (1 retry with diagnostic hints)
  const { taskQueue, scanInterval: initialScanInterval } = runSpawnPhase(
    projectRoot, sprint, config, opts, spawnBackend,
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

  // Post-collect sweep: pick up any .result files written during/after waitForResults timeout
  try {
    const preGraceCollectedIds = new Set(results.map(r => r.taskId));
    for (const task of sprint.tasks) {
      if (preGraceCollectedIds.has(task.id)) continue;
      const latePath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
      if (existsSync(latePath)) {
        const lateResult = readJsonSafe<TaskResult>(latePath);
        if (lateResult) {
          debugLog('postCollect:lateResult', `task=${task.id} selfAssessment=${lateResult.selfAssessment} — collected post-timeout result`);
          results.push(lateResult);
        }
      }
    }
  } catch (e) { debugLog('postCollect:main', e); }

  // Grace period: for tasks with heartbeat but no result, wait 5 min then kill worker
  try {
    const collectedIds = new Set(results.map(r => r.taskId));
    const staleWorkers = sprint.tasks.filter(t => {
      if (collectedIds.has(t.id)) return false;
      const hbPath = join(projectRoot, TASKS_DIR, `task-${t.id}.hb`);
      const resultPath = join(projectRoot, TASKS_DIR, `task-${t.id}.result`);
      return existsSync(hbPath) && !existsSync(resultPath);
    });

    if (staleWorkers.length > 0) {
      const GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
      debugLog('[Brain]', `Grace period: ${staleWorkers.length} worker(s) have heartbeat but no result — waiting ${GRACE_PERIOD_MS / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, GRACE_PERIOD_MS));

      for (const task of staleWorkers) {
        const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
        if (existsSync(resultPath)) {
          // Worker wrote result during grace period — read and collect it
          const lateResult = readJsonSafe<TaskResult>(resultPath);
          if (lateResult) {
            debugLog('graceKill:lateResult', `task=${task.id} selfAssessment=${lateResult.selfAssessment} — collected late result`);
            results.push(lateResult);
          }
        } else {
          // Worker still hasn't written result — kill it
          try {
            if (spawnBackend) spawnBackend.kill(task.id);
            else killWorker(task.id);
          } catch (e) { debugLog('graceKill:killWorker', e); }

          // Write synthetic NO_GO result
          const syntheticResult: TaskResult = {
            taskId: task.id,
            workerId: task.assignedWorker ?? `w-${task.id}`,
            filesChanged: [],
            linesAdded: 0,
            linesRemoved: 0,
            testsPassed: false,
            coverage: 0,
            selfAssessment: 'NO_GO',
            notes: 'Worker had heartbeat but failed to write result within grace period — killed',
          };
          try {
            writeFileSync(
              resultPath,
              JSON.stringify(syntheticResult, null, 2),
              'utf-8',
            );
          } catch (e) { debugLog('graceKill:writeResult', e); }
          results.push(syntheticResult);
        }
      }
    }
  } catch (e) { debugLog('graceKill:main', e); }

  // Phase 4: EVALUATE
  const evaluations = new Map<string, TaskEvaluation>();
  await runEvaluatePhase(projectRoot, sprint, results, evaluations, config.coverage_threshold);

  // ─── Honesty Check Metrics (Sprint 135 — secondary observability) ──
  // Emit metric for each result that triggers honesty-pattern detection
  // (notes containing "pre-existing" or "unrelated"). delta = 1 per flagged task.
  {
    const HONESTY_PATTERNS = [/pre-existing/i, /unrelated/i];
    for (const r of results) {
      if (r.notes && HONESTY_PATTERNS.some(p => p.test(r.notes))) {
        metric('honesty.check', 1, { taskId: r.taskId });
      }
    }
  }

  // Rollback check: if rollback is enabled and all tasks are NO_GO, trigger rollback
  runRollbackCheck(projectRoot, sprint, evaluations, rollbackEnabled, safetyPoint);

  // ─── Human Checkpoint: EVALUATE ────────────────────────────────
  if (config.human_checkpoints?.includes('evaluate')) {
    const goCount = [...evaluations.values()].filter(e => e === TaskEvaluation.DONE).length;
    const noGoCount = [...evaluations.values()].filter(e => e === TaskEvaluation.NO_GO).length;
    const debtCount = [...evaluations.values()].filter(e => e === TaskEvaluation.GO_WITH_TECH_DEBT).length;
    const evalSummary = `Değerlendirme: ${goCount} GO, ${debtCount} TECH_DEBT, ${noGoCount} NO_GO — toplam ${evaluations.size} task`;
    const approved = await waitForHumanApproval(projectRoot, sprint.id, 'evaluate', evalSummary);
    if (!approved) {
      sprint.status = SprintStatus.ABORTED;
      sprint.completedAt = now();
      clearActiveSprint();
      releaseSprintLock(projectRoot);
      clearSprintState(projectRoot);
      return sprint;
    }
  }

  // ─── Human Checkpoint: FIX ─────────────────────────────────────
  if (config.human_checkpoints?.includes('fix')) {
    const noGoTasks = sprint.tasks.filter(t => evaluations.get(t.id) === TaskEvaluation.NO_GO);
    if (noGoTasks.length > 0) {
      const fixSummary = `Fix fazı başlayacak: ${noGoTasks.length} NO_GO task — ${noGoTasks.map(t => t.title).join(', ')}`;
      const approved = await waitForHumanApproval(projectRoot, sprint.id, 'fix', fixSummary);
      if (!approved) {
        sprint.status = SprintStatus.ABORTED;
        sprint.completedAt = now();
        clearActiveSprint();
        releaseSprintLock(projectRoot);
        clearSprintState(projectRoot);
        return sprint;
      }
    }
  }

  // Phase 5: FIX
  await runFixPhase(projectRoot, sprint, evaluations, results, config, opts, routingVersionForFix, spawnBackend);

  // Phase 6+7: RETRO + DECAY via finalizeSprint (skipped in testMode)
  await runRetroPhase(projectRoot, sprint, evaluations, results, config, opts?.testMode);

  // Phase 8: CLEANUP (skipped when skipCleanup is true)
  scanInterval = runCleanupPhase(projectRoot, sprint, config, opts, scanInterval, spawnBackend);

  sprint.status = SprintStatus.COMPLETE;
  sprint.phase = SprintPhase.COMPLETE;
  sprint.completedAt = now();

  // Clear active sprint reference — sprint completed normally
  releaseSprintLock(projectRoot);
  clearActiveSprint();

  // Clear sprint state file after successful completion
  clearSprintState(projectRoot);

  // ─── PID Cleanup (Sprint 135) ─────────────────────────────────
  // Stop snapshot interval, remove beforeExit handler, clear PID file
  if (snapshotInterval) clearInterval(snapshotInterval);
  process.removeListener('beforeExit', beforeExitHandler);
  try { clearPid(projectRoot, sprint.id); } catch { /* non-fatal */ }

  updateDashboard(projectRoot, {
    sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
    agents: [],
    progress: { done: sprint.tasks.length, active: 0, blocked: 0, total: sprint.tasks.length },
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
      } catch (e) { debugLog('pauseSprint:writeTaskFile', e); }

      // Write .paused marker with previous status for resume
      try {
        writeFileSync(
          join(tasksPath, `task-${task.id}.paused`),
          JSON.stringify({ taskId: task.id, previousStatus: prevStatus, pausedAt: now() }, null, 2),
          'utf-8',
        );
      } catch (e) { debugLog('pauseSprint:writePausedMarker', e); }

      pausedTaskIds.push(task.id);

      // Send PAUSE via IPC if a channel is registered for this task (subprocess backend)
      // For tmux backend (no IPC channel), kill the worker to stop execution.
      const channel = getChannelRegistry().get(task.id);
      if (channel) {
        try { channel.pause(); } catch (e) { debugLog('pauseSprint:channelPause', e); }
      } else {
        // No IPC channel -> tmux backend worker -- kill the session to stop execution
        try { killWorker(task.id); } catch (e) { debugLog('pauseSprint:killWorker', e); }
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
  } catch (e) { debugLog('pauseSprint:writePauseState', e); }

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
        alerts: [{ level: AlertLevel.WARNING, message: `Sprint paused: ${reason}`, timestamp: now() }],
      updatedAt: now(),
    });
  } catch (e) { debugLog('pauseSprint:updateDashboard', e); }

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
      } catch (e) { debugLog('resumeSprint:writeTaskFile', e); }

      // Remove .paused marker
      const pausedMarker = join(tasksPath, `task-${task.id}.paused`);
      if (existsSync(pausedMarker)) {
        try { unlinkSync(pausedMarker); } catch (e) { debugLog('resumeSprint:unlinkPausedMarker', e); }
      }

      resumedTaskIds.push(task.id);

      // Send RESUME via IPC if a channel is registered for this task (subprocess backend).
      // Tmux workers were killed on pause and must be re-spawned by the caller.
      const channel = getChannelRegistry().get(task.id);
      if (channel) {
        try { channel.resume(); } catch (e) { debugLog('resumeSprint:channelResume', e); }
      }
    }
  }

  sprint.status = SprintStatus.ACTIVE;

  // Remove pause state file
  const pauseStatePath = join(projectRoot, PAUSE_STATE_FILE);
  if (existsSync(pauseStatePath)) {
    try { unlinkSync(pauseStatePath); } catch (e) { debugLog('resumeSprint:unlinkPauseState', e); }
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
        alerts: [],
      updatedAt: now(),
    });
  } catch (e) { debugLog('resumeSprint:updateDashboard', e); }

  return pauseState;
}

