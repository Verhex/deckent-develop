import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sprintLogUpdater, upsertSprintLog } from '../../../src/orchestra/doc-updaters/sprint-log.js';
import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import type { Sprint, SprintMetrics } from '../../../src/core/types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedRenameSync = vi.mocked(renameSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);

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

  it('targetFile matches actual write path (docs/SPRINT-LOG.md)', () => {
    expect(sprintLogUpdater.targetFile).toBe('docs/SPRINT-LOG.md');
  });

  it('writes to docs/SPRINT-LOG.md (not docs/archive/SPRINT-LOG.md)', () => {
    sprintLogUpdater.run(makeCtx());
    const destinationPath = String(mockedRenameSync.mock.calls[0][1]);
    expect(destinationPath).toContain('docs/SPRINT-LOG.md');
    expect(destinationPath).not.toContain('docs/archive');
  });

  it('result.file matches targetFile', () => {
    const result = sprintLogUpdater.run(makeCtx());
    expect(result.file).toBe(sprintLogUpdater.targetFile);
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

  it('preserves an unrelated existing sprint section byte-for-byte', () => {
    const existing = '# Sprint Log\n\n---\n\n## Sprint 2\n\nOld\n';
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(existing);

    sprintLogUpdater.run(makeCtx());

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written.startsWith(existing)).toBe(true);
    expect(written).toContain('Sprint 3');
  });

  it('replaces and coalesces every section with the exact sprint identity', () => {
    const unrelatedBefore = '# Sprint Log\n\n## Sprint 2 — sprint-002\n\nFOREIGN-A\n';
    const staleFirst = '## Sprint 3 — sprint-003\n\n**Status:** RETROSPECTIVE\n\n---\n\n';
    const unrelatedAfter = '## Sprint 4 — sprint-004\n\nFOREIGN-B\n';
    const staleDuplicate = '## Sprint 3 — sprint-003\n\nDUPLICATE\n';
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(unrelatedBefore + staleFirst + unrelatedAfter + staleDuplicate);

    upsertSprintLog(makeCtx(), 'COMPLETE');

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written.match(/^## Sprint 3 — sprint-003$/gm)).toHaveLength(1);
    expect(written).toContain('**Status:** COMPLETE');
    expect(written).not.toContain('RETROSPECTIVE');
    expect(written).not.toContain('DUPLICATE');
    expect(written.startsWith(unrelatedBefore)).toBe(true);
    expect(written).toContain(unrelatedAfter);
  });

  it('accepts ABORTED as explicit terminal receipt-backed projection input', () => {
    const ctx = makeCtx();
    ctx.sprintResult.sprint.status = SprintStatus.COMPLETE;

    upsertSprintLog(ctx, 'ABORTED');

    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('**Status:** ABORTED');
    expect(written).not.toContain('**Status:** COMPLETE');
  });

  it('writes through a same-directory temporary file and atomic rename', () => {
    upsertSprintLog(makeCtx(), 'COMPLETE');

    const temporaryPath = String(mockedWriteFileSync.mock.calls[0][0]);
    expect(temporaryPath).toMatch(/^\/proj\/docs\/\.SPRINT-LOG\.md\..+\.tmp$/);
    expect(mockedRenameSync).toHaveBeenCalledWith(temporaryPath, '/proj/docs/SPRINT-LOG.md');
  });

  it('cleans up the temporary file and preserves rename failure', () => {
    const failure = new Error('rename failed');
    mockedRenameSync.mockImplementationOnce(() => { throw failure; });

    expect(() => upsertSprintLog(makeCtx(), 'COMPLETE')).toThrow(failure);
    const temporaryPath = String(mockedWriteFileSync.mock.calls[0][0]);
    expect(mockedUnlinkSync).toHaveBeenCalledWith(temporaryPath);
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
