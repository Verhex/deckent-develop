import { describe, it, expect, beforeEach, vi } from 'vitest';
import { changelogUpdater } from '../../../src/orchestra/doc-updaters/changelog.js';
import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DocUpdateContext, SprintResult } from '../../../src/orchestra/doc-updaters/types.js';
import type { ResolvedConfig, Sprint, SprintMetrics } from '../../../src/core/types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function makeCtx(overrides: Partial<DocUpdateContext> = {}): DocUpdateContext {
  const sprint: Sprint = {
    id: 'sprint-005', number: 5, status: SprintStatus.COMPLETE, phase: SprintPhase.COMPLETE,
    tasks: [
      { id: '005-001', title: 'Feature X', description: 'd', model: 'sonnet', effort: 'normal',
        priority: 'NORMAL', reason: 'r', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [], goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
        status: TaskStatus.DONE, sprintId: 'sprint-005' },
    ],
    workers: ['w-1'],
  };
  const metrics: SprintMetrics = {
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 5000, coveragePercent: 90, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  };
  const config = {
    mode: 'max_plan' as const, activeModeConfig: {} as any, modes: {} as any,
    language: 'en', projectName: 'test', projectRoot: '/proj', version: '0.0.0',
    auto_docs: { tier1: true, tier2: false, tier3: false },
  };
  return {
    projectRoot: '/proj',
    sprintResult: { sprint, evaluations: new Map([['005-001', TaskEvaluation.DONE]]), metrics },
    config,
    isInternalProject: false,
    ...overrides,
  };
}

describe('changelogUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockReturnValue('');
  });

  it('has correct metadata', () => {
    expect(changelogUpdater.name).toBe('changelog');
    expect(changelogUpdater.tier).toBe(1);
    expect(changelogUpdater.internal).toBe(false);
  });

  it('shouldRun returns true by default', () => {
    expect(changelogUpdater.shouldRun(makeCtx())).toBe(true);
  });

  it('shouldRun returns false when tier1 disabled', () => {
    const ctx = makeCtx();
    ctx.config.auto_docs = { tier1: false, tier2: false, tier3: false };
    expect(changelogUpdater.shouldRun(ctx)).toBe(false);
  });

  it('creates CHANGELOG with sprint entry when file does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = changelogUpdater.run(makeCtx());
    expect(result.updated).toBe(true);
    expect(mockedWriteFileSync).toHaveBeenCalledTimes(1);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('sprint05');
    expect(written).toContain('### Added');
    expect(written).toContain('Feature X');
  });

  it('inserts new entry before existing entries', () => {
    const existing = '# Changelog\n\nDesc\n\n## [0.1.0-sprint04] - 2026-03-17\n\n### Added\n\n- old\n';
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(existing);

    changelogUpdater.run(makeCtx());

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    const sprint05Idx = written.indexOf('sprint05');
    const sprint04Idx = written.indexOf('sprint04');
    expect(sprint05Idx).toBeLessThan(sprint04Idx);
  });

  it('shows "No completed tasks" when all NO_GO', () => {
    const ctx = makeCtx();
    ctx.sprintResult.evaluations = new Map([['005-001', TaskEvaluation.NO_GO]]);

    changelogUpdater.run(ctx);

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('No completed tasks');
  });

  it('includes GO_WITH_TECH_DEBT in highlights', () => {
    const ctx = makeCtx();
    ctx.sprintResult.evaluations = new Map([['005-001', TaskEvaluation.GO_WITH_TECH_DEBT]]);

    changelogUpdater.run(ctx);

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('tech debt');
  });
});
