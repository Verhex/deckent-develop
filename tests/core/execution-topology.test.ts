import { describe, expect, it } from 'vitest';
import {
  deriveExecutionTopology,
  normalizePortableWriterPath,
} from '../../src/core/execution-topology.js';
import type { Task } from '../../src/core/types.js';
import { TaskStatus } from '../../src/core/types.js';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: 'topology fixture',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

describe('normalizePortableWriterPath', () => {
  it('normalizes lexical aliases without consulting the filesystem', () => {
    expect(normalizePortableWriterPath('./src//Café/../Foo.ts')).toEqual({
      ok: true,
      path: 'src/Foo.ts',
      collisionKey: 'src/foo.ts',
    });
    expect(normalizePortableWriterPath('src\\foo.ts')).toEqual({
      ok: true,
      path: 'src/foo.ts',
      collisionKey: 'src/foo.ts',
    });
  });

  it.each(['/etc/passwd', 'C:\\repo\\file.ts', '../../escape.ts', '\\\\server\\share\\file.ts'])(
    'rejects non-portable or root-escaping writer %s',
    (value) => expect(normalizePortableWriterPath(value)).toEqual({ ok: false }),
  );
});

describe('deriveExecutionTopology', () => {
  it('blocks three undeclared writers and serializes them in stable plan-slot order', () => {
    const tasks = [
      task('counter-900', { scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] } }),
      task('counter-100', { scope: { directories: [], filesRead: [], filesWrite: ['./src/shared.ts'] } }),
      task('counter-500', { scope: { directories: [], filesRead: [], filesWrite: ['SRC\\SHARED.ts'] } }),
    ];
    const topology = deriveExecutionTopology(tasks, { maxWorkers: 8 });

    expect(topology.verdict).toBe('block');
    expect(topology.collisions).toEqual([{
      path: 'SRC/SHARED.ts',
      key: 'src/shared.ts',
      writerSlots: [1, 2, 3],
      declared: false,
    }]);
    expect(topology.syntheticEdges).toEqual([
      { from: 1, to: 2, source: 'collision', paths: ['SRC/SHARED.ts'] },
      { from: 2, to: 3, source: 'collision', paths: ['SRC/SHARED.ts'] },
    ]);
    expect(topology.waves.map(wave => wave.slots)).toEqual([[1], [2], [3]]);
    expect(topology.findings).toContainEqual(expect.objectContaining({
      code: 'undeclared-writer-collision',
      slots: [1, 2, 3],
    }));
  });

  it('accepts an explicit dependency chain while keeping the safe serialized waves visible', () => {
    const tasks = [
      task('random-c', {
        title: 'First',
        scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] },
      }),
      task('random-a', {
        title: 'Second',
        dependencies: ['First'],
        scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] },
      }),
      task('random-b', {
        title: 'Third',
        dependencies: ['Second'],
        scope: { directories: [], filesRead: [], filesWrite: ['src/shared.ts'] },
      }),
    ];
    const topology = deriveExecutionTopology(tasks, { maxWorkers: 8 });

    expect(topology.verdict).toBe('pass');
    expect(topology.collisions[0]?.declared).toBe(true);
    expect(topology.authoredEdges).toEqual([
      { from: 1, to: 2, source: 'authored' },
      { from: 2, to: 3, source: 'authored' },
    ]);
    expect(topology.syntheticEdges).toEqual([]);
    expect(topology.waves.map(wave => wave.slots)).toEqual([[1], [2], [3]]);
  });

  it('is task-ID invariant and caps every wave by configured maxWorkers', () => {
    const first = [task('901'), task('101'), task('501')];
    const second = [task('new-a'), task('new-b'), task('new-c')];
    const topologyA = deriveExecutionTopology(first, { maxWorkers: 2 });
    const topologyB = deriveExecutionTopology(second, { maxWorkers: 2 });

    expect(topologyA).toEqual(topologyB);
    expect(topologyA.waves.map(wave => wave.slots)).toEqual([[1, 2], [3]]);
    expect(topologyA.effectiveConcurrency).toBe(2);
  });

  it('fails loud on unresolved dependencies, invalid paths, and cycles', () => {
    const topology = deriveExecutionTopology([
      task('a', { dependencies: ['b'], scope: { directories: [], filesRead: [], filesWrite: ['/absolute.ts'] } }),
      task('b', { dependencies: ['a'] }),
      task('c', { dependencies: ['missing'] }),
    ], { maxWorkers: 4 });

    expect(topology.verdict).toBe('block');
    expect(topology.findings.map(finding => finding.code)).toEqual(expect.arrayContaining([
      'dependency-cycle',
      'invalid-writer-path',
      'unresolved-dependency',
    ]));
  });
});
