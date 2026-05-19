import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs');

const mockClose = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/api/server.js', () => ({
  createHttpServer: vi.fn().mockReturnValue({
    server: { on: vi.fn() },
    close: () => mockClose(),
  }),
}));
vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/test/project'),
}));
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

const mockedFs = vi.mocked(fs);

describe('serve command — EXTENDED_MIME_TYPES', () => {
  it('contains all original MIME types', async () => {
    const { EXTENDED_MIME_TYPES } = await import('../../../src/cli/commands/serve.js');
    expect(EXTENDED_MIME_TYPES['.html']).toBe('text/html');
    expect(EXTENDED_MIME_TYPES['.js']).toBe('application/javascript');
    expect(EXTENDED_MIME_TYPES['.css']).toBe('text/css');
    expect(EXTENDED_MIME_TYPES['.json']).toBe('application/json');
    expect(EXTENDED_MIME_TYPES['.svg']).toBe('image/svg+xml');
  });

  it('contains image MIME types', async () => {
    const { EXTENDED_MIME_TYPES } = await import('../../../src/cli/commands/serve.js');
    expect(EXTENDED_MIME_TYPES['.png']).toBe('image/png');
    expect(EXTENDED_MIME_TYPES['.jpg']).toBe('image/jpeg');
    expect(EXTENDED_MIME_TYPES['.jpeg']).toBe('image/jpeg');
    expect(EXTENDED_MIME_TYPES['.gif']).toBe('image/gif');
    expect(EXTENDED_MIME_TYPES['.ico']).toBe('image/x-icon');
    expect(EXTENDED_MIME_TYPES['.webp']).toBe('image/webp');
  });

  it('contains font MIME types', async () => {
    const { EXTENDED_MIME_TYPES } = await import('../../../src/cli/commands/serve.js');
    expect(EXTENDED_MIME_TYPES['.woff']).toBe('font/woff');
    expect(EXTENDED_MIME_TYPES['.woff2']).toBe('font/woff2');
    expect(EXTENDED_MIME_TYPES['.ttf']).toBe('font/ttf');
  });

  it('has more than 10 MIME type entries', async () => {
    const { EXTENDED_MIME_TYPES } = await import('../../../src/cli/commands/serve.js');
    expect(Object.keys(EXTENDED_MIME_TYPES).length).toBeGreaterThan(10);
  });
});

describe('serve command — checkDistDirectory', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns exists=false when directory does not exist', async () => {
    mockedFs.existsSync.mockReturnValue(false);
    const { checkDistDirectory } = await import('../../../src/cli/commands/serve.js');
    const result = checkDistDirectory('/path/dist');
    expect(result.exists).toBe(false);
    expect(result.hasContent).toBe(false);
  });

  it('returns exists=true, hasContent=true when directory has files', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockReturnValue(['index.html', 'main.js'] as never);
    const { checkDistDirectory } = await import('../../../src/cli/commands/serve.js');
    const result = checkDistDirectory('/path/dist');
    expect(result.exists).toBe(true);
    expect(result.hasContent).toBe(true);
  });

  it('returns exists=true, hasContent=false when directory is empty', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockReturnValue([] as never);
    const { checkDistDirectory } = await import('../../../src/cli/commands/serve.js');
    const result = checkDistDirectory('/path/dist');
    expect(result.exists).toBe(true);
    expect(result.hasContent).toBe(false);
  });

  it('handles readdirSync errors gracefully', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockImplementation(() => { throw new Error('EPERM'); });
    const { checkDistDirectory } = await import('../../../src/cli/commands/serve.js');
    const result = checkDistDirectory('/path/dist');
    expect(result.exists).toBe(true);
    expect(result.hasContent).toBe(false);
  });
});

describe('serve command — registerServe', () => {
  beforeEach(() => { vi.clearAllMocks(); mockClose.mockResolvedValue(undefined); });
  afterEach(() => {
    // Remove any SIGINT/SIGTERM listeners added by registerServe to prevent leaks
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
  });

  it('registers serve command with expected options', async () => {
    const { Command } = await import('commander');
    const { registerServe } = await import('../../../src/cli/commands/serve.js');
    const program = new Command();
    registerServe(program);
    const cmd = program.commands.find(c => c.name() === 'serve');
    expect(cmd).toBeDefined();
    const optNames = cmd!.options.map(o => o.long);
    expect(optNames).toContain('--port');
    expect(optNames).toContain('--dev');
    expect(optNames).toContain('--dev-port');
  });

  it('starts server on default port', async () => {
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockReturnValue(['index.html'] as never);
    const { Command } = await import('commander');
    const { registerServe } = await import('../../../src/cli/commands/serve.js');
    const { createHttpServer } = await import('../../../src/api/server.js');
    const program = new Command();
    registerServe(program);
    const cmd = program.commands.find(c => c.name() === 'serve')!;
    await cmd.parseAsync([], { from: 'user' });
    // serve now wires the bundled dashboard staticDir (previously a bug: it
    // built the wrong path and never passed it to createHttpServer).
    expect(createHttpServer).toHaveBeenCalledWith(
      '/test/project',
      3100,
      expect.stringContaining('dashboard'),
    );
  });

  it('rejects invalid port', async () => {
    const { Command } = await import('commander');
    const { registerServe } = await import('../../../src/cli/commands/serve.js');
    const { printError } = await import('../../../src/cli/helpers/output.js');
    const program = new Command();
    registerServe(program);
    const cmd = program.commands.find(c => c.name() === 'serve')!;
    await cmd.parseAsync(['--port', 'notaport'], { from: 'user' });
    expect(printError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Invalid port') }));
  });

  it('warns when dist directory is missing', async () => {
    mockedFs.existsSync.mockReturnValue(false);
    const { Command } = await import('commander');
    const { registerServe } = await import('../../../src/cli/commands/serve.js');
    const { print } = await import('../../../src/cli/helpers/output.js');
    const program = new Command();
    registerServe(program);
    const cmd = program.commands.find(c => c.name() === 'serve')!;
    await cmd.parseAsync([], { from: 'user' });
    const calls = vi.mocked(print).mock.calls.map(c => c[0] as string);
    expect(calls.some(c => c.includes('Warning') || c.includes('build'))).toBe(true);
  });
});
