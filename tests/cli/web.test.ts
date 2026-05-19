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

import { registerWeb, getMimeType } from '../../src/cli/commands/web.js';
import { print } from '../../src/cli/helpers/output.js';

// ─── Tests ──────────────────────────────────────────────────────────
describe('registerWeb', () => {
  let program: Command;
  const originalListeners = {
    SIGINT: [] as NodeJS.SignalsListener[],
    SIGTERM: [] as NodeJS.SignalsListener[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockResolvedValue(undefined);
    originalListeners.SIGINT = process.listeners('SIGINT') as NodeJS.SignalsListener[];
    originalListeners.SIGTERM = process.listeners('SIGTERM') as NodeJS.SignalsListener[];
    program = new Command();
    program.exitOverride();
    registerWeb(program);
  });

  afterEach(() => {
    const currentSigint = process.listeners('SIGINT') as NodeJS.SignalsListener[];
    const currentSigterm = process.listeners('SIGTERM') as NodeJS.SignalsListener[];
    for (const l of currentSigint) {
      if (!originalListeners.SIGINT.includes(l)) process.removeListener('SIGINT', l);
    }
    for (const l of currentSigterm) {
      if (!originalListeners.SIGTERM.includes(l)) process.removeListener('SIGTERM', l);
    }
  });

  it('registers web command', () => {
    const cmd = program.commands.find((c) => c.name() === 'web');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toBe('Start web dashboard with API server');
  });

  it('starts server with default port', async () => {
    await program.parseAsync(['node', 'test', 'web']);
    expect(mockCreateHttpServer).toHaveBeenCalledWith(
      '/tmp/test-project',
      3100,
      expect.stringContaining('dashboard'),
    );
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('Deckent Web Dashboard on http://localhost:3100'),
    );
  });

  it('starts server with custom port', async () => {
    await program.parseAsync(['node', 'test', 'web', '--port', '4000']);
    expect(mockCreateHttpServer).toHaveBeenCalledWith(
      '/tmp/test-project',
      4000,
      expect.stringContaining('dashboard'),
    );
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:4000'),
    );
  });

  it('prints dev mode instruction with --dev flag', async () => {
    await program.parseAsync(['node', 'test', 'web', '--dev']);
    expect(vi.mocked(print)).toHaveBeenCalledWith(
      expect.stringContaining("Run 'cd src/dashboard && npm run dev' for Vite dev server on port 5173"),
    );
  });

  it('passes undefined staticDir in dev mode', async () => {
    await program.parseAsync(['node', 'test', 'web', '--dev']);
    expect(mockCreateHttpServer).toHaveBeenCalledWith(
      '/tmp/test-project',
      3100,
      undefined,
    );
  });

  it('passes staticDir in production mode', async () => {
    await program.parseAsync(['node', 'test', 'web']);
    const callArgs = mockCreateHttpServer.mock.calls[0]!;
    // Bundled dashboard dir (built: dist/dashboard; source/test: src/dashboard).
    expect(callArgs[2]).toContain('dashboard');
  });

  it('registers SIGINT and SIGTERM handlers', async () => {
    const onSpy = vi.spyOn(process, 'on');
    await program.parseAsync(['node', 'test', 'web']);

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
    await program.parseAsync(['node', 'test', 'web']);

    const sigintCall = onSpy.mock.calls.find(([sig]) => sig === 'SIGINT');
    expect(sigintCall).toBeDefined();
    const cleanupFn = sigintCall![1] as () => void;

    cleanupFn();
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
    await program.parseAsync(['node', 'test', 'web']);

    const sigintCall = onSpy.mock.calls.find(([sig]) => sig === 'SIGINT');
    const cleanupFn = sigintCall![1] as () => void;

    cleanupFn();
    await new Promise((r) => setTimeout(r, 10));

    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    onSpy.mockRestore();
  });
});

describe('getMimeType', () => {
  it('returns text/html for .html', () => {
    expect(getMimeType('index.html')).toBe('text/html');
  });

  it('returns application/javascript for .js', () => {
    expect(getMimeType('main.js')).toBe('application/javascript');
  });

  it('returns text/css for .css', () => {
    expect(getMimeType('style.css')).toBe('text/css');
  });

  it('returns image/svg+xml for .svg', () => {
    expect(getMimeType('icon.svg')).toBe('image/svg+xml');
  });

  it('returns application/json for .json', () => {
    expect(getMimeType('data.json')).toBe('application/json');
  });

  it('returns application/octet-stream for unknown extensions', () => {
    expect(getMimeType('file.xyz')).toBe('application/octet-stream');
  });
});

describe('static file serving integration', () => {
  const savedListeners = {
    SIGINT: [] as NodeJS.SignalsListener[],
    SIGTERM: [] as NodeJS.SignalsListener[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClose.mockResolvedValue(undefined);
    savedListeners.SIGINT = process.listeners('SIGINT') as NodeJS.SignalsListener[];
    savedListeners.SIGTERM = process.listeners('SIGTERM') as NodeJS.SignalsListener[];
  });

  afterEach(() => {
    const currentSigint = process.listeners('SIGINT') as NodeJS.SignalsListener[];
    const currentSigterm = process.listeners('SIGTERM') as NodeJS.SignalsListener[];
    for (const l of currentSigint) {
      if (!savedListeners.SIGINT.includes(l)) process.removeListener('SIGINT', l);
    }
    for (const l of currentSigterm) {
      if (!savedListeners.SIGTERM.includes(l)) process.removeListener('SIGTERM', l);
    }
  });

  it('createHttpServer receives staticDir parameter', async () => {
    const prog = new Command();
    prog.exitOverride();
    registerWeb(prog);

    await prog.parseAsync(['node', 'test', 'web']);

    expect(mockCreateHttpServer).toHaveBeenCalledTimes(1);
    const args = mockCreateHttpServer.mock.calls[0]!;
    expect(args).toHaveLength(3);
    expect(args[0]).toBe('/tmp/test-project');
    expect(args[1]).toBe(3100);
    expect(typeof args[2]).toBe('string');
  });
});
