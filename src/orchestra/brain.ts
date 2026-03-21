// ═══ Brain — Master Orchestrator ═══════════════════════════════════
// This module coordinates all sprint phases. Sub-modules handle:
//   model-selector.ts  — model inference and selection
//   task-builder.ts    — task creation, scope extraction, directive parsing
//   debt-manager.ts    — debt lifecycle, escalation, decay
//   sprint-reporter.ts — retrospective, sprint log, metrics, doc updates

// ─── Node Builtins ─────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Core (value imports — enums used at runtime) ──────────────────
import { TaskStatus, TaskEvaluation, SprintPhase, SprintStatus, DebtPriority, AgentStatus, AlertLevel } from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, TaskResult, TaskScope, Sprint, SprintMetrics,
  UsageMetrics, AgentInfo, ResolvedConfig, SystemProfile,
  BrainContext, SprintSizeRecommendation,
  BrainPlanningMode, PlannerResult,
} from '../core/types.js';
export type { BrainContext, ProjectState, SprintSizeRecommendation } from '../core/types.js';
import {
  BRAIN_DIR, TASKS_DIR, DIRECTIVES_FILE,
  MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE,
  RETRO_FILE, TASK_FILE_EXTENSIONS,
  LOCKS_DIR,
} from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { getNextSprintId, parseDebtTable, updateLastSprintId } from '../core/utils.js';

// ─── Core — config ────────────────────────────────────────────────
import { resolveEffectiveWorkers } from '../core/config.js';

// ─── Core — system profile ────────────────────────────────────────
import { getSystemProfile } from '../core/system-profile.js';

// ─── Core — usage tracker ─────────────────────────────────────────
import { UsageTracker } from '../core/usage-tracker.js';
export type { SprintUsage, TotalUsage, ModelBreakdown } from '../core/usage-tracker.js';

// ─── Core — provider abstraction ──────────────────────────────────
import type { ProviderAdapter } from '../core/provider.js';
export type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry } from '../core/provider.js';

// ─── Core — spawn backend abstraction ────────────────────────────
import type { SpawnBackend } from '../core/spawn-backend.js';
export type { SpawnBackend } from '../core/spawn-backend.js';
import { SpawnBackendFactory } from '../core/spawn-backend.js';
export { SpawnBackendFactory };

// ─── Planner ─────────────────────────────────────────────────────
import { callBrainPlanner } from './planner.js';

// ─── Wave 2 — tmux ────────────────────────────────────────────────
import { ensureSession, spawnWorker, killWorker, listWorkers } from './tmux.js';

// ─── Wave 2 — auditor ─────────────────────────────────────────────
import { resetDashboard, updateDashboard, detectDeadlocks, startScanLoop, writeScanToDashboard } from '../monitor/auditor.js';

// ─── Wave 2 — worker ──────────────────────────────────────────────
import { releaseAllLocks } from '../agents/worker.js';

// ─── Result watcher (fs.watch-based, replaces pure polling) ──────
import { createResultWatcher } from './result-watcher.js';

// ─── Worker IPC ───────────────────────────────────────────────────
import { ChannelRegistry } from '../agents/worker-ipc.js';
import type { WorkerChannel } from '../agents/worker-ipc.js';

// ─── Agent Pool & Selection ──────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { selectAgent } from '../core/agent-selector.js';

// ─── Rollback ─────────────────────────────────────────────────────
import {
  createSafetyPoint, rollback, getRollbackPolicy, recordRollbackInDebt,
  saveSafetyPoint, deleteSafetyPoint,
} from './rollback.js';
export type { SafetyPoint, RollbackResult, RollbackPolicy } from './rollback.js';
export { createSafetyPoint, rollback, getRollbackPolicy, recordRollbackInDebt, isCleanWorkingTree, safetyBranchExists } from './rollback.js';

// ─── Sub-modules (re-export for backward compatibility) ───────────
export { calculateModelScore, inferModelFromDirective, resolveTaskModel, parsePatterns, deduplicatePatterns, suggestModelFromPatterns } from './model-selector.js';
export { createTask, extractScopeFromDirective, parseStructuredDirectives, buildWorkerPrompt, plannerTaskToParams, resolveWorkerEffort } from './task-builder.js';
export type { CreateTaskParams, ParsedDirectiveTask } from './task-builder.js';
export { handleEvaluation, handleCrossDependencies, escalateDebt, resolveDebt, runDecay, decay } from './debt-manager.js';
export type { RunDecayOptions } from './debt-manager.js';
export { trimMemoryWithHeader, writeRetrospective, writeSprintLog, calculateMetrics, updateProjectDocs, compareWithPreviousSprint, readPreviousSprintMetrics, buildAgentPerformance, formatAgentPerformanceTable, buildSkillPerformance, formatSkillPerformanceTable } from './sprint-reporter.js';
export type { SprintComparison, AgentPerformanceRow, SkillPerformanceRow } from './sprint-reporter.js';
export type { SprintResult } from '../core/types.js';
export { parseCoverageFromVitest, validateCoverage, validateWorkerCoverage, isDocOnlyTask } from './coverage-validator.js';
export type { CoverageResult, CoverageWarningLevel, ParsedVitestOutput, VitestCoverageSummary, VitestCoverageData } from './coverage-validator.js';

// ─── Internal imports from sub-modules (used by orchestrator) ─────
import { resolveTaskModel, parsePatterns, deduplicatePatterns } from './model-selector.js';
import { createTask, extractScopeFromDirective, parseStructuredDirectives, buildWorkerPrompt, plannerTaskToParams } from './task-builder.js';
import { handleEvaluation, handleCrossDependencies, escalateDebt, resolveDebt, runDecay } from './debt-manager.js';
import { writeRetrospective, writeSprintLog, calculateMetrics, updateProjectDocs } from './sprint-reporter.js';
import { validateWorkerCoverage } from './coverage-validator.js';

// ═══ Types ═════════════════════════════════════════════════════════

export class BrainError extends Error {
  public readonly phase?: SprintPhase;
  constructor(message: string, phase?: SprintPhase) {
    super(message);
    this.name = 'BrainError';
    this.phase = phase;
  }
}

// ═══ IPC Channel Registry ══════════════════════════════════════════

/**
 * Module-level registry that maps taskId → WorkerChannel.
 * Populated when workers are spawned via child_process.fork (subprocess backend).
 * tmux-based workers do not populate this registry — they use file-based heartbeats.
 */
const _channelRegistry = new ChannelRegistry();

/** Returns the module-level ChannelRegistry (used by Brain and tests). */
export function getChannelRegistry(): ChannelRegistry {
  return _channelRegistry;
}

/** Register a WorkerChannel for a given taskId. */
export function registerWorkerChannel(taskId: string, channel: WorkerChannel): void {
  _channelRegistry.register(taskId, channel);
}

/** Unregister and close the WorkerChannel for a given taskId. */
export function unregisterWorkerChannel(taskId: string): void {
  _channelRegistry.remove(taskId);
}

// ═══ Internal Helpers ══════════════════════════════════════════════

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function now(): string {
  return new Date().toISOString();
}

// Helper: resolve max_workers to a number, handling 'auto'
function resolveMaxWorkersNumeric(config: ResolvedConfig, systemProfile?: SystemProfile): number {
  const maxWorkers = config.activeModeConfig.max_workers;
  if (maxWorkers === 'auto') {
    const profile = systemProfile ?? getSystemProfile();
    return profile.recommendedMaxWorkers;
  }
  return maxWorkers;
}

/** Source code directory prefixes — anything outside these is treated as a doc task */
const SOURCE_CODE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];

function isSourceCodeDir(dir: string): boolean {
  const normalized = dir === 'src' || dir === 'tests' || dir === 'lib';
  return normalized || SOURCE_CODE_PREFIXES.some(p => dir.startsWith(p));
}

/** Write error dashboard state — centralizes the repeated boilerplate in runSprint phases */
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
  } catch { /* dashboard write failed — continue */ }
}

// ═══ Exported Functions ════════════════════════════════════════════

// 1. readContext
export function readContext(projectRoot: string): BrainContext {
  const brainPath = join(projectRoot, BRAIN_DIR);

  const directives = readFileSafe(join(projectRoot, DIRECTIVES_FILE));
  const memory = readFileSafe(join(brainPath, MEMORY_FILE));
  const retro = readFileSafe(join(brainPath, RETRO_FILE));
  const patterns = readFileSafe(join(brainPath, PATTERNS_FILE));
  const decisions = readFileSafe(join(brainPath, DECISIONS_FILE));

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

  return { directives, memory, retro, debt, patterns, decisions, existingTasks, projectState: { gitStatus, fileTree } };
}

// 2. checkUsage — real integration (synchronous, direct claude CLI)
export function checkUsage(_config: ResolvedConfig): UsageMetrics {
  const SAFE_DEFAULT: UsageMetrics = { fiveHourPercent: 50, weeklyPercent: 30, measuredAt: now() };
  try {
    const result = spawnSync('claude', ['-p', '/usage'], { encoding: 'utf-8', timeout: 10_000 });
    if (result.status !== 0 || !result.stdout) return SAFE_DEFAULT;

    const output = result.stdout;
    const fiveHrMatch = output.match(/5[- ]?h(?:r|our(?:ly)?)?[:\s]+(\d+(?:\.\d+)?)\s*%/i)
      ?? output.match(/(\d+(?:\.\d+)?)\s*%[^%\n]*5[- ]?h/i);
    const weeklyMatch = output.match(/week(?:ly)?[:\s]+(\d+(?:\.\d+)?)\s*%/i)
      ?? output.match(/(\d+(?:\.\d+)?)\s*%[^%\n]*week/i);

    const fiveHourPercent = fiveHrMatch?.[1] ? parseFloat(fiveHrMatch[1]) : SAFE_DEFAULT.fiveHourPercent;
    const weeklyPercent = weeklyMatch?.[1] ? parseFloat(weeklyMatch[1]) : SAFE_DEFAULT.weeklyPercent;
    return { fiveHourPercent, weeklyPercent, measuredAt: now() };
  } catch {
    return SAFE_DEFAULT;
  }
}

// 2a. checkUsageWithProvider — async, delegates to ProviderAdapter
export async function checkUsageWithProvider(provider: ProviderAdapter): Promise<UsageMetrics> {
  return provider.checkUsage();
}

// 2b. getDefaultProvider — returns the default registered provider, or null
export function getDefaultProvider(): ProviderAdapter | null {
  try {
    return providerRegistry.getDefault();
  } catch {
    return null;
  }
}

// 3. adjustSprintSize (pure)
export function adjustSprintSize(config: ResolvedConfig, usage: UsageMetrics, systemProfile?: SystemProfile): SprintSizeRecommendation {
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

// 5. planSprint
export async function planSprint(
  projectRoot: string,
  config: ResolvedConfig,
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  options?: { mode?: BrainPlanningMode; asDraft?: boolean; usage?: UsageMetrics },
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

  // CRITICAL debt → priority fix tasks
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
    plannerResult = callBrainPlanner(
      context,
      recommendation,
      config.activeModeConfig.brain_model,
      config.projectName,
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
    const directiveSources: Array<{ title: string; description: string; scope: TaskScope; forceModel?: import('../core/types.js').ModelType; forceEffort?: import('../core/types.js').TaskEffort }> =
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
          ? `Directive (model: ${resolvedModel} — user override)`
          : `Directive (model: ${resolvedModel} — resolved from scope/complexity/plan/usage)`,
        scope: src.scope,
        dependencies: [],
        goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor issues' },
        sprintId,
        initialStatus,
        forceModel: src.forceModel,
        forceEffort: src.forceEffort,
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

  // Agent selection (non-fatal — if pool fails, continue with generic workers)
  try {
    const agentPool = new AgentPoolManager(projectRoot);
    const pool = agentPool.loadAgents();
    for (const task of tasks) {
      if (!task.forceModel) {
        const result = selectAgent(task, pool);
        task.assignedAgent = result.agent?.id ?? 'generic';
        if (result.agent?.preferredModel && !task.forceModel) {
          task.model = result.agent.preferredModel;
        }
      } else {
        task.assignedAgent = 'generic';
      }
    }
  } catch { /* agent pool failure is non-fatal */ }

  // Skill selection (non-fatal — if skill modules fail, continue without skills)
  try {
    const { detectProjectStack } = await import('../core/stack-detector.js');
    const { SkillPoolManager } = await import('../core/skill-pool.js');
    const { selectSkills } = await import('../core/skill-selector.js');

    const projectStack = detectProjectStack(projectRoot);
    const skillPool = new SkillPoolManager(projectRoot);
    const skills = skillPool.loadSkills();

    if (skills.size > 0) {
      for (const task of tasks) {
        const agentInfo = task.assignedAgent && task.assignedAgent !== 'generic'
          ? { id: task.assignedAgent, expertise: [] as string[] }
          : undefined;
        const result = selectSkills(task, projectStack, skills, agentInfo);
        if (result.skills.length > 0) {
          task.assignedSkills = result.skills.map(s => s.id);
        }
      }
    }
  } catch { /* skill selection failure is non-fatal */ }

  // Write task files
  const tasksPath = join(projectRoot, TASKS_DIR);
  mkdirSync(tasksPath, { recursive: true });
  for (const task of tasks) {
    writeFileSync(join(tasksPath, `task-${task.id}.json`), JSON.stringify(task, null, 2), 'utf-8');
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

// 5a. confirmDraftTasks — DRAFT → PENDING
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

// 6. spawnWorkers — spawns initial batch (up to max_workers), returns queued tasks
export function spawnWorkers(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: { autoApprove?: boolean; usageTracker?: UsageTracker; spawnBackend?: SpawnBackend },
): Task[] {
  // Use provided SpawnBackend, or fall back to direct tmux calls (backward compat)
  const backend = spawnOpts?.spawnBackend;

  if (!backend) {
    // Legacy path: direct tmux session management
    ensureSession();
  }

  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);
  const activeTasks = sprint.tasks.slice(0, maxWorkers);
  const queuedTasks = sprint.tasks.slice(maxWorkers);

  for (const task of activeTasks) {
    const prompt = buildWorkerPrompt(task);
    const model = task.model;
    const writeTargets = [...task.scope.directories, ...task.scope.filesWrite].filter(Boolean);
    const allowedTools = writeTargets.length > 0
      ? `Read,Write(${writeTargets.join(',')}),Bash`
      : 'Read,Write,Bash';

    if (backend) {
      // SpawnBackend abstraction path
      backend.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else {
      // Legacy direct tmux path
      spawnWorker(task.id, model, prompt, projectRoot, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
      });
    }

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
    currentAction: 'Starting',
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

// 7. waitForResults — with queue support
export async function waitForResults(
  projectRoot: string,
  sprint: Sprint,
  timeoutMs?: number,
  queue?: Task[],
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
): Promise<TaskResult[]> {
  const timeout = timeoutMs ?? 30 * 60 * 1000;
  const WATCH_FALLBACK_MS = 5_000;
  const startTime = Date.now();
  const results: TaskResult[] = [];
  const taskIds = new Set(sprint.tasks.map(t => t.id));
  const collected = new Set<string>();
  const remainingQueue: Task[] = queue ? [...queue] : [];

  const collectResults = (): string[] => {
    const newlyCollected: string[] = [];
    for (const taskId of taskIds) {
      if (collected.has(taskId)) continue;
      const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
      if (existsSync(resultPath)) {
        const result = readJsonSafe<TaskResult>(resultPath);
        if (result) {
          results.push(result);
          collected.add(taskId);
          newlyCollected.push(taskId);
        }
      }
    }
    return newlyCollected;
  };

  const queueBackend = spawnOpts?.spawnBackend;

  const processQueue = (completedTaskIds: string[]): void => {
    for (const taskId of completedTaskIds) {
      if (remainingQueue.length === 0) break;
      // Kill completed worker (clean up slot)
      try {
        if (queueBackend) queueBackend.kill(taskId);
        else killWorker(taskId);
      } catch { /* ignore */ }
      const nextTask = remainingQueue.shift()!;
      const prompt = buildWorkerPrompt(nextTask);
      const writeTargets = [...nextTask.scope.directories, ...nextTask.scope.filesWrite].filter(Boolean);
      const allowedTools = writeTargets.length > 0
        ? `Read,Write(${writeTargets.join(',')}),Bash`
        : 'Read,Write,Bash';
      try {
        if (queueBackend) {
          queueBackend.spawn(nextTask.id, nextTask.model, prompt, {
            allowedTools,
            autoApprove: spawnOpts?.autoApprove ?? false,
            projectDir: projectRoot,
          });
        } else {
          spawnWorker(nextTask.id, nextTask.model, prompt, projectRoot, {
            allowedTools,
            autoApprove: spawnOpts?.autoApprove ?? false,
          });
        }
      } catch { /* ignore spawn errors — task will timeout */ }
    }
  };

  const initiallyCollected = collectResults();
  processQueue(initiallyCollected);
  if (collected.size === taskIds.size) return results;

  // ── IPC dual-mode: register HEARTBEAT listeners for any channels in registry ──
  // When a worker is spawned via subprocess (fork), its channel is registered.
  // We listen for HEARTBEAT messages here as a liveness signal; the result is
  // still read from the .result file (file-based authority for results).
  // For tmux-based workers there is no channel → file-based polling only.
  const ipcWakeup = { resolve: (_: void) => {}, pending: false };
  let ipcWakeupPromise: Promise<void> | null = null;

  const setupIpcListeners = (): void => {
    for (const taskId of taskIds) {
      if (collected.has(taskId)) continue;
      const channel = _channelRegistry.get(taskId);
      if (!channel) continue;

      channel.onMessage('HEARTBEAT', () => {
        // A heartbeat means the worker is alive — trigger a result check
        if (ipcWakeup.pending) {
          ipcWakeup.pending = false;
          ipcWakeup.resolve();
        }
      });
    }
  };

  const makeIpcWakeupPromise = (): Promise<void> => {
    ipcWakeup.pending = true;
    return new Promise<void>(resolve => { ipcWakeup.resolve = resolve; });
  };

  setupIpcListeners();

  // Use fs.watch with fallback polling (5s instead of 15s)
  // IPC heartbeats can also wake the loop early.
  const watcher = createResultWatcher(projectRoot, WATCH_FALLBACK_MS);
  try {
    while (Date.now() - startTime < timeout) {
      ipcWakeupPromise = makeIpcWakeupPromise();
      // Race: fs.watch / fallback-poll vs IPC heartbeat wakeup
      await Promise.race([watcher.waitForChange(), ipcWakeupPromise]);
      const newlyCollected = collectResults();
      processQueue(newlyCollected);
      if (collected.size === taskIds.size) break;
    }
  } finally {
    watcher.close();
  }
  return results;
}

// 8. evaluateResult (pure)

/**
 * Returns true if the task is doc-only (no source code directories).
 * Source code scopes: src/, tests/, lib/ — everything else is a doc task.
 */
export function isDocTask(task: Task): boolean {
  const dirs = task.scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return dirs.every(d => !isSourceCodeDir(d));
}

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

// 16. cleanup

export function isStaleTaskFile(filePath: string, maxAgeMs: number = 86_400_000): boolean {
  try {
    const stat = statSync(filePath);
    return Date.now() - stat.mtimeMs > maxAgeMs;
  } catch {
    return false;
  }
}

export function cleanup(projectRoot: string, sprint: Sprint, spawnBackend?: SpawnBackend): void {
  // Kill all active workers via backend or direct tmux calls
  const workers = spawnBackend ? spawnBackend.list() : listWorkers();
  for (const taskId of workers) {
    try {
      if (spawnBackend) spawnBackend.kill(taskId);
      else killWorker(taskId);
    } catch { /* already dead */ }
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
}

// ─── RunSprintOptions ─────────────────────────────────────────────
export interface RunSprintOptions {
  autoApprove?: boolean;
  sandboxMode?: boolean;
  testMode?: boolean;
  skipCleanup?: boolean;
  timeoutMs?: number;
  /** Optional SpawnBackend override — defaults to SpawnBackendFactory.create() */
  spawnBackend?: SpawnBackend;
  /** Optional ProviderAdapter override — used for usage checking */
  provider?: ProviderAdapter;
  /**
   * Enable git rollback safety mechanism.
   * When true (default): creates a safety branch before PLAN phase and
   * offers rollback when all tasks result in NO_GO.
   * When false: disables rollback entirely.
   */
  rollback?: boolean;
}

// 17. runSprint — Master Orchestrator
export async function runSprint(
  projectRoot: string,
  config: ResolvedConfig,
  opts?: RunSprintOptions,
): Promise<Sprint> {
  let sprint: Sprint;
  let evaluations = new Map<string, TaskEvaluation>();
  let results: TaskResult[] = [];
  let metrics: SprintMetrics | undefined;
  let scanInterval: ReturnType<typeof setInterval> | null = null;
  let taskQueue: Task[] = [];
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
  let safetyPoint: import('./rollback.js').SafetyPoint | null = null;

  // Phase 1: PLAN
  try {
    const context = readContext(projectRoot);
    // Use provider-based async usage check when a provider is available
    const usage = activeProvider
      ? await checkUsageWithProvider(activeProvider)
      : checkUsage(config);
    const recommendation = adjustSprintSize(config, usage);
    sprint = await planSprint(projectRoot, config, context, recommendation);
    sprint.startedAt = now();

    // Create git safety point after planning (we now have sprint.id) but before workers spawn.
    // This records the pre-execution state so we can roll back if all tasks fail.
    if (rollbackEnabled) {
      try {
        safetyPoint = createSafetyPoint(projectRoot, sprint.id);
        saveSafetyPoint(projectRoot, safetyPoint);
      } catch { /* safety point creation failure is non-fatal — continue without rollback */ }
    }
  } catch (err) {
    throw new BrainError(
      `Plan phase failed: ${err instanceof Error ? err.message : String(err)}`,
      SprintPhase.PLAN,
    );
  }

  // Reset dashboard for new sprint
  try {
    resetDashboard(projectRoot, sprint.id, sprint.tasks.length);
  } catch { /* dashboard reset failed — non-fatal */ }

  // Phase 2: SPAWN (1 retry)
  let spawnAttempts = 0;
  while (spawnAttempts < 2) {
    try {
      sprint.phase = SprintPhase.SPAWN;
      taskQueue = spawnWorkers(projectRoot, sprint, config, { autoApprove: opts?.autoApprove, usageTracker, spawnBackend });
      sprint.status = SprintStatus.ACTIVE;
      try {
        scanInterval = startScanLoop(projectRoot, sprint.id, undefined, (scanResult) => {
          writeScanToDashboard(projectRoot, {
            id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status,
          }, scanResult);
        });
      } catch { /* scan loop start failed — non-fatal */ }
      break;
    } catch (err) {
      spawnAttempts++;
      if (spawnAttempts >= 2) {
        if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
        try { cleanup(projectRoot, sprint); } catch { /* best effort */ }
        throw new BrainError(
          `Spawn phase failed after retry: ${err instanceof Error ? err.message : String(err)}`,
          SprintPhase.SPAWN,
        );
      }
    }
  }

  // Phase 3: EXECUTE
  try {
    sprint.phase = SprintPhase.EXECUTE;
    results = await waitForResults(projectRoot, sprint, undefined, taskQueue, { autoApprove: opts?.autoApprove, spawnBackend });
  } catch (err) {
    safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Phase 4: EVALUATE
  try {
    sprint.status = SprintStatus.EVALUATING;
    sprint.phase = SprintPhase.EVALUATE;
    const collectedIds = new Set(results.map(r => r.taskId));

    for (const task of sprint.tasks) {
      if (collectedIds.has(task.id)) {
        const result = results.find(r => r.taskId === task.id)!;
        const evaluation = evaluateResult(result, task);
        handleEvaluation(projectRoot, task, evaluation, result);
        evaluations.set(task.id, evaluation);
        // Record evaluation call in usage tracker
        usageTracker.recordCall(task.model, 2_000, task.id, sprint.id);
        if (evaluation === TaskEvaluation.DONE || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) {
          if (task.isPriorityFix && task.fixForTaskId) {
            resolveDebt(projectRoot, `debt-${task.fixForTaskId}`, sprint.id);
          }
          resolveDebt(projectRoot, `debt-${task.id}`, sprint.id);
        }
      } else {
        const syntheticResult: TaskResult = {
          taskId: task.id,
          workerId: task.assignedWorker ?? 'unknown',
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          notes: 'Timeout - no result received',
        };
        handleEvaluation(projectRoot, task, TaskEvaluation.NO_GO, syntheticResult);
        evaluations.set(task.id, TaskEvaluation.NO_GO);
        // Record evaluation call for timeout tasks too
        usageTracker.recordCall(task.model, 1_000, task.id, sprint.id);
      }
    }
  } catch (err) {
    safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Rollback check: if rollback is enabled and all tasks are NO_GO, trigger rollback
  if (rollbackEnabled && safetyPoint && evaluations.size > 0) {
    try {
      const evalValues = [...evaluations.values()].map(e => e as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO');
      const policy = getRollbackPolicy(evalValues);
      if (policy === 'auto') {
        // All tasks NO_GO — automatically rollback
        const rollbackResult = rollback(projectRoot, safetyPoint);
        recordRollbackInDebt(projectRoot, sprint.id, rollbackResult);
        sprint.rolledBack = true;
        sprint.rollbackResult = rollbackResult.message;
      }
      // 'ask' policy (partial failure): record in debt but don't auto-rollback
      // The CLI layer can check sprint.rolledBack and offer the option interactively
    } catch { /* rollback failure is non-fatal */ }
  }

  // After successful sprint (no rollback or partial success): clean up safety branch
  if (rollbackEnabled && safetyPoint && !sprint.rolledBack) {
    try { deleteSafetyPoint(projectRoot, safetyPoint); } catch { /* non-fatal */ }
  }

  // Phase 5: FIX
  try {
    sprint.status = SprintStatus.FIXING;
    sprint.phase = SprintPhase.FIX;
    handleCrossDependencies(projectRoot, sprint, evaluations);

    const fixTasks: Task[] = [];
    const tasksPath = join(projectRoot, TASKS_DIR);
    if (existsSync(tasksPath)) {
      for (const file of readdirSync(tasksPath).filter(f => f.startsWith('task-') && f.endsWith('.json'))) {
        const task = readJsonSafe<Task>(join(tasksPath, file));
        if (task?.isPriorityFix && task.status === TaskStatus.PENDING) fixTasks.push(task);
      }
    }

    if (fixTasks.length > 0) {
      const fixSprint: Sprint = { ...sprint, tasks: fixTasks, workers: fixTasks.map(t => `w-${t.id}`) };
      spawnWorkers(projectRoot, fixSprint, config, { autoApprove: opts?.autoApprove, usageTracker, spawnBackend });
      const fixResults = await waitForResults(projectRoot, fixSprint, 10 * 60 * 1000, undefined, { spawnBackend });
      for (const fixTask of fixTasks) {
        const fixResult = fixResults.find(r => r.taskId === fixTask.id);
        if (fixResult) {
          const fixEval = evaluateResult(fixResult, fixTask);
          handleEvaluation(projectRoot, fixTask, fixEval, fixResult);
          if (fixEval === TaskEvaluation.DONE && fixTask.fixForTaskId) {
            resolveDebt(projectRoot, `debt-${fixTask.fixForTaskId}`, sprint.id);
          }
        }
      }
    }
    escalateDebt(projectRoot);
  } catch (err) {
    safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Phase 6: RETRO (skipped in testMode)
  if (!opts?.testMode) {
    try {
      sprint.status = SprintStatus.RETROSPECTIVE;
      sprint.phase = SprintPhase.RETRO;
      const freshDebt = parseDebtTable(readFileSafe(join(projectRoot, BRAIN_DIR, DEBT_FILE)) ?? '');
      metrics = calculateMetrics(sprint, evaluations, results, freshDebt);
      sprint.metrics = metrics;
      writeRetrospective(projectRoot, sprint, evaluations, metrics, usageTracker);
      writeSprintLog(projectRoot, sprint, metrics, evaluations);
      try { updateProjectDocs(projectRoot, { sprint, evaluations, metrics }, config); } catch { /* non-critical */ }
    } catch (err) {
      safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    try {
      const freshDebt = parseDebtTable(readFileSafe(join(projectRoot, BRAIN_DIR, DEBT_FILE)) ?? '');
      metrics = calculateMetrics(sprint, evaluations, results, freshDebt);
      sprint.metrics = metrics;
    } catch { /* metrics calculation failed in test mode — non-fatal */ }
  }

  // Phase 7: DECAY (skipped in testMode)
  if (!opts?.testMode) {
    try {
      sprint.phase = SprintPhase.DECAY;
      runDecay(projectRoot, sprint.id);
    } catch (err) {
      safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Phase 8: CLEANUP (skipped when skipCleanup is true)
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  if (!opts?.skipCleanup) {
    try {
      cleanup(projectRoot, sprint, spawnBackend);
    } catch (err) {
      safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  sprint.status = SprintStatus.COMPLETE;
  sprint.phase = SprintPhase.COMPLETE;
  sprint.completedAt = now();

  // Sprint usage report
  try {
    const sprintUsage = usageTracker.getSprintUsage(sprint.id);
    sprint.usageReport = {
      totalCalls: sprintUsage.totalCalls,
      totalTokens: sprintUsage.totalTokens,
      modelBreakdown: sprintUsage.modelBreakdown,
    };
  } catch { /* non-fatal */ }

  if (!opts?.testMode) {
    updateLastSprintId(projectRoot, sprint.id);
  }

  updateDashboard(projectRoot, {
    sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
    agents: [],
    progress: { done: sprint.tasks.length, active: 0, blocked: 0, total: sprint.tasks.length },
    usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: now() },
    alerts: [],
    updatedAt: now(),
  });

  return sprint;
}


// ═══ Pause / Resume ════════════════════════════════════════════════

export interface PauseState {
  sprintId: string;
  pausedAt: string;
  pausedTaskIds: string[];
  reason: string;
}

const PAUSE_STATE_FILE = '.deckent/pause-state.json';

/**
 * pauseSprint -- transitions active/pending tasks to PAUSED status,
 * writes a .paused marker file for each task, saves pause state,
 * and updates the dashboard with PAUSED sprint status.
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
        try { channel.pause(); } catch { /* non-fatal — file-based paused marker written above */ }
      } else {
        // No IPC channel → tmux backend worker — kill the session to stop execution
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
 * resumeSprint -- transitions PAUSED tasks back to PENDING,
 * removes .paused marker files, clears the pause state, and
 * restores the dashboard to ACTIVE status.
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
 * checkAndAutoPause -- checks usage thresholds and auto-pauses the sprint
 * if either the 5hr or weekly limit is exceeded.
 * Returns true if the sprint was paused, false otherwise.
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
 * checkAndAutoResume -- checks usage thresholds and auto-resumes the sprint
 * if usage has dropped below the resume threshold (80% of the pause threshold).
 * This hysteresis prevents rapid pause/resume oscillation.
 * Returns true if the sprint was resumed, false otherwise.
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
