/**
 * Tests for config command overhaul improvements:
 * A) config list / config keys
 * B) autoMigrateOnLoad (via CLI)
 * C) Validation error messages improvement
 * D) JSON comment import support
 * E) Env var overrides (DECKENT_MODE, DECKENT_LANGUAGE)
 * F) --raw flag
 * G) Migration modes field detection
 * H) Timestamp backup
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

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
    deepMerge: vi.fn((a: unknown, b: unknown) => ({ ...(a as object), ...(b as object) })),
    CONFIG_METADATA: {
      mode: { description: 'Plan mode', type: 'string', default: 'max5x_plan', options: ['max_plan', 'max5x_plan', 'pro_plan', 'api'], category: 'Sprint', required: true },
      language: { description: 'Language', type: 'string', default: undefined, category: 'Project' },
      brain_provider: { description: 'Brain provider', type: 'string', default: 'claude', options: ['claude', 'codex', 'gemini'], category: 'Provider' },
    },
    listConfigByCategory: vi.fn(() => ({
      Sprint: ['mode'],
      Project: ['language'],
      Provider: ['brain_provider'],
    })),
  };
});

vi.mock('../../../src/core/config-migration.js', () => ({
  migrateConfig: vi.fn(() => ({ migrated: false, addedFields: [], backupPath: null })),
  needsMigration: vi.fn(() => false),
  getMissingFields: vi.fn(() => []),
  migrateConfigInMemory: vi.fn((c: unknown) => ({ config: c, addedFields: [] })),
  collectKeys: vi.fn(() => []),
  getNestedValue: vi.fn(),
  setNestedValue: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadConfig, validatePartialConfig, ConfigValidationError, CONFIG_METADATA, listConfigByCategory } from '../../../src/core/config.js';
import { migrateConfig, needsMigration } from '../../../src/core/config-migration.js';
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

describe('config list subcommand (A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => { process.exitCode = undefined; });

  it('outputs category headers', async () => {
    await runCommand(['config', 'list']);
    const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
    expect(calls.some(c => c.includes('Sprint'))).toBe(true);
    expect(calls.some(c => c.includes('Project'))).toBe(true);
    expect(calls.some(c => c.includes('Provider'))).toBe(true);
  });

  it('outputs key names under each category', async () => {
    await runCommand(['config', 'list']);
    const output = vi.mocked(print).mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('mode');
    expect(output).toContain('language');
    expect(output).toContain('brain_provider');
  });

  it('shows default values in list output', async () => {
    await runCommand(['config', 'list']);
    const output = vi.mocked(print).mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('max5x_plan');
  });
});

describe('config keys subcommand (A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => { process.exitCode = undefined; });

  it('outputs all key names', async () => {
    await runCommand(['config', 'keys']);
    const calls = vi.mocked(print).mock.calls.map(c => String(c[0]));
    expect(calls).toContain('brain_provider');
    expect(calls).toContain('language');
    expect(calls).toContain('mode');
  });

  it('outputs keys in sorted order', async () => {
    await runCommand(['config', 'keys']);
    const keys = vi.mocked(print).mock.calls.map(c => String(c[0]));
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });
});

describe('config --raw flag (F)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => { process.exitCode = undefined; });

  it('shows raw file content without loading defaults', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"mode":"pro_plan"}');
    await runCommand(['config', '--raw']);
    expect(print).toHaveBeenCalledWith('{"mode":"pro_plan"}');
    expect(loadConfig).not.toHaveBeenCalled();
  });

  it('shows empty object when config file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    await runCommand(['config', '--raw']);
    expect(print).toHaveBeenCalledWith('{}');
    expect(loadConfig).not.toHaveBeenCalled();
  });
});

describe('autoMigrateOnLoad via CLI (B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => { process.exitCode = undefined; });

  it('calls needsMigration when config file exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"mode":"pro_plan"}');
    vi.mocked(needsMigration).mockReturnValue(false);
    vi.mocked(loadConfig).mockResolvedValue({ mode: 'pro_plan' } as any);
    await runCommand(['config']);
    expect(needsMigration).toHaveBeenCalled();
  });

  it('calls migrateConfig when needsMigration returns true', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"mode":"pro_plan"}');
    vi.mocked(needsMigration).mockReturnValue(true);
    vi.mocked(migrateConfig).mockReturnValue({ migrated: true, addedFields: ['fix_phase_enabled'], backupPath: '/mock/root/.deckent/config.json.bak.2026' });
    vi.mocked(loadConfig).mockResolvedValue({ mode: 'pro_plan' } as any);
    await runCommand(['config']);
    expect(migrateConfig).toHaveBeenCalledWith(
      expect.stringContaining('config.json'),
      { dryRun: false }
    );
  });
});

describe('JSON comment import support (D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => { process.exitCode = undefined; });

  it('imports JSON with line comments', async () => {
    const jsonWithComments = `{
  // This is the mode setting
  "mode": "pro_plan",
  "language": "en" // inline comment
}`;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const filePath = String(p);
      if (filePath.includes('import')) return jsonWithComments;
      return '{}';
    });
    vi.mocked(validatePartialConfig).mockImplementation(() => {});
    vi.mocked(writeFileSync).mockImplementation(() => {});
    await runCommand(['config', 'import', '/tmp/import.json']);
    expect(writeFileSync).toHaveBeenCalled();
    const written = JSON.parse(String(vi.mocked(writeFileSync).mock.calls[0]![1]));
    expect(written.mode).toBe('pro_plan');
  });

  it('imports JSON with block comments', async () => {
    const jsonWithBlock = `{
  /* Sprint mode configuration */
  "mode": "max_plan"
}`;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: unknown) => {
      const filePath = String(p);
      if (filePath.includes('import')) return jsonWithBlock;
      return '{}';
    });
    vi.mocked(validatePartialConfig).mockImplementation(() => {});
    vi.mocked(writeFileSync).mockImplementation(() => {});
    await runCommand(['config', 'import', '/tmp/import.json']);
    const written = JSON.parse(String(vi.mocked(writeFileSync).mock.calls[0]![1]));
    expect(written.mode).toBe('max_plan');
  });
});

describe('config registers list and keys commands', () => {
  it('registers list subcommand', () => {
    const program = new Command();
    registerConfig(program);
    const cmd = program.commands.find(c => c.name() === 'config');
    expect(cmd).toBeDefined();
    expect(cmd!.commands.find(c => c.name() === 'list')).toBeDefined();
  });

  it('registers keys subcommand', () => {
    const program = new Command();
    registerConfig(program);
    const cmd = program.commands.find(c => c.name() === 'config');
    expect(cmd).toBeDefined();
    expect(cmd!.commands.find(c => c.name() === 'keys')).toBeDefined();
  });
});
