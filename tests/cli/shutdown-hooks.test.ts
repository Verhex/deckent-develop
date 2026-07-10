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
 * Hermetic: in-memory only; real timers (bound test uses a short real race).
 */
import { describe, it, expect, afterEach } from 'vitest';
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
    // Contract-level probe without waiting the real 5s: the run must be a race
    // against a timer (resolves even though the hook never does). We assert the
    // exported bound is the documented 5s and race the run against a generous
    // 6s ceiling using a hook that never settles.
    expect(SHUTDOWN_HOOKS_TIMEOUT_MS).toBe(5000);
    track(() => new Promise<void>(() => { /* never settles */ }));
    const start = Date.now();
    await runShutdownHooks();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(4500);
    expect(elapsed).toBeLessThan(SHUTDOWN_HOOKS_TIMEOUT_MS + 1500);
  }, 10_000);
});
