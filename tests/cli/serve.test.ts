import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockServer = { address: vi.fn(() => ({ port: 3100 })) };
const mockCreateHttpServer = vi.fn(() => ({
  server: mockServer,
  close: mockClose,
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
    // serve now wires the bundled dashboard staticDir (previously never passed).
    expect(mockCreateHttpServer).toHaveBeenCalledWith(
      '/tmp/test-project',
      3100,
      expect.stringContaining('dashboard'),
    );
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('listening on http://localhost:3100'),
    );
  });

  it('starts server with custom port', async () => {
    await program.parseAsync(['node', 'test', 'serve', '--port', '4000']);
    expect(mockCreateHttpServer).toHaveBeenCalledWith(
      '/tmp/test-project',
      4000,
      expect.stringContaining('dashboard'),
    );
  });

  it('registers SIGINT and SIGTERM handlers', async () => {
    const onSpy = vi.spyOn(process, 'on');
    await program.parseAsync(['node', 'test', 'serve']);

    const sigintCalls = onSpy.mock.calls.filter(([sig]) => sig === 'SIGINT');
    const sigtermCalls = onSpy.mock.calls.filter(([sig]) => sig === 'SIGTERM');
    expect(sigintCalls.length).toBeGreaterThan(0);
    expect(sigtermCalls.length).toBeGreaterThan(0);

    onSpy.mockRestore();
  });

  it('cleanup handler calls api.close and exits on success', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockClose.mockResolvedValue(undefined);

    const onSpy = vi.spyOn(process, 'on');
    await program.parseAsync(['node', 'test', 'serve']);

    // Find the SIGINT cleanup handler
    const sigintCall = onSpy.mock.calls.find(([sig]) => sig === 'SIGINT');
    expect(sigintCall).toBeDefined();
    const cleanupFn = sigintCall![1] as () => void;

    cleanupFn();
    // Wait for promise chain
    await new Promise((r) => setTimeout(r, 10));

    expect(mockClose).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('cleanup handler exits with 1 on close error', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockClose.mockRejectedValue(new Error('close failed'));

    const onSpy = vi.spyOn(process, 'on');
    await program.parseAsync(['node', 'test', 'serve']);

    const sigintCall = onSpy.mock.calls.find(([sig]) => sig === 'SIGINT');
    const cleanupFn = sigintCall![1] as () => void;

    cleanupFn();
    await new Promise((r) => setTimeout(r, 10));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    onSpy.mockRestore();
  });
});
