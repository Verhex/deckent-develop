// ─── Integration Test: Progress + Summary E2E ─────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { WorkerStatusTracker } from '../../src/cli/helpers/worker-status.js';
import { ETACalculator } from '../../src/cli/helpers/eta-calculator.js';
import {
  ProgressRenderer,
  type ProgressState,
  type WorkerProgressEntry,
} from '../../src/cli/helpers/progress.js';
import {
  RichSprintSummary,
  type SprintSummaryData,
} from '../../src/cli/helpers/sprint-summary.js';
import { SprintComparison, type SprintDelta } from '../../src/cli/helpers/sprint-comparison.js';
import { ChangeCategorizer, type FileChange } from '../../src/cli/helpers/change-categorizer.js';
import { AgentPerformanceFormatter } from '../../src/cli/helpers/agent-performance.js';
import { RecommendationEngine, type RecommendationInput } from '../../src/cli/helpers/recommendations.js';
import {
  TaskEvaluation,
  SprintPhase,
  SprintStatus,
  TaskStatus,
  type Sprint,
  type Task,
  type TaskResult,
  type SprintMetrics,
} from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

let tmpRoot: string;

function makeSprint(overrides?: Partial<Sprint>): Sprint {
  return {
    id: 'sprint-032',
    number: 32,
    status: SprintStatus.ACTIVE,
    phase: SprintPhase.EXECUTE,
    tasks: [],
    workers: [],
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

function makeTask(id: string, title: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title,
    description: `Description for ${title}`,
    model: 'opus',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'passes', noGoCriteria: 'fails', techDebtAcceptable: 'partial' },
    status: TaskStatus.PENDING,
    assignedAgent: 'generic',
    ...overrides,
  };
}

function makeResult(taskId: string, overrides?: Partial<TaskResult>): TaskResult {
  return {
    taskId,
    workerId: `worker-${taskId}`,
    filesChanged: [`src/${taskId}.ts`, `tests/${taskId}.test.ts`],
    linesAdded: 100,
    linesRemoved: 20,
    testsPassed: true,
    coverage: 85,
    selfAssessment: 'DONE',
    notes: `Completed ${taskId}`,
    agentId: 'agent-default',
    ...overrides,
  };
}

function writeHeartbeat(dir: string, taskId: string, status: string, agentId?: string): void {
  const data = {
    workerId: `worker-${taskId}`,
    taskId,
    status,
    currentFile: `src/${taskId}.ts`,
    timestamp: new Date().toISOString(),
    agentId: agentId ?? 'agent-default',
  };
  writeFileSync(join(dir, `task-${taskId}.hb`), JSON.stringify(data), 'utf-8');
}

function writeResult(dir: string, taskId: string, result: TaskResult): void {
  writeFileSync(join(dir, `task-${taskId}.result`), JSON.stringify(result), 'utf-8');
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-progress-summary-'));
  mkdirSync(join(tmpRoot, '.tasks'), { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ═══ Progress Flow ════════════════════════════════════════════════════

describe('Progress + Summary Integration', () => {
  describe('WorkerStatusTracker reads heartbeats', () => {
    it('reads heartbeat files from tasks directory', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      writeHeartbeat(tasksDir, '032-001', 'CODING');
      writeHeartbeat(tasksDir, '032-002', 'TESTING');

      const tracker = new WorkerStatusTracker();
      const entries = tracker.pollWorkerStatus(tasksDir);

      expect(entries).toHaveLength(2);
      const ids = entries.map((e) => e.taskId);
      expect(ids).toContain('032-001');
      expect(ids).toContain('032-002');
    });

    it('maps status to progress percent', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      writeHeartbeat(tasksDir, '032-001', 'CODING');
      writeHeartbeat(tasksDir, '032-002', 'TESTING');
      writeHeartbeat(tasksDir, '032-003', 'DOCUMENTING');
      writeHeartbeat(tasksDir, '032-004', 'DONE');

      const tracker = new WorkerStatusTracker();
      const entries = tracker.pollWorkerStatus(tasksDir);

      const byTask = new Map(entries.map((e) => [e.taskId, e]));
      expect(byTask.get('032-001')!.progressPercent).toBe(25);
      expect(byTask.get('032-002')!.progressPercent).toBe(65);
      expect(byTask.get('032-003')!.progressPercent).toBe(90);
      expect(byTask.get('032-004')!.progressPercent).toBe(100);
    });

    it('detects stale workers with old timestamps', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const staleTime = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const data = {
        workerId: 'worker-032-001',
        taskId: '032-001',
        status: 'CODING',
        currentFile: 'src/test.ts',
        timestamp: staleTime,
        agentId: 'agent-default',
      };
      writeFileSync(join(tasksDir, 'task-032-001.hb'), JSON.stringify(data), 'utf-8');

      const tracker = new WorkerStatusTracker();
      const entries = tracker.pollWorkerStatus(tasksDir);

      expect(entries).toHaveLength(1);
      expect(entries[0]!.status).toBe('STALE');
    });

    it('returns empty array when no heartbeat files exist', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const tracker = new WorkerStatusTracker();
      const entries = tracker.pollWorkerStatus(tasksDir);
      expect(entries).toEqual([]);
    });

    it('returns agent name from heartbeat', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      writeHeartbeat(tasksDir, '032-001', 'CODING', 'typescript-expert');

      const tracker = new WorkerStatusTracker();
      const entries = tracker.pollWorkerStatus(tasksDir);

      expect(entries[0]!.agentName).toBe('typescript-expert');
    });
  });

  describe('ETACalculator computes estimates', () => {
    it('calculates ETA from elapsed time and completed tasks', () => {
      const calculator = new ETACalculator();
      // 2 of 4 completed in 60s -> remaining 2 should take ~60s
      const eta = calculator.calculateETA(2, 4, 60_000);
      expect(eta).toBe(60_000);
    });

    it('returns 0 when all tasks complete', () => {
      const calculator = new ETACalculator();
      const eta = calculator.calculateETA(4, 4, 120_000);
      expect(eta).toBe(0);
    });

    it('returns -1 when no data available', () => {
      const calculator = new ETACalculator();
      const eta = calculator.calculateETA(0, 4, 0);
      expect(eta).toBe(-1);
    });

    it('uses task durations for weighted average', () => {
      const calculator = new ETACalculator();
      const durations = [10_000, 12_000, 8_000];
      const eta = calculator.calculateETA(3, 5, 30_000, durations);
      expect(eta).toBeGreaterThan(0);
      // 2 remaining tasks at weighted average
      expect(eta).toBeLessThan(30_000);
    });

    it('formats ETA as readable string', () => {
      const calculator = new ETACalculator();
      expect(calculator.formatETA(30_000)).toBe('~30s');
      expect(calculator.formatETA(120_000)).toBe('~2m');
      expect(calculator.formatETA(150_000)).toBe('~2m 30s');
      expect(calculator.formatETA(0)).toBe('~0s');
      expect(calculator.formatETA(-1)).toBe('calculating...');
    });
  });

  describe('ProgressRenderer generates output', () => {
    it('renders progress bar with correct percentage', () => {
      const renderer = new ProgressRenderer();
      const state: ProgressState = {
        totalTasks: 4,
        completedTasks: 2,
        activeTasks: [],
        queuedTasks: [],
        phase: SprintPhase.EXECUTE,
        elapsedMs: 60_000,
        etaMs: 60_000,
      };

      const output = renderer.render(state);
      expect(output).toContain('2/4');
      expect(output).toContain('50%');
    });

    it('renders active worker rows', () => {
      const renderer = new ProgressRenderer();
      const workers: WorkerProgressEntry[] = [
        { taskId: '032-001', workerId: 'w1', agentName: 'ts-expert', status: 'CODING', currentFile: 'src/test.ts', progressPercent: 25 },
        { taskId: '032-002', workerId: 'w2', agentName: 'generic', status: 'TESTING', currentFile: '', progressPercent: 65 },
      ];
      const state: ProgressState = {
        totalTasks: 4,
        completedTasks: 0,
        activeTasks: workers,
        queuedTasks: [],
        phase: SprintPhase.EXECUTE,
        elapsedMs: 30_000,
        etaMs: 120_000,
      };

      const output = renderer.render(state);
      expect(output).toContain('Active Workers');
      expect(output).toContain('w1');
      expect(output).toContain('w2');
      expect(output).toContain('CODING');
      expect(output).toContain('TESTING');
    });

    it('renders queued tasks section', () => {
      const renderer = new ProgressRenderer();
      const state: ProgressState = {
        totalTasks: 6,
        completedTasks: 1,
        activeTasks: [],
        queuedTasks: ['032-003', '032-004', '032-005'],
        phase: SprintPhase.EXECUTE,
        elapsedMs: 30_000,
        etaMs: 90_000,
      };

      const output = renderer.render(state);
      expect(output).toContain('Queued');
      expect(output).toContain('032-003');
    });

    it('shows ETA in progress bar', () => {
      const renderer = new ProgressRenderer();
      const state: ProgressState = {
        totalTasks: 4,
        completedTasks: 1,
        activeTasks: [],
        queuedTasks: [],
        phase: SprintPhase.EXECUTE,
        elapsedMs: 30_000,
        etaMs: 90_000,
      };

      const bar = renderer.renderBar(state);
      expect(bar).toContain('ETA');
      expect(bar).toContain('90s');
    });
  });

  // ═══ Full Progress Pipeline ═════════════════════════════════════════

  describe('Full progress pipeline: heartbeats -> tracker -> renderer', () => {
    it('reads heartbeats and renders progress for a 4-task sprint', () => {
      const tasksDir = join(tmpRoot, '.tasks');

      // Write heartbeats for 4 tasks: 1 done, 2 active, 1 pending (no hb)
      writeHeartbeat(tasksDir, '032-001', 'DONE', 'agent-a');
      writeHeartbeat(tasksDir, '032-002', 'CODING', 'agent-b');
      writeHeartbeat(tasksDir, '032-003', 'TESTING', 'agent-a');

      const tracker = new WorkerStatusTracker();
      const entries = tracker.pollWorkerStatus(tasksDir);

      const calculator = new ETACalculator();
      const etaMs = calculator.calculateETA(1, 4, 60_000);

      const activeTasks = entries.filter((e) => e.status !== 'DONE' && e.status !== 'STALE');
      const state: ProgressState = {
        totalTasks: 4,
        completedTasks: 1,
        activeTasks,
        queuedTasks: ['032-004'],
        phase: SprintPhase.EXECUTE,
        elapsedMs: 60_000,
        etaMs,
      };

      const renderer = new ProgressRenderer();
      const output = renderer.render(state);

      expect(output).toContain('1/4');
      expect(output).toContain('25%');
      expect(output).toContain('Active Workers');
      expect(output).toContain('Queued');
      expect(output).toContain('032-004');
    });
  });

  // ═══ Summary Flow ═══════════════════════════════════════════════════

  describe('RichSprintSummary generated after tasks complete', () => {
    it('renders results section with correct counts', () => {
      const sprint = makeSprint({
        tasks: [
          makeTask('032-001', 'Task A'),
          makeTask('032-002', 'Task B'),
          makeTask('032-003', 'Task C'),
          makeTask('032-004', 'Task D'),
        ],
      });

      const evaluations = new Map<string, TaskEvaluation>([
        ['032-001', TaskEvaluation.DONE],
        ['032-002', TaskEvaluation.DONE],
        ['032-003', TaskEvaluation.GO_WITH_TECH_DEBT],
        ['032-004', TaskEvaluation.NO_GO],
      ]);

      const results: TaskResult[] = [
        makeResult('032-001'),
        makeResult('032-002'),
        makeResult('032-003', { coverage: 70 }),
        makeResult('032-004', { coverage: 0, testsPassed: false, selfAssessment: 'NO_GO' }),
      ];

      const summary = new RichSprintSummary();
      const data: SprintSummaryData = { sprint, results, evaluations };
      const output = summary.format(data);

      expect(output).toContain('RESULTS');
      expect(output).toContain('2 DONE');
      expect(output).toContain('1 TECH_DEBT');
      expect(output).toContain('1 NO_GO');
    });

    it('renders changes section with file diff info', () => {
      const sprint = makeSprint({
        tasks: [makeTask('032-001', 'Task A')],
      });

      const evaluations = new Map<string, TaskEvaluation>([
        ['032-001', TaskEvaluation.DONE],
      ]);

      const results: TaskResult[] = [
        makeResult('032-001', {
          filesChanged: ['src/core/provider.ts', 'tests/core/provider.test.ts'],
          linesAdded: 150,
          linesRemoved: 10,
        }),
      ];

      const summary = new RichSprintSummary();
      const output = summary.format({ sprint, results, evaluations });

      expect(output).toContain('CHANGES');
      expect(output).toContain('src/core/provider.ts');
      expect(output).toContain('tests/core/provider.test.ts');
    });

    it('renders tests section with coverage', () => {
      const sprint = makeSprint({
        tasks: [makeTask('032-001', 'Task A'), makeTask('032-002', 'Task B')],
      });

      const evaluations = new Map<string, TaskEvaluation>([
        ['032-001', TaskEvaluation.DONE],
        ['032-002', TaskEvaluation.DONE],
      ]);

      const results: TaskResult[] = [
        makeResult('032-001', { coverage: 90 }),
        makeResult('032-002', { coverage: 80 }),
      ];

      const summary = new RichSprintSummary();
      const output = summary.format({ sprint, results, evaluations });

      expect(output).toContain('TESTS');
      expect(output).toContain('2/2');
      expect(output).toContain('85.0%');
    });
  });

  describe('SprintComparison with previous sprint', () => {
    it('calculates coverage delta between two sprints', () => {
      const current: SprintMetrics = {
        totalTasks: 4, completedTasks: 3, techDebtTasks: 1, noGoTasks: 0,
        durationMs: 120_000, coveragePercent: 88.5, noGoRate: 0,
        newDebtCount: 1, resolvedDebtCount: 0, totalOpenDebt: 3,
        boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
      };

      const previous: SprintMetrics = {
        totalTasks: 3, completedTasks: 2, techDebtTasks: 0, noGoTasks: 1,
        durationMs: 100_000, coveragePercent: 82.0, noGoRate: 33.3,
        newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 2,
        boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
      };

      const comparison = new SprintComparison();
      const delta = comparison.compare(current, previous);

      expect(delta.isFirst).toBe(false);
      expect(delta.coverageDelta).toBeCloseTo(6.5, 1);
      expect(delta.noGoRateDelta).toBeCloseTo(-33.3, 1);
      expect(delta.taskCountDelta).toBe(1);
    });

    it('returns isFirst=true when no previous sprint', () => {
      const current: SprintMetrics = {
        totalTasks: 4, completedTasks: 4, techDebtTasks: 0, noGoTasks: 0,
        durationMs: 120_000, coveragePercent: 90, noGoRate: 0,
        newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
        boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
      };

      const comparison = new SprintComparison();
      const delta = comparison.compare(current, null);

      expect(delta.isFirst).toBe(true);
      expect(delta.coverageDelta).toBe(0);
    });

    it('formats delta as human-readable string', () => {
      const comparison = new SprintComparison();
      const delta: SprintDelta = {
        coverageDelta: 6.5,
        durationDelta: -20_000,
        noGoRateDelta: -10,
        taskCountDelta: 2,
        debtDelta: -1,
        isFirst: false,
      };

      const output = comparison.formatDelta(delta);
      expect(output).toContain('Sprint Comparison');
      expect(output).toContain('Coverage');
      expect(output).toContain('+6.5%');
    });

    it('formats first sprint with no comparison message', () => {
      const comparison = new SprintComparison();
      const delta: SprintDelta = {
        coverageDelta: 0, durationDelta: 0, noGoRateDelta: 0,
        taskCountDelta: 0, debtDelta: 0, isFirst: true,
      };
      const output = comparison.formatDelta(delta);
      expect(output).toContain('First sprint');
    });
  });

  describe('ChangeCategorizer groups files', () => {
    it('categorizes source, test, config, and docs files', () => {
      const categorizer = new ChangeCategorizer();
      const files: FileChange[] = [
        { filePath: 'src/core/provider.ts', linesAdded: 100, linesRemoved: 0 },
        { filePath: 'tests/core/provider.test.ts', linesAdded: 80, linesRemoved: 0 },
        { filePath: 'tsconfig.json', linesAdded: 2, linesRemoved: 1 },
        { filePath: 'docs/guide.md', linesAdded: 30, linesRemoved: 5 },
      ];

      const categories = categorizer.categorize(files);

      expect(categories.get('source')).toHaveLength(1);
      expect(categories.get('test')).toHaveLength(1);
      expect(categories.get('config')).toHaveLength(1);
      expect(categories.get('docs')).toHaveLength(1);
    });

    it('formats categorized changes with section headers', () => {
      const categorizer = new ChangeCategorizer();
      const files: FileChange[] = [
        { filePath: 'src/core/provider.ts', linesAdded: 100, linesRemoved: 10 },
        { filePath: 'src/core/types.ts', linesAdded: 20, linesRemoved: 5 },
        { filePath: 'tests/core/provider.test.ts', linesAdded: 80, linesRemoved: 0 },
      ];

      const categories = categorizer.categorize(files);
      const output = categorizer.formatCategorized(categories);

      expect(output).toContain('SOURCE');
      expect(output).toContain('TEST');
      expect(output).toContain('src/core/provider.ts');
    });

    it('returns "No changes" when no files', () => {
      const categorizer = new ChangeCategorizer();
      const output = categorizer.formatCategorized(new Map());
      expect(output).toBe('No changes');
    });
  });

  describe('AgentPerformanceFormatter shows per-agent stats', () => {
    it('groups tasks by agent and calculates success rate', () => {
      const formatter = new AgentPerformanceFormatter();
      const evaluations = new Map<string, TaskEvaluation | string>([
        ['032-001', 'DONE'],
        ['032-002', 'DONE'],
        ['032-003', 'NO_GO'],
        ['032-004', 'GO_WITH_TECH_DEBT'],
      ]);
      const taskAgentMap = new Map([
        ['032-001', 'ts-expert'],
        ['032-002', 'ts-expert'],
        ['032-003', 'generic'],
        ['032-004', 'generic'],
      ]);

      const output = formatter.format(evaluations, taskAgentMap);

      expect(output).toContain('ts-expert');
      expect(output).toContain('generic');
      expect(output).toContain('2/2');
      expect(output).toContain('100%');
    });

    it('highlights underperforming agents', () => {
      const formatter = new AgentPerformanceFormatter();
      const evaluations = new Map<string, TaskEvaluation | string>([
        ['032-001', 'DONE'],
        ['032-002', 'NO_GO'],
        ['032-003', 'NO_GO'],
      ]);
      const taskAgentMap = new Map([
        ['032-001', 'agent-a'],
        ['032-002', 'agent-b'],
        ['032-003', 'agent-b'],
      ]);

      const output = formatter.format(evaluations, taskAgentMap);
      expect(output).toContain('UNDERPERFORMER');
    });

    it('returns informative message when no data', () => {
      const formatter = new AgentPerformanceFormatter();
      const output = formatter.format(new Map(), new Map());
      expect(output).toContain('No agent performance data');
    });
  });

  describe('RecommendationEngine produces suggestions', () => {
    it('generates NO_GO fix recommendation', () => {
      const engine = new RecommendationEngine();
      const input: RecommendationInput = {
        metrics: {
          totalTasks: 4, completedTasks: 3, techDebtTasks: 0, noGoTasks: 1,
          durationMs: 120_000, coveragePercent: 85, noGoRate: 25,
          newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
          boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
        },
        evaluations: new Map([
          ['032-001', 'DONE'],
          ['032-002', 'DONE'],
          ['032-003', 'DONE'],
          ['032-004', 'NO_GO'],
        ]),
        agentPerformance: [],
      };

      const recs = engine.generate(input);
      const fixRec = recs.find((r) => r.type === 'fix');
      expect(fixRec).toBeTruthy();
      expect(fixRec!.message).toContain('NO_GO');
      expect(fixRec!.message).toContain('032-004');
    });

    it('generates tech debt warning', () => {
      const engine = new RecommendationEngine();
      const input: RecommendationInput = {
        metrics: {
          totalTasks: 4, completedTasks: 4, techDebtTasks: 2, noGoTasks: 0,
          durationMs: 120_000, coveragePercent: 85, noGoRate: 0,
          newDebtCount: 2, resolvedDebtCount: 0, totalOpenDebt: 2,
          boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
        },
        evaluations: new Map([
          ['032-001', 'DONE'],
          ['032-002', 'GO_WITH_TECH_DEBT'],
          ['032-003', 'GO_WITH_TECH_DEBT'],
          ['032-004', 'DONE'],
        ]),
        agentPerformance: [],
      };

      const recs = engine.generate(input);
      const debtRec = recs.find((r) => r.type === 'warning');
      expect(debtRec).toBeTruthy();
      expect(debtRec!.message).toContain('tech debt');
    });

    it('generates underperformer agent suggestion', () => {
      const engine = new RecommendationEngine();
      const input: RecommendationInput = {
        metrics: {
          totalTasks: 4, completedTasks: 2, techDebtTasks: 0, noGoTasks: 2,
          durationMs: 120_000, coveragePercent: 85, noGoRate: 50,
          newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
          boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
        },
        evaluations: new Map([
          ['032-001', 'DONE'],
          ['032-002', 'DONE'],
          ['032-003', 'NO_GO'],
          ['032-004', 'NO_GO'],
        ]),
        agentPerformance: [
          { agentId: 'good-agent', totalTasks: 2, doneTasks: 2, techDebtTasks: 0, noGoTasks: 0, successRate: 100 },
          { agentId: 'bad-agent', totalTasks: 2, doneTasks: 0, techDebtTasks: 0, noGoTasks: 2, successRate: 0 },
        ],
      };

      const recs = engine.generate(input);
      const agentRec = recs.find((r) => r.type === 'suggestion');
      expect(agentRec).toBeTruthy();
      expect(agentRec!.message).toContain('bad-agent');
    });

    it('generates coverage regression warning', () => {
      const engine = new RecommendationEngine();
      const input: RecommendationInput = {
        metrics: {
          totalTasks: 4, completedTasks: 4, techDebtTasks: 0, noGoTasks: 0,
          durationMs: 120_000, coveragePercent: 75, noGoRate: 0,
          newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
          boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
        },
        evaluations: new Map([
          ['032-001', 'DONE'],
          ['032-002', 'DONE'],
          ['032-003', 'DONE'],
          ['032-004', 'DONE'],
        ]),
        agentPerformance: [],
        previousCoverage: 85,
      };

      const recs = engine.generate(input);
      const regRec = recs.find((r) => r.type === 'regression');
      expect(regRec).toBeTruthy();
      expect(regRec!.message).toContain('regressed');
    });

    it('limits recommendations to 5', () => {
      const engine = new RecommendationEngine();
      const evaluations = new Map<string, string>();
      for (let i = 1; i <= 10; i++) {
        evaluations.set(`task-${i}`, i <= 3 ? 'DONE' : 'NO_GO');
      }

      const input: RecommendationInput = {
        metrics: {
          totalTasks: 10, completedTasks: 3, techDebtTasks: 0, noGoTasks: 7,
          durationMs: 300_000, coveragePercent: 40, noGoRate: 70,
          newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 5,
          boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
        },
        evaluations,
        agentPerformance: [
          { agentId: 'agent-x', totalTasks: 7, doneTasks: 0, techDebtTasks: 0, noGoTasks: 7, successRate: 0 },
        ],
        previousCoverage: 80,
      };

      const recs = engine.generate(input);
      expect(recs.length).toBeLessThanOrEqual(5);
    });

    it('generates success message when all done', () => {
      const engine = new RecommendationEngine();
      const input: RecommendationInput = {
        metrics: {
          totalTasks: 3, completedTasks: 3, techDebtTasks: 0, noGoTasks: 0,
          durationMs: 60_000, coveragePercent: 95, noGoRate: 0,
          newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
          boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
        },
        evaluations: new Map([
          ['032-001', 'DONE'],
          ['032-002', 'DONE'],
          ['032-003', 'DONE'],
        ]),
        agentPerformance: [],
      };

      const recs = engine.generate(input);
      const successRec = recs.find((r) => r.type === 'success');
      expect(successRec).toBeTruthy();
      expect(successRec!.message).toContain('successfully');
    });
  });

  // ═══ Full E2E Pipeline ══════════════════════════════════════════════

  describe('Full E2E: heartbeats -> progress -> completion -> summary', () => {
    it('simulates entire sprint lifecycle from progress to summary', () => {
      const tasksDir = join(tmpRoot, '.tasks');

      // Phase 1: Active sprint with heartbeats
      writeHeartbeat(tasksDir, '032-001', 'TESTING', 'agent-a');
      writeHeartbeat(tasksDir, '032-002', 'CODING', 'agent-b');
      writeHeartbeat(tasksDir, '032-003', 'CODING', 'agent-a');

      const tracker = new WorkerStatusTracker();
      const entries = tracker.pollWorkerStatus(tasksDir);
      expect(entries.length).toBeGreaterThanOrEqual(3);

      const calculator = new ETACalculator();
      const etaMs = calculator.calculateETA(0, 4, 30_000);

      // Phase 2: Tasks complete - build summary
      const sprint = makeSprint({
        tasks: [
          makeTask('032-001', 'Provider interface', { assignedAgent: 'agent-a' }),
          makeTask('032-002', 'Subprocess backend', { assignedAgent: 'agent-b' }),
          makeTask('032-003', 'Coverage validator', { assignedAgent: 'agent-a' }),
          makeTask('032-004', 'Usage tracker', { assignedAgent: 'agent-b' }),
        ],
        completedAt: new Date().toISOString(),
      });

      const evaluations = new Map<string, TaskEvaluation>([
        ['032-001', TaskEvaluation.DONE],
        ['032-002', TaskEvaluation.DONE],
        ['032-003', TaskEvaluation.GO_WITH_TECH_DEBT],
        ['032-004', TaskEvaluation.NO_GO],
      ]);

      const results: TaskResult[] = [
        makeResult('032-001', { agentId: 'agent-a', coverage: 90 }),
        makeResult('032-002', { agentId: 'agent-b', coverage: 85 }),
        makeResult('032-003', { agentId: 'agent-a', coverage: 70 }),
        makeResult('032-004', { agentId: 'agent-b', coverage: 0, testsPassed: false, selfAssessment: 'NO_GO' }),
      ];

      // RichSprintSummary
      const summaryFormatter = new RichSprintSummary();
      const summaryOutput = summaryFormatter.format({ sprint, results, evaluations });
      expect(summaryOutput).toContain('RESULTS');
      expect(summaryOutput).toContain('CHANGES');
      expect(summaryOutput).toContain('TESTS');

      // ChangeCategorizer
      const categorizer = new ChangeCategorizer();
      const allFiles: FileChange[] = results.flatMap((r) =>
        r.filesChanged.map((f) => ({ filePath: f, linesAdded: r.linesAdded, linesRemoved: r.linesRemoved })),
      );
      const categories = categorizer.categorize(allFiles);
      expect(categories.size).toBeGreaterThan(0);

      // AgentPerformanceFormatter
      const agentFormatter = new AgentPerformanceFormatter();
      const taskAgentMap = new Map([
        ['032-001', 'agent-a'],
        ['032-002', 'agent-b'],
        ['032-003', 'agent-a'],
        ['032-004', 'agent-b'],
      ]);
      const perfOutput = agentFormatter.format(evaluations, taskAgentMap);
      expect(perfOutput).toContain('agent-a');
      expect(perfOutput).toContain('agent-b');

      // RecommendationEngine
      const recEngine = new RecommendationEngine();
      const agentStats = agentFormatter.calculateStats(
        agentFormatter.groupByAgent(evaluations, taskAgentMap),
      );
      const recommendations = recEngine.generate({
        metrics: {
          totalTasks: 4, completedTasks: 3, techDebtTasks: 1, noGoTasks: 1,
          durationMs: 120_000, coveragePercent: 61.25, noGoRate: 25,
          newDebtCount: 1, resolvedDebtCount: 0, totalOpenDebt: 1,
          boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
        },
        evaluations,
        agentPerformance: agentStats,
      });
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some((r) => r.type === 'fix')).toBe(true);

      // SprintComparison
      const comparison = new SprintComparison();
      const previousMetrics: SprintMetrics = {
        totalTasks: 3, completedTasks: 3, techDebtTasks: 0, noGoTasks: 0,
        durationMs: 90_000, coveragePercent: 80, noGoRate: 0,
        newDebtCount: 0, resolvedDebtCount: 0, totalOpenDebt: 0,
        boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
      };
      const delta = comparison.compare(
        {
          totalTasks: 4, completedTasks: 3, techDebtTasks: 1, noGoTasks: 1,
          durationMs: 120_000, coveragePercent: 61.25, noGoRate: 25,
          newDebtCount: 1, resolvedDebtCount: 0, totalOpenDebt: 1,
          boundaryViolations: 0, crossAssignments: 0, contextLinesUsed: 0,
        },
        previousMetrics,
      );
      expect(delta.isFirst).toBe(false);
      expect(delta.coverageDelta).toBeLessThan(0);
      expect(delta.noGoRateDelta).toBeGreaterThan(0);
    });
  });
});
