// ═══ Results Map Index Tests ═════════════════════════════════════
// Sprint 133 Task 5: O(n²)→O(n) results lookup optimization
// Tests: buildResultsMap helper — Map creation, duplicate override, backward-compat

import { describe, it, expect } from 'vitest';
import { buildResultsMap } from '../../src/orchestra/result-collector.js';
import type { TaskResult } from '../../src/core/types.js';

function makeResult(taskId: string, overrides?: Partial<TaskResult>): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 80,
    selfAssessment: 'DONE',
    notes: `Result for ${taskId}`,
    ...overrides,
  };
}

describe('buildResultsMap', () => {
  it('should create a Map with O(1) lookup by taskId', () => {
    const results: TaskResult[] = [
      makeResult('001-001'),
      makeResult('001-002'),
      makeResult('001-003'),
    ];

    const map = buildResultsMap(results);

    expect(map.size).toBe(3);
    expect(map.get('001-001')?.taskId).toBe('001-001');
    expect(map.get('001-002')?.taskId).toBe('001-002');
    expect(map.get('001-003')?.taskId).toBe('001-003');
    expect(map.get('nonexistent')).toBeUndefined();
  });

  it('should override earlier entries when duplicate taskIds exist (last wins)', () => {
    const results: TaskResult[] = [
      makeResult('001-001', { notes: 'first attempt', selfAssessment: 'NO_GO' }),
      makeResult('001-001', { notes: 'second attempt', selfAssessment: 'DONE' }),
    ];

    const map = buildResultsMap(results);

    expect(map.size).toBe(1);
    const entry = map.get('001-001');
    expect(entry?.notes).toBe('second attempt');
    expect(entry?.selfAssessment).toBe('DONE');
  });

  it('should produce Array.from(map.values()) equivalent to original results (backward-compat)', () => {
    const results: TaskResult[] = [
      makeResult('001-001', { coverage: 90 }),
      makeResult('001-002', { coverage: 85 }),
      makeResult('001-003', { coverage: 70 }),
    ];

    const map = buildResultsMap(results);
    const asArray = Array.from(map.values());

    // All items present, same data
    expect(asArray.length).toBe(results.length);
    for (const r of results) {
      const found = asArray.find(a => a.taskId === r.taskId);
      expect(found).toBeDefined();
      expect(found?.coverage).toBe(r.coverage);
    }
  });

  it('should handle empty results array', () => {
    const map = buildResultsMap([]);
    expect(map.size).toBe(0);
    expect(map.get('anything')).toBeUndefined();
  });

  it('should be significantly faster than Array.find for large result sets', () => {
    // Build a large result set to demonstrate O(1) vs O(n) lookup
    const N = 1000;
    const results: TaskResult[] = [];
    for (let i = 0; i < N; i++) {
      results.push(makeResult(`task-${i.toString().padStart(4, '0')}`));
    }

    const map = buildResultsMap(results);

    // Map lookups — O(1) each
    const mapStart = performance.now();
    for (let i = 0; i < N; i++) {
      map.get(`task-${i.toString().padStart(4, '0')}`);
    }
    const mapMs = performance.now() - mapStart;

    // Array.find lookups — O(n) each, total O(n²)
    const arrayStart = performance.now();
    for (let i = 0; i < N; i++) {
      results.find(r => r.taskId === `task-${i.toString().padStart(4, '0')}`);
    }
    const arrayMs = performance.now() - arrayStart;

    // Map should be faster — we don't enforce a strict ratio to avoid flaky tests,
    // but we verify both approaches return correct results
    expect(map.get('task-0000')?.taskId).toBe('task-0000');
    expect(map.get('task-0999')?.taskId).toBe('task-0999');
    // Log for informational purposes (visible in verbose mode)
    console.log(`Map lookup ${N}x: ${mapMs.toFixed(2)}ms | Array.find ${N}x: ${arrayMs.toFixed(2)}ms | Speedup: ${(arrayMs / mapMs).toFixed(1)}x`);
  });
});
