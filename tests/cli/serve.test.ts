import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockServer = { address: vi.fn(() => ({ port: 3100 })) };
const mockCreateHttpServer = vi.fn(() => ({
  server: mockServer,
  close: mockClose,
}));


vi.mock('../../src/core/invocation-receipt-store.js', () => ({
  InvocationReceiptStore: vi.fn().mockImplementation(() => ({
    close: vi.fn(),
  })),
}));


vi.mock('../../src/orchestra/acceptance-confirmation-reconciler.js', () => ({
  openAcceptanceConfirmationReconciler: vi.fn().mockReturnValue({
    close: vi.fn(),
  }),
}));

vi.mock('../../src/api/server.js', () => ({
  createHttpServer: (...args: unknown[]) => mockCreateHttpServer(...args),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn(() => '/tmp/test-project'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

// born-496 B1 — handshake meta + shutdown-hook seams (hermetic: no real
// /tmp/test-project/.deckent writes, no real registry mutation).
const mockWriteMeta = vi.fn();
const mockClearMeta = vi.fn();
vi.mock('../../src/api/serve-daemon-meta.js', () => ({
  writeServeDaemonMeta: (...args: unknown[]) => mockWriteMeta(...args),
  clearServeDaemonMeta: (...args: unknown[]) => mockClearMeta(...args),
}));

const registeredHooks: Array<() => Promise<void>> = [];
const mockRegisterShutdownHook = vi.fn((hook: () => Promise<void>) => {
  registeredHooks.push(hook);
  return () => {};
});
vi.mock('../../src/cli/helpers/shutdown-hooks.js', () => ({
  registerShutdownHook: (hook: () => Promise<void>) => mockRegisterShutdownHook(hook),
}));

import { registerServe } from '../../src/cli/commands/serve.js';
import { print } from '../../src/cli/helpers/output.js';

// ─── Tests ──────────────────────────────────────────────────────────
describe('registerServe', () => {
  let program: Command;
  const originalListeners = {
    SIGINT: [] as NodeJS.SignalsListener[],
    SIGTERM: [] as NodeJS.SignalsListener[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    registeredHooks.length = 0;
    // Save existing listeners
    originalListeners.SIGINT = process.listeners('SIGINT') as NodeJS.SignalsListener[];
    originalListeners.SIGTERM = process.listeners('SIGTERM') as NodeJS.SignalsListener[];
    program = new Command();
    program.exitOverride();
    registerServe(program);
  });

  afterEach(() => {
    // Remove only listeners added during test
    const currentSigint = process.listeners('SIGINT') as NodeJS.SignalsListener[];
    const currentSigterm = process.listeners('SIGTERM') as NodeJS.SignalsListener[];
    for (const l of currentSigint) {
      if (!originalListeners.SIGINT.includes(l)) process.removeListener('SIGINT', l);
    }
    for (const l of currentSigterm) {
      if (!originalListeners.SIGTERM.includes(l)) process.removeListener('SIGTERM', l);
    }
  });

  it('registers serve command', () => {
    const cmd = program.commands.find((c) => c.name() === 'serve');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Start HTTP API server with SSE support');
  });

  it('starts server with default port', async () => {
    await program.parseAsync(['node', 'test', 'serve']);
    // Sprint 175 W2.3: createHttpServer signature became (root, opts) with
    // host + terminalBackend wired through. Default host is 127.0.0.1.
    expect(mockCreateHttpServer).toHaveBeenCalledWith(
      '/tmp/test-project',
      expect.objectContaining({
        port: 3100,
        staticDir: expect.stringContaining('dashboard'),
      }),
    );
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('Deckent is ready — http://127.0.0.1:3100'),
    );
  });

  it('starts server with custom port', async () => {
    await program.parseAsync(['node', 'test', 'serve', '--port', '4000']);
    expect(mockCreateHttpServer).toHaveBeenCalledWith(
      '/tmp/test-project',
      expect.objectContaining({
        port: 4000,
        staticDir: expect.stringContaining('dashboard'),
      }),
    );
  });

  // born-496 B1 — the previous 3 tests here pinned serve's OWN
  // process.on(SIGINT/SIGTERM) cleanup. That listener was reproduced-dead in
  // production (entry.ts's bootstrap onSignal wins registration order and
  // exits synchronously → later listeners never fire), so serve now registers
  // through the entry-level shutdown-hook registry instead. Same intent
  // (graceful api.close on shutdown), now on the path that actually runs.
  it('registers a shutdown hook instead of dead process.on signal listeners', async () => {
    const onSpy = vi.spyOn(process, 'on');
    await program.parseAsync(['node', 'test', 'serve']);

    expect(mockRegisterShutdownHook).toHaveBeenCalledTimes(1);
    // No serve-owned direct signal listeners anymore — entry owns signals.
    const signalCalls = onSpy.mock.calls.filter(([sig]) => sig === 'SIGINT' || sig === 'SIGTERM');
    expect(signalCalls).toEqual([]);

    onSpy.mockRestore();
  });

  it('writes the daemon handshake meta on startup (adopt-vs-spawn hint)', async () => {
    await program.parseAsync(['node', 'test', 'serve', '--port', '4100']);

    expect(mockWriteMeta).toHaveBeenCalledWith(
      '/tmp/test-project',
      expect.objectContaining({
        host: '127.0.0.1',
        port: 4100,
        projectRoot: '/tmp/test-project',
      }),
    );
  });

  it('shutdown hook clears the handshake meta FIRST, then closes the api', async () => {
    mockClose.mockResolvedValue(undefined);
    await program.parseAsync(['node', 'test', 'serve']);

    const hook = registeredHooks[registeredHooks.length - 1]!;
    await hook();

    expect(mockClearMeta).toHaveBeenCalledWith('/tmp/test-project');
    expect(mockClose).toHaveBeenCalled();
    // Sync clear must precede the (potentially hanging) close.
    expect(mockClearMeta.mock.invocationCallOrder[0]!)
      .toBeLessThan(mockClose.mock.invocationCallOrder[0]!);
  });

  it('shutdown hook still clears the meta even when api.close rejects', async () => {
    mockClose.mockRejectedValue(new Error('close failed'));
    await program.parseAsync(['node', 'test', 'serve']);

    const hook = registeredHooks[registeredHooks.length - 1]!;
    // The registry's runShutdownHooks settles rejections (Promise.allSettled);
    // at the hook level the rejection propagates — but the clear already ran.
    await expect(hook()).rejects.toThrow('close failed');
    expect(mockClearMeta).toHaveBeenCalledWith('/tmp/test-project');
  });
});
