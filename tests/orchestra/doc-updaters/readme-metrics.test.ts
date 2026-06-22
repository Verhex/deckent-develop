import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readmeMetricsUpdater } from '../../../src/orchestra/doc-updaters/readme-metrics.js';
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
    id: 'sprint-010', number: 10, status: SprintStatus.COMPLETE, phase: SprintPhase.COMPLETE,
    tasks: [{ id: '010-001', title: 'T', description: 'd', model: 'sonnet', effort: 'normal',
      priority: 'NORMAL', reason: 'r', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
      status: TaskStatus.DONE, sprintId: 'sprint-010' }],
    workers: ['w-1'],
  };
  const metrics: SprintMetrics = {
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 3000, coveragePercent: 97.5, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  };
  return {
    projectRoot: '/proj',
    sprintResult: { sprint, evaluations: new Map([['010-001', TaskEvaluation.DONE]]), metrics },
    config: {
      mode: 'max_plan' as const, activeModeConfig: {} as any, modes: {} as any,
      language: 'en', projectName: 'test', projectRoot: '/proj', version: '0.0.0',
      auto_docs: { tier1: true, tier2: true, tier3: false },
    },
    isInternalProject: false,
    ...overrides,
  };
}

describe('readmeMetricsUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
  });

  it('has correct metadata', () => {
    expect(readmeMetricsUpdater.name).toBe('readme-metrics');
    expect(readmeMetricsUpdater.tier).toBe(2);
    expect(readmeMetricsUpdater.internal).toBe(false);
  });

  it('shouldRun returns false when tier2 disabled', () => {
    const ctx = makeCtx();
    ctx.config.auto_docs = { tier1: true, tier2: false, tier3: false };
    expect(readmeMetricsUpdater.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns false when README does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    expect(readmeMetricsUpdater.shouldRun(makeCtx())).toBe(false);
  });

  it('shouldRun returns true when tier2 enabled and README exists', () => {
    mockedExistsSync.mockReturnValue(true);
    expect(readmeMetricsUpdater.shouldRun(makeCtx())).toBe(true);
  });

  it('updates sprint count in README', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\n500+ tests | 95% coverage | 8 sprints completed\n');

    const result = readmeMetricsUpdater.run(makeCtx());

    expect(result.updated).toBe(true);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('10 sprints completed');
  });

  it('updates coverage percentage', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\n95% coverage\n');

    readmeMetricsUpdater.run(makeCtx());

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('97.5% coverage');
  });

  it('does not fabricate or corrupt the test count from coverage (R5)', () => {
    mockedExistsSync.mockReturnValue(true);
    // "500+ tests" badge-ish prose + a "+5 tests" sprint-log example line.
    mockedReadFileSync.mockReturnValue(
      '# Proj\n\n500+ tests | 95% coverage\n\n    286  tsc OK · +5 tests · 0 regressions\n',
    );

    readmeMetricsUpdater.run(makeCtx()); // metrics.coveragePercent = 97.5

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    // Pre-fix wrote `97.5 * 10 = 975+ tests` (a fabrication) and its blind
    // `/\d+\+?\s+tests?/g` replace also mangled the "+5 tests" example.
    expect(written).not.toContain('975+ tests');
    expect(written).toContain('500+ tests'); // real count left intact
    expect(written).toContain('+5 tests');   // example not corrupted
    expect(written).toContain('97.5% coverage'); // coverage still updated
  });

  it('returns skipped_not_found when file missing at run time', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = readmeMetricsUpdater.run(makeCtx());
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('skipped_not_found');
  });

  it('returns skipped_no_changes when content unchanged', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Proj\n\nNo metrics here\n');

    const result = readmeMetricsUpdater.run(makeCtx());
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('skipped_no_changes');
  });
});
