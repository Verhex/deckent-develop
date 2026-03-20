import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ── Module mocks ──────────────────────────────────────────────────────────────
const mockWatchCallbacks: Array<(eventType: string, filename: string | null) => void> = [];
let watchShouldThrow = false;

const mockFsWatcher = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> };
mockFsWatcher.close = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  watch: vi.fn((_path: string, cb: (eventType: string, filename: string | null) => void) => {
    if (watchShouldThrow) throw new Error('watch failed');
    mockWatchCallbacks.push(cb);
    return mockFsWatcher;
  }),
}));

vi.mock('../../src/core/constants.js', () => ({ TASKS_DIR: '.tasks' }));

// Helpers
function triggerResult(filename = 'task-001.result') {
  for (const cb of mockWatchCallbacks) cb('rename', filename);
}

function triggerError() {
  mockFsWatcher.emit('error', new Error('watch error'));
}

// Import after mocks are set up
import { createResultWatcher } from '../../src/orchestra/result-watcher.js';

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('createResultWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockWatchCallbacks.length = 0;
    mockFsWatcher.close.mockClear();
    watchShouldThrow = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── createResultWatcher ────────────────────────────────────────────────────
  describe('interface', () => {
    it('returns an object with waitForChange and close', () => {
      const w = createResultWatcher('/proj');
      expect(typeof w.waitForChange).toBe('function');
      expect(typeof w.close).toBe('function');
      w.close();
    });

    it('attaches an fs.watch listener when tasksDir exists', async () => {
      const { watch } = await import('node:fs');
      createResultWatcher('/proj');
      expect(watch).toHaveBeenCalled();
    });

    it('does not throw when tasks dir does not exist', async () => {
      const { existsSync } = await import('node:fs');
      vi.mocked(existsSync).mockReturnValueOnce(false);
      expect(() => createResultWatcher('/proj')).not.toThrow();
    });
  });

  // ── waitForChange — watcher mode ───────────────────────────────────────────
  describe('waitForChange — watcher mode', () => {
    it('resolves when a .result file event fires', async () => {
      const w = createResultWatcher('/proj');
      const p = w.waitForChange();
      triggerResult();
      await expect(p).resolves.toBeUndefined();
      w.close();
    });

    it('does NOT resolve for non-.result filenames', async () => {
      const w = createResultWatcher('/proj');
      let resolved = false;
      const p = w.waitForChange().then(() => { resolved = true; });
      triggerResult('task-001.hb');          // wrong extension
      await Promise.resolve();
      expect(resolved).toBe(false);
      // clean up
      vi.runAllTimers();
      await p;
      w.close();
    });

    it('resolves after fallback timeout when no event fires', async () => {
      const w = createResultWatcher('/proj', 1_000);
      const p = w.waitForChange();
      vi.advanceTimersByTime(1_000);
      await expect(p).resolves.toBeUndefined();
      w.close();
    });

    it('timer is cleared when watcher event fires (no double-resolve)', async () => {
      const w = createResultWatcher('/proj', 2_000);
      let resolveCount = 0;
      const p = w.waitForChange().then(() => { resolveCount++; });
      triggerResult();
      await p;
      vi.advanceTimersByTime(3_000); // timer would have fired here if not cleared
      await Promise.resolve();
      expect(resolveCount).toBe(1);
      w.close();
    });

    it('watcher event is ignored after timer fires', async () => {
      const w = createResultWatcher('/proj', 500);
      let resolveCount = 0;
      const p = w.waitForChange().then(() => { resolveCount++; });
      vi.advanceTimersByTime(500);  // timer fires
      await p;
      triggerResult();              // late event — should be a no-op
      await Promise.resolve();
      expect(resolveCount).toBe(1);
      w.close();
    });

    it('supports multiple sequential waitForChange calls', async () => {
      const w = createResultWatcher('/proj');
      const p1 = w.waitForChange();
      triggerResult('task-001.result');
      await p1;

      const p2 = w.waitForChange();
      triggerResult('task-002.result');
      await p2;

      w.close();
    });
  });

  // ── close() ────────────────────────────────────────────────────────────────
  describe('close()', () => {
    it('resolves pending waitForChange immediately on close', async () => {
      const w = createResultWatcher('/proj');
      const p = w.waitForChange();
      w.close();
      await expect(p).resolves.toBeUndefined();
    });

    it('also cancels the fallback timer when closed', async () => {
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
      const w = createResultWatcher('/proj', 5_000);
      const p = w.waitForChange();
      w.close();
      await p;
      expect(clearSpy).toHaveBeenCalled();
    });

    it('close() on already-closed watcher does not throw', () => {
      const w = createResultWatcher('/proj');
      w.close();
      expect(() => w.close()).not.toThrow();
    });

    it('waitForChange returns immediately when closed', async () => {
      const w = createResultWatcher('/proj');
      w.close();
      await expect(w.waitForChange()).resolves.toBeUndefined();
    });

    it('calls fsWatcher.close() when closing', () => {
      const w = createResultWatcher('/proj');
      w.close();
      expect(mockFsWatcher.close).toHaveBeenCalled();
    });
  });

  // ── fallback timer mode (no fsWatcher) ────────────────────────────────────
  describe('fallback timer mode', () => {
    it('uses timer when watch() throws', async () => {
      watchShouldThrow = true;
      const w = createResultWatcher('/proj', 300);
      const p = w.waitForChange();
      vi.advanceTimersByTime(300);
      await expect(p).resolves.toBeUndefined();
      w.close();
    });

    it('uses timer when watch error event fires', async () => {
      const w = createResultWatcher('/proj', 300);
      triggerError(); // watcher falls back to null
      const p = w.waitForChange();
      vi.advanceTimersByTime(300);
      await expect(p).resolves.toBeUndefined();
      w.close();
    });

    it('close() in fallback mode still resolves pending', async () => {
      watchShouldThrow = true;
      const w = createResultWatcher('/proj', 5_000);
      const p = w.waitForChange();
      w.close();
      await expect(p).resolves.toBeUndefined();
    });
  });

  // ── race condition edge cases ──────────────────────────────────────────────
  describe('race condition edge cases', () => {
    it('handles rapid successive result events without double-resolve', async () => {
      const w = createResultWatcher('/proj');
      let count = 0;
      const p = w.waitForChange().then(() => { count++; });
      triggerResult('task-001.result');
      triggerResult('task-001.result'); // second event — ignored
      await p;
      expect(count).toBe(1);
      w.close();
    });

    it('handles null filename gracefully', async () => {
      const w = createResultWatcher('/proj', 500);
      const p = w.waitForChange();
      // Trigger with null filename — should be ignored
      for (const cb of mockWatchCallbacks) cb('rename', null);
      let resolved = false;
      p.then(() => { resolved = true; });
      await Promise.resolve();
      expect(resolved).toBe(false);
      // clean up via timer
      vi.runAllTimers();
      await p;
      w.close();
    });

    it('close while timer already fired does not throw', async () => {
      const w = createResultWatcher('/proj', 100);
      const p = w.waitForChange();
      vi.advanceTimersByTime(100);
      await p;
      expect(() => w.close()).not.toThrow();
    });
  });
});
