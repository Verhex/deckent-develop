// ═══ Sprint Controller Nervous System Wire Tests (Sprint 180 W3-1) ════
// NERVOUS-TODO §11.2 Step D: runSprint() instantiates the nervous system
// at the top of its body and disposes it in the finally block.
//
// Three contracts under test:
//   1. Default-off respect — `nervous_system.enabled !== true` → bootstrap
//      loader is NOT consulted, init returns null
//   2. Enabled path — bootstrap loader is consulted, factory is called with
//      (config, projectRoot, sprintStateProvider) and its handle is returned
//   3. Dispose contract — disposeNervousSystem invokes handle.dispose() on a
//      non-null handle, is a safe no-op on null, and swallows dispose
//      exceptions (fail-safe so a meta-orchestrator fault never breaks the
//      sprint's own return value)
//
// We exercise the wire helpers directly with injected loaders rather than
// driving the full runSprint() pipeline. This keeps the test focused on the
// wire contract and decouples it from PLAN/SPAWN/EXECUTE machinery.

import { describe, it, expect, vi } from 'vitest';
import {
  initNervousSystemForSprint,
  disposeNervousSystem,
  type NervousSystemHandle,
} from '../../src/orchestra/sprint-controller.js';
import type { ResolvedConfig } from '../../src/core/types.js';

interface BootstrapModuleShape {
  createNervousSystemIfEnabled: (
    config: ResolvedConfig,
    projectRoot: string,
    sprintStateProvider: () => unknown,
  ) => NervousSystemHandle | null;
}

function makeBaseConfig(enabled: boolean): ResolvedConfig {
  return {
    nervous_system: enabled
      ? {
          enabled: true,
          mode: 'balanced',
        }
      : undefined,
  } as unknown as ResolvedConfig;
}

describe('Sprint Controller — Nervous System Wire (W3-1, NERVOUS-TODO §11.2 Step D)', () => {
  it('disabled → bootstrap loader is NOT consulted, init returns null (default-off respect)', async () => {
    const bootstrapLoader = vi.fn<() => Promise<BootstrapModuleShape | null>>();
    const stateLoader = vi.fn<() => Promise<() => unknown>>();

    const config = makeBaseConfig(false);
    const handle = await initNervousSystemForSprint(
      config,
      '/tmp/project',
      bootstrapLoader,
      stateLoader,
    );

    expect(handle).toBeNull();
    expect(bootstrapLoader).not.toHaveBeenCalled();
    expect(stateLoader).not.toHaveBeenCalled();
  });

  it('enabled → bootstrap.createNervousSystemIfEnabled is called with (config, projectRoot, sprintStateProvider) and its handle is returned', async () => {
    const disposeSpy = vi.fn();
    const stubHandle: NervousSystemHandle = { dispose: disposeSpy };

    const factorySpy = vi.fn(() => stubHandle);
    const bootstrapLoader = vi.fn(async () => ({
      createNervousSystemIfEnabled: factorySpy,
    } satisfies BootstrapModuleShape));

    const stateProviderFn = vi.fn(() => ({ sprintId: 'sprint-180', currentPhase: 'PLAN' }));
    const stateLoader = vi.fn(async () => stateProviderFn);

    const config = makeBaseConfig(true);
    const handle = await initNervousSystemForSprint(
      config,
      '/tmp/project',
      bootstrapLoader,
      stateLoader,
    );

    expect(bootstrapLoader).toHaveBeenCalledTimes(1);
    expect(stateLoader).toHaveBeenCalledTimes(1);
    expect(factorySpy).toHaveBeenCalledTimes(1);

    const [callConfig, callRoot, callStateProvider] = factorySpy.mock.calls[0];
    expect(callConfig).toBe(config);
    expect(callRoot).toBe('/tmp/project');
    expect(callStateProvider).toBe(stateProviderFn);

    expect(handle).toBe(stubHandle);
    expect(disposeSpy).not.toHaveBeenCalled();
  });

  it('disposeNervousSystem → invokes handle.dispose() once; null-safe; swallows dispose throws', () => {
    // Path 1: real handle → dispose called exactly once
    const disposeSpy = vi.fn();
    const handle: NervousSystemHandle = { dispose: disposeSpy };
    disposeNervousSystem(handle);
    expect(disposeSpy).toHaveBeenCalledTimes(1);

    // Path 2: null handle → safe no-op (no throw)
    expect(() => disposeNervousSystem(null)).not.toThrow();

    // Path 3: dispose throws → swallowed (sprint return value must not be
    // masked by a meta-orchestrator fault, fail-safe contract)
    const throwingHandle: NervousSystemHandle = {
      dispose: () => {
        throw new Error('observer teardown crashed');
      },
    };
    expect(() => disposeNervousSystem(throwingHandle)).not.toThrow();
  });

  it('enabled but bootstrap loader returns null (module missing) → init returns null gracefully', async () => {
    const bootstrapLoader = vi.fn(async () => null);
    const stateLoader = vi.fn();

    const config = makeBaseConfig(true);
    const handle = await initNervousSystemForSprint(
      config,
      '/tmp/project',
      bootstrapLoader,
      stateLoader,
    );

    expect(handle).toBeNull();
    expect(bootstrapLoader).toHaveBeenCalledTimes(1);
    // State provider loader is short-circuited when bootstrap module is missing
    expect(stateLoader).not.toHaveBeenCalled();
  });
});
