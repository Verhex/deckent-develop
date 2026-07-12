import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/core/config.js', () => ({
  resolveBrainPlanningMode: (c: any) => c?.brain_planning ?? c?.activeModeConfig?.brain_planning ?? 'auto',  // sprint-429 (429-006)
  loadConfig: vi.fn(),
  loadGlobalConfig: vi.fn(),
  saveGlobalConfig: vi.fn(),
  validatePartialConfig: vi.fn(),
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
import { loadConfig, loadGlobalConfig, saveGlobalConfig } from '../../src/core/config.js';
import { print, printError } from '../../src/cli/helpers/output.js';
import { registerMode } from '../../src/cli/commands/mode.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function buildProgram(): Command {
  const program = new Command().exitOverride();
  registerMode(program);
  return program;
}

async function run(...args: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(['node', 'deckent', ...args]);
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('deckent mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('show', () => {
    it('prints current mode from config', async () => {
      vi.mocked(loadConfig).mockResolvedValue({ deckent_style: 'task' } as any);

      await run('mode', 'show');

      expect(loadConfig).toHaveBeenCalledWith('/mock/root');
      expect(print).toHaveBeenCalledWith('Current: task');
    });

    it('defaults to sprint when deckent_style is not set', async () => {
      vi.mocked(loadConfig).mockResolvedValue({} as any);

      await run('mode', 'show');

      expect(print).toHaveBeenCalledWith('Current: sprint');
    });
  });

  describe('sprint', () => {
    it('writes sprint mode to project config', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"max_workers": 3}');

      await run('mode', 'sprint');

      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock/root/.deckent/config.json',
        expect.stringContaining('"deckent_style": "sprint"'),
      );
      expect(print).toHaveBeenCalledWith(expect.stringContaining('sprint mode'));
    });
  });

  describe('task', () => {
    it('writes task mode to project config', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('{"max_workers": 3}');

      await run('mode', 'task');

      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock/root/.deckent/config.json',
        expect.stringContaining('"deckent_style": "task"'),
      );
      expect(print).toHaveBeenCalledWith(expect.stringContaining('task mode'));
    });
  });

  describe('auto', () => {
    it('detects sprint mode when git + DIRECTIVES exist', async () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        const path = String(p);
        if (path.includes('.git')) return true;
        if (path.includes('DIRECTIVES.md')) return true;
        if (path.includes('config.json')) return true;
        return false;
      });
      vi.mocked(readFileSync).mockReturnValue('{}');

      await run('mode', 'auto');

      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock/root/.deckent/config.json',
        expect.stringContaining('"deckent_style": "sprint"'),
      );
      expect(print).toHaveBeenCalledWith(expect.stringContaining('Auto-detected: sprint'));
    });

    it('detects task mode when git is missing', async () => {
      vi.mocked(existsSync).mockImplementation((p: any) => {
        const path = String(p);
        if (path.includes('.git')) return false;
        if (path.includes('DIRECTIVES.md')) return false;
        if (path.includes('config.json')) return false;
        return false;
      });

      await run('mode', 'auto');

      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock/root/.deckent/config.json',
        expect.stringContaining('"deckent_style": "task"'),
      );
      expect(print).toHaveBeenCalledWith(expect.stringContaining('Auto-detected: task'));
    });
  });

  describe('global', () => {
    it('sets global config for valid style', async () => {
      vi.mocked(loadGlobalConfig).mockResolvedValue({ max_workers: 2 } as any);

      await run('mode', 'global', 'task');

      expect(saveGlobalConfig).toHaveBeenCalledWith(
        expect.objectContaining({ deckent_style: 'task' }),
      );
      expect(print).toHaveBeenCalledWith(expect.stringContaining('Global default set: task'));
    });

    it('rejects invalid style', async () => {
      await run('mode', 'global', 'turbo');

      expect(printError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Invalid style') }),
      );
    });
  });
});
