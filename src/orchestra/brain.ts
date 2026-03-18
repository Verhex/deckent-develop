// ─── Node Builtins ─────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Core (value imports — enums used at runtime) ──────────────────
import { TaskStatus, TaskEvaluation, SprintPhase, SprintStatus, DebtPriority, AgentStatus, AlertLevel } from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, TaskResult, TaskScope, GoNoGoCriteria, Sprint, SprintMetrics,
  DebtItem, ModelType, TaskEffort, TaskPriority,
  UsageMetrics, AgentInfo, ResolvedConfig, PatternEntry, DecayResult,
  BrainContext, SprintSizeRecommendation, SystemProfile,
  BrainPlanningMode, PlannerResult, PlannerTask,
  SprintResult,
} from '../core/types.js';
export type { BrainContext, ProjectState, SprintSizeRecommendation } from '../core/types.js';
import {
  BRAIN_DIR, TASKS_DIR, LOCKS_DIR, DIRECTIVES_FILE,
  MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE,
  RETRO_FILE, SPRINTS_DIR, ARCHIVE_DIR,
  MEMORY_MAX_LINES, RETRO_MAX_LINES, SPRINT_LOG_MAX_LINES,
  BRAIN_TOTAL_LINE_BUDGET, MEMORY_DECAY_SPRINTS,
  DEBT_HIGH_PRIORITY_SPRINTS, DEBT_CRITICAL_SPRINTS,
  TASK_FILE_EXTENSIONS,
} from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { countBrainLines, getNextSprintId, parseDebtTable, generateDebtTable, updateLastSprintId, shouldRemoveResolvedDebt } from '../core/utils.js';

// ─── Core — config ────────────────────────────────────────────────
import { resolveEffectiveWorkers } from '../core/config.js';

// ─── Core — system profile ────────────────────────────────────────
import { getSystemProfile } from '../core/system-profile.js';

// ─── Planner ─────────────────────────────────────────────────────
import { callBrainPlanner } from './planner.js';

// ─── Wave 2 — tmux ────────────────────────────────────────────────
import { ensureSession, spawnWorker, killWorker, listWorkers } from './tmux.js';

// ─── Wave 2 — auditor ─────────────────────────────────────────────
import { resetDashboard, updateDashboard, detectDeadlocks, startScanLoop, writeScanToDashboard } from '../monitor/auditor.js';

// ─── Wave 2 — worker ──────────────────────────────────────────────
import { updateTaskStatus, releaseAllLocks } from '../agents/worker.js';

// ─── Doc Updaters ─────────────────────────────────────────────────
import { runAllUpdaters } from './doc-updaters/registry.js';
import type { DocUpdateResult } from './doc-updaters/types.js';
// Side-effect import: registers all updaters
import './doc-updaters/index.js';

// ═══ Types ═════════════════════════════════════════════════════════

export interface CreateTaskParams {
  title: string;
  description: string;
  model: ModelType;
  effort: TaskEffort;
  priority: TaskPriority;
  reason: string;
  scope: TaskScope;
  dependencies: string[];
  goNogo: GoNoGoCriteria;
  sprintId: string;
  isPriorityFix?: boolean;
  fixForTaskId?: string;
  initialStatus?: import('../core/types.js').TaskStatus;
}

export class BrainError extends Error {
  public readonly phase?: SprintPhase;
  constructor(message: string, phase?: SprintPhase) {
    super(message);
    this.name = 'BrainError';
    this.phase = phase;
  }
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function now(): string {
  return new Date().toISOString();
}

function getSprintNumber(sprintId: string): number {
  const match = sprintId.match(/sprint-(\d+)/);
  return match?.[1] ? parseInt(match[1], 10) : 0;
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

// 2. checkUsage — real integration
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

// Helper: resolve max_workers to a number, handling 'auto'
function resolveMaxWorkersNumeric(config: ResolvedConfig, systemProfile?: SystemProfile): number {
  const maxWorkers = config.activeModeConfig.max_workers;
  if (maxWorkers === 'auto') {
    const profile = systemProfile ?? getSystemProfile();
    return profile.recommendedMaxWorkers;
  }
  return maxWorkers;
}

// 4. createTask (pure)
export function createTask(params: CreateTaskParams, sequence: number): Task {
  const sprintNumber = params.sprintId.replace('sprint-', '');
  const id = `${sprintNumber}-${String(sequence).padStart(3, '0')}`;
  return {
    id,
    title: params.title,
    description: params.description,
    model: params.model,
    effort: params.effort,
    priority: params.priority,
    reason: params.reason,
    scope: params.scope,
    dependencies: params.dependencies,
    goNogo: params.goNogo,
    status: params.initialStatus ?? TaskStatus.PENDING,
    sprintId: params.sprintId,
    isPriorityFix: params.isPriorityFix,
    fixForTaskId: params.fixForTaskId,
    createdAt: now(),
  };
}

// 4b. extractScopeFromDirective (pure)
export function extractScopeFromDirective(line: string): TaskScope {
  const directories: string[] = [];
  const filesWrite: string[] = [];

  // Match directory-like paths: src/..., tests/...
  const dirMatches = line.match(/\b(src\/[\w/.-]*|tests\/[\w/.-]*)\//g);
  if (dirMatches) {
    for (const d of dirMatches) {
      if (!directories.includes(d)) directories.push(d);
    }
  }

  // Match file paths: anything ending in .ts or .js
  const fileMatches = line.match(/\b[\w/.-]+\.(?:ts|js)\b/g);
  if (fileMatches) {
    for (const f of fileMatches) {
      if (!filesWrite.includes(f)) filesWrite.push(f);
    }
  }

  return { directories, filesRead: [], filesWrite };
}

// 4c. inferModelFromDirective — score-based model selection for structured mode
export function inferModelFromDirective(title: string, description: string, scope: TaskScope): ModelType {
  const score = calculateModelScore(title, description, scope);

  if (score >= 4) return 'opus';
  if (score <= -1) return 'haiku';
  return 'sonnet';
}

// 4c2. resolveTaskModel — layered model selection (top-level selector)
// Layer order (highest priority first):
//   1. Plan access filter: pro_plan → no opus; haiku_allowed=false → no haiku
//   2. Usage pressure: 80%+ → downgrade opus to sonnet
//   3. Task type filter: docs/test-only scope → max sonnet
//   4. Score system: inferModelFromDirective as base
export function resolveTaskModel(
  title: string,
  description: string,
  scope: TaskScope,
  config: ResolvedConfig,
  usage: UsageMetrics,
): ModelType {
  // Layer 4: base model from score system
  let model: ModelType = inferModelFromDirective(title, description, scope);

  // Layer 3: task type filter — docs or test-only → cap at sonnet
  const isDocScope = scope.directories.length > 0 && scope.directories.every(d =>
    d === 'docs' || d.startsWith('docs/') ||
    d === 'tmp-test' || d.startsWith('tmp-test/') ||
    d === 'scripts' || d.startsWith('scripts/'),
  );
  const isTestOnly = scope.filesWrite.length > 0 &&
    scope.filesWrite.every(f => f.includes('.test.') || f.includes('.spec.'));

  if (isDocScope || isTestOnly) {
    if (model === 'opus') model = 'sonnet';
  }

  // Layer 2: usage pressure — 80%+ → downgrade opus to sonnet
  const usageHigh = usage.fiveHourPercent >= 80 || usage.weeklyPercent >= 80;
  if (usageHigh && model === 'opus') {
    model = 'sonnet';
  }

  // Layer 1: plan access filter (highest priority)
  const mode = config.mode;
  const isProPlan = mode === 'pro_plan';
  if (isProPlan && model === 'opus') {
    model = 'sonnet';
  }

  const haikuAllowed = config.activeModeConfig.haiku_allowed;
  if (!haikuAllowed && model === 'haiku') {
    model = 'sonnet';
  }

  return model;
}

// 4c1. calculateModelScore — score-based heuristic for model selection
export function calculateModelScore(title: string, description: string, scope: TaskScope): number {
  const text = `${title}\n${description}`.toLowerCase();
  let score = 0;

  // ─── Cross-module scope: +3 (2+ directories)
  if (scope.directories.length >= 2) {
    score += 3;
  }

  // ─── Architectural keywords: +2
  const architectPatterns = /\b(mimari|architect|refactor|redesign|migrate|breaking|cross.?cutting|orchestrat)\b/;
  if (architectPatterns.test(text)) {
    score += 2;
  }

  // ─── File count: filesWrite.length
  const fileWriteCount = scope.filesWrite.length;
  if (fileWriteCount > 15) {
    score += 3;
  } else if (fileWriteCount > 10) {
    score += 2;
  } else if (fileWriteCount > 5) {
    score += 1;
  }

  // ─── docs/ or config scope: -2 (all directories are docs or config)
  const isAllDocOrConfig = scope.directories.every(d =>
    d === 'docs' || d.startsWith('docs/') ||
    d === 'config' || d.startsWith('config/')
  );
  if (isAllDocOrConfig) {
    score -= 2;
  }

  // ─── Single directory scope: -1
  if (scope.directories.length === 1) {
    score -= 1;
  }

  // ─── Test-only task: -1
  const isTestOnly = /\btest\b|\b(unit|integration|e2e)\b/i.test(text) &&
    scope.filesWrite.every(f => f.includes('.test.') || f.includes('.spec.'));
  if (isTestOnly) {
    score -= 1;
  }

  return score;
}

// 4c2. ParsedDirectiveTask
export interface ParsedDirectiveTask {
  title: string;
  description: string;
  scope: TaskScope;
  testTarget?: string;
}

// 4d. parseStructuredDirectives (pure)
export function parseStructuredDirectives(content: string): ParsedDirectiveTask[] {
  // Split on "## Görev N:" or "## Task N:" pattern
  const blockSplit = content.split(/^##\s+(?:Görev|Task)\s+\d+[^:]*:/m);
  const blocks = blockSplit.slice(1); // skip content before first heading

  if (blocks.length === 0) return []; // no structured sections → fallback

  const tasks: ParsedDirectiveTask[] = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    // First non-empty line after heading becomes the title (strip leading "- " prefix)
    const titleLine = lines.find(l => l.trim()) ?? '';
    const title = titleLine.trim().replace(/^-\s+/, '');
    if (!title) continue;

    // Collect all scope-related lines (Dosya:, Kapsam:, file paths)
    const scopeLines = lines.filter(l =>
      l.includes('Dosya:') || l.includes('Kapsam:') || l.includes('- Kapsam') ||
      /\bsrc\/|tests\//.test(l),
    );
    const scope = scopeLines.reduce<TaskScope>((acc, scopeLine) => {
      const extracted = extractScopeFromDirective(scopeLine);
      return {
        directories: [...acc.directories, ...extracted.directories.filter(d => !acc.directories.includes(d))],
        filesRead: [],
        filesWrite: [...acc.filesWrite, ...extracted.filesWrite.filter(f => !acc.filesWrite.includes(f))],
      };
    }, { directories: [], filesRead: [], filesWrite: [] });

    // Extract test target from "- Test: ..." lines
    const testLine = lines.find(l => /^[\s-]*Test:/i.test(l.trim()));
    const testTarget = testLine
      ? testLine.trim().replace(/^-\s+/, '').replace(/^Test:\s*/i, '').trim()
      : undefined;

    tasks.push({ title, description: block.trim(), scope, testTarget });
  }
  return tasks;
}

// 4e. plannerTaskToParams (pure)
function plannerTaskToParams(
  pt: PlannerTask,
  sprintId: string,
  modelOverride: ModelType,
  initialStatus?: import('../core/types.js').TaskStatus,
): CreateTaskParams {
  return {
    title: pt.title,
    description: pt.description,
    model: pt.model ?? modelOverride,
    effort: pt.effort,
    priority: pt.priority,
    reason: pt.reason,
    scope: pt.scope,
    dependencies: pt.dependencies,
    goNogo: pt.goNogo,
    sprintId,
    initialStatus,
  };
}

// 5. planSprint
export function planSprint(
  projectRoot: string,
  config: ResolvedConfig,
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  options?: { mode?: BrainPlanningMode; asDraft?: boolean; usage?: UsageMetrics },
): Sprint {
  // Determine sprint number
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
      // POST-VALIDATION: AI planner tüm görevleri planlıyor mu?
      const directiveTaskCount = parseStructuredDirectives(context.directives).length;
      if (planMode === 'auto' && directiveTaskCount > 0 && plannerResult.tasks.length < directiveTaskCount) {
        // AI yetersiz — structured fallback'e düş
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
    const directiveSources: Array<{ title: string; description: string; scope: TaskScope }> =
      structuredTasks.length > 0
        ? structuredTasks
        : context.directives
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#'))
            .map(l => l.replace(/^-\s+/, ''))
            .filter(Boolean)
            .map(line => ({ title: line, description: line, scope: extractScopeFromDirective(line) }));

    for (const src of directiveSources) {
      const resolvedModel = recommendation.modelConstraint ??
        resolveTaskModel(src.title, src.description, src.scope, config, usageForModel);
      tasks.push(createTask({
        title: src.title,
        description: src.description,
        model: resolvedModel,
        effort: 'normal',
        priority: 'NORMAL',
        reason: `Directive (model: ${resolvedModel} — resolved from scope/complexity/plan/usage)`,
        scope: src.scope,
        dependencies: [],
        goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor issues' },
        sprintId,
        initialStatus,
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

// 5b. buildWorkerPrompt (pure)
export function buildWorkerPrompt(task: Task): string {
  const scopeStr = task.scope.directories.length > 0
    ? task.scope.directories.join(', ')
    : 'any';

  return `You are a Deckent worker agent. Your task:

Task ${task.id}: ${task.title}
Description: ${task.description}
Scope: ${scopeStr}

Instructions:
1. Complete the task described above
2. Stay within the assigned scope
3. Write tests for every function you write (*.test.ts)
4. Place test files in the same directory as the source file, with the same name and .test.ts extension
5. Run: npx vitest run — then write the test results to the .result file
6. Coverage goal: minimum 80%
7. Create a heartbeat file at .tasks/task-${task.id}.hb BEFORE starting work (JSON format):

{
  "workerId": "w-${task.id}",
  "taskId": "${task.id}",
  "status": "EXECUTING",
  "currentAction": "Starting task",
  "timestamp": "<use new Date().toISOString() — UTC ISO 8601, e.g. 2026-01-01T00:00:00.000Z>",
  "filesChangedCount": 0,
  "sequence": 0
}

IMPORTANT: The timestamp field MUST be a valid UTC ISO 8601 string produced by new Date().toISOString(). Never use locale date strings, relative times, or placeholder text.

Update this file periodically as you work:
- Change status to CODING, TESTING, DOCUMENTING as appropriate
- Update currentAction with what you're doing
- Increment sequence on each update
- Update filesChangedCount as you modify files
- Always refresh the timestamp using new Date().toISOString() on each update

8. When finished, create the result file at .tasks/task-${task.id}.result — this file is REQUIRED (JSON format):

{
  "taskId": "${task.id}",
  "filesChanged": ["list/of/files/you/created/or/modified"],
  "linesAdded": 0,
  "linesRemoved": 0,
  "testsPassed": true,
  "coverage": 0,
  "selfAssessment": "DONE",
  "notes": "Brief summary of what was done"
}

selfAssessment must be one of: "DONE", "GO_WITH_TECH_DEBT", "NO_GO"
The result file at .tasks/task-${task.id}.result is REQUIRED — without it your work cannot be evaluated.`;
}

// 6. spawnWorkers — spawns initial batch (up to max_workers), returns queued tasks
export function spawnWorkers(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: { autoApprove?: boolean },
): Task[] {
  ensureSession();

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

    spawnWorker(task.id, model, prompt, projectRoot, {
      allowedTools,
      autoApprove: spawnOpts?.autoApprove ?? false,
    });
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
  spawnOpts?: { autoApprove?: boolean },
): Promise<TaskResult[]> {
  const timeout = timeoutMs ?? 30 * 60 * 1000;
  const pollInterval = 15_000;
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

  const processQueue = (completedTaskIds: string[]): void => {
    for (const taskId of completedTaskIds) {
      if (remainingQueue.length === 0) break;
      // Kill the completed worker's tmux window
      try { killWorker(taskId); } catch { /* ignore */ }
      // Spawn next queued task
      const nextTask = remainingQueue.shift()!;
      const prompt = buildWorkerPrompt(nextTask);
      const writeTargets = [...nextTask.scope.directories, ...nextTask.scope.filesWrite].filter(Boolean);
      const allowedTools = writeTargets.length > 0
        ? `Read,Write(${writeTargets.join(',')}),Bash`
        : 'Read,Write,Bash';
      try {
        spawnWorker(nextTask.id, nextTask.model, prompt, projectRoot, {
          allowedTools,
          autoApprove: spawnOpts?.autoApprove ?? false,
        });
      } catch { /* ignore spawn errors — task will timeout */ }
    }
  };

  // First pass — check immediately
  const initiallyCollected = collectResults();
  processQueue(initiallyCollected);
  if (collected.size === taskIds.size) return results;

  // Poll loop
  while (Date.now() - startTime < timeout) {
    const remaining = timeout - (Date.now() - startTime);
    await sleep(Math.min(pollInterval, remaining));
    const newlyCollected = collectResults();
    processQueue(newlyCollected);
    if (collected.size === taskIds.size) break;
  }
  return results;
}

// 8. evaluateResult (pure)

/** Source code directory prefixes — anything outside these is treated as a doc task */
const SOURCE_CODE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];

function isSourceCodeDir(dir: string): boolean {
  const normalized = dir === 'src' || dir === 'tests' || dir === 'lib';
  return normalized || SOURCE_CODE_PREFIXES.some(p => dir.startsWith(p));
}

/**
 * Returns true if the task is doc-only (no source code directories).
 * Source code scopes: src/, tests/, lib/ — everything else is a doc task.
 * Mixed scope (e.g. docs/ + src/) → false (normal evaluation applies).
 */
export function isDocTask(task: Task): boolean {
  const dirs = task.scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return dirs.every(d => !isSourceCodeDir(d));
}

export function evaluateResult(result: TaskResult, task: Task): TaskEvaluation {
  if (result.selfAssessment === 'NO_GO') return TaskEvaluation.NO_GO;
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT') return TaskEvaluation.GO_WITH_TECH_DEBT;
  // selfAssessment === 'DONE' — verify
  if (!result.testsPassed) return TaskEvaluation.NO_GO;
  // Doc tasks: skip coverage threshold — testsPassed is sufficient
  if (isDocTask(task)) return TaskEvaluation.DONE;
  if (result.coverage < 90) return TaskEvaluation.GO_WITH_TECH_DEBT;
  return TaskEvaluation.DONE;
}

// 9. handleEvaluation
export function handleEvaluation(
  projectRoot: string,
  task: Task,
  evaluation: TaskEvaluation,
  result: TaskResult,
): void {
  const brainPath = join(projectRoot, BRAIN_DIR);
  const workerId = task.assignedWorker ?? `w-${task.id}`;

  if (evaluation === TaskEvaluation.DONE) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.DONE);
    releaseAllLocks(projectRoot, workerId);
    return;
  }

  if (evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) {
    updateTaskStatus(projectRoot, task.id, TaskStatus.DONE);
    releaseAllLocks(projectRoot, workerId);

    // Add debt item
    const debtPath = join(brainPath, DEBT_FILE);
    mkdirSync(brainPath, { recursive: true });
    const existing = readFileSafe(debtPath);
    const items = existing ? parseDebtTable(existing) : [];
    items.push({
      id: `debt-${task.id}`,
      description: `Tech debt from ${task.id}: ${result.notes}`.slice(0, 80),
      originTaskId: task.id,
      originSprintId: task.sprintId ?? '',
      priority: DebtPriority.NORMAL,
      sprintsOpen: 0,
      resolved: false,
      createdAt: now(),
    });
    writeFileSync(debtPath, generateDebtTable(items), 'utf-8');
    return;
  }

  // NO_GO — keep locks, create fix task
  updateTaskStatus(projectRoot, task.id, TaskStatus.NO_GO);

  const fixTask: Task = {
    id: `${task.id}-fix`,
    title: `Fix: ${task.title}`,
    description: `Priority fix for NO_GO task ${task.id}. Notes: ${result.notes}`,
    model: task.model,
    effort: task.effort,
    priority: 'CRITICAL',
    reason: `Task ${task.id} evaluated as NO_GO`,
    scope: task.scope,
    dependencies: [],
    goNogo: task.goNogo,
    status: TaskStatus.PENDING,
    sprintId: task.sprintId,
    isPriorityFix: true,
    fixForTaskId: task.id,
    createdAt: now(),
  };
  mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
  writeFileSync(
    join(projectRoot, TASKS_DIR, `task-${fixTask.id}.json`),
    JSON.stringify(fixTask, null, 2),
    'utf-8',
  );
}

// 10. handleCrossDependencies
export function handleCrossDependencies(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
): Task[] {
  const fixTasks: Task[] = [];
  const noGoTasks = sprint.tasks.filter(t => evaluations.get(t.id) === TaskEvaluation.NO_GO);

  for (const noGoTask of noGoTasks) {
    for (const depId of noGoTask.dependencies) {
      const depEval = evaluations.get(depId);
      if (depEval === TaskEvaluation.DONE || depEval === TaskEvaluation.GO_WITH_TECH_DEBT) {
        const depTask = sprint.tasks.find(t => t.id === depId);
        if (!depTask) continue;

        const fixTask: Task = {
          id: `${depId}-xfix`,
          title: `Cross-fix: ${depTask.title}`,
          description: `Cross-dependency fix: ${noGoTask.id} (NO_GO) depends on ${depId}`,
          model: depTask.model,
          effort: depTask.effort,
          priority: 'CRITICAL',
          reason: `Cross-dependency: ${noGoTask.id} failed, may be caused by ${depId}`,
          scope: depTask.scope,
          dependencies: [],
          goNogo: depTask.goNogo,
          status: TaskStatus.PENDING,
          sprintId: depTask.sprintId,
          isPriorityFix: true,
          fixForTaskId: depId,
          createdAt: now(),
        };
        fixTasks.push(fixTask);

        mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
        writeFileSync(
          join(projectRoot, TASKS_DIR, `task-${fixTask.id}.json`),
          JSON.stringify(fixTask, null, 2),
          'utf-8',
        );
      }
    }
  }
  return fixTasks;
}

// 11. escalateDebt
export function escalateDebt(projectRoot: string): void {
  const debtPath = join(projectRoot, BRAIN_DIR, DEBT_FILE);
  const content = readFileSafe(debtPath);
  if (!content) return;

  const items = parseDebtTable(content);
  let changed = false;

  for (const item of items) {
    if (item.resolved) continue;
    item.sprintsOpen++;
    if (item.sprintsOpen >= DEBT_CRITICAL_SPRINTS && item.priority !== DebtPriority.CRITICAL) {
      item.priority = DebtPriority.CRITICAL;
      changed = true;
    } else if (item.sprintsOpen >= DEBT_HIGH_PRIORITY_SPRINTS && item.priority === DebtPriority.NORMAL) {
      item.priority = DebtPriority.HIGH;
      changed = true;
    }
    changed = true; // sprintsOpen always increments
  }

  if (changed) {
    mkdirSync(join(projectRoot, BRAIN_DIR), { recursive: true });
    writeFileSync(debtPath, generateDebtTable(items), 'utf-8');
  }
}

// 11b. resolveDebt
export function resolveDebt(projectRoot: string, debtId: string, resolvedInSprintId: string): boolean {
  const debtPath = join(projectRoot, BRAIN_DIR, DEBT_FILE);
  const content = readFileSafe(debtPath);
  if (!content) return false;
  const items = parseDebtTable(content);
  const item = items.find(d => d.id === debtId);
  if (!item || item.resolved) return false;
  item.resolved = true;
  item.resolvedInSprintId = resolvedInSprintId;
  mkdirSync(join(projectRoot, BRAIN_DIR), { recursive: true });
  writeFileSync(debtPath, generateDebtTable(items), 'utf-8');
  return true;
}

// 12. writeRetrospective
export function writeRetrospective(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  metrics: SprintMetrics,
): void {
  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });

  // Write RETRO.md (overwrite)
  const retroLines: string[] = [
    `# Sprint ${sprint.id} Retrospective`, '',
    '## Metrics',
    `- Tasks: ${metrics.totalTasks} total, ${metrics.completedTasks} done, ${metrics.techDebtTasks} debt, ${metrics.noGoTasks} no-go`,
    `- Coverage: ${metrics.coveragePercent.toFixed(1)}%`,
    `- No-Go Rate: ${metrics.noGoRate.toFixed(1)}%`,
    `- Duration: ${metrics.durationMs}ms`, '',
    '## Results',
  ];
  for (const task of sprint.tasks) {
    retroLines.push(`- ${task.id}: ${task.title} -> ${evaluations.get(task.id) ?? 'UNKNOWN'}`);
  }
  writeFileSync(
    join(brainPath, RETRO_FILE),
    retroLines.slice(0, RETRO_MAX_LINES).join('\n'),
    'utf-8',
  );

  // Append to MEMORY.md
  const memoryPath = join(brainPath, MEMORY_FILE);
  const existingMemory = readFileSafe(memoryPath);
  const learnings: string[] = [`## Sprint ${sprint.id} Learnings`];
  for (const task of sprint.tasks) {
    const ev = evaluations.get(task.id);
    if (ev === TaskEvaluation.NO_GO || ev === TaskEvaluation.GO_WITH_TECH_DEBT) {
      learnings.push(`- ${task.title}: ${ev}`);
    }
    if (learnings.length >= 11) break; // header + max 10
  }
  const newMemory = existingMemory
    ? existingMemory + '\n' + learnings.join('\n')
    : learnings.join('\n');
  const memoryLines = newMemory.split('\n');
  const trimmed = memoryLines.length > MEMORY_MAX_LINES
    ? memoryLines.slice(memoryLines.length - MEMORY_MAX_LINES).join('\n')
    : newMemory;
  writeFileSync(memoryPath, trimmed, 'utf-8');
}

// 13. writeSprintLog
export function writeSprintLog(projectRoot: string, sprint: Sprint, metrics: SprintMetrics, evaluations?: Map<string, TaskEvaluation>): void {
  const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  mkdirSync(sprintsPath, { recursive: true });

  const lines: string[] = [
    `# ${sprint.id}`, '',
    '## Metrics',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Tasks | ${metrics.totalTasks} |`,
    `| Completed | ${metrics.completedTasks} |`,
    `| Tech Debt | ${metrics.techDebtTasks} |`,
    `| No-Go | ${metrics.noGoTasks} |`,
    `| Coverage | ${metrics.coveragePercent.toFixed(1)}% |`,
    `| Duration | ${metrics.durationMs}ms |`, '',
    '## Tasks',
  ];
  for (const task of sprint.tasks) {
    const evalResult = evaluations?.get(task.id);
    const statusStr = evalResult ?? task.status;
    lines.push(`- ${task.id}: ${task.title} (${statusStr})`);
  }
  writeFileSync(
    join(sprintsPath, `${sprint.id}.md`),
    lines.slice(0, SPRINT_LOG_MAX_LINES).join('\n'),
    'utf-8',
  );
}

// 14. calculateMetrics (pure)
export function calculateMetrics(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  debt?: DebtItem[],
): SprintMetrics {
  let completedTasks = 0;
  let techDebtTasks = 0;
  let noGoTasks = 0;

  for (const ev of evaluations.values()) {
    if (ev === TaskEvaluation.DONE) completedTasks++;
    else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) { completedTasks++; techDebtTasks++; }
    else if (ev === TaskEvaluation.NO_GO) noGoTasks++;
  }

  const totalTasks = evaluations.size;
  const coveragePercent = results.length > 0
    ? results.reduce((sum, r) => sum + r.coverage, 0) / results.length
    : 0;
  const noGoRate = totalTasks > 0 ? (noGoTasks / totalTasks) * 100 : 0;

  const startTime = sprint.startedAt ? new Date(sprint.startedAt).getTime() : Date.now();
  const endTime = sprint.completedAt ? new Date(sprint.completedAt).getTime() : Date.now();

  return {
    totalTasks,
    completedTasks,
    techDebtTasks,
    noGoTasks,
    durationMs: endTime - startTime,
    coveragePercent,
    noGoRate,
    newDebtCount: techDebtTasks,
    resolvedDebtCount: debt ? debt.filter(d => d.resolved && d.resolvedInSprintId === sprint.id).length : 0,
    totalOpenDebt: debt ? debt.filter(d => !d.resolved).length : 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  };
}

// 15. runDecay — public wrapper with force option
export interface RunDecayOptions {
  force?: boolean;
}

export function runDecay(projectRoot: string, sprintId: string, opts?: RunDecayOptions): DecayResult {
  const linesBefore = countBrainLines(projectRoot);
  const brainPath = join(projectRoot, BRAIN_DIR);

  // Track what we'll remove
  let removedDebtCount = 0;
  let removedPatternCount = 0;
  const archivedSprints: string[] = [];

  const shouldRun = opts?.force || linesBefore > BRAIN_TOTAL_LINE_BUDGET;
  if (!shouldRun) {
    return { linesBefore, linesAfter: linesBefore, archivedSprints: [], removedDebtCount: 0, removedPatternCount: 0 };
  }

  // 1. Remove resolved patterns
  const patternsPath = join(brainPath, PATTERNS_FILE);
  if (existsSync(patternsPath)) {
    const patterns = readJsonSafe<PatternEntry[]>(patternsPath);
    if (patterns) {
      const resolved = patterns.filter(p => p.resolved);
      removedPatternCount = resolved.length;
      const active = patterns.filter(p => !p.resolved);
      writeFileSync(patternsPath, JSON.stringify(active, null, 2), 'utf-8');
    }
  }

  // 2. Remove resolved debt (with retention window — keep entries resolved < 3 sprints ago)
  const debtPath = join(brainPath, DEBT_FILE);
  const debtContent = readFileSafe(debtPath);
  if (debtContent) {
    const items = parseDebtTable(debtContent);
    const toRemove = items.filter(d => shouldRemoveResolvedDebt(d, sprintId, 3));
    removedDebtCount = toRemove.length;
    const keptItems = items.filter(d => !shouldRemoveResolvedDebt(d, sprintId, 3));
    writeFileSync(debtPath, generateDebtTable(keptItems), 'utf-8');
  }

  // 3. Archive old sprint logs (keep last 2)
  const sprintsPath = join(brainPath, SPRINTS_DIR);
  if (existsSync(sprintsPath)) {
    const archivePath = join(brainPath, ARCHIVE_DIR);
    const sprintFiles = readdirSync(sprintsPath).filter(f => f.endsWith('.md')).sort();
    const toArchive = sprintFiles.slice(0, Math.max(0, sprintFiles.length - 2));
    if (toArchive.length > 0) {
      mkdirSync(archivePath, { recursive: true });
      for (const file of toArchive) {
        const content = readFileSync(join(sprintsPath, file), 'utf-8');
        writeFileSync(join(archivePath, file), content, 'utf-8');
        unlinkSync(join(sprintsPath, file));
        archivedSprints.push(file);
      }
    }
  }

  // 4. Memory archive — trim old sections
  const memoryPath = join(brainPath, MEMORY_FILE);
  if (existsSync(memoryPath) && countBrainLines(projectRoot) > BRAIN_TOTAL_LINE_BUDGET) {
    const content = readFileSafe(memoryPath);
    const currentNum = getSprintNumber(sprintId);
    const lines = content.split('\n');
    const kept: string[] = [];
    let currentSectionOld = false;

    for (const line of lines) {
      const sectionMatch = line.match(/^## Sprint sprint-(\d+)/);
      if (sectionMatch?.[1]) {
        const sectionNum = parseInt(sectionMatch[1], 10);
        currentSectionOld = (currentNum - sectionNum) >= MEMORY_DECAY_SPRINTS;
      }
      if (!currentSectionOld) kept.push(line);
    }
    writeFileSync(memoryPath, kept.join('\n'), 'utf-8');
  }

  // 5. Last resort — truncate MEMORY.md to 50 lines
  if (countBrainLines(projectRoot) > BRAIN_TOTAL_LINE_BUDGET) {
    const memContent = readFileSafe(join(brainPath, MEMORY_FILE));
    const memLines = memContent.split('\n');
    if (memLines.length > 50) {
      writeFileSync(join(brainPath, MEMORY_FILE), memLines.slice(memLines.length - 50).join('\n'), 'utf-8');
    }
  }

  const linesAfter = countBrainLines(projectRoot);
  return { linesBefore, linesAfter, archivedSprints, removedDebtCount, removedPatternCount };
}

// 15b. decay — backward-compatible alias for runDecay
export function decay(projectRoot: string, currentSprintId: string): void {
  runDecay(projectRoot, currentSprintId);
}

// 16. cleanup
/**
 * Returns true if the file at `filePath` was last modified more than `maxAgeMs` ago.
 * Used to detect stale task files left over from previous sprints.
 */
export function isStaleTaskFile(filePath: string, maxAgeMs: number = 86_400_000): boolean {
  try {
    const stat = statSync(filePath);
    return Date.now() - stat.mtimeMs > maxAgeMs;
  } catch {
    return false;
  }
}

export function cleanup(projectRoot: string, sprint: Sprint): void {
  // Kill all workers
  const workers = listWorkers();
  for (const taskId of workers) {
    try { killWorker(taskId); } catch { /* already dead */ }
  }

  // Release locks for assigned workers
  for (const task of sprint.tasks) {
    if (task.assignedWorker) {
      try { releaseAllLocks(projectRoot, task.assignedWorker); } catch { /* skip */ }
    }
  }

  // Delete all task files (.json, .plan, .hb, .result, .paused, .log)
  const tasksDir = join(projectRoot, TASKS_DIR);
  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir).filter(f => TASK_FILE_EXTENSIONS.some(ext => f.endsWith(ext)))) {
      try { unlinkSync(join(tasksDir, file)); } catch { /* skip */ }
    }
  }

  // Clean stale task files (older than 24h) regardless of sprint
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

  // Delete .lock files
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (existsSync(locksDir)) {
    for (const file of readdirSync(locksDir).filter(f => f.endsWith('.lock'))) {
      try { unlinkSync(join(locksDir, file)); } catch { /* skip */ }
    }
  }
}

// 16b. SprintResult — re-exported from core/types
export type { SprintResult } from '../core/types.js';

// 16c. updateProjectDocs — registry-based auto-update after sprint completion
export function updateProjectDocs(projectRoot: string, sprintResult: SprintResult): DocUpdateResult[] {
  const isInternalProject = existsSync(join(projectRoot, 'DECKENT-MASTER-BLUEPRINT.md'));
  const config: ResolvedConfig = {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8,
      brain_model: 'opus',
      default_model: 'opus',
      haiku_allowed: true,
      usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
      brain_planning: 'auto',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: isInternalProject ? 'deckent' : 'deckent-project',
    projectRoot,
    version: '0.0.0',
    auto_docs: { tier1: true, tier2: true, tier3: false },
  };
  const ctx = { projectRoot, sprintResult, config, isInternalProject };
  return runAllUpdaters(ctx);
}

// ─── RunSprintOptions ─────────────────────────────────────────────
// autoApprove → passed to tmux as --dangerously-skip-permissions
// sandboxMode → Docker sandbox (not yet implemented; reserved for future)
// NOTE: haikuAllowed lives in PlanModeConfig.haiku_allowed (model selection only)
export interface RunSprintOptions {
  autoApprove?: boolean;
  sandboxMode?: boolean;
  testMode?: boolean;
  skipCleanup?: boolean;
  timeoutMs?: number;
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

  // Phase 1: PLAN
  try {
    const context = readContext(projectRoot);
    const usage = checkUsage(config);
    const recommendation = adjustSprintSize(config, usage);
    sprint = planSprint(projectRoot, config, context, recommendation);
    sprint.startedAt = now();
  } catch (err) {
    throw new BrainError(
      `Plan phase failed: ${err instanceof Error ? err.message : String(err)}`,
      SprintPhase.PLAN,
    );
  }

  // Reset dashboard for new sprint (clear stale data from previous sprint)
  try {
    resetDashboard(projectRoot, sprint.id, sprint.tasks.length);
  } catch { /* dashboard reset failed — non-fatal */ }

  // Phase 2: SPAWN (1 retry)
  let spawnAttempts = 0;
  while (spawnAttempts < 2) {
    try {
      sprint.phase = SprintPhase.SPAWN;
      taskQueue = spawnWorkers(projectRoot, sprint, config, { autoApprove: opts?.autoApprove });
      sprint.status = SprintStatus.ACTIVE;
      // Start auditor scan loop (in-process)
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
        // Cleanup and throw
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
    results = await waitForResults(projectRoot, sprint, undefined, taskQueue, { autoApprove: opts?.autoApprove });
  } catch (err) {
    try {
      updateDashboard(projectRoot, {
        sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
        agents: [],
        progress: { done: 0, active: 0, blocked: 0, total: sprint.tasks.length },
        usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
        alerts: [{ level: AlertLevel.WARNING, message: `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date().toISOString() }],
        updatedAt: new Date().toISOString(),
      });
    } catch { /* dashboard write failed — continue */ }
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
        // Resolve debt for completed tasks
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
      }
    }
  } catch (err) {
    try {
      updateDashboard(projectRoot, {
        sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
        agents: [],
        progress: { done: 0, active: 0, blocked: 0, total: sprint.tasks.length },
        usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
        alerts: [{ level: AlertLevel.WARNING, message: `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date().toISOString() }],
        updatedAt: new Date().toISOString(),
      });
    } catch { /* dashboard write failed — continue */ }
  }

  // Phase 5: FIX
  try {
    sprint.status = SprintStatus.FIXING;
    sprint.phase = SprintPhase.FIX;
    handleCrossDependencies(projectRoot, sprint, evaluations);

    // Find all pending fix tasks
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
      spawnWorkers(projectRoot, fixSprint, config, { autoApprove: opts?.autoApprove });
      const fixResults = await waitForResults(projectRoot, fixSprint, 10 * 60 * 1000);
      for (const fixTask of fixTasks) {
        const fixResult = fixResults.find(r => r.taskId === fixTask.id);
        if (fixResult) {
          const fixEval = evaluateResult(fixResult, fixTask);
          handleEvaluation(projectRoot, fixTask, fixEval, fixResult);
          // Resolve debt for completed fix tasks
          if (fixEval === TaskEvaluation.DONE && fixTask.fixForTaskId) {
            resolveDebt(projectRoot, `debt-${fixTask.fixForTaskId}`, sprint.id);
          }
        }
      }
    }
    escalateDebt(projectRoot);
  } catch (err) {
    try {
      updateDashboard(projectRoot, {
        sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
        agents: [],
        progress: { done: 0, active: 0, blocked: 0, total: sprint.tasks.length },
        usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
        alerts: [{ level: AlertLevel.WARNING, message: `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date().toISOString() }],
        updatedAt: new Date().toISOString(),
      });
    } catch { /* dashboard write failed — continue */ }
  }

  // Phase 6: RETRO (skipped in testMode)
  if (!opts?.testMode) {
    try {
      sprint.status = SprintStatus.RETROSPECTIVE;
      sprint.phase = SprintPhase.RETRO;
      const freshDebt = parseDebtTable(readFileSafe(join(projectRoot, BRAIN_DIR, DEBT_FILE)) ?? '');
      metrics = calculateMetrics(sprint, evaluations, results, freshDebt);
      sprint.metrics = metrics;
      writeRetrospective(projectRoot, sprint, evaluations, metrics);
      writeSprintLog(projectRoot, sprint, metrics, evaluations);
      try { updateProjectDocs(projectRoot, { sprint, evaluations, metrics }); } catch { /* non-critical */ }
    } catch (err) {
      try {
        updateDashboard(projectRoot, {
          sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
          agents: [],
          progress: { done: 0, active: 0, blocked: 0, total: sprint.tasks.length },
          usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
          alerts: [{ level: AlertLevel.WARNING, message: `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date().toISOString() }],
          updatedAt: new Date().toISOString(),
        });
      } catch { /* dashboard write failed — continue */ }
    }
  } else {
    // In testMode, still calculate metrics but skip writing retro/log/docs
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
      try {
        updateDashboard(projectRoot, {
          sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
          agents: [],
          progress: { done: 0, active: 0, blocked: 0, total: sprint.tasks.length },
          usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
          alerts: [{ level: AlertLevel.WARNING, message: `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date().toISOString() }],
          updatedAt: new Date().toISOString(),
        });
      } catch { /* dashboard write failed — continue */ }
    }
  }

  // Phase 8: CLEANUP (skipped when skipCleanup is true)
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  if (!opts?.skipCleanup) {
    try {
      cleanup(projectRoot, sprint);
    } catch (err) {
      try {
        updateDashboard(projectRoot, {
          sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
          agents: [],
          progress: { done: 0, active: 0, blocked: 0, total: sprint.tasks.length },
          usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
          alerts: [{ level: AlertLevel.WARNING, message: `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`, timestamp: new Date().toISOString() }],
          updatedAt: new Date().toISOString(),
        });
      } catch { /* dashboard write failed — continue */ }
    }
  }

  sprint.status = SprintStatus.COMPLETE;
  sprint.phase = SprintPhase.COMPLETE;
  sprint.completedAt = now();

  // Persist sprint ID to config so getNextSprintId never regresses (skip in testMode)
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
