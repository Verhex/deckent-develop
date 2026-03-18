import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('../../../src/core/config.js', () => {
  const MockConfigValidationError = class ConfigValidationError extends Error {
    errors: string[];
    constructor(errors: string[]) {
      super(errors.join(', '));
      this.name = 'ConfigValidationError';
      this.errors = errors;
    }
  };
  return {
    loadConfig: vi.fn(),
    validatePartialConfig: vi.fn(),
    ConfigValidationError: MockConfigValidationError,
  };
});

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadConfig, validatePartialConfig, ConfigValidationError } from '../../../src/core/config.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerConfig } from '../../../src/cli/commands/config.js';

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerConfig(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride throws on exit
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('config command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('registers config command with set subcommand', () => {
    const program = new Command();
    registerConfig(program);
    const cmd = program.commands.find(c => c.name() === 'config');
    expect(cmd).toBeDefined();
    const subCmd = cmd!.commands.find(c => c.name() === 'set');
    expect(subCmd).toBeDefined();
  });

  it('shows current config as JSON', async () => {
    const mockConfig = { mode: 'max_plan', language: 'en', projectName: 'myproject' };
    vi.mocked(loadConfig).mockResolvedValue(mockConfig as any);
    await runCommand(['config']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('max_plan'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('myproject'));
  });

  it('handles loadConfig rejection with error', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('file not found'));
    await runCommand(['config']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('config set writes value to file', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"mode":"max_plan"}');
    vi.mocked(validatePartialConfig).mockImplementation(() => {});
    await runCommand(['config', 'set', 'language', 'tr']);
    expect(writeFileSync).toHaveBeenCalled();
    const writeCall = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(String(writeCall![1]));
    expect(written.language).toBe('tr');
    expect(written.mode).toBe('max_plan');
  });

  it('config set parses JSON values', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(validatePartialConfig).mockImplementation(() => {});
    await runCommand(['config', 'set', 'max_workers', '4']);
    expect(writeFileSync).toHaveBeenCalled();
    const writeCall = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(String(writeCall![1]));
    expect(written.max_workers).toBe(4); // parsed as number, not string
  });

  it('config set keeps string for non-JSON values', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(validatePartialConfig).mockImplementation(() => {});
    await runCommand(['config', 'set', 'projectName', 'my-project']);
    const writeCall = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(String(writeCall![1]));
    expect(written.projectName).toBe('my-project');
  });

  it('config set prints confirmation', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(validatePartialConfig).mockImplementation(() => {});
    await runCommand(['config', 'set', 'language', 'en']);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Set language'));
  });

  it('config set reports validation errors', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(validatePartialConfig).mockImplementation(() => {
      throw new ConfigValidationError(['invalid mode value']);
    });
    await runCommand(['config', 'set', 'mode', 'bad']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('config set handles generic errors', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('EACCES'); });
    await runCommand(['config', 'set', 'key', 'val']);
    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('config set creates new object when file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(validatePartialConfig).mockImplementation(() => {});
    await runCommand(['config', 'set', 'newKey', '"newValue"']);
    const writeCall = vi.mocked(writeFileSync).mock.calls[0];
    const written = JSON.parse(String(writeCall![1]));
    expect(written.newKey).toBe('newValue');
  });
});
