import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerUpdater,
  getRegisteredUpdaters,
  clearUpdaters,
  runAllUpdaters,
} from '../../../src/orchestra/doc-updaters/registry.js';
import type { DocUpdater, DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import { SprintPhase, SprintStatus, TaskStatus } from '../../../src/core/types.js';
import type { ResolvedConfig, Sprint, SprintMetrics } from '../../../src/core/types.js';

function makeContext(overrides: Partial<DocUpdateContext> = {}): DocUpdateContext {
  const sprint: Sprint = {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.COMPLETE,
    tasks: [{
      id: '001-001', title: 'Test', description: 'Test', model: 'sonnet',
      effort: 'normal', priority: 'NORMAL', reason: 'test',
      scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      status: TaskStatus.DONE, sprintId: 'sprint-001',
    }],
    workers: ['w-001'],
  };
  const metrics: SprintMetrics = {
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 1000, coveragePercent: 95.0, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0,
  };
  const config: ResolvedConfig = {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8, brain_model: 'opus', default_model: 'opus',
      haiku_allowed: true,
      brain_planning: 'auto',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en', projectName: 'test', projectRoot: '/test', version: '0.0.0',
    auto_docs: { tier1: true, tier2: true, tier3: false },
  };
  return {
    projectRoot: '/test',
    sprintResult: { sprint, evaluations: new Map([['001-001', 'DONE' as any]]), metrics },
    config,
    isInternalProject: false,
    ...overrides,
  };
}

describe('registry', () => {
  beforeEach(() => {
    clearUpdaters();
  });

  it('starts empty', () => {
    expect(getRegisteredUpdaters()).toHaveLength(0);
  });

  it('registers an updater', () => {
    const updater: DocUpdater = {
      name: 'test', tier: 1, internal: false, targetFile: 'test.md',
      shouldRun: () => true,
      run: () => ({ file: 'test.md', updated: true, reason: 'created' }),
    };
    registerUpdater(updater);
    expect(getRegisteredUpdaters()).toHaveLength(1);
    expect(getRegisteredUpdaters()[0].name).toBe('test');
  });

  it('clearUpdaters removes all updaters', () => {
    registerUpdater({
      name: 'a', tier: 1, internal: false, targetFile: 'a.md',
      shouldRun: () => true, run: () => ({ file: 'a.md', updated: true }),
    });
    registerUpdater({
      name: 'b', tier: 2, internal: false, targetFile: 'b.md',
      shouldRun: () => true, run: () => ({ file: 'b.md', updated: true }),
    });
    expect(getRegisteredUpdaters()).toHaveLength(2);
    clearUpdaters();
    expect(getRegisteredUpdaters()).toHaveLength(0);
  });

  it('runAllUpdaters runs all registered updaters', () => {
    registerUpdater({
      name: 'a', tier: 1, internal: false, targetFile: 'a.md',
      shouldRun: () => true,
      run: () => ({ file: 'a.md', updated: true, reason: 'created' }),
    });
    registerUpdater({
      name: 'b', tier: 2, internal: false, targetFile: 'b.md',
      shouldRun: () => true,
      run: () => ({ file: 'b.md', updated: true, reason: 'updated' }),
    });

    const results = runAllUpdaters(makeContext());
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ file: 'a.md', updated: true, reason: 'created' });
    expect(results[1]).toEqual({ file: 'b.md', updated: true, reason: 'updated' });
  });

  it('skips updater when shouldRun returns false', () => {
    registerUpdater({
      name: 'skip', tier: 1, internal: false, targetFile: 'skip.md',
      shouldRun: () => false,
      run: () => ({ file: 'skip.md', updated: true }),
    });

    const results = runAllUpdaters(makeContext());
    expect(results).toHaveLength(1);
    expect(results[0].updated).toBe(false);
    expect(results[0].reason).toBe('skipped_config');
  });

  it('catches errors in updater run and returns error result', () => {
    registerUpdater({
      name: 'broken', tier: 1, internal: false, targetFile: 'broken.md',
      shouldRun: () => true,
      run: () => { throw new Error('boom'); },
    });

    const results = runAllUpdaters(makeContext());
    expect(results).toHaveLength(1);
    expect(results[0].updated).toBe(false);
    expect(results[0].reason).toBe('error');
  });

  it('returns results in registration order', () => {
    const names = ['first', 'second', 'third'];
    for (const name of names) {
      registerUpdater({
        name, tier: 1, internal: false, targetFile: `${name}.md`,
        shouldRun: () => true,
        run: () => ({ file: `${name}.md`, updated: true }),
      });
    }

    const results = runAllUpdaters(makeContext());
    expect(results.map(r => r.file)).toEqual(['first.md', 'second.md', 'third.md']);
  });

  it('handles empty registry', () => {
    const results = runAllUpdaters(makeContext());
    expect(results).toHaveLength(0);
  });
});
