import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────
// Same mock set as tests/cli/mode-command.test.ts — RUN-MODE-BRIDGE (378-003) adds a
// `mode run` alias + a read-side display bridge on top of the existing mode surface.

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
import { loadConfig } from '../../src/core/config.js';
import { print } from '../../src/cli/helpers/output.js';
import { registerMode, bridgeStyleLabel } from '../../src/cli/commands/mode.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

// registerMode() resolves help language at registration time via getLanguage(undefined) ->
// LC_ALL/LANG env fallback. Pin those env vars for deterministic help-text assertions.
const ORIGINAL_LC_ALL = process.env['LC_ALL'];
const ORIGINAL_LANG = process.env['LANG'];

beforeEach(() => {
  process.env['LC_ALL'] = 'en_US.UTF-8';
  process.env['LANG'] = 'en_US.UTF-8';
  vi.clearAllMocks();
});

afterEach(() => {
  if (ORIGINAL_LC_ALL === undefined) delete process.env['LC_ALL'];
  else process.env['LC_ALL'] = ORIGINAL_LC_ALL;
  if (ORIGINAL_LANG === undefined) delete process.env['LANG'];
  else process.env['LANG'] = ORIGINAL_LANG;
});

function buildProgram(): Command {
  const program = new Command().exitOverride();
  registerMode(program);
  return program;
}

async function run(...args: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(['node', 'deckent', ...args]);
}

function renderHelp(command: Command): string {
  let out = '';
  command.configureOutput({ writeOut: (str: string) => { out += str; } });
  command.outputHelp();
  return out;
}

describe('bridgeStyleLabel (pure helper)', () => {
  it('bridges "sprint" to the "run (sprint)" label', () => {
    expect(bridgeStyleLabel('sprint')).toBe('run (sprint)');
  });

  it('passes through "task" and "process" unchanged', () => {
    expect(bridgeStyleLabel('task')).toBe('task');
    expect(bridgeStyleLabel('process')).toBe('process');
  });
});

describe('deckent mode run (write-time alias)', () => {
  it('writes deckent_style: "sprint" to project config, same as `mode sprint`', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"max_workers": 3}');

    await run('mode', 'run');

    expect(writeFileSync).toHaveBeenCalledWith(
      '/mock/root/.deckent/config.json',
      expect.stringContaining('"deckent_style": "sprint"'),
    );
    expect(print).toHaveBeenCalledWith(expect.stringContaining('run mode'));
  });
});

describe('deckent mode sprint (unchanged — 378-003 must not alter it)', () => {
  it('still writes deckent_style: "sprint" with the original confirmation message', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('{"max_workers": 3}');

    await run('mode', 'sprint');

    expect(writeFileSync).toHaveBeenCalledWith(
      '/mock/root/.deckent/config.json',
      expect.stringContaining('"deckent_style": "sprint"'),
    );
    expect(print).toHaveBeenCalledWith('✓ Switched to sprint mode (project override)');
  });
});

describe('deckent mode show (read-side display bridge)', () => {
  it('keeps the pinned "Current: sprint" line AND adds the "run (sprint)" bridge line', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ deckent_style: 'sprint' } as any);

    await run('mode', 'show');

    expect(print).toHaveBeenCalledWith('Current: sprint');
    expect(print).toHaveBeenCalledWith('Bridge: run (sprint)');
  });

  it('does not add a bridge line for "task"', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ deckent_style: 'task' } as any);

    await run('mode', 'show');

    expect(print).toHaveBeenCalledWith('Current: task');
    expect(print).not.toHaveBeenCalledWith(expect.stringContaining('Bridge:'));
  });

  it('does not add a bridge line for "process"', async () => {
    vi.mocked(loadConfig).mockResolvedValue({ deckent_style: 'process' } as any);

    await run('mode', 'show');

    expect(print).toHaveBeenCalledWith('Current: process');
    expect(print).not.toHaveBeenCalledWith(expect.stringContaining('Bridge:'));
  });
});

describe('deckent mode --help (three-mode presentation)', () => {
  it('presents the modes as "run (sprint) | task | process"', () => {
    const program = buildProgram();
    const modeCmd = program.commands.find((c) => c.name() === 'mode');
    expect(modeCmd).toBeDefined();

    const help = renderHelp(modeCmd!);

    expect(help).toContain('run (sprint) | task | process');
    // Pre-existing RUN-RENAME note (376-002) must still be present, untouched.
    expect(help).toContain(getMessage('mode.rename_note', 'en'));
  });

  it('lists the new `run` subcommand alongside the existing ones', () => {
    const program = buildProgram();
    const modeCmd = program.commands.find((c) => c.name() === 'mode');
    const runCmd = modeCmd!.commands.find((c) => c.name() === 'run');

    expect(runCmd).toBeDefined();
  });
});
