import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
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
    loadGlobalConfig: vi.fn(),
    saveGlobalConfig: vi.fn(),
    deepMerge: vi.fn((base: Record<string, unknown>, override: Record<string, unknown>) => ({ ...base, ...override })),
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
import { validatePartialConfig, ConfigValidationError } from '../../../src/core/config.js';
import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerConfig, exportConfig, importConfig } from '../../../src/cli/commands/config.js';

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

describe('config export/import commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });
  afterEach(() => {
    process.exitCode = undefined;
  });

  // ── exportConfig unit tests ──────────────────────────────────────

  describe('exportConfig()', () => {
    it('throws when config file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(() => exportConfig('/no/config.json')).toThrow('Config file not found');
    });

    it('prints JSON to stdout when no outputFile given', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"mode":"max_plan"}');
      exportConfig('/mock/root/.deckent/config.json');
      expect(print).toHaveBeenCalledWith('{"mode":"max_plan"}');
    });

    it('writes JSON to file when outputFile given', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"mode":"pro_plan"}');
      exportConfig('/mock/root/.deckent/config.json', '/tmp/export.json');
      expect(writeFileSync).toHaveBeenCalledWith('/tmp/export.json', '{"mode":"pro_plan"}');
      expect(print).not.toHaveBeenCalled();
    });

    it('strips block comments before export', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('/* comment */{"mode":"max_plan"}');
      exportConfig('/mock/root/.deckent/config.json');
      const output = vi.mocked(print).mock.calls[0]?.[0] as string;
      expect(output).not.toContain('/* comment */');
      expect(output).toContain('"mode"');
    });

    it('strips line comments before export', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"mode":"max_plan" // inline comment\n}');
      exportConfig('/mock/root/.deckent/config.json');
      const output = vi.mocked(print).mock.calls[0]?.[0] as string;
      expect(output).not.toContain('// inline comment');
    });

    it('throws when config content is invalid JSON after stripping', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('not-valid-json');
      expect(() => exportConfig('/mock/root/.deckent/config.json')).toThrow();
    });

    it('handles empty JSON object {}', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{}');
      expect(() => exportConfig('/mock/root/.deckent/config.json')).not.toThrow();
      expect(print).toHaveBeenCalledWith('{}');
    });

    it('strips multiline block comments spanning multiple lines', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(
        '/*\n * Multi-line\n * block comment\n */\n{"mode":"max_plan"}',
      );
      exportConfig('/mock/root/.deckent/config.json');
      const output = vi.mocked(print).mock.calls[0]?.[0] as string;
      expect(output).not.toContain('Multi-line');
      expect(output).not.toContain('block comment');
      expect(output).toContain('"mode"');
    });

    it('handles config with nested objects', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"modes":{"pro_plan":{"max_workers":3}}}');
      expect(() => exportConfig('/mock/root/.deckent/config.json')).not.toThrow();
      const output = vi.mocked(print).mock.calls[0]?.[0] as string;
      expect(output).toContain('modes');
      expect(output).toContain('max_workers');
    });
  });

  // ── importConfig unit tests ──────────────────────────────────────

  describe('importConfig()', () => {
    it('throws when import file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(() => importConfig('/no/import.json', '/config.json')).toThrow('Import file not found');
    });

    it('throws on invalid JSON in import file', () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => p === '/import.json');
      vi.mocked(readFileSync).mockReturnValue('not-json');
      expect(() => importConfig('/import.json', '/config.json')).toThrow('Invalid JSON');
    });

    it('validates imported config before writing', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('import')) return '{"mode":"max_plan"}';
        return '{}';
      });
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      importConfig('/import.json', '/config.json');
      expect(validatePartialConfig).toHaveBeenCalledWith({ mode: 'max_plan' });
    });

    it('merges import over existing config', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('import')) return '{"language":"tr"}';
        return '{"mode":"max_plan","projectName":"oldname"}';
      });
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      importConfig('/import.json', '/config.json');
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const written = JSON.parse(String(writeCall![1]));
      expect(written.mode).toBe('max_plan');
      expect(written.projectName).toBe('oldname');
      expect(written.language).toBe('tr');
    });

    it('creates new config when no existing config file', () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => p === '/import.json');
      vi.mocked(readFileSync).mockReturnValue('{"mode":"pro_plan"}');
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      importConfig('/import.json', '/config.json');
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const written = JSON.parse(String(writeCall![1]));
      expect(written.mode).toBe('pro_plan');
    });

    it('handles malformed existing config gracefully', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('import')) return '{"mode":"max_plan"}';
        return 'INVALID JSON';
      });
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      // Should not throw
      expect(() => importConfig('/import.json', '/config.json')).not.toThrow();
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const written = JSON.parse(String(writeCall![1]));
      expect(written.mode).toBe('max_plan');
    });

    it('throws ConfigValidationError when import fails validation', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"mode":"bad_mode"}');
      vi.mocked(validatePartialConfig).mockImplementation(() => {
        throw new ConfigValidationError(['Invalid mode']);
      });
      expect(() => importConfig('/import.json', '/config.json')).toThrow(ConfigValidationError);
    });

    it('imports an empty JSON object without error', () => {
      vi.mocked(existsSync).mockImplementation((p: unknown) => p === '/import.json');
      vi.mocked(readFileSync).mockReturnValue('{}');
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      expect(() => importConfig('/import.json', '/config.json')).not.toThrow();
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const written = JSON.parse(String(writeCall![1]));
      expect(written).toEqual({});
    });

    it('preserves extra fields in existing config during merge', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('import')) return '{"language":"tr"}';
        return '{"mode":"max_plan","customField":"preserved","projectName":"myapp"}';
      });
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      importConfig('/import.json', '/config.json');
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const written = JSON.parse(String(writeCall![1]));
      expect(written.customField).toBe('preserved');
      expect(written.projectName).toBe('myapp');
      expect(written.language).toBe('tr');
    });

    it('import data with numeric value is preserved', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('import')) return '{"max_workers":5}';
        return '{}';
      });
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      importConfig('/import.json', '/config.json');
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const written = JSON.parse(String(writeCall![1]));
      expect(written.max_workers).toBe(5);
    });

    it('import data overrides existing config field of same name', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('import')) return '{"mode":"pro_plan"}';
        return '{"mode":"max_plan"}';
      });
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      importConfig('/import.json', '/config.json');
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const written = JSON.parse(String(writeCall![1]));
      expect(written.mode).toBe('pro_plan');
    });
  });

  // ── CLI command integration ──────────────────────────────────────

  describe('config export command', () => {
    it('registers export subcommand', () => {
      const program = new Command();
      registerConfig(program);
      const config = program.commands.find(c => c.name() === 'config');
      const exportCmd = config!.commands.find(c => c.name() === 'export');
      expect(exportCmd).toBeDefined();
    });

    it('exports config to stdout when no file arg', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"mode":"max_plan"}');
      await runCommand(['config', 'export']);
      expect(print).toHaveBeenCalledWith(expect.stringContaining('"mode"'));
    });

    it('exports config to file and prints confirmation', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"mode":"max_plan"}');
      await runCommand(['config', 'export', '/tmp/out.json']);
      expect(writeFileSync).toHaveBeenCalledWith('/tmp/out.json', expect.any(String));
      expect(print).toHaveBeenCalledWith(expect.stringContaining('/tmp/out.json'));
    });

    it('sets exitCode 1 when config file missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['config', 'export']);
      expect(printError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe('config import command', () => {
    it('registers import subcommand', () => {
      const program = new Command();
      registerConfig(program);
      const config = program.commands.find(c => c.name() === 'config');
      const importCmd = config!.commands.find(c => c.name() === 'import');
      expect(importCmd).toBeDefined();
    });

    it('imports config and prints confirmation', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('import')) return '{"language":"tr"}';
        return '{"mode":"max_plan"}';
      });
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      await runCommand(['config', 'import', '/tmp/import.json']);
      expect(writeFileSync).toHaveBeenCalled();
      expect(print).toHaveBeenCalledWith(expect.stringContaining('/tmp/import.json'));
    });

    it('sets exitCode 1 when import file not found', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await runCommand(['config', 'import', '/no/such/file.json']);
      expect(printError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('sets exitCode 1 on validation error and prints invalid config message', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"mode":"bad"}');
      vi.mocked(validatePartialConfig).mockImplementation(() => {
        throw new ConfigValidationError(['bad mode']);
      });
      await runCommand(['config', 'import', '/tmp/bad.json']);
      expect(printError).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Invalid config'),
      }));
      expect(process.exitCode).toBe(1);
    });

    it('sets exitCode 1 on generic error during import', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
      await runCommand(['config', 'import', '/tmp/perm.json']);
      expect(printError).toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('writes merged config with import data overriding existing', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockImplementation((p: unknown) => {
        if (String(p).includes('import')) return '{"language":"tr"}';
        return '{"mode":"max_plan","projectName":"myproject"}';
      });
      vi.mocked(validatePartialConfig).mockImplementation(() => {});
      await runCommand(['config', 'import', '/tmp/import.json']);
      const writeCall = vi.mocked(writeFileSync).mock.calls[0];
      const written = JSON.parse(String(writeCall![1]));
      expect(written.mode).toBe('max_plan');
      expect(written.projectName).toBe('myproject');
      expect(written.language).toBe('tr');
    });
  });
});
