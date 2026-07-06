import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────
// Same mock set as tests/cli/mode-command.test.ts — this file only exercises
// --help output (descriptions + addHelpText note), never the action handlers.

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

import { registerMode } from '../../src/cli/commands/mode.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

// registerMode() resolves its help language once, at registration time, via
// getLanguage(undefined) -> LC_ALL/LANG env fallback. Pin those env vars so
// this test is deterministic regardless of the host/CI locale (hermeticity).
const ORIGINAL_LC_ALL = process.env['LC_ALL'];
const ORIGINAL_LANG = process.env['LANG'];

beforeEach(() => {
  process.env['LC_ALL'] = 'en_US.UTF-8';
  process.env['LANG'] = 'en_US.UTF-8';
});

afterEach(() => {
  if (ORIGINAL_LC_ALL === undefined) delete process.env['LC_ALL'];
  else process.env['LC_ALL'] = ORIGINAL_LC_ALL;
  if (ORIGINAL_LANG === undefined) delete process.env['LANG'];
  else process.env['LANG'] = ORIGINAL_LANG;
});

function buildModeCommand(): Command {
  const program = new Command().exitOverride();
  registerMode(program);
  const modeCmd = program.commands.find((c) => c.name() === 'mode');
  if (!modeCmd) throw new Error('mode command not registered');
  return modeCmd;
}

/**
 * `addHelpText()` content is only emitted by `outputHelp()` (via the
 * beforeHelp/afterHelp events), not by `helpInformation()` — capture the
 * real --help output stream instead of relying on the plain formatter.
 */
function renderHelp(command: Command): string {
  let out = '';
  command.configureOutput({ writeOut: (str: string) => { out += str; } });
  command.outputHelp();
  return out;
}

describe('deckent mode --help', () => {
  it('lists sprint, task, process and auto in the top-level help text', () => {
    const modeCmd = buildModeCommand();
    const help = renderHelp(modeCmd);

    expect(help).toContain('sprint');
    expect(help).toContain('task');
    expect(help).toContain('process');
    expect(help).toContain('auto');
  });

  it('fixes the stale "global" subcommand description to include process', () => {
    const modeCmd = buildModeCommand();
    const globalCmd = modeCmd.commands.find((c) => c.name() === 'global');
    expect(globalCmd).toBeDefined();

    const desc = globalCmd!.description();
    expect(desc).toContain('process');
    expect(desc).toBe(getMessage('mode.global_desc', 'en'));
  });

  it('appends the RUN-RENAME pre-note to the top-level help', () => {
    const modeCmd = buildModeCommand();
    const help = renderHelp(modeCmd);

    expect(help).toContain(getMessage('mode.rename_note', 'en'));
    expect(help).toContain("'run'");
  });

  it('the RUN-RENAME note is available in Turkish and differs from the English copy', () => {
    const enNote = getMessage('mode.rename_note', 'en');
    const trNote = getMessage('mode.rename_note', 'tr');

    expect(trNote).not.toBe(enNote);
    expect(trNote).toContain("'sprint'");
    expect(trNote).toContain("'run'");
  });
});
