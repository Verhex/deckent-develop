import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────
vi.mock('node:fs', () => ({
  watch: vi.fn(() => ({ close: vi.fn() })),
}));

import { watch } from 'node:fs';
import { watchDashboard, type DashboardWatcher } from '../../src/api/watcher.js';

const mockWatch = vi.mocked(watch);

describe('watchDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockWatch.mockReturnValue({ close: vi.fn() } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Watcher Creation ────────────────────────────────────────
  describe('watcher creation', () => {
    it('calls fs.watch with the given file path', () => {
      watchDashboard('/some/path/.dashboard', vi.fn());
      expect(mockWatch).toHaveBeenCalledWith('/some/path/.dashboard', expect.any(Function));
    });

    it('returns an object with a close() method', () => {
      const w = watchDashboard('/tmp/.dashboard', vi.fn());
      expect(w).toBeDefined();
      expect(typeof w.close).toBe('function');
    });

    it('creates watcher immediately (not lazily)', () => {
      watchDashboard('/tmp/.dashboard', vi.fn());
      expect(mockWatch).toHaveBeenCalledTimes(1);
    });

    it('supports watching different file paths', () => {
      watchDashboard('/path/a', vi.fn());
      watchDashboard('/path/b', vi.fn());
      expect(mockWatch).toHaveBeenCalledTimes(2);
      expect(mockWatch).toHaveBeenNthCalledWith(1, '/path/a', expect.any(Function));
      expect(mockWatch).toHaveBeenNthCalledWith(2, '/path/b', expect.any(Function));
    });
  });

  // ─── File Change Detection ───────────────────────────────────
  describe('file change detection', () => {
    it('calls onChange after debounce timeout when file changes', () => {
      const onChange = vi.fn();
      watchDashboard('/tmp/.dashboard', onChange);

      // trigger the fs.watch callback
      const fsCallback = mockWatch.mock.calls[0][1] as () => void;
      fsCallback();

      expect(onChange).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('debounces rapid successive change events (only one call)', () => {
      const onChange = vi.fn();
      watchDashboard('/tmp/.dashboard', onChange);
      const fsCallback = mockWatch.mock.calls[0][1] as () => void;

      fsCallback();
      vi.advanceTimersByTime(100);
      fsCallback();
      vi.advanceTimersByTime(100);
      fsCallback();
      vi.advanceTimersByTime(500);

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('fires onChange again on second change after debounce settles', () => {
      const onChange = vi.fn();
      watchDashboard('/tmp/.dashboard', onChange);
      const fsCallback = mockWatch.mock.calls[0][1] as () => void;

      fsCallback();
      vi.advanceTimersByTime(500);
      expect(onChange).toHaveBeenCalledTimes(1);

      fsCallback();
      vi.advanceTimersByTime(500);
      expect(onChange).toHaveBeenCalledTimes(2);
    });

    it('does not call onChange before debounce window elapses', () => {
      const onChange = vi.fn();
      watchDashboard('/tmp/.dashboard', onChange);
      const fsCallback = mockWatch.mock.calls[0][1] as () => void;

      fsCallback();
      vi.advanceTimersByTime(499);
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ─── Cleanup ─────────────────────────────────────────────────
  describe('cleanup', () => {
    it('close() calls the underlying FSWatcher.close()', () => {
      const innerClose = vi.fn();
      mockWatch.mockReturnValueOnce({ close: innerClose } as any);
      const w = watchDashboard('/tmp/.dashboard', vi.fn());
      w.close();
      expect(innerClose).toHaveBeenCalledTimes(1);
    });

    it('close() cancels a pending debounce timer so onChange is not called', () => {
      const innerClose = vi.fn();
      mockWatch.mockReturnValueOnce({ close: innerClose } as any);
      const onChange = vi.fn();
      const w = watchDashboard('/tmp/.dashboard', onChange);
      const fsCallback = mockWatch.mock.calls[0][1] as () => void;

      fsCallback(); // start debounce timer
      w.close();   // close before timer fires
      vi.advanceTimersByTime(500);

      expect(onChange).not.toHaveBeenCalled();
      expect(innerClose).toHaveBeenCalledTimes(1);
    });

    it('close() is safe to call when no pending timer', () => {
      const innerClose = vi.fn();
      mockWatch.mockReturnValueOnce({ close: innerClose } as any);
      const w = watchDashboard('/tmp/.dashboard', vi.fn());
      expect(() => w.close()).not.toThrow();
      expect(innerClose).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Error Handling ──────────────────────────────────────────
  describe('error handling', () => {
    it('propagates error when fs.watch throws (file not found)', () => {
      mockWatch.mockImplementationOnce(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      expect(() => watchDashboard('/nonexistent/.dashboard', vi.fn())).toThrow('ENOENT');
    });

    it('propagates error when fs.watch throws (permission denied)', () => {
      mockWatch.mockImplementationOnce(() => {
        throw new Error('EACCES: permission denied');
      });
      expect(() => watchDashboard('/root/.dashboard', vi.fn())).toThrow('EACCES');
    });
  });
});
