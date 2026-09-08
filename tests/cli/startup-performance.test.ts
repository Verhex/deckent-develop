import { describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from '../../src/core/config-types.js';
import {
  buildHealthSnapshot,
  createDeferredHealthAuthFeed,
  createDeferredHealthAuthUpdate,
  resolveDeferredHealthAuth,
} from '../../src/cli/helpers/health-snapshot.js';
import { launchDefaultRepl } from '../../src/cli/entry.js';

function config(): ResolvedConfig {
  return {
    mode: 'balanced',
    activeModeConfig: {},
    modes: {},
    language: 'en',
    projectName: 'startup-test',
    projectRoot: '/private/startup-test',
    version: '1',
  } as ResolvedConfig;
}

describe('default REPL startup critical path', () => {
  it('paints before authority validation and stops before provider/session work on HOLD', async () => {
    const order: string[] = [];
    const loadConfigFn = vi.fn(async () => config());

    await launchDefaultRepl({
      loadConfigFn,
      firstPaint: () => { order.push('paint'); },
      authorize: () => {
        order.push('authority');
        return false;
      },
    });

    expect(order).toEqual(['paint', 'authority']);
    expect(loadConfigFn).not.toHaveBeenCalled();
  });

  it('uses supplied config and MemoryStore projection without duplicate reads', async () => {
    const loadConfigFn = vi.fn(async () => config());
    const readMemoryCountFn = vi.fn(() => 999);
    const probeAuthFn = vi.fn(async () => ({ provider: 'claude', state: 'logged-in' as const }));

    const initial = await buildHealthSnapshot('/private/startup-test', {
      config: config(),
      provider: 'claude',
      memoryCount: 7,
      memoryCountProvided: true,
      deferAuth: true,
      loadConfigFn,
      readMemoryCountFn,
      probeAuthFn,
      loadMcpServersFn: () => ({}),
      listActiveSessionsFn: () => [],
    });

    expect(initial.memory.label).toBe('7/?');
    expect(initial.auth).toMatchObject({ status: 'unknown', detail: 'auth probe pending' });
    expect(loadConfigFn).not.toHaveBeenCalled();
    expect(readMemoryCountFn).not.toHaveBeenCalled();
    expect(probeAuthFn).not.toHaveBeenCalled();

    const settled = await resolveDeferredHealthAuth(initial, { probeAuthFn });
    expect(settled).toMatchObject({ status: 'ok', label: 'logged-in' });
    expect(probeAuthFn).toHaveBeenCalledTimes(1);
    expect(initial.auth.status).toBe('unknown');
  });

  it('treats an unavailable owned memory projection as final and never opens a second store', async () => {
    const readMemoryCountFn = vi.fn(() => 12);
    const snapshot = await buildHealthSnapshot('/private/startup-test', {
      config: config(),
      provider: 'claude',
      memoryCountProvided: true,
      deferAuth: true,
      readMemoryCountFn,
      loadMcpServersFn: () => ({}),
      listActiveSessionsFn: () => [],
    });

    expect(snapshot.memory.status).toBe('unknown');
    expect(readMemoryCountFn).not.toHaveBeenCalled();
  });

  it('settles native unknown auth once and suppresses a late update after disposal', async () => {
    let release!: (value: { provider: string; state: 'logged-in' }) => void;
    const probeAuthFn = vi.fn(() => new Promise<{ provider: string; state: 'logged-in' }>((resolve) => { release = resolve; }));
    const updates: string[] = [];
    const update = createDeferredHealthAuthUpdate((auth) => updates.push(auth.label), { probeAuthFn });
    const snapshot = await buildHealthSnapshot('/private/startup-test', {
      config: config(),
      resolvedSelection: {
        provider: { status: 'ok', label: 'claude' },
        model: { status: 'ok', label: 'claude-model' },
        auth: { status: 'unknown', label: 'unknown' },
      },
      deferAuth: true,
      memoryCountProvided: true,
      loadMcpServersFn: () => ({}),
      listActiveSessionsFn: () => [],
    });

    update.start(snapshot);
    update.start(snapshot);
    expect(probeAuthFn).toHaveBeenCalledTimes(1);
    update.dispose();
    release({ provider: 'claude', state: 'logged-in' });
    await Promise.resolve();
    await Promise.resolve();
    expect(updates).toEqual([]);
  });

  it('clears a switched provider boot projection and suppresses its in-flight result', async () => {
    let release!: (value: { provider: string; state: 'logged-in' }) => void;
    const probeAuthFn = vi.fn(() => new Promise<{ provider: string; state: 'logged-in' }>((resolve) => { release = resolve; }));
    const feed = createDeferredHealthAuthFeed((auth) => `auth:${auth.label}`, { probeAuthFn });
    const changes = vi.fn();
    const unsubscribe = feed.feed.subscribe(changes);
    const snapshot = await buildHealthSnapshot('/private/startup-test', {
      config: config(), provider: 'claude', deferAuth: true, memoryCountProvided: true,
      loadMcpServersFn: () => ({}), listActiveSessionsFn: () => [],
    });

    feed.start(snapshot);
    feed.clear();
    expect(feed.feed.getSnapshot()).toBeNull();
    expect(changes).toHaveBeenCalledTimes(1);
    release({ provider: 'claude', state: 'logged-in' });
    await Promise.resolve();
    await Promise.resolve();
    expect(feed.feed.getSnapshot()).toBeNull();
    expect(changes).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
