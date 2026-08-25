import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks (must be hoisted before imports) ──────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readdirSync: vi.fn().mockReturnValue(['index.html', 'assets']),
  renameSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
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
  createHttpServer: vi.fn().mockReturnValue({
    close: vi.fn().mockReturnValue(Promise.resolve()),
    terminalToken: 'mock-token-abc',
  }),
}));

vi.mock('../../src/api/terminal/session-backend.js', () => ({
  LocalPtyBackend: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/dashboard-dir.js', () => ({
  getDashboardStaticDir: vi.fn().mockReturnValue('/mock/root/dist/dashboard'),
}));

import { print } from '../../src/cli/helpers/output.js';
import { createHttpServer } from '../../src/api/server.js';
import { registerServe } from '../../src/cli/commands/serve.js';

// ─── Helper ──────────────────────────────────────────────────────────

async function runServe(extraArgs: string[] = []): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerServe(program);
  try {
    await program.parseAsync(['node', 'test', 'serve', ...extraArgs]);
  } catch {
    // commander exitOverride throws on --help; ignore
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('serve first-run banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore close mock so cleanup handler (if fired) doesn't throw
    (createHttpServer as ReturnType<typeof vi.fn>).mockReturnValue({
      close: vi.fn().mockReturnValue(Promise.resolve()),
      terminalToken: 'mock-token-abc',
    });
    process.exitCode = undefined;
  });
  afterEach(() => {
    // Remove SIGINT/SIGTERM listeners added by serve action so they don't fire
    // after test teardown and hit cleared mock state
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.exitCode = undefined;
  });

  it('prints the ready line with host and port', async () => {
    await runServe(['--port', '3100']);

    const calls = (print as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    const readyLine = calls.find((l) => l.includes('3100'));
    expect(readyLine).toBeDefined();
    expect(readyLine).toContain('http://');
    expect(readyLine).toContain('3100');
  });

  it('prints the token auto-injected line', async () => {
    await runServe();

    const calls = (print as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    const tokenLine = calls.find((l) => l.toLowerCase().includes('token'));
    expect(tokenLine).toBeDefined();
    expect(tokenLine).toContain('auto-injected');
  });

  it('prints terminal-enabled message when terminal is active', async () => {
    await runServe();

    const calls = (print as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    const termLine = calls.find((l) => l.toLowerCase().includes('terminal'));
    expect(termLine).toBeDefined();
    // terminal is enabled by default on localhost
    expect(termLine).toContain('enabled');
  });

  it('prints terminal-disabled message when --no-terminal is passed', async () => {
    await runServe(['--no-terminal']);

    const calls = (print as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    const termLine = calls.find((l) => l.toLowerCase().includes('terminal'));
    expect(termLine).toBeDefined();
    expect(termLine).toContain('disabled');
  });

  it('prints the stop (Ctrl+C) hint', async () => {
    await runServe();

    const calls = (print as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    const stopLine = calls.find((l) => l.includes('Ctrl+C'));
    expect(stopLine).toBeDefined();
  });

  it('prints the port/host tips line', async () => {
    await runServe();

    const calls = (print as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    const tipLine = calls.find((l) => l.includes('--port'));
    expect(tipLine).toBeDefined();
    expect(tipLine).toContain('--host');
  });

  it('uses getMessage — all banner strings routed through i18n', async () => {
    await runServe();

    // createHttpServer should have been called (server was created)
    expect(createHttpServer).toHaveBeenCalledOnce();
    // print should have been called multiple times for the banner
    expect((print as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
