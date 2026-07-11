/**
 * shutdown-hooks (born-496 B1 — born-549 registry generalized).
 *
 * Contract under test (entry.ts onSignal + command consumers depend on it):
 *   - register returns a working unregister (normal-exit paths must not leave
 *     stale hooks for the next surface in the same process);
 *   - hasShutdownHooks is a synchronous emptiness probe (onSignal's no-hook
 *     fast-path contract);
 *   - runShutdownHooks settles EVERY hook, never rejects (a throwing hook must
 *     not break sibling cleanup), and is collectively time-bounded so one hung
 *     hook cannot hang shutdown.
 *
 * Hermetic: in-memory only; the bound-race test drives vitest fake timers
 * (born-632) instead of racing a real wall-clock window.
 */
import {
  describe, it, expect, afterEach, vi,
} from 'vitest';
import {
  registerShutdownHook,
  hasShutdownHooks,
  runShutdownHooks,
  SHUTDOWN_HOOKS_TIMEOUT_MS,
} from '../../src/cli/helpers/shutdown-hooks.js';

const cleanups: Array<() => void> = [];

afterEach(() => {
  // Leave the module-level registry empty for the next test.
  for (const un of cleanups.splice(0)) un();
  expect(hasShutdownHooks()).toBe(false);
});

function track(hook: () => Promise<void>): () => void {
  const un = registerShutdownHook(hook);
  cleanups.push(un);
  return un;
}

describe('shutdown-hooks registry', () => {
  it('hasShutdownHooks reflects registration and unregistration', () => {
    expect(hasShutdownHooks()).toBe(false);
    const un = track(async () => {});
    expect(hasShutdownHooks()).toBe(true);
    un();
    expect(hasShutdownHooks()).toBe(false);
  });

  it('unregister is idempotent and removes only its own hook', () => {
    const ranA: string[] = [];
    const unA = track(async () => { ranA.push('a'); });
    track(async () => { ranA.push('b'); });
    unA();
    unA(); // second call: no-op, must not disturb hook b
    return runShutdownHooks().then(() => {
      expect(ranA).toEqual(['b']);
    });
  });

  it('runs every hook to settlement — a rejecting hook does not break siblings and never rejects the run', async () => {
    const ran: string[] = [];
    track(async () => { throw new Error('hook-a boom'); });
    track(async () => { ran.push('b'); });
    await expect(runShutdownHooks()).resolves.toBeUndefined();
    expect(ran).toEqual(['b']);
  });

  it('is collectively bounded — a never-resolving hook cannot hang the run', async () => {
    // born-632: the previous version raced runShutdownHooks() against a real
    // 4.5s–6.5s wall-clock window; VITEST_MAX_FORKS=2 fork pressure coalesces
    // timers and measured 3157ms in CI (under the lower bound → flaky RED).
    // Fake timers make the race deterministic: we can assert the EXACT
    // instant the bound fires (pending one tick before it, resolved the tick
    // it crosses), which is a strictly stronger proof of "collectively
    // bounded" than a tolerance window ever was.
    expect(SHUTDOWN_HOOKS_TIMEOUT_MS).toBe(5000);
    vi.useFakeTimers();
    try {
      track(() => new Promise<void>(() => { /* never settles */ }));

      let resolved = false;
      const runPromise = runShutdownHooks().then(() => { resolved = true; });

      await vi.advanceTimersByTimeAsync(SHUTDOWN_HOOKS_TIMEOUT_MS - 1);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
      await runPromise;
    } finally {
      vi.useRealTimers();
    }
  });
});
