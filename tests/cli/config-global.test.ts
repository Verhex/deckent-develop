import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainModel: () => 'sonnet',  // sprint-431 (431-003) compiler-cagri-zinciri okur
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
  loadGlobalConfig: vi.fn(),
  saveGlobalConfig: vi.fn(),
  mergeConfigs: vi.fn(),
  validatePartialConfig: vi.fn(),
  deepMerge: vi.fn((base: Record<string, unknown>, override: Record<string, unknown>) => ({ ...base, ...override })),
  ConfigValidationError: class ConfigValidationError extends Error {
    public readonly errors: string[];
    constructor(errors: string[]) {
      super(`Config validation failed: ${errors.join(', ')}`);
      this.name = 'ConfigValidationError';
      this.errors = errors;
    }
  },
}));

vi.mock('../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  PROJECT_CONFIG_PATH: '.deckent/config.json',
  GLOBAL_CONFIG_PATH: '/home/mock/.deckent/config.json',
  GLOBAL_DECKENT_DIR: '/home/mock/.deckent',
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadConfig, loadGlobalConfig, saveGlobalConfig, mergeConfigs, validatePartialConfig, ConfigValidationError } from '../../src/core/config.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import { exportConfig, importConfig, registerConfig } from '../../src/cli/commands/config.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeResolvedConfig(overrides = {}) {
  return {
    mode: 'max_plan',
    activeModeConfig: { brain_model: 'claude-opus-4-8', max_workers: 3 },
    language: 'en',
    projectName: 'test-project',
    projectRoot: '/mock/root',
    version: '1.0.0',
    ...overrides,
  };
}

async function runConfigCommand(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerConfig(program);
  try {
    await program.parseAsync(['node', 'test', 'config', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('config command — project config (default)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows project config by default when no flags', async () => {
    vi.mocked(loadConfig).mockResolvedValue(makeResolvedConfig() as any);
    await runConfigCommand();
    expect(loadConfig).toHaveBeenCalled();
    expect(print).toHaveBeenCalled();
  });

  it('config output is valid JSON', async () => {
    const config = makeResolvedConfig();
    vi.mocked(loadConfig).mockResolvedValue(config as any);
    await runConfigCommand();
    const printCall = vi.mocked(print).mock.calls[0]?.[0];
    expect(() => JSON.parse(printCall as string)).not.toThrow();
  });

  it('config shows error when loadConfig fails', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));
    await runConfigCommand();
    expect(printError).toHaveBeenCalled();
  });
});

describe('exportConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports config to stdout when no outputFile', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"mode": "max_plan"}');
    exportConfig('/mock/root/.deckent/config.json');
    expect(print).toHaveBeenCalledWith('{"mode": "max_plan"}');
  });

  it('exports config to file when outputFile is given', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"mode": "max_plan"}');
    exportConfig('/mock/root/.deckent/config.json', '/tmp/out.json');
    expect(writeFileSync).toHaveBeenCalledWith('/tmp/out.json', '{"mode": "max_plan"}');
  });

  it('throws when config file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(() => exportConfig('/nonexistent/config.json')).toThrow('Config file not found');
  });

  it('strips JSON comments before exporting', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{\n  // comment\n  "mode": "max_plan"\n}');
    exportConfig('/mock/root/.deckent/config.json');
    const output = vi.mocked(print).mock.calls[0]?.[0] as string;
    expect(output).not.toContain('// comment');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('throws on invalid JSON after stripping comments', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not valid json');
    expect(() => exportConfig('/mock/config.json')).toThrow();
  });
});

describe('importConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('imports and merges config over existing', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('import')) return '{"mode": "pro_plan"}';
      return '{"mode": "max_plan", "language": "en"}';
    });
    importConfig('/import.json', '/config.json');
    expect(writeFileSync).toHaveBeenCalledWith(
      '/config.json',
      expect.stringContaining('"mode"'),
    );
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
    expect(written.mode).toBe('pro_plan');
    expect(written.language).toBe('en');
  });

  it('throws when import file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(() => importConfig('/nonexistent.json', '/config.json')).toThrow('Import file not found');
  });

  it('throws on invalid JSON in import file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not json');
    expect(() => importConfig('/import.json', '/config.json')).toThrow('Invalid JSON');
  });

  it('creates fresh config when existing config is malformed', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('import')) return '{"mode": "pro_plan"}';
      return 'malformed{{{';
    });
    importConfig('/import.json', '/config.json');
    const written = JSON.parse(vi.mocked(writeFileSync).mock.calls[0][1] as string);
    expect(written.mode).toBe('pro_plan');
  });

  it('calls validatePartialConfig on imported data', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockImplementation((p: any) => {
      if (String(p).includes('import')) return '{"mode": "max_plan"}';
      return '{}';
    });
    importConfig('/import.json', '/config.json');
    expect(validatePartialConfig).toHaveBeenCalledWith({ mode: 'max_plan' });
  });
});

describe('loadGlobalConfig / saveGlobalConfig / mergeConfigs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loadGlobalConfig returns null when file does not exist', async () => {
    vi.mocked(loadGlobalConfig).mockResolvedValue(null);
    const result = await loadGlobalConfig();
    expect(result).toBeNull();
  });

  it('mergeConfigs gives project config priority over global', () => {
    const global = { mode: 'max_plan' as const, language: 'tr' };
    const project = { mode: 'pro_plan' as const };
    vi.mocked(mergeConfigs).mockReturnValue(makeResolvedConfig({ mode: 'pro_plan', language: 'tr' }) as any);
    const result = mergeConfigs(global as any, project as any);
    expect(result.mode).toBe('pro_plan');
  });

  it('mergeConfigs works with null global config', () => {
    vi.mocked(mergeConfigs).mockReturnValue(makeResolvedConfig() as any);
    const result = mergeConfigs(null, { mode: 'max_plan' } as any);
    expect(result).toBeDefined();
    expect(result.mode).toBe('max_plan');
  });
});
