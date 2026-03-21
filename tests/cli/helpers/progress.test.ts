import { describe, it, expect } from 'vitest';
import { ProgressRenderer } from '../../../src/cli/helpers/progress.js';
import type { ProgressState, WorkerProgressEntry } from '../../../src/cli/helpers/progress.js';
import { SprintPhase } from '../../../src/core/types.js';

function makeState(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    totalTasks: 8,
    completedTasks: 4,
    activeTasks: [],
    queuedTasks: [],
    phase: SprintPhase.EXECUTE,
    elapsedMs: 60000,
    etaMs: 120000,
    ...overrides,
  };
}

function makeWorker(overrides: Partial<WorkerProgressEntry> = {}): WorkerProgressEntry {
  return {
    taskId: 'task-001',
    workerId: 'worker-1',
    agentName: 'generic',
    status: 'CODING',
    currentFile: 'src/main.ts',
    progressPercent: 50,
    ...overrides,
  };
}

describe('ProgressRenderer', () => {
  const renderer = new ProgressRenderer();

  // ─── renderBar ─────────────────────────────────────────────────────

  describe('renderBar', () => {
    it('renders progress bar with correct percentage', () => {
      const bar = renderer.renderBar(makeState());
      expect(bar).toContain('4/8');
      expect(bar).toContain('50%');
    });

    it('renders ETA when > 0', () => {
      const bar = renderer.renderBar(makeState({ etaMs: 120000 }));
      expect(bar).toContain('ETA ~120s');
    });

    it('omits ETA when 0', () => {
      const bar = renderer.renderBar(makeState({ etaMs: 0 }));
      expect(bar).not.toContain('ETA');
    });

    it('shows 0% for 0 completed', () => {
      const bar = renderer.renderBar(makeState({ completedTasks: 0 }));
      expect(bar).toContain('0%');
      expect(bar).toContain('0/8');
    });

    it('shows 100% for all completed', () => {
      const bar = renderer.renderBar(makeState({ completedTasks: 8 }));
      expect(bar).toContain('100%');
      expect(bar).toContain('8/8');
    });

    it('handles 0 total tasks', () => {
      const bar = renderer.renderBar(makeState({ totalTasks: 0, completedTasks: 0 }));
      expect(bar).toContain('0/0');
      expect(bar).toContain('0%');
    });

    it('contains = and - characters in bar', () => {
      const bar = renderer.renderBar(makeState({ completedTasks: 4, totalTasks: 8 }));
      expect(bar).toContain('=');
      expect(bar).toContain('-');
    });

    it('bar is enclosed in brackets', () => {
      const bar = renderer.renderBar(makeState());
      expect(bar).toMatch(/^\[.*\]/);
    });
  });

  // ─── renderWorkerRow ──────────────────────────────────────────────

  describe('renderWorkerRow', () => {
    it('includes worker id', () => {
      const row = renderer.renderWorkerRow(makeWorker());
      expect(row).toContain('worker-1');
    });

    it('includes worker status', () => {
      const row = renderer.renderWorkerRow(makeWorker({ status: 'TESTING' }));
      expect(row).toContain('TESTING');
    });

    it('includes current file', () => {
      const row = renderer.renderWorkerRow(makeWorker({ currentFile: 'src/foo.ts' }));
      expect(row).toContain('src/foo.ts');
    });

    it('omits file portion when currentFile is empty', () => {
      const row = renderer.renderWorkerRow(makeWorker({ currentFile: '' }));
      expect(row).toContain('worker-1');
      expect(row).toContain('CODING');
    });

    it('shows progress bar based on progressPercent', () => {
      const row = renderer.renderWorkerRow(makeWorker({ progressPercent: 100 }));
      expect(row).toContain('==========');
    });

    it('shows empty bar for 0 percent', () => {
      const row = renderer.renderWorkerRow(makeWorker({ progressPercent: 0 }));
      expect(row).toContain('----------');
    });
  });

  // ─── render (full) ────────────────────────────────────────────────

  describe('render', () => {
    it('includes progress bar line', () => {
      const output = renderer.render(makeState());
      expect(output).toContain('4/8');
      expect(output).toContain('50%');
    });

    it('includes Active Workers section when there are active tasks', () => {
      const state = makeState({ activeTasks: [makeWorker()] });
      const output = renderer.render(state);
      expect(output).toContain('Active Workers:');
      expect(output).toContain('worker-1');
    });

    it('omits Active Workers section when no active tasks', () => {
      const output = renderer.render(makeState({ activeTasks: [] }));
      expect(output).not.toContain('Active Workers:');
    });

    it('includes Queued section with task ids', () => {
      const state = makeState({ queuedTasks: ['task-005', 'task-006'] });
      const output = renderer.render(state);
      expect(output).toContain('Queued:');
      expect(output).toContain('task-005');
      expect(output).toContain('task-006');
    });

    it('omits Queued section when no queued tasks', () => {
      const output = renderer.render(makeState({ queuedTasks: [] }));
      expect(output).not.toContain('Queued:');
    });

    it('shows +N more when queued tasks exceed 5', () => {
      const queued = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
      const output = renderer.render(makeState({ queuedTasks: queued }));
      expect(output).toContain('+2 more');
    });

    it('does not show +N more when exactly 5 queued', () => {
      const queued = ['t1', 't2', 't3', 't4', 't5'];
      const output = renderer.render(makeState({ queuedTasks: queued }));
      expect(output).not.toContain('+');
    });

    it('renders multiple active workers', () => {
      const workers = [
        makeWorker({ workerId: 'w1', taskId: 't1' }),
        makeWorker({ workerId: 'w2', taskId: 't2' }),
      ];
      const output = renderer.render(makeState({ activeTasks: workers }));
      expect(output).toContain('w1');
      expect(output).toContain('w2');
    });
  });
});
