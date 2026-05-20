import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ──────────────────────────────────────────────────────────
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockCreateHttpServer = vi.fn(() => ({ close: mockClose }));

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

vi.mock('../../src/cli/helpers/dashboard-dir.js', () => ({
  getDashboardStaticDir: vi.fn(() => '/fake/dashboard/dist'),
}));

import { registerServe } from '../../src/cli/commands/serve.js';

// ─── Tests ──────────────────────────────────────────────────────────
describe('serve CLI terminal options', () => {
  it('exposes --host and --no-terminal', () => {
    const program = new Command();
    registerServe(program);
    const serve = program.commands.find((c) => c.name() === 'serve')!;
    const opts = serve.options.map((o) => o.long);
    expect(opts).toContain('--host');
    expect(opts).toContain('--no-terminal');
  });

  describe('non-localhost host', () => {
    let program: Command;
    const savedSigint: NodeJS.SignalsListener[] = [];
    const savedSigterm: NodeJS.SignalsListener[] = [];

    beforeEach(() => {
      vi.clearAllMocks();
      savedSigint.splice(0, savedSigint.length, ...(process.listeners('SIGINT') as NodeJS.SignalsListener[]));
      savedSigterm.splice(0, savedSigterm.length, ...(process.listeners('SIGTERM') as NodeJS.SignalsListener[]));
      program = new Command();
      program.exitOverride();
      registerServe(program);
    });

    afterEach(() => {
      for (const l of process.listeners('SIGINT') as NodeJS.SignalsListener[]) {
        if (!savedSigint.includes(l)) process.removeListener('SIGINT', l);
      }
      for (const l of process.listeners('SIGTERM') as NodeJS.SignalsListener[]) {
        if (!savedSigterm.includes(l)) process.removeListener('SIGTERM', l);
      }
    });

    it('warns via stderr when host is non-localhost and terminal is not explicitly disabled', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await program.parseAsync(['node', 'test', 'serve', '--host', '0.0.0.0']);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('terminal disabled'),
      );
      stderrSpy.mockRestore();
    });

    it('does not warn when --no-terminal is explicitly set with non-localhost host', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      await program.parseAsync(['node', 'test', 'serve', '--host', '0.0.0.0', '--no-terminal']);
      const terminalWarningCalls = stderrSpy.mock.calls.filter(([msg]) =>
        typeof msg === 'string' && msg.includes('terminal disabled'),
      );
      expect(terminalWarningCalls).toHaveLength(0);
      stderrSpy.mockRestore();
    });
  });
});
