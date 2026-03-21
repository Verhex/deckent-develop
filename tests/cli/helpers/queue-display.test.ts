import { describe, it, expect } from 'vitest';
import { QueueDisplay } from '../../../src/cli/helpers/queue-display.js';
import type { QueueTask } from '../../../src/cli/helpers/queue-display.js';

function makeTask(overrides: Partial<QueueTask> = {}): QueueTask {
  return {
    id: 'task-001',
    title: 'Implement feature X',
    dependencies: [],
    ...overrides,
  };
}

describe('QueueDisplay', () => {
  const display = new QueueDisplay();

  // ─── formatQueue ──────────────────────────────────────────────────

  describe('formatQueue', () => {
    it('returns "Queue: empty" for empty list', () => {
      expect(display.formatQueue([])).toBe('Queue: empty');
    });

    it('lists task ids and titles', () => {
      const tasks = [makeTask({ id: 't1', title: 'First task' })];
      const output = display.formatQueue(tasks);
      expect(output).toContain('t1');
      expect(output).toContain('First task');
    });

    it('shows dependency info', () => {
      const tasks = [makeTask({ id: 't2', dependencies: ['t1'] })];
      const output = display.formatQueue(tasks);
      expect(output).toContain('waiting: t1');
    });

    it('shows multiple dependencies', () => {
      const tasks = [makeTask({ id: 't3', dependencies: ['t1', 't2'] })];
      const output = display.formatQueue(tasks);
      expect(output).toContain('t1, t2');
    });

    it('shows +N more when exceeding maxDisplay', () => {
      const tasks = Array.from({ length: 8 }, (_, i) =>
        makeTask({ id: `t${i + 1}`, title: `Task ${i + 1}` }),
      );
      const output = display.formatQueue(tasks, 5);
      expect(output).toContain('+3 more');
    });

    it('does not show +N more when tasks fit within maxDisplay', () => {
      const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' })];
      const output = display.formatQueue(tasks, 5);
      expect(output).not.toContain('+');
    });

    it('respects custom maxDisplay', () => {
      const tasks = Array.from({ length: 5 }, (_, i) =>
        makeTask({ id: `t${i + 1}`, title: `Task ${i + 1}` }),
      );
      const output = display.formatQueue(tasks, 3);
      expect(output).toContain('+2 more');
      expect(output).toContain('t1');
      expect(output).toContain('t3');
      expect(output).not.toContain('t4');
    });

    it('starts with "Queue:" header', () => {
      const tasks = [makeTask()];
      const output = display.formatQueue(tasks);
      expect(output.startsWith('Queue:')).toBe(true);
    });
  });

  // ─── formatDependencyWait ─────────────────────────────────────────

  describe('formatDependencyWait', () => {
    it('shows "ready" when no blockers', () => {
      const task = makeTask({ id: 't1' });
      expect(display.formatDependencyWait(task, [])).toBe('t1: ready');
    });

    it('shows blocked by single task', () => {
      const task = makeTask({ id: 't2' });
      expect(display.formatDependencyWait(task, ['t1'])).toBe('t2: blocked by t1');
    });

    it('shows blocked by multiple tasks', () => {
      const task = makeTask({ id: 't3' });
      expect(display.formatDependencyWait(task, ['t1', 't2'])).toBe('t3: blocked by t1, t2');
    });
  });

  // ─── formatWaveDisplay ────────────────────────────────────────────

  describe('formatWaveDisplay', () => {
    it('returns "No waves planned" for empty waves', () => {
      expect(display.formatWaveDisplay([])).toBe('No waves planned');
    });

    it('renders single wave', () => {
      const waves = [[makeTask({ id: 't1' }), makeTask({ id: 't2' })]];
      const output = display.formatWaveDisplay(waves);
      expect(output).toContain('Wave 1');
      expect(output).toContain('t1, t2');
    });

    it('renders multiple waves', () => {
      const waves = [
        [makeTask({ id: 't1' })],
        [makeTask({ id: 't2' }), makeTask({ id: 't3' })],
      ];
      const output = display.formatWaveDisplay(waves);
      expect(output).toContain('Wave 1');
      expect(output).toContain('Wave 2');
      expect(output).toContain('t2, t3');
    });
  });
});
