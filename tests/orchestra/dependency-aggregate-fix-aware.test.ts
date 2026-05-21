import { describe, it, expect, vi } from 'vitest';
import { getAggregateVerdict, type TaskRecord } from '../../src/orchestra/result-evaluator.js';
import { emitDependencyResolvedByFix, CHANNELS } from '../../src/orchestra/event-stream.js';
import { buildDependenciesBlock } from '../../src/orchestra/prompt-god-template.js';

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
});
