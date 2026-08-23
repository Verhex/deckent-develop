import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fakes = vi.hoisted(() => ({
  root: '',
  buildConnector: vi.fn().mockResolvedValue({
    name: 'connector-broadcast',
    isAvailable: () => true,
    send: vi.fn(),
  }),
  bootstrapNotify: vi.fn(),
  closeNotify: vi.fn().mockResolvedValue(undefined),
  runLoop: vi.fn().mockResolvedValue({ iterations: 1, reason: 'max-iterations' }),
  buildRuntime: vi.fn(() => ({ deps: {} })),
}));

vi.mock('../../src/core/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/config.js')>();
  return {
    ...actual,
    loadConfig: vi.fn(async () => ({
      projectRoot: fakes.root,
      mode: 'balanced',
      modes: { balanced: { brain_model: 'claude-fable-5', default_model: 'claude-fable-5' } },
      autonomous: { enabled: true, engine: 'v1', interval_ms: 1 },
      approval: { lifecycle: { profiles: {} } },
      notify_connectors: { telegram: { token: 'test-token', chat_ids: ['1'] } },
    })),
  };
});

vi.mock('../../src/core/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/provider.js')>();
  return { ...actual, bootstrapProviders: vi.fn().mockResolvedValue({ registered: [], skipped: [] }) };
});

vi.mock('../../src/providers/provider-authority-runtime-bootstrap.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/providers/provider-authority-runtime-bootstrap.js')
  >();
  return { ...actual, openLocalProviderAuthorityRuntimeIfConfigured: vi.fn(() => undefined) };
});

vi.mock('../../src/core/approval-authority-bootstrap.js', () => ({
  bootstrapApprovalAuthority: vi.fn(() => ({
    state: 'hold',
    reasonCode: 'approval_authority_not_configured',
    authorityEvidenceRef: 'approval-authority:test',
    retryable: false,
  })),
}));

vi.mock('../../src/orchestra/autonomous/runtime-loop.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/autonomous/runtime-loop.js')>();
  return {
    ...actual,
    buildEngineRuntime: (...args: unknown[]) => fakes.buildRuntime(...args),
    runAutonomousLoop: (...args: unknown[]) => fakes.runLoop(...args),
  };
});

vi.mock('../../src/connectors/kpi-summary-dispatch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/connectors/kpi-summary-dispatch.js')>();
  return {
    ...actual,
    buildConnectorAdapterWithKpiSummary: (...args: unknown[]) => fakes.buildConnector(...args),
    buildSprintKpiSummaryFn: vi.fn(() => vi.fn().mockResolvedValue(null)),
  };
});

vi.mock('../../src/core/notify-bootstrap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/notify-bootstrap.js')>();
  return {
    ...actual,
    bootstrapNotifyDispatcher: (options: unknown) => {
      fakes.bootstrapNotify(options);
      return { close: fakes.closeNotify };
    },
  };
});

vi.mock('../../src/nervous/bootstrap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/nervous/bootstrap.js')>();
  return { ...actual, createNervousSystemIfEnabled: vi.fn(() => null) };
});

vi.mock('../../src/orchestra/exact-plan-start-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/exact-plan-start-service.js')>();
  return { ...actual, createCanonicalExactSprintExecutor: vi.fn(() => ({ execute: vi.fn() })) };
});

import { handleStart } from '../../src/cli/commands/autonomous.js';

describe('autonomous notification ownership', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'autonomous-notify-lifecycle-'));
    fakes.root = root;
    fakes.buildConnector.mockClear();
    fakes.bootstrapNotify.mockClear();
    fakes.closeNotify.mockReset().mockResolvedValue(undefined);
    fakes.runLoop.mockReset().mockResolvedValue({ iterations: 1, reason: 'max-iterations' });
    fakes.buildRuntime.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it('constructs connectors once for the whole loop and awaits canonical close on normal stop', async () => {
    await handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' });

    expect(fakes.buildConnector).toHaveBeenCalledOnce();
    expect(fakes.bootstrapNotify).toHaveBeenCalledOnce();
    expect(fakes.runLoop).toHaveBeenCalledOnce();
    expect(fakes.closeNotify).toHaveBeenCalledOnce();
    expect(fakes.buildConnector.mock.invocationCallOrder[0]).toBeLessThan(
      fakes.runLoop.mock.invocationCallOrder[0]!,
    );
    expect(fakes.runLoop.mock.invocationCallOrder[0]).toBeLessThan(
      fakes.closeNotify.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    ['admission failure', new Error('provider admission denied')],
    ['unexpected throw', new Error('loop exploded')],
  ])('awaits the same canonical close on %s', async (_label, failure) => {
    fakes.runLoop.mockRejectedValueOnce(failure);

    await expect(handleStart({ root, lang: 'en', intervalMs: '1' })).rejects.toBe(failure);
    expect(fakes.bootstrapNotify).toHaveBeenCalledOnce();
    expect(fakes.closeNotify).toHaveBeenCalledOnce();
  });

  it('aborts on SIGTERM and closes the same dispatcher without leaving signal listeners', async () => {
    let sigterm: NodeJS.SignalsListener | undefined;
    const on = vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      if (event === 'SIGTERM') sigterm = listener as NodeJS.SignalsListener;
      return process;
    });
    const off = vi.spyOn(process, 'off').mockImplementation(() => process);
    fakes.runLoop.mockImplementationOnce(async (_config, _deps, options: unknown) => {
      const signal = (options as { signal: AbortSignal }).signal;
      expect(signal.aborted).toBe(false);
      expect(sigterm).toBeTypeOf('function');
      sigterm?.('SIGTERM');
      expect(signal.aborted).toBe(true);
      return { iterations: 0, reason: 'aborted' };
    });

    await handleStart({ root, lang: 'en', intervalMs: '1' });

    expect(on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(off).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(fakes.closeNotify).toHaveBeenCalledOnce();
  });

  it('still closes notifications when sibling teardown throws', async () => {
    fakes.closeNotify.mockResolvedValueOnce(undefined);
    const cleanupFailure = new Error('cleanup failure');
    // A stopped reactive source is the sibling-cleanup failure seam. The test
    // keeps runtime scheduling mocked and only proves notification ownership.
    fakes.buildRuntime.mockImplementationOnce(() => ({ deps: {} }));
    const off = vi.spyOn(process, 'off');
    off.mockImplementationOnce(() => { throw cleanupFailure; });

    await expect(handleStart({ root, lang: 'en', intervalMs: '1', maxIterations: '1' }))
      .rejects.toBe(cleanupFailure);
    expect(fakes.closeNotify).toHaveBeenCalledOnce();
  });
});
