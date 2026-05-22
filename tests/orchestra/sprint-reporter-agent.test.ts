import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  writeRetrospective,
  buildAgentPerformance,
  formatAgentPerformanceTable,
} from '../../src/orchestra/sprint-reporter.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { MEMORY_DB_FILE } from '../../src/core/constants.js';
import { TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult, SprintMetrics } from '../../src/core/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(tmpdir(), `sr-agent-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Test reason',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE',
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-029',
    number: 29,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.RETRO,
    tasks: [makeTask()],
    workers: ['w-001'],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 1,
    completedTasks: 1,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 10000,
    coveragePercent: 90,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

// ─── buildAgentPerformance ──────────────────────────────────────────────

describe('buildAgentPerformance', () => {
  it('groups tasks by assignedAgent', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001', assignedAgent: 'security-auditor' }),
        makeTask({ id: '002', assignedAgent: 'security-auditor' }),
        makeTask({ id: '003', assignedAgent: 'generic' }),
      ],
    });
    const evaluations = new Map<string, TaskEvaluation>([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['003', TaskEvaluation.NO_GO],
    ]);
    const rows = buildAgentPerformance(sprint, evaluations, []);
    expect(rows).toHaveLength(2);

    const secRow = rows.find(r => r.agent === 'security-auditor');
    expect(secRow).toBeDefined();
    expect(secRow!.tasks).toBe(2);
    expect(secRow!.done).toBe(2); // DONE + GO_WITH_TECH_DEBT both count as done
    expect(secRow!.debt).toBe(1);
    expect(secRow!.noGo).toBe(0);

    const genRow = rows.find(r => r.agent === 'generic');
    expect(genRow).toBeDefined();
    expect(genRow!.tasks).toBe(1);
    expect(genRow!.noGo).toBe(1);
  });

  it('uses agentMap when provided instead of task.assignedAgent', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001', assignedAgent: 'old-agent' }),
        makeTask({ id: '002', assignedAgent: 'old-agent' }),
      ],
    });
    const evaluations = new Map<string, TaskEvaluation>([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.DONE],
    ]);
    const agentMap = new Map([['001', 'new-agent'], ['002', 'new-agent']]);
    const rows = buildAgentPerformance(sprint, evaluations, [], agentMap);
    expect(rows).toHaveLength(1);
    expect(rows[0].agent).toBe('new-agent');
  });

  it('defaults to generic when no assignedAgent and no agentMap', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001', assignedAgent: undefined })],
    });
    const evaluations = new Map([['001', TaskEvaluation.DONE]]);
    const rows = buildAgentPerformance(sprint, evaluations, []);
    expect(rows[0].agent).toBe('generic');
  });

  it('calculates avgCoverage from results', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001', assignedAgent: 'agent-a' }),
        makeTask({ id: '002', assignedAgent: 'agent-a' }),
      ],
    });
    const evaluations = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.DONE],
    ]);
    const results: TaskResult[] = [
      { taskId: '001', workerId: 'w-001', filesChanged: [], linesAdded: 0, linesRemoved: 0, testsPassed: true, coverage: 80, selfAssessment: 'DONE', notes: '' },
      { taskId: '002', workerId: 'w-002', filesChanged: [], linesAdded: 0, linesRemoved: 0, testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: '' },
    ];
    const rows = buildAgentPerformance(sprint, evaluations, results);
    expect(rows[0].avgCoverage).toBe(90); // (80+100)/2 = 90
  });

  it('returns 0 avgCoverage when no results', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001', assignedAgent: 'agent-x' })],
    });
    const evaluations = new Map([['001', TaskEvaluation.DONE]]);
    const rows = buildAgentPerformance(sprint, evaluations, []);
    expect(rows[0].avgCoverage).toBe(0);
  });

  it('sorts rows by task count descending', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001', assignedAgent: 'many-tasks' }),
        makeTask({ id: '002', assignedAgent: 'many-tasks' }),
        makeTask({ id: '003', assignedAgent: 'many-tasks' }),
        makeTask({ id: '004', assignedAgent: 'few-tasks' }),
      ],
    });
    const evaluations = new Map([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.DONE],
      ['003', TaskEvaluation.DONE],
      ['004', TaskEvaluation.DONE],
    ]);
    const rows = buildAgentPerformance(sprint, evaluations, []);
    expect(rows[0].agent).toBe('many-tasks');
    expect(rows[1].agent).toBe('few-tasks');
  });

  it('returns empty array for sprint with no tasks', () => {
    const sprint = makeSprint({ tasks: [] });
    const evaluations = new Map<string, TaskEvaluation>();
    const rows = buildAgentPerformance(sprint, evaluations, []);
    expect(rows).toHaveLength(0);
  });
});

// ─── formatAgentPerformanceTable ────────────────────────────────────────

describe('formatAgentPerformanceTable', () => {
  it('returns empty array for empty rows', () => {
    expect(formatAgentPerformanceTable([])).toEqual([]);
  });

  it('generates markdown table with header', () => {
    const rows = [
      { agent: 'security-auditor', tasks: 2, done: 2, debt: 0, noGo: 0, avgCoverage: 95 },
    ];
    const lines = formatAgentPerformanceTable(rows);
    expect(lines).toContain('## Agent Performance');
    expect(lines).toContain('| Agent | Tasks | Done | Debt | NoGo | Avg Coverage |');
    expect(lines).toContain('|-------|-------|------|------|------|-------------|');
    expect(lines.some(l => l.includes('security-auditor'))).toBe(true);
    expect(lines.some(l => l.includes('95%'))).toBe(true);
  });

  it('generates correct row format', () => {
    const rows = [
      { agent: 'test-agent', tasks: 5, done: 3, debt: 1, noGo: 1, avgCoverage: 88 },
    ];
    const lines = formatAgentPerformanceTable(rows);
    const dataRow = lines.find(l => l.includes('test-agent'));
    expect(dataRow).toBe('| test-agent | 5 | 3 | 1 | 1 | 88% |');
  });

  it('generates multiple rows', () => {
    const rows = [
      { agent: 'a1', tasks: 3, done: 3, debt: 0, noGo: 0, avgCoverage: 100 },
      { agent: 'a2', tasks: 2, done: 1, debt: 1, noGo: 0, avgCoverage: 75 },
    ];
    const lines = formatAgentPerformanceTable(rows);
    const dataLines = lines.filter(l => l.startsWith('| ') && !l.includes('Agent') && !l.includes('---'));
    expect(dataLines).toHaveLength(2);
  });
});

// ─── writeRetrospective — agent performance section ─────────────────────

describe('writeRetrospective — agent performance section', () => {
  // B8: writeRetrospective writes the retro to memory.db (`retro-<id>` entry),
  // not the legacy .brain/RETRO.md file — assertions read the DB entry.
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, '.brain'), { recursive: true });
    dbPath = join(tempDir, '.brain', MEMORY_DB_FILE);
    new MemoryStore(dbPath).close();
  });

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true }); } catch { /* ignore */ }
  });

  function readRetro(sprintId: string): string {
    const store = new MemoryStore(dbPath);
    try {
      return store.getById(`retro-${sprintId}`)?.content ?? '';
    } finally {
      store.close();
    }
  }

  it('includes agent performance table in the retro entry', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001', assignedAgent: 'security-auditor' }),
        makeTask({ id: '002', assignedAgent: 'generic' }),
      ],
    });
    const evaluations = new Map<string, TaskEvaluation>([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.GO_WITH_TECH_DEBT],
    ]);
    const metrics = makeMetrics({ totalTasks: 2, completedTasks: 2 });

    writeRetrospective(tempDir, sprint, evaluations, metrics);

    const retro = readRetro(sprint.id);
    expect(retro).toContain('## Agent Performance');
    expect(retro).toContain('security-auditor');
    expect(retro).toContain('generic');
  });

  it('includes agent performance using agentMap', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '001' })],
    });
    const evaluations = new Map([['001', TaskEvaluation.DONE]]);
    const metrics = makeMetrics();
    const agentMap = new Map([['001', 'custom-agent']]);

    writeRetrospective(tempDir, sprint, evaluations, metrics, agentMap);

    expect(readRetro(sprint.id)).toContain('custom-agent');
  });

  it('writes the retro entry without an agent section when no tasks have agents', () => {
    const sprint = makeSprint({ tasks: [] });
    const evaluations = new Map<string, TaskEvaluation>();
    const metrics = makeMetrics({ totalTasks: 0, completedTasks: 0 });

    writeRetrospective(tempDir, sprint, evaluations, metrics);

    expect(readRetro(sprint.id)).not.toContain('## Agent Performance');
  });
});
