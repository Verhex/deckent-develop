import { describe, it, expect, beforeEach, vi } from 'vitest';
import { healthCheckUpdater } from '../../../src/orchestra/doc-updaters/health-check.js';
import { TaskEvaluation, TaskStatus, SprintPhase, SprintStatus } from '../../../src/core/types.js';
import type { DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import type { Sprint, SprintMetrics } from '../../../src/core/types.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const mockedExistsSync = vi.mocked(existsSync);
const mockedMkdirSync = vi.mocked(mkdirSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function makeCtx(overrides: Partial<DocUpdateContext> = {}): DocUpdateContext {
  const sprint: Sprint = {
    id: 'sprint-020', number: 20, status: SprintStatus.COMPLETE, phase: SprintPhase.COMPLETE,
    tasks: [{ id: '020-001', title: 'T', description: 'd', model: 'sonnet', effort: 'normal',
      priority: 'NORMAL', reason: 'r', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: '' },
      status: TaskStatus.DONE, sprintId: 'sprint-020' }],
    workers: ['w-1'],
  };
  const metrics: SprintMetrics = {
    totalTasks: 5, completedTasks: 5, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 120000, coveragePercent: 97.5, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  };
  return {
    projectRoot: '/proj',
    sprintResult: { sprint, evaluations: new Map([['020-001', TaskEvaluation.DONE]]), metrics },
    config: {
      mode: 'max_plan' as const, activeModeConfig: {} as any, modes: {} as any,
      language: 'en', projectName: 'deckent', projectRoot: '/proj', version: '0.0.0',
      auto_docs: { tier1: true, tier2: true, tier3: false },
    },
    isInternalProject: true,
    ...overrides,
  };
}

describe('healthCheckUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
  });

  it('has correct metadata', () => {
    expect(healthCheckUpdater.name).toBe('health-check');
    expect(healthCheckUpdater.tier).toBe(2);
    expect(healthCheckUpdater.internal).toBe(true);
  });

  it('shouldRun returns false for non-internal projects', () => {
    const ctx = makeCtx({ isInternalProject: false });
    mockedExistsSync.mockReturnValue(true);
    expect(healthCheckUpdater.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns false when tier2 disabled', () => {
    const ctx = makeCtx();
    ctx.config.auto_docs = { tier1: true, tier2: false, tier3: false };
    expect(healthCheckUpdater.shouldRun(ctx)).toBe(false);
  });

  it('shouldRun returns true for internal project (file existence not required)', () => {
    mockedExistsSync.mockReturnValue(false);
    expect(healthCheckUpdater.shouldRun(makeCtx())).toBe(true);
  });

  it('shouldRun returns true for internal project with file present', () => {
    mockedExistsSync.mockReturnValue(true);
    expect(healthCheckUpdater.shouldRun(makeCtx())).toBe(true);
  });

  it('creates file when it does not exist', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = healthCheckUpdater.run(makeCtx());

    expect(result.updated).toBe(true);
    expect(result.reason).toBe('created');
    expect(mockedWriteFileSync).toHaveBeenCalledOnce();
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('Post-Sprint 20');
    expect(written).toContain('| Tests | 5 |');
    expect(written).toContain('| Sprints | 20 |');
  });

  it('uses consistent HEALTH_DOC_PATH in shouldRun and run', () => {
    // Both shouldRun and run should reference docs/reference/health-check.md
    expect(healthCheckUpdater.targetFile).toBe('docs/reference/health-check.md');
    // run() with existing file should read from the same path
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# No metrics\n');
    healthCheckUpdater.run(makeCtx());
    const readPath = String(mockedReadFileSync.mock.calls[0][0]);
    expect(readPath).toContain('docs/reference/health-check.md');
  });

  it('updates metric table rows', () => {
    const content = [
      '# Health Check Post-Sprint 18',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      '| Tests | 1200 |',
      '| Sprints | 18 |',
      '',
      '*Last audit: 2026-03-17*',
    ].join('\n');
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(content);

    const result = healthCheckUpdater.run(makeCtx());

    expect(result.updated).toBe(true);
    const written = String(mockedWriteFileSync.mock.calls[0][1]);
    expect(written).toContain('| Tests | 5 |');
    expect(written).toContain('| Sprints | 20 |');
    expect(written).toContain('Post-Sprint 20');
    expect(written).toMatch(/Last audit: \d{4}-\d{2}-\d{2}/);
  });

  it('creates file with correct content when missing at run time', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = healthCheckUpdater.run(makeCtx());
    expect(result.updated).toBe(true);
    expect(result.reason).toBe('created');
    expect(mockedWriteFileSync).toHaveBeenCalledOnce();
  });

  it('returns skipped_no_changes when nothing matches', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('# Health Check\n\nNo metrics here.\n');

    const result = healthCheckUpdater.run(makeCtx());
    expect(result.updated).toBe(false);
    expect(result.reason).toBe('skipped_no_changes');
  });
});
