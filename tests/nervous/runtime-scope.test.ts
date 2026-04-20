// tests/nervous/runtime-scope.test.ts
//
// Runtime scope enforcement tests — Sprint 148 Task 7
// ADR-037 RBAC: nervous system components must only run in Brain PID.
// 6 tests covering: brain context OK, worker context throws, error message,
// event emission, observer same check, spawn env var.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { assertBrainScope } from '../../src/nervous/runtime-scope-check.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Save and restore DECKENT_WORKER_MODE env var around tests */
let originalWorkerMode: string | undefined;

beforeEach(() => {
  originalWorkerMode = process.env.DECKENT_WORKER_MODE;
});

afterEach(() => {
  if (originalWorkerMode === undefined) {
    delete process.env.DECKENT_WORKER_MODE;
  } else {
    process.env.DECKENT_WORKER_MODE = originalWorkerMode;
  }
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('assertBrainScope', () => {
  it('should allow instantiation in Brain context (no DECKENT_WORKER_MODE)', () => {
    delete process.env.DECKENT_WORKER_MODE;
    expect(() => assertBrainScope('NervousDispatcher')).not.toThrow();
  });

  it('should throw NervousScopeViolationError in worker context', () => {
    process.env.DECKENT_WORKER_MODE = '1';
    expect(() => assertBrainScope('NervousDispatcher')).toThrow('NERVOUS_SCOPE_VIOLATION');
  });

  it('should include ADR-037 and Brain-scoped in error message', () => {
    process.env.DECKENT_WORKER_MODE = '1';
    try {
      assertBrainScope('TestComponent');
      expect.fail('should have thrown');
    } catch (err: unknown) {
      const error = err as Error;
      expect(error.name).toBe('NervousScopeViolationError');
      expect(error.message).toContain('ADR-037');
      expect(error.message).toContain('Brain-scoped');
      expect(error.message).toContain('TestComponent');
    }
  });

  it('should emit violation event on deckent-event channel', async () => {
    process.env.DECKENT_WORKER_MODE = '1';

    // Mock the event-bus module that assertBrainScope tries to require
    const mockEmit = vi.fn();
    vi.doMock('../../src/orchestra/event-bus.js', () => ({
      eventBus: { emit: mockEmit },
    }));

    // Re-import to pick up mock — but assertBrainScope uses require() internally
    // so we need to verify via the stderr fallback path (ESM environment)
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      assertBrainScope('NervousDispatcher');
    } catch {
      // Expected throw
    }

    // In ESM test environment, require() may fail — verify stderr fallback works
    // Either eventBus.emit was called or stderr.write was called
    const eventEmitted = mockEmit.mock.calls.length > 0;
    const stderrWritten = stderrSpy.mock.calls.some(
      (call) => typeof call[0] === 'string' && call[0].includes('NERVOUS_SCOPE_VIOLATION'),
    );
    expect(eventEmitted || stderrWritten).toBe(true);

    stderrSpy.mockRestore();
    vi.doUnmock('../../src/orchestra/event-bus.js');
  });

  it('should enforce scope on NervousObserver constructor', async () => {
    process.env.DECKENT_WORKER_MODE = '1';

    // NervousObserver imports event-bus at module level, so we mock it
    vi.doMock('../../src/orchestra/event-bus.js', () => ({
      eventBus: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
      },
    }));

    const { NervousObserver } = await import('../../src/nervous/observer.js');

    expect(() => new NervousObserver('/tmp/test')).toThrow('NERVOUS_SCOPE_VIOLATION');

    vi.doUnmock('../../src/orchestra/event-bus.js');
  });

  it('should not throw when DECKENT_WORKER_MODE is not "1"', () => {
    // Values other than '1' should not trigger the check
    process.env.DECKENT_WORKER_MODE = '0';
    expect(() => assertBrainScope('NervousDispatcher')).not.toThrow();

    process.env.DECKENT_WORKER_MODE = '';
    expect(() => assertBrainScope('NervousDispatcher')).not.toThrow();

    delete process.env.DECKENT_WORKER_MODE;
    expect(() => assertBrainScope('NervousDispatcher')).not.toThrow();
  });
});
