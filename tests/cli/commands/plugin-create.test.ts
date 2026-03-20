import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../../src/core/plugin.js', () => ({
  loadPlugin: vi.fn(),
  scanPlugins: vi.fn(),
  createPlugin: vi.fn(),
  PluginError: class PluginError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'PluginError';
    }
  },
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { createPlugin, PluginError } from '../../../src/core/plugin.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerPlugin } from '../../../src/cli/commands/plugin.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlugin(name = 'my-plugin') {
  return {
    manifest: {
      name,
      version: '0.1.0',
      description: '',
      entrypoint: 'SKILL.md',
    },
    dir: `/mock/root/.deckent/plugins/${name}`,
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

describe('plugin create — command registration', () => {
  it('registers the create subcommand', () => {
    const program = new Command();
    registerPlugin(program);
    const cmd = program.commands.find(c => c.name() === 'plugin')!;
    const create = cmd.commands.find(c => c.name() === 'create');
    expect(create).toBeDefined();
  });

  it('create subcommand has the correct description', () => {
    const program = new Command();
    registerPlugin(program);
    const cmd = program.commands.find(c => c.name() === 'plugin')!;
    const create = cmd.commands.find(c => c.name() === 'create')!;
    expect(create.description()).toContain('plugin');
  });
});

describe('plugin create — success path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('calls createPlugin with plugin name and pluginsDir', async () => {
    vi.mocked(createPlugin).mockResolvedValue(makePlugin('my-plugin'));
    await runCommand(['plugin', 'create', 'my-plugin']);
    expect(createPlugin).toHaveBeenCalledWith(
      'my-plugin',
      '/mock/root/.deckent/plugins',
    );
  });

  it('prints confirmation message with plugin name', async () => {
    vi.mocked(createPlugin).mockResolvedValue(makePlugin('my-plugin'));
    await runCommand(['plugin', 'create', 'my-plugin']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('my-plugin'));
  });

  it('prints the plugin directory path', async () => {
    vi.mocked(createPlugin).mockResolvedValue(makePlugin('my-plugin'));
    await runCommand(['plugin', 'create', 'my-plugin']);
    expect(print).toHaveBeenCalledWith(
      expect.stringContaining('/mock/root/.deckent/plugins/my-plugin'),
    );
  });

  it('prints manifest.json creation notice', async () => {
    vi.mocked(createPlugin).mockResolvedValue(makePlugin('my-plugin'));
    await runCommand(['plugin', 'create', 'my-plugin']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('manifest.json'));
  });

  it('prints SKILL.md creation notice', async () => {
    vi.mocked(createPlugin).mockResolvedValue(makePlugin('my-plugin'));
    await runCommand(['plugin', 'create', 'my-plugin']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('SKILL.md'));
  });

  it('prints README.md creation notice', async () => {
    vi.mocked(createPlugin).mockResolvedValue(makePlugin('my-plugin'));
    await runCommand(['plugin', 'create', 'my-plugin']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('README.md'));
  });

  it('does not set exitCode on success', async () => {
    vi.mocked(createPlugin).mockResolvedValue(makePlugin('my-plugin'));
    await runCommand(['plugin', 'create', 'my-plugin']);
    expect(process.exitCode).toBeUndefined();
  });
});

describe('plugin create — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('sets exitCode=1 and calls printError when createPlugin throws PluginError', async () => {
    vi.mocked(createPlugin).mockRejectedValue(
      new PluginError('Plugin "my-plugin" already exists'),
    );
    await runCommand(['plugin', 'create', 'my-plugin']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('sets exitCode=1 and calls printError on generic error', async () => {
    vi.mocked(createPlugin).mockRejectedValue(new Error('disk full'));
    await runCommand(['plugin', 'create', 'my-plugin']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('does not print success message on error', async () => {
    vi.mocked(createPlugin).mockRejectedValue(new Error('fail'));
    await runCommand(['plugin', 'create', 'my-plugin']);
    const calls = vi.mocked(print).mock.calls;
    // print should not have been called with a "created at" message
    const successCalls = calls.filter(([msg]) => msg.includes('created at'));
    expect(successCalls).toHaveLength(0);
  });
});

describe('plugin create — pluginsDir construction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('uses .deckent/plugins under project root', async () => {
    vi.mocked(createPlugin).mockResolvedValue(makePlugin('foo'));
    await runCommand(['plugin', 'create', 'foo']);
    const [, pluginsDir] = vi.mocked(createPlugin).mock.calls[0]!;
    expect(pluginsDir).toBe('/mock/root/.deckent/plugins');
  });

  it('passes the exact plugin name to createPlugin', async () => {
    vi.mocked(createPlugin).mockResolvedValue(makePlugin('code-reviewer'));
    await runCommand(['plugin', 'create', 'code-reviewer']);
    const [name] = vi.mocked(createPlugin).mock.calls[0]!;
    expect(name).toBe('code-reviewer');
  });
});
