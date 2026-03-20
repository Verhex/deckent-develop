import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../../src/core/plugin.js', () => ({
  loadPlugin: vi.fn(),
  listPlugins: vi.fn(),
  scanPlugins: vi.fn(),
  PluginError: class PluginError extends Error {
    constructor(msg: string) { super(msg); this.name = 'PluginError'; }
  },
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { loadPlugin, scanPlugins } from '../../../src/core/plugin.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerPlugin } from '../../../src/cli/commands/plugin.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlugin(overrides?: Partial<{ name: string; version: string; description: string; entrypoint: string }>) {
  return {
    manifest: {
      name: 'test-plugin',
      version: '1.0.0',
      description: 'A test plugin',
      entrypoint: 'index.js',
      ...overrides,
    },
    dir: '/plugins/test-plugin',
  };
}

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerPlugin(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on --help / exit
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('plugin command registration', () => {
  it('registers plugin command on program', () => {
    const program = new Command();
    registerPlugin(program);
    const cmd = program.commands.find(c => c.name() === 'plugin');
    expect(cmd).toBeDefined();
    expect(cmd!.description()).toContain('plugin');
  });

  it('has install subcommand', () => {
    const program = new Command();
    registerPlugin(program);
    const cmd = program.commands.find(c => c.name() === 'plugin')!;
    const install = cmd.commands.find(c => c.name() === 'install');
    expect(install).toBeDefined();
  });

  it('has list subcommand', () => {
    const program = new Command();
    registerPlugin(program);
    const cmd = program.commands.find(c => c.name() === 'plugin')!;
    const list = cmd.commands.find(c => c.name() === 'list');
    expect(list).toBeDefined();
  });

  it('has info subcommand', () => {
    const program = new Command();
    registerPlugin(program);
    const cmd = program.commands.find(c => c.name() === 'plugin')!;
    const info = cmd.commands.find(c => c.name() === 'info');
    expect(info).toBeDefined();
  });
});

describe('plugin install', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { process.exitCode = undefined; });

  it('prints not implemented message for install', async () => {
    await runCommand(['plugin', 'install', 'my-plugin']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('my-plugin'));
  });
});

describe('plugin list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints no plugins message when list is empty', async () => {
    vi.mocked(scanPlugins).mockReturnValue([]);
    await runCommand(['plugin', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('No plugins'));
  });

  it('prints plugin count and details for each plugin', async () => {
    const plugins = [makePlugin(), makePlugin({ name: 'other-plugin', version: '2.0.0' })];
    vi.mocked(scanPlugins).mockReturnValue(plugins);
    await runCommand(['plugin', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('2'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('test-plugin@1.0.0'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('other-plugin@2.0.0'));
  });

  it('prints plugin description in list', async () => {
    vi.mocked(scanPlugins).mockReturnValue([makePlugin({ description: 'My awesome plugin' })]);
    await runCommand(['plugin', 'list']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('My awesome plugin'));
  });

  it('sets exitCode=1 and calls printError when scanPlugins throws', async () => {
    vi.mocked(scanPlugins).mockImplementation(() => { throw new Error('scan failed'); });
    await runCommand(['plugin', 'list']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('calls scanPlugins with project root', async () => {
    vi.mocked(scanPlugins).mockReturnValue([]);
    await runCommand(['plugin', 'list']);
    expect(scanPlugins).toHaveBeenCalledWith('/mock/root');
  });
});

describe('plugin info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('prints all plugin fields on success', async () => {
    vi.mocked(loadPlugin).mockReturnValue(makePlugin());
    await runCommand(['plugin', 'info', '/plugins/test-plugin']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('test-plugin'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('1.0.0'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('A test plugin'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('index.js'));
  });

  it('prints directory info', async () => {
    vi.mocked(loadPlugin).mockReturnValue(makePlugin());
    await runCommand(['plugin', 'info', '/plugins/test-plugin']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('/plugins/test-plugin'));
  });

  it('sets exitCode=1 and calls printError when loadPlugin throws', async () => {
    vi.mocked(loadPlugin).mockImplementation(() => { throw new Error('no manifest'); });
    await runCommand(['plugin', 'info', '/bad/dir']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('calls loadPlugin with the given directory', async () => {
    vi.mocked(loadPlugin).mockReturnValue(makePlugin());
    await runCommand(['plugin', 'info', '/my/plugin/dir']);
    expect(loadPlugin).toHaveBeenCalledWith('/my/plugin/dir');
  });
});
