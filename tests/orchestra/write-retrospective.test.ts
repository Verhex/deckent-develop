import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRetrospective } from '../../src/orchestra/sprint-reporter.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import { MEMORY_DB_FILE, BRAIN_DIR } from '../../src/core/constants.js';
import { TaskEvaluation, SprintStatus, SprintPhase } from '../../src/core/types.js';
import type { Sprint, Task, SprintMetrics, TaskResult } from '../../src/core/types.js';

// B8 (Memory V2): writeRetrospective persists the retrospective, the sprint
// metadata and the per-sprint learnings ONLY to memory.db — the legacy
// `.brain/RETRO.md` and `.brain/MEMORY.md` files are no longer written.

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
    id: 'sprint-201',
    number: 201,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.RETRO,
    tasks: [makeTask()],
    workers: ['w-001'],
    startedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    completedAt: new Date('2026-01-01T01:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 3,
    completedTasks: 2,
    techDebtTasks: 1,
    noGoTasks: 0,
    durationMs: 3_600_000,
    coveragePercent: 85,
    noGoRate: 0,
    newDebtCount: 1,
    resolvedDebtCount: 0,
    totalOpenDebt: 1,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

function makeResult(taskId: string, overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/foo.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'done',
    ...overrides,
  };
}

describe('writeRetrospective — Memory V2 DB-first (B8)', () => {
  let root: string;
  let dbPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'write-retro-'));
    mkdirSync(join(root, BRAIN_DIR), { recursive: true });
    dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
    new MemoryStore(dbPath).close();
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function read(id: string) {
    const store = new MemoryStore(dbPath);
    try {
      return store.getById(id);
    } finally {
      store.close();
    }
  }

  it('writes a `retro` entry for the sprint', () => {
    const sprint = makeSprint();
    writeRetrospective(root, sprint, new Map([['001', TaskEvaluation.DONE]]), makeMetrics());

    const retro = read('retro-sprint-201');
    expect(retro).not.toBeNull();
    expect(retro!.type).toBe('retro');
    expect(retro!.sprint_id).toBe('sprint-201');
    expect(retro!.content.length).toBeGreaterThan(0);
  });

  it('writes a `sprint` metadata entry with the canonical sprint-log id', () => {
    writeRetrospective(root, makeSprint(), new Map([['001', TaskEvaluation.DONE]]), makeMetrics());

    const sprintEntry = read('sprint-log-201');
    expect(sprintEntry).not.toBeNull();
    expect(sprintEntry!.type).toBe('sprint');
  });

  it('writes a `memory` learnings entry containing tech-debt / no-go tasks only', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '001', title: 'Done task' }),
        makeTask({ id: '002', title: 'Debt task' }),
        makeTask({ id: '003', title: 'Failed task' }),
      ],
    });
    const evaluations = new Map<string, TaskEvaluation>([
      ['001', TaskEvaluation.DONE],
      ['002', TaskEvaluation.GO_WITH_TECH_DEBT],
      ['003', TaskEvaluation.NO_GO],
    ]);
    writeRetrospective(root, sprint, evaluations, makeMetrics(), undefined, undefined, [
      makeResult('002', { selfAssessment: 'GO_WITH_TECH_DEBT', notes: 'left a TODO' }),
      makeResult('003', { selfAssessment: 'NO_GO', notes: 'tests failed' }),
    ]);

    const mem = read('mem-sprint-201');
    expect(mem).not.toBeNull();
    expect(mem!.type).toBe('memory');
    expect(mem!.content).toContain('Debt task');
    expect(mem!.content).toContain('Failed task');
    expect(mem!.content).not.toContain('Done task');
  });

  it('does not duplicate the learnings entry when called twice for the same sprint', () => {
    const sprint = makeSprint();
    writeRetrospective(root, sprint, new Map([['001', TaskEvaluation.DONE]]), makeMetrics());
    writeRetrospective(root, sprint, new Map([['001', TaskEvaluation.DONE]]), makeMetrics());

    const store = new MemoryStore(dbPath);
    try {
      const memEntries = store.getByType('memory').filter(e => e.id === 'mem-sprint-201');
      expect(memEntries).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it('does not throw when memory.db is absent', () => {
    const freshRoot = mkdtempSync(join(tmpdir(), 'write-retro-nodb-'));
    try {
      expect(() =>
        writeRetrospective(freshRoot, makeSprint(), new Map([['001', TaskEvaluation.DONE]]), makeMetrics()),
      ).not.toThrow();
    } finally {
      rmSync(freshRoot, { recursive: true, force: true });
    }
  });
});
