// ─── Node Builtins ─────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Core (value imports — enums used at runtime) ──────────────────
import { TaskStatus, TaskEvaluation, SprintPhase, SprintStatus, DebtPriority, AgentStatus } from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, TaskResult, TaskScope, GoNoGoCriteria, Sprint, SprintMetrics,
  DebtItem, ModelType, TaskEffort, TaskPriority,
  UsageMetrics, AgentInfo, ResolvedConfig, PatternEntry,
} from '../core/types.js';
import {
  BRAIN_DIR, TASKS_DIR, LOCKS_DIR, DIRECTIVES_FILE,
  MEMORY_FILE, DECISIONS_FILE, DEBT_FILE, PATTERNS_FILE,
  RETRO_FILE, SPRINTS_DIR, ARCHIVE_DIR,
  MEMORY_MAX_LINES, RETRO_MAX_LINES, SPRINT_LOG_MAX_LINES,
  BRAIN_TOTAL_LINE_BUDGET, MEMORY_DECAY_SPRINTS,
  DEBT_HIGH_PRIORITY_SPRINTS, DEBT_CRITICAL_SPRINTS,
  DEBT_TABLE_HEADER,
} from '../core/constants.js';

// ─── Wave 2 — tmux ────────────────────────────────────────────────
import { ensureSession, spawnWorker, killWorker, listWorkers, startAuditor } from './tmux.js';

// ─── Wave 2 — auditor ─────────────────────────────────────────────
import { updateDashboard, detectDeadlocks } from '../monitor/auditor.js';

// ─── Wave 2 — worker ──────────────────────────────────────────────
import { updateTaskStatus, releaseAllLocks } from '../agents/worker.js';

// ═══ Types ═════════════════════════════════════════════════════════

export interface BrainContext {
  directives: string;
  memory: string;
  retro: string;
  debt: DebtItem[];
  patterns: string;
  decisions: string;
  existingTasks: Task[];
  projectState: ProjectState;
}

export interface ProjectState {
  gitStatus: string;
  fileTree: string[];
}

export interface SprintSizeRecommendation {
  size: 'full' | 'reduced' | 'minimal';
  maxWorkers: number;
  modelConstraint: ModelType | null;
  reason: string;
}

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

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function now(): string {
  return new Date().toISOString();
}

function parseDebtTable(content: string): DebtItem[] {
  const lines = content.split('\n');
  const items: DebtItem[] = [];
  let headerFound = false;

  for (const line of lines) {
    if (line.includes('| ID |')) { headerFound = true; continue; }
    if (!headerFound) continue;
    if (line.startsWith('|---') || line.startsWith('| ---')) continue;
    if (!line.startsWith('|')) continue;

    const cols = line.split('|').slice(1, -1).map(c => c.trim());
    if (cols.length < 9) continue;

    items.push({
      id: cols[0]!,
      description: cols[1]!,
      originTaskId: cols[2]!,
      originSprintId: cols[3]!,
      priority: cols[4] as DebtPriority,
      sprintsOpen: parseInt(cols[5]!, 10) || 0,
      resolved: cols[6] === 'true',
      resolvedInSprintId: cols[7] === '-' ? undefined : cols[7],
      createdAt: cols[8]!,
    });
  }
  return items;
}

function generateDebtTable(items: DebtItem[]): string {
  const separator = '|----|-------------|------|--------|----------|------|----------|----------|---------|';
  const rows = items.map(d =>
    `| ${d.id} | ${d.description} | ${d.originTaskId} | ${d.originSprintId} | ${d.priority} | ${d.sprintsOpen} | ${d.resolved} | ${d.resolvedInSprintId ?? '-'} | ${d.createdAt} |`,
  );
  return [DEBT_TABLE_HEADER, separator, ...rows].join('\n');
}

function countBrainLines(projectRoot: string): number {
  const brainPath = join(projectRoot, BRAIN_DIR);
  if (!existsSync(brainPath)) return 0;

  let total = 0;
  const entries = readdirSync(brainPath);
  for (const entry of entries) {
    if (entry === ARCHIVE_DIR || entry === SPRINTS_DIR) continue;
    try { total += readFileSync(join(brainPath, entry), 'utf-8').split('\n').length; } catch { /* dir */ }
  }

  const sprintsPath = join(brainPath, SPRINTS_DIR);
  if (existsSync(sprintsPath)) {
    for (const file of readdirSync(sprintsPath)) {
      try { total += readFileSync(join(sprintsPath, file), 'utf-8').split('\n').length; } catch { /* skip */ }
    }
  }
  return total;
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

// 2. checkUsage (stub)
export function checkUsage(_config: ResolvedConfig): UsageMetrics {
  return { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: now() };
}

// 3. adjustSprintSize (pure)
export function adjustSprintSize(config: ResolvedConfig, usage: UsageMetrics): SprintSizeRecommendation {
  const thresholds = config.activeModeConfig.usage_thresholds;
  const fiveHrExceeded = usage.fiveHourPercent / 100 >= thresholds['5hr'];
  const weeklyExceeded = usage.weeklyPercent / 100 >= thresholds.weekly;

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
      maxWorkers: Math.max(1, Math.floor(config.activeModeConfig.max_workers / 2)),
      modelConstraint: 'sonnet',
      reason: `${fiveHrExceeded ? '5hr' : 'Weekly'} usage threshold exceeded`,
    };
  }
  return {
    size: 'full',
    maxWorkers: config.activeModeConfig.max_workers,
    modelConstraint: null,
    reason: 'No usage constraints',
  };
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
    status: TaskStatus.PENDING,
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

// 5. planSprint
export function planSprint(
  projectRoot: string,
  config: ResolvedConfig,
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
): Sprint {
  // Determine sprint number
  const sprintsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  let maxNumber = 0;
  if (existsSync(sprintsDir)) {
    for (const file of readdirSync(sprintsDir)) {
      const match = file.match(/^sprint-(\d+)\.md$/);
      if (match?.[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) maxNumber = num;
      }
    }
  }
  const sprintNumber = maxNumber + 1;
  const sprintId = `sprint-${String(sprintNumber).padStart(3, '0')}`;
  const defaultModel = recommendation.modelConstraint ?? config.activeModeConfig.default_model;

  const tasks: Task[] = [];
  let seq = 1;

  // CRITICAL debt → priority fix tasks
  const criticalDebt = context.debt.filter(d => d.priority === DebtPriority.CRITICAL && !d.resolved);
  for (const debt of criticalDebt) {
    if (tasks.length >= recommendation.maxWorkers) break;
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
    }, seq++));
  }

  // Directive lines → tasks
  const directiveLines = context.directives
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.replace(/^-\s+/, ''));

  for (const line of directiveLines) {
    if (tasks.length >= recommendation.maxWorkers) break;
    const scope = extractScopeFromDirective(line);
    tasks.push(createTask({
      title: line,
      description: line,
      model: defaultModel,
      effort: 'normal',
      priority: 'NORMAL',
      reason: 'Directive',
      scope,
      dependencies: [],
      goNogo: { goCriteria: 'Tests pass', noGoCriteria: 'Build fails', techDebtAcceptable: 'Minor issues' },
      sprintId,
    }, seq++));
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
    number: sprintNumber,
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
  };
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
3. When finished, create the result file at .tasks/task-${task.id}.result with this exact JSON format:

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
The result file is REQUIRED — without it your work cannot be evaluated.`.replace(/'/g, '');
}

// 6. spawnWorkers
export function spawnWorkers(projectRoot: string, sprint: Sprint, config: ResolvedConfig): void {
  ensureSession();
  startAuditor(projectRoot, { allowedTools: 'Read,Bash' });

  for (const task of sprint.tasks) {
    const prompt = buildWorkerPrompt(task);
    const model = task.model;
    const writeTargets = [...task.scope.directories, ...task.scope.filesWrite].filter(Boolean);
    const allowedTools = writeTargets.length > 0
      ? `Read,Write(${writeTargets.join(',')}),Bash`
      : 'Read,Write,Bash';

    spawnWorker(task.id, model, prompt, projectRoot, {
      allowedTools,
      autoApprove: config.activeModeConfig.haiku_allowed,
    });
  }

  const agents: AgentInfo[] = sprint.tasks.map(task => ({
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
    progress: { done: 0, active: sprint.tasks.length, blocked: 0, total: sprint.tasks.length },
    usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: now() },
    alerts: [],
    updatedAt: now(),
  });
}

// 7. waitForResults
export function waitForResults(projectRoot: string, sprint: Sprint, timeoutMs?: number): TaskResult[] {
  const timeout = timeoutMs ?? 30 * 60 * 1000;
  const pollInterval = 15_000;
  const startTime = Date.now();
  const results: TaskResult[] = [];
  const taskIds = new Set(sprint.tasks.map(t => t.id));
  const collected = new Set<string>();

  const collectResults = () => {
    for (const taskId of taskIds) {
      if (collected.has(taskId)) continue;
      const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
      if (existsSync(resultPath)) {
        const result = readJsonSafe<TaskResult>(resultPath);
        if (result) {
          results.push(result);
          collected.add(taskId);
        }
      }
    }
  };

  // First pass — check immediately
  collectResults();
  if (collected.size === taskIds.size) return results;

  // Poll loop
  while (Date.now() - startTime < timeout) {
    sleepSync(pollInterval);
    collectResults();
    if (collected.size === taskIds.size) break;
  }
  return results;
}

// 8. evaluateResult (pure)
export function evaluateResult(result: TaskResult, _task: Task): TaskEvaluation {
  if (result.selfAssessment === 'NO_GO') return TaskEvaluation.NO_GO;
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT') return TaskEvaluation.GO_WITH_TECH_DEBT;
  // selfAssessment === 'DONE' — verify
  if (!result.testsPassed) return TaskEvaluation.NO_GO;
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
export function writeSprintLog(projectRoot: string, sprint: Sprint, metrics: SprintMetrics): void {
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
    lines.push(`- ${task.id}: ${task.title} (${task.status})`);
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
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  };
}

// 15. decay
export function decay(projectRoot: string, currentSprintId: string): void {
  if (countBrainLines(projectRoot) <= BRAIN_TOTAL_LINE_BUDGET) return;

  const brainPath = join(projectRoot, BRAIN_DIR);
  const archivePath = join(brainPath, ARCHIVE_DIR);

  // 1. Remove resolved patterns
  const patternsPath = join(brainPath, PATTERNS_FILE);
  if (existsSync(patternsPath)) {
    const patterns = readJsonSafe<PatternEntry[]>(patternsPath);
    if (patterns) {
      const active = patterns.filter(p => !p.resolved);
      writeFileSync(patternsPath, JSON.stringify(active, null, 2), 'utf-8');
    }
  }

  // 2. Remove resolved debt
  const debtPath = join(brainPath, DEBT_FILE);
  const debtContent = readFileSafe(debtPath);
  if (debtContent) {
    const items = parseDebtTable(debtContent);
    const openItems = items.filter(d => !d.resolved);
    writeFileSync(debtPath, generateDebtTable(openItems), 'utf-8');
  }

  // 3. Archive old sprint logs (keep last 2)
  const sprintsPath = join(brainPath, SPRINTS_DIR);
  if (existsSync(sprintsPath)) {
    const sprintFiles = readdirSync(sprintsPath).filter(f => f.endsWith('.md')).sort();
    const toArchive = sprintFiles.slice(0, Math.max(0, sprintFiles.length - 2));
    if (toArchive.length > 0) {
      mkdirSync(archivePath, { recursive: true });
      for (const file of toArchive) {
        const content = readFileSync(join(sprintsPath, file), 'utf-8');
        writeFileSync(join(archivePath, file), content, 'utf-8');
        unlinkSync(join(sprintsPath, file));
      }
    }
  }

  // 4. Memory archive — trim old sections
  const memoryPath = join(brainPath, MEMORY_FILE);
  if (existsSync(memoryPath) && countBrainLines(projectRoot) > BRAIN_TOTAL_LINE_BUDGET) {
    const content = readFileSafe(memoryPath);
    const currentNum = getSprintNumber(currentSprintId);
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
}

// 16. cleanup
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

  // Delete .hb files
  const tasksDir = join(projectRoot, TASKS_DIR);
  if (existsSync(tasksDir)) {
    for (const file of readdirSync(tasksDir).filter(f => f.endsWith('.hb'))) {
      try { unlinkSync(join(tasksDir, file)); } catch { /* skip */ }
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

// 17. runSprint — Master Orchestrator
export function runSprint(projectRoot: string, config: ResolvedConfig): Sprint {
  let sprint: Sprint;
  let evaluations = new Map<string, TaskEvaluation>();
  let results: TaskResult[] = [];
  let metrics: SprintMetrics | undefined;

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

  // Phase 2: SPAWN (1 retry)
  let spawnAttempts = 0;
  while (spawnAttempts < 2) {
    try {
      sprint.phase = SprintPhase.SPAWN;
      spawnWorkers(projectRoot, sprint, config);
      sprint.status = SprintStatus.ACTIVE;
      break;
    } catch (err) {
      spawnAttempts++;
      if (spawnAttempts >= 2) {
        // Cleanup and throw
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
    results = waitForResults(projectRoot, sprint);
  } catch { /* use empty results */ }

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
  } catch { /* skip to retro */ }

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
      spawnWorkers(projectRoot, fixSprint, config);
      const fixResults = waitForResults(projectRoot, fixSprint, 10 * 60 * 1000);
      for (const fixTask of fixTasks) {
        const fixResult = fixResults.find(r => r.taskId === fixTask.id);
        if (fixResult) {
          const fixEval = evaluateResult(fixResult, fixTask);
          handleEvaluation(projectRoot, fixTask, fixEval, fixResult);
        }
      }
    }
    escalateDebt(projectRoot);
  } catch { /* skip to retro */ }

  // Phase 6: RETRO
  try {
    sprint.status = SprintStatus.RETROSPECTIVE;
    sprint.phase = SprintPhase.RETRO;
    metrics = calculateMetrics(sprint, evaluations, results);
    sprint.metrics = metrics;
    writeRetrospective(projectRoot, sprint, evaluations, metrics);
    writeSprintLog(projectRoot, sprint, metrics);
  } catch { /* skip to decay */ }

  // Phase 7: DECAY
  try {
    sprint.phase = SprintPhase.DECAY;
    decay(projectRoot, sprint.id);
  } catch { /* skip to cleanup */ }

  // Phase 8: CLEANUP
  try {
    cleanup(projectRoot, sprint);
  } catch { /* best effort */ }

  sprint.status = SprintStatus.COMPLETE;
  sprint.phase = SprintPhase.COMPLETE;
  sprint.completedAt = now();
  return sprint;
}
