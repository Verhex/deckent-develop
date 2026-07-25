import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';

// ── Module mocks ──────────────────────────────────────────────────────────────
const mockWatchCallbacks: Array<(eventType: string, filename: string | null) => void> = [];
const mockWatchPaths: string[] = [];
let watchShouldThrow = false;

const mockFsWatcher = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> };
mockFsWatcher.close = vi.fn();

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  watch: vi.fn((_path: string, cb: (eventType: string, filename: string | null) => void) => {
    if (watchShouldThrow) throw new Error('watch failed');
    mockWatchPaths.push(_path);
    mockWatchCallbacks.push(cb);
    return mockFsWatcher;
  }),
  // Sprint 139 async I/O migration: sprint-finalizer and other modules use
  // `import { promises as fsPromises } from 'node:fs'`. Bind async impls via
  // `vi.fn(async () => ...)` so vi.clearAllMocks preserves them.
  promises: {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 0 })),
  },
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
    vi.clearAllMocks();
    mockWatchCallbacks.length = 0;
    mockWatchPaths.length = 0;
    mockFsWatcher.removeAllListeners();
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

    it('rejects escaping wake paths before installing any watcher', async () => {
      const { watch } = await import('node:fs');
      try {
        createResultWatcher('/proj', 5_000, {
          wakeFiles: ['../outside.signal'],
        });
        expect.unreachable('escaping wake path must fail closed');
      } catch (error) {
        expect(error).toMatchObject({
          name: 'DeckentError',
          code: 'DECKENT_E077',
        });
        expect(error).toHaveProperty('message', expect.stringContaining('escapes project root'));
      }
      expect(watch).not.toHaveBeenCalled();
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

    it('resolves only for an exact configured control-plane wake file', async () => {
      const wakeFile = '.deckent/nervous-respawn-requests.jsonl';
      const w = createResultWatcher('/proj', 5_000, { wakeFiles: [wakeFile] });
      const controlIndex = mockWatchPaths.indexOf(join('/proj', '.deckent'));
      expect(controlIndex).toBeGreaterThan(-1);
      let resolved = false;
      const p = w.waitForChange().then(() => { resolved = true; });

      mockWatchCallbacks[controlIndex]!('change', 'other-control-file.jsonl');
      await Promise.resolve();
      expect(resolved).toBe(false);

      mockWatchCallbacks[controlIndex]!('change', 'nervous-respawn-requests.jsonl');
      await expect(p).resolves.toBeUndefined();
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
