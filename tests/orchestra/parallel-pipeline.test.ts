import { describe, it, expect } from 'vitest';
import { ParallelPipelineManager } from '../../src/orchestra/parallel-pipeline.js';
import type { PipelineTask, ExecutionWave } from '../../src/orchestra/parallel-pipeline.js';

describe('ParallelPipelineManager', () => {
  const manager = new ParallelPipelineManager();

  // ─── createPipeline ──────────────────────────────────────────────

  describe('createPipeline', () => {
    it('returns empty array for empty input', () => {
      expect(manager.createPipeline([])).toEqual([]);
    });

    it('puts all independent tasks in wave 0', () => {
      const tasks: PipelineTask[] = [
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: [] },
        { id: 'c', dependencies: [] },
      ];
      const waves = manager.createPipeline(tasks);
      expect(waves).toHaveLength(1);
      expect(waves[0]!.waveIndex).toBe(0);
      expect(waves[0]!.taskIds).toEqual(['a', 'b', 'c']);
    });

    it('creates two waves for linear dependency', () => {
      const tasks: PipelineTask[] = [
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['a'] },
      ];
      const waves = manager.createPipeline(tasks);
      expect(waves).toHaveLength(2);
      expect(waves[0]!.taskIds).toEqual(['a']);
      expect(waves[1]!.taskIds).toEqual(['b']);
    });

    it('creates three waves for A -> B -> C chain', () => {
      const tasks: PipelineTask[] = [
        { id: 'c', dependencies: ['b'] },
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['a'] },
      ];
      const waves = manager.createPipeline(tasks);
      expect(waves).toHaveLength(3);
      expect(waves[0]!.taskIds).toEqual(['a']);
      expect(waves[1]!.taskIds).toEqual(['b']);
      expect(waves[2]!.taskIds).toEqual(['c']);
    });

    it('groups parallel tasks in the same wave', () => {
      // a -> b, a -> c (b and c can run in parallel)
      const tasks: PipelineTask[] = [
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['a'] },
        { id: 'c', dependencies: ['a'] },
      ];
      const waves = manager.createPipeline(tasks);
      expect(waves).toHaveLength(2);
      expect(waves[0]!.taskIds).toEqual(['a']);
      expect(waves[1]!.taskIds).toEqual(['b', 'c']);
    });

    it('handles diamond dependency: a -> b,c -> d', () => {
      const tasks: PipelineTask[] = [
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['a'] },
        { id: 'c', dependencies: ['a'] },
        { id: 'd', dependencies: ['b', 'c'] },
      ];
      const waves = manager.createPipeline(tasks);
      expect(waves).toHaveLength(3);
      expect(waves[0]!.taskIds).toEqual(['a']);
      expect(waves[1]!.taskIds).toEqual(['b', 'c']);
      expect(waves[2]!.taskIds).toEqual(['d']);
    });

    it('throws on circular dependency A -> B -> A', () => {
      const tasks: PipelineTask[] = [
        { id: 'a', dependencies: ['b'] },
        { id: 'b', dependencies: ['a'] },
      ];
      expect(() => manager.createPipeline(tasks)).toThrow(/Circular dependency/);
    });

    it('throws on self-dependency', () => {
      const tasks: PipelineTask[] = [
        { id: 'a', dependencies: ['a'] },
      ];
      expect(() => manager.createPipeline(tasks)).toThrow(/Circular dependency/);
    });

    it('throws on three-node cycle A -> B -> C -> A', () => {
      const tasks: PipelineTask[] = [
        { id: 'a', dependencies: ['c'] },
        { id: 'b', dependencies: ['a'] },
        { id: 'c', dependencies: ['b'] },
      ];
      expect(() => manager.createPipeline(tasks)).toThrow(/Circular dependency/);
    });

    it('ignores unknown dependencies (not in task list)', () => {
      const tasks: PipelineTask[] = [
        { id: 'a', dependencies: ['unknown-task'] },
        { id: 'b', dependencies: [] },
      ];
      const waves = manager.createPipeline(tasks);
      expect(waves).toHaveLength(1);
      expect(waves[0]!.taskIds).toEqual(['a', 'b']);
    });

    it('handles single task with no dependencies', () => {
      const waves = manager.createPipeline([{ id: 'solo', dependencies: [] }]);
      expect(waves).toHaveLength(1);
      expect(waves[0]!.taskIds).toEqual(['solo']);
    });

    it('sorts task IDs within each wave for determinism', () => {
      const tasks: PipelineTask[] = [
        { id: 'z', dependencies: [] },
        { id: 'a', dependencies: [] },
        { id: 'm', dependencies: [] },
      ];
      const waves = manager.createPipeline(tasks);
      expect(waves[0]!.taskIds).toEqual(['a', 'm', 'z']);
    });

    it('handles complex graph with multiple roots', () => {
      // root1 -> mid1, root2 -> mid2, mid1+mid2 -> leaf
      const tasks: PipelineTask[] = [
        { id: 'root1', dependencies: [] },
        { id: 'root2', dependencies: [] },
        { id: 'mid1', dependencies: ['root1'] },
        { id: 'mid2', dependencies: ['root2'] },
        { id: 'leaf', dependencies: ['mid1', 'mid2'] },
      ];
      const waves = manager.createPipeline(tasks);
      expect(waves).toHaveLength(3);
      expect(waves[0]!.taskIds).toEqual(['root1', 'root2']);
      expect(waves[1]!.taskIds).toEqual(['mid1', 'mid2']);
      expect(waves[2]!.taskIds).toEqual(['leaf']);
    });

    it('wave indices are sequential starting from 0', () => {
      const tasks: PipelineTask[] = [
        { id: 'a', dependencies: [] },
        { id: 'b', dependencies: ['a'] },
        { id: 'c', dependencies: ['b'] },
      ];
      const waves = manager.createPipeline(tasks);
      for (let i = 0; i < waves.length; i++) {
        expect(waves[i]!.waveIndex).toBe(i);
      }
    });

    it('handles many tasks with no deps (all wave 0)', () => {
      const tasks: PipelineTask[] = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${String(i).padStart(2, '0')}`,
        dependencies: [],
      }));
      const waves = manager.createPipeline(tasks);
      expect(waves).toHaveLength(1);
      expect(waves[0]!.taskIds).toHaveLength(10);
    });
  });

  // ─── getExecutionPlan ────────────────────────────────────────────

  describe('getExecutionPlan', () => {
    it('returns "No tasks" for empty waves', () => {
      expect(manager.getExecutionPlan([])).toBe('No tasks to execute.');
    });

    it('formats single wave correctly', () => {
      const waves: ExecutionWave[] = [{ waveIndex: 0, taskIds: ['a', 'b'] }];
      const plan = manager.getExecutionPlan(waves);
      expect(plan).toContain('Wave 0: [a, b]');
      expect(plan).toContain('Total waves: 1');
    });

    it('formats multiple waves correctly', () => {
      const waves: ExecutionWave[] = [
        { waveIndex: 0, taskIds: ['a'] },
        { waveIndex: 1, taskIds: ['b', 'c'] },
        { waveIndex: 2, taskIds: ['d'] },
      ];
      const plan = manager.getExecutionPlan(waves);
      expect(plan).toContain('Wave 0: [a]');
      expect(plan).toContain('Wave 1: [b, c]');
      expect(plan).toContain('Wave 2: [d]');
      expect(plan).toContain('Total waves: 3');
    });

    it('includes Execution Plan header', () => {
      const waves: ExecutionWave[] = [{ waveIndex: 0, taskIds: ['x'] }];
      expect(manager.getExecutionPlan(waves)).toContain('Execution Plan:');
    });
  });
});
