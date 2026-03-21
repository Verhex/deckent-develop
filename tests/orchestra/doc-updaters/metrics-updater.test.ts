import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sprintMetricsUpdater } from '../../../src/orchestra/doc-updaters/metrics-updater.js';
import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import type { Sprint, SprintMetrics } from '../../../src/core/types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function makeCtx(overrides: Partial<DocUpdateContext> = {}): DocUpdateContext {
  const sprint: Sprint = {
    id: 'sprint-015', number: 15, status: SprintStatus.COMPLETE, phase: SprintPhase.COMPLETE,
    tasks: [{ id: '015-001', title: 'T', description: 'd', model: 'sonnet', effort: 'normal',
      priority: 'NORMAL', reason: 'r', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
      status: TaskStatus.DONE, sprintId: 'sprint-015' }],
    workers: ['w-1'],
  };
  const metrics: SprintMetrics = {
    totalTasks: 10, completedTasks: 8, techDebtTasks: 1, noGoTasks: 1,
    durationMs: 60000, coveragePercent: 90.0, noGoRate: 0.1, newDebtCount: 1,
    resolvedDebtCount: 0, totalOpenDebt: 2, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  };
  return {
    projectRoot: '/proj',
    sprintResult: { sprint, evaluations: new Map([['015-001', TaskEvaluation.DONE]]), metrics },
    config: {
      mode: 'max_plan' as const, activeModeConfig: {} as any, modes: {} as any,
      language: 'en', projectName: 'test', projectRoot: '/proj', version: '0.0.0',
      auto_docs: { tier1: true, tier2: true, tier3: false },
    },
    isInternalProject: false,
    ...overrides,
  };
}

describe('sprintMetricsUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
  });

  it('has correct metadata', () => {
    expect(sprintMetricsUpdater.name).toBe('sprint-metrics');
    expect(sprintMetricsUpdater.tier).toBe(2);
    expect(sprintMetricsUpdater.internal).toBe(false);
    expect(sprintMetricsUpdater.targetFile).toBe('README.md');
  });

  it('shouldRun returns true when tier2 enabled and README exists', () => {
    mockedExistsSync.mockReturnValue(true);
    expect(sprintMetricsUpdater.shouldRun(makeCtx())).toBe(true);
  });

  it('shouldRun returns false when tier2 disabled', () => {
    mockedExistsSync.mockReturnValue(true);
    const ctx = makeCtx();
    ctx.config.auto_docs = { tier1: true, tier2: false, tier3: false };
    expect(sprintMetricsUpdater.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns false when no README', () => {
    mockedExistsSync.mockReturnValue(false);
    expect(sprintMetricsUpdater.shouldRun(makeCtx())).toBe(false);
  });

  it('run updates sprint count in README', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\n8 sprints completed\n');

    const result = sprintMetricsUpdater.run(makeCtx());

    expect(result.updated).toBe(true);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('15 sprints completed');
  });

  it('run updates task count', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\n50 tasks completed\n');

    const result = sprintMetricsUpdater.run(makeCtx());

    expect(result.updated).toBe(true);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    // completedTasks(8) + techDebtTasks(1) = 9
    expect(written).toContain('9 tasks completed');
  });

  it('run updates success rate (prefix format)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\nsuccess rate: 70%\n');

    const result = sprintMetricsUpdater.run(makeCtx());

    expect(result.updated).toBe(true);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    // (8+1)/10 = 90%
    expect(written).toContain('success rate: 90%');
  });

  it('run updates success rate (suffix format)', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\n70% success rate\n');

    const result = sprintMetricsUpdater.run(makeCtx());

    expect(result.updated).toBe(true);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('90% success rate');
  });

  it('run returns updated:false when no changes needed', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\nJust a plain README with no metric patterns.\n');

    const result = sprintMetricsUpdater.run(makeCtx());

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('skipped_no_changes');
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('run returns updated:false when README not found', () => {
    mockedExistsSync.mockReturnValue(false);

    const result = sprintMetricsUpdater.run(makeCtx());

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('skipped_not_found');
  });

  it('run handles README without metric patterns gracefully', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# My Project\n\nThis is a project.\n\n## Features\n- Feature A\n');

    const result = sprintMetricsUpdater.run(makeCtx());

    expect(result.updated).toBe(false);
    expect(result.reason).toBe('skipped_no_changes');
    expect(mockedWriteFileSync).not.toHaveBeenCalled();
  });

  it('run preserves other README content', () => {
    mockedExistsSync.mockReturnValue(true);
    const original = '# My Project\n\n## About\nGreat project.\n\n## Stats\n5 sprints completed | 30 tasks completed\n\n## License\nMIT\n';
    mockedReadFileSync.mockReturnValue(original);

    sprintMetricsUpdater.run(makeCtx());

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('# My Project');
    expect(written).toContain('## About');
    expect(written).toContain('Great project.');
    expect(written).toContain('## License');
    expect(written).toContain('MIT');
    expect(written).toContain('15 sprints completed');
    expect(written).toContain('9 tasks completed');
  });

  it('run updates usage data when present in sprintResult', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\n100 API calls | 50000 tokens used\n');

    const ctx = makeCtx();
    (ctx.sprintResult as Record<string, unknown>).usageData = { totalCalls: 250, totalTokens: 120000 };

    const result = sprintMetricsUpdater.run(ctx);

    expect(result.updated).toBe(true);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('250 API calls');
    expect(written).toContain('120000 tokens used');
  });

  it('run updates test count based on totalTasks', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\n500+ tests\n');

    const result = sprintMetricsUpdater.run(makeCtx());

    expect(result.updated).toBe(true);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    // totalTasks(10) * 10 = 100
    expect(written).toContain('100+ tests');
  });
});
