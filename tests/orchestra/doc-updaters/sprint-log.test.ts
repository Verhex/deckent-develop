import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sprintLogUpdater } from '../../../src/orchestra/doc-updaters/sprint-log.js';
import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import type { Sprint, SprintMetrics } from '../../../src/core/types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function makeCtx(overrides: Partial<DocUpdateContext> = {}): DocUpdateContext {
  const sprint: Sprint = {
    id: 'sprint-003', number: 3, status: SprintStatus.COMPLETE, phase: SprintPhase.COMPLETE,
    tasks: [
      { id: '003-001', title: 'Task A', description: 'd', model: 'sonnet', effort: 'normal',
        priority: 'NORMAL', reason: 'r', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [], goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
        status: TaskStatus.DONE, sprintId: 'sprint-003' },
      { id: '003-002', title: 'Task B', description: 'd', model: 'haiku', effort: 'low',
        priority: 'LOW', reason: 'r', scope: { directories: ['tests/'], filesRead: [], filesWrite: [] },
        dependencies: [], goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
        status: TaskStatus.DONE, sprintId: 'sprint-003' },
    ],
    workers: ['w-1', 'w-2'],
  };
  const metrics: SprintMetrics = {
    totalTasks: 2, completedTasks: 2, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 60000, coveragePercent: 88.5, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  };
  return {
    projectRoot: '/proj',
    sprintResult: {
      sprint, metrics,
      evaluations: new Map([['003-001', TaskEvaluation.DONE], ['003-002', TaskEvaluation.DONE]]),
    },
    config: {
      mode: 'max_plan' as const, activeModeConfig: {} as any, modes: {} as any,
      language: 'en', projectName: 'test', projectRoot: '/proj', version: '0.0.0',
      auto_docs: { tier1: true, tier2: false, tier3: false },
    },
    isInternalProject: false,
    ...overrides,
  };
}

describe('sprintLogUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockReturnValue('');
  });

  it('has correct metadata', () => {
    expect(sprintLogUpdater.name).toBe('sprint-log');
    expect(sprintLogUpdater.tier).toBe(1);
    expect(sprintLogUpdater.internal).toBe(false);
  });

  it('shouldRun returns true by default', () => {
    expect(sprintLogUpdater.shouldRun(makeCtx())).toBe(true);
  });

  it('shouldRun returns false when tier1 disabled', () => {
    const ctx = makeCtx();
    ctx.config.auto_docs = { tier1: false, tier2: false, tier3: false };
    expect(sprintLogUpdater.shouldRun(ctx)).toBe(false);
  });

  it('creates new sprint log when file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = sprintLogUpdater.run(makeCtx());
    expect(result.updated).toBe(true);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('# Sprint Log');
    expect(written).toContain('Sprint 3');
    expect(written).toContain('sprint-003');
  });

  it('appends to existing sprint log', () => {
    const existing = '# Sprint Log\n\n---\n\n## Sprint 2\n\nOld\n';
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(existing);

    sprintLogUpdater.run(makeCtx());

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('Sprint 2');
    expect(written).toContain('Sprint 3');
  });

  it('includes metric table', () => {
    sprintLogUpdater.run(makeCtx());
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('| Total Tasks | 2 |');
    expect(written).toContain('| Completed | 2 |');
    expect(written).toContain('| Coverage | 88.5% |');
  });

  it('includes task list with evaluations', () => {
    sprintLogUpdater.run(makeCtx());
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('003-001: Task A (DONE)');
    expect(written).toContain('003-002: Task B (DONE)');
  });
});
