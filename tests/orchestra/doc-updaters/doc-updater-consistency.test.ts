import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sprintLogUpdater } from '../../../src/orchestra/doc-updaters/sprint-log.js';
import { changelogUpdater } from '../../../src/orchestra/doc-updaters/changelog.js';
import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import type { Sprint, SprintMetrics } from '../../../src/core/types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  // sprintLogUpdater writes atomically (temp file + rename); without this the
  // mock throws "No renameSync export is defined".
  renameSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function makeSprint(id: string, number: number): Sprint {
  return {
    id,
    number,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [
      {
        id: `${String(number).padStart(3, '0')}-001`,
        title: 'Test Task',
        description: 'desc',
        model: 'sonnet',
        effort: 'normal',
        priority: 'NORMAL',
        reason: 'r',
        scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
        dependencies: [],
        goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
        status: TaskStatus.DONE,
        sprintId: id,
      },
    ],
    workers: ['w-1'],
  };
}

function makeMetrics(): SprintMetrics {
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
  };
}

function makeCtx(sprintId = 'sprint-055', sprintNum = 55): DocUpdateContext {
  const sprint = makeSprint(sprintId, sprintNum);
  return {
    projectRoot: '/proj',
    sprintResult: {
      sprint,
      evaluations: new Map([[`${String(sprintNum).padStart(3, '0')}-001`, TaskEvaluation.DONE]]),
      metrics: makeMetrics(),
    },
    config: {
      mode: 'max_plan' as const,
      activeModeConfig: {} as any,
      modes: {} as any,
      language: 'en',
      projectName: 'test',
      projectRoot: '/proj',
      version: '0.0.0',
      auto_docs: { tier1: true, tier2: false, tier3: false },
    },
    isInternalProject: false,
  };
}

describe('Doc Updater Path Consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedReadFileSync.mockReturnValue('');
  });

  // A) sprint-log.ts path consistency
  it('sprintLogUpdater.targetFile is docs/SPRINT-LOG.md (not docs/archive/SPRINT-LOG.md)', () => {
    expect(sprintLogUpdater.targetFile).toBe('docs/SPRINT-LOG.md');
    expect(sprintLogUpdater.targetFile).not.toContain('archive');
  });

  it('sprintLogUpdater writes to docs/SPRINT-LOG.md path (no archive)', () => {
    sprintLogUpdater.run(makeCtx());
    // sprintLogUpdater now writes atomically: a sibling temp file, then rename onto
    // the target. The durable destination is renameSync's second argument — asserting
    // writeFileSync's path here would only ever see the temp name.
    const tempPath = String(mockedWriteFileSync.mock.calls[0][0]);
    const finalPath = String(vi.mocked(renameSync).mock.calls[0][1]);
    expect(tempPath).toContain('docs/');
    expect(finalPath).toMatch(/docs\/SPRINT-LOG\.md$/);
    expect(finalPath).not.toContain('docs/archive');
  });

  it('sprintLogUpdater result.file matches targetFile exactly', () => {
    const result = sprintLogUpdater.run(makeCtx());
    expect(result.file).toBe(sprintLogUpdater.targetFile);
    expect(result.file).toBe('docs/SPRINT-LOG.md');
  });

  // B) changelog.ts path consistency
  it('changelogUpdater.targetFile is docs/CHANGELOG.md', () => {
    expect(changelogUpdater.targetFile).toBe('docs/CHANGELOG.md');
  });

  it('changelogUpdater writes to docs/CHANGELOG.md path', () => {
    changelogUpdater.run(makeCtx());
    const writtenPath = String(mockedWriteFileSync.mock.calls[0][0]);
    expect(writtenPath).toMatch(/docs\/CHANGELOG\.md$/);
  });

  it('changelogUpdater result.file matches targetFile', () => {
    const result = changelogUpdater.run(makeCtx());
    expect(result.file).toBe(changelogUpdater.targetFile);
  });

  it('changelogUpdater result.updated is always true', () => {
    const result = changelogUpdater.run(makeCtx());
    expect(result.updated).toBe(true);
  });

  // C) Sprint 055-058 CHANGELOG entries are formatted correctly
  it('changelogUpdater sprint entry includes correct sprint number format', () => {
    changelogUpdater.run(makeCtx('sprint-055', 55));
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('sprint55');
  });

  it('changelogUpdater sprint 058 entry formats with two digits', () => {
    changelogUpdater.run(makeCtx('sprint-058', 58));
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('sprint58');
  });

  it('sprintLogUpdater sprint 056 entry includes sprint header', () => {
    sprintLogUpdater.run(makeCtx('sprint-056', 56));
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('Sprint 56');
    expect(written).toContain('sprint-056');
  });
});
