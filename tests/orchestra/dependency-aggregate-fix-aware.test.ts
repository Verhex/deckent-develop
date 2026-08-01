import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAggregateVerdict, type TaskRecord } from '../../src/orchestra/result-evaluator.js';
import { emitDependencyResolvedByFix, CHANNELS } from '../../src/orchestra/event-stream.js';
import { buildDependenciesBlock } from '../../src/orchestra/prompt-god-template.js';
import { buildWorkerPrompt, collectDependencyResultEntries } from '../../src/orchestra/task-builder.js';
import { TaskStatus, type Task, type TaskResult } from '../../src/core/types.js';

describe('Bug A: Dependency aggregate fix-aware', () => {
  it('(a) getAggregateVerdict: main NO_GO + fix DONE returns DONE', () => {
    const records = new Map<string, TaskRecord>([
      ['179-001', { verdict: 'NO_GO', isFix: false }],
      ['179-001-fix', { verdict: 'DONE', isFix: true, originalTaskId: '179-001' }],
    ]);
    expect(getAggregateVerdict('179-001', records)).toBe('DONE');
  });

  it('(b) emitDependencyResolvedByFix emits structured event', () => {
    const emit = vi.fn();
    emitDependencyResolvedByFix(
      { originalTaskId: '179-001', fixTaskId: '179-001-fix' },
      emit,
    );
    expect(emit).toHaveBeenCalledTimes(1);
    const call = emit.mock.calls[0][0];
    expect(call.type).toBe('BRAIN→*:DEPENDENCY_RESOLVED_BY_FIX');
    expect(call.originalTaskId).toBe('179-001');
    expect(call.fixTaskId).toBe('179-001-fix');
    expect(call.emittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('(c) CHANNELS.DEPENDENCY_RESOLVED_BY_FIX channel defined', () => {
    expect(CHANNELS).toHaveProperty('DEPENDENCY_RESOLVED_BY_FIX');
  });

  it('(d) buildDependenciesBlock embeds both original + fix digest with aggregate marker', () => {
    const block = buildDependenciesBlock({
      currentTaskId: '179-002',
      deps: ['179-001'],
      results: new Map([
        ['179-001', { verdict: 'NO_GO', filesChanged: ['src/a.ts'], notes: 'failed', isFix: false }],
        ['179-001-fix', { verdict: 'DONE', filesChanged: ['src/a.ts'], notes: 'fixed', isFix: true, originalTaskId: '179-001' }],
      ]),
    });
    expect(block).toContain('179-001');
    expect(block).toContain('aggregate: DONE');
  });

  it('(e) honest-gate intact: Brain re-evaluate UPDATE not blocked', () => {
    const records = new Map<string, TaskRecord>([
      ['179-001', { verdict: 'DONE', isFix: false }],
    ]);
    // Brain re-evaluates and downgrades
    records.set('179-001', { verdict: 'NO_GO', isFix: false });
    expect(getAggregateVerdict('179-001', records)).toBe('NO_GO');
  });

  it('(f) production prompt consumes Brain-evaluated FIX lineage and grants dependency outputs read-only', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-dependency-prompt-'));
    const sprintId = 'sprint-dependency-prompt';
    const tasksDir = join(root, '.tasks');
    const evalDir = join(root, '.deckent', 'runtime', 'evaluations', sprintId);
    mkdirSync(tasksDir, { recursive: true });
    mkdirSync(evalDir, { recursive: true });
    const baseTask = (id: string): Task => ({
      id, title: id, description: id, model: 'test-model', effort: 'normal', priority: 'NORMAL',
      reason: 'test', scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
      dependencies: [], goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      status: TaskStatus.DONE, sprintId,
    });
    const original = baseTask('dep-root');
    const fix = { ...baseTask('dep-root-fix'), isPriorityFix: true, fixForTaskId: original.id };
    const dependent = { ...baseTask('dependent'), status: TaskStatus.PENDING, dependencies: [original.id] };
    const writeAttempt = (attempt: Task, verdict: 'DONE' | 'NO_GO', result: TaskResult): void => {
      writeFileSync(join(tasksDir, `task-${attempt.id}.json`), JSON.stringify(attempt));
      writeFileSync(join(tasksDir, `task-${attempt.id}.result`), JSON.stringify(result));
      writeFileSync(join(evalDir, `${attempt.id}-attempt-1.json`), JSON.stringify({ decision: verdict }));
    };
    writeAttempt(original, 'NO_GO', {
      taskId: original.id, workerId: 'w-original', filesChanged: ['src/dependency.ts'],
      linesAdded: 1, linesRemoved: 0, testsPassed: false, coverage: 0,
      selfAssessment: 'NO_GO', notes: 'raw original failed',
    });
    writeAttempt(fix, 'DONE', {
      taskId: fix.id, workerId: 'w-fix', filesChanged: ['src/dependency.ts'],
      linesAdded: 2, linesRemoved: 0, testsPassed: true, coverage: 100,
      selfAssessment: 'DONE', notes: 'repair settled',
    });

    try {
      const prompt = buildWorkerPrompt(dependent, undefined, undefined, root);
      expect(prompt).toContain('Dependency dep-root (aggregate: DONE)');
      expect(prompt).toContain('Fix dep-root-fix (DONE)');
      expect(dependent.scope.filesRead).toContain('src/dependency.ts');
      expect(dependent.scope.filesWrite).not.toContain('src/dependency.ts');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('(g) dependency projection consumes the newest redispatch audit verdict', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-dependency-attempt-'));
    const sprintId = 'sprint-dependency-attempt';
    const taskId = 'dep-redispatched';
    const tasksDir = join(root, '.tasks');
    const evalDir = join(root, '.deckent', 'runtime', 'evaluations', sprintId);
    mkdirSync(tasksDir, { recursive: true });
    mkdirSync(evalDir, { recursive: true });
    writeFileSync(join(tasksDir, `task-${taskId}.json`), JSON.stringify({
      id: taskId, sprintId, scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
    }));
    writeFileSync(join(tasksDir, `task-${taskId}.result`), JSON.stringify({
      taskId, workerId: 'w-redispatch', filesChanged: ['src/current.ts'],
      linesAdded: 2, linesRemoved: 0, testsPassed: true, coverage: 100,
      selfAssessment: 'DONE', notes: 'redispatch settled',
    }));
    writeFileSync(join(evalDir, `${taskId}-attempt-1.json`), JSON.stringify({ decision: 'NO_GO' }));
    writeFileSync(join(evalDir, `${taskId}-attempt-2.json`), JSON.stringify({ decision: 'DONE' }));

    try {
      expect(collectDependencyResultEntries(root, sprintId).get(taskId)?.verdict).toBe('DONE');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
