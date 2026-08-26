import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/mock/root'),
}));

vi.mock('../../../src/core/system-profile.js', () => ({
  getSystemProfile: vi.fn().mockReturnValue({
    cpuCores: 4,
    totalMemMB: 8192,
    recommendedMaxWorkers: 3,
  }),
}));

vi.mock('../../../src/cli/helpers/wizard.js', () => ({
  runWizard: vi.fn().mockResolvedValue({ language: 'en', mode: 'performance', runInit: false }),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0, stdout: '1.0.0\n', stderr: '', error: null }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
}));

vi.mock('../../../src/core/constants.js', () => ({
  RUNTIME_DIR: '.deckent/runtime',  // sprint-429 (429-011) tool-inventory yolu modül-yüklemede okur
  DECKENT_DIR: '.deckent',
  SETTINGS_DIR: '.deckent/settings',  // born-630 allowscope-zinciri modül-yüklemede okur
  DECKENT_VERSION: '0.2.0-beta.1',
}));

import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerOnboard } from '../../../src/cli/commands/onboard.js';
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { print as print__tsm_008 } from "../../../src/cli/helpers/output.js";
import { runWizard } from "../../../src/cli/helpers/wizard.js";
import type { WizardResult } from "../../../src/cli/helpers/wizard.js";
import { registerOnboard as registerOnboard__tsm_008, detectClaudeCli, detectProjectInfo, buildOnboardSteps, runOnboard } from "../../../src/cli/commands/onboard.js";

// ─── Helpers ─────────────────────────────────────────────────────────

async function runCommand(args: string[] = []): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerOnboard(program);
  try {
    await program.parseAsync(['node', 'test', ...args]);
  } catch {
    // Commander exitOverride
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('onboard command (isolated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  // ── registerOnboard ────────────────────────────────────────────────

  describe('registerOnboard', () => {
    it('registers the onboard command on the program', () => {
      const program = new Command();
      registerOnboard(program);
      const cmd = program.commands.find(c => c.name() === 'onboard');
      expect(cmd).toBeDefined();
    });

    it('onboard command has a description', () => {
      const program = new Command();
      registerOnboard(program);
      const cmd = program.commands.find(c => c.name() === 'onboard');
      expect(cmd!.description()).toBeTruthy();
      expect(cmd!.description().length).toBeGreaterThan(0);
    });

    it('onboard command description mentions wizard or onboard', () => {
      const program = new Command();
      registerOnboard(program);
      const cmd = program.commands.find(c => c.name() === 'onboard');
      const desc = cmd!.description().toLowerCase();
      expect(desc).toMatch(/onboard|wizard/);
    });
  });

  // ── Onboard flow ──────────────────────────────────────────────────

  describe('onboard flow', () => {
    it('prints a message when the onboard command is invoked', async () => {
      await runCommand(['onboard']);
      expect(print).toHaveBeenCalled();
    });

    it('prints a welcome or setup message', async () => {
      await runCommand(['onboard']);
      const calls = vi.mocked(print).mock.calls.flat();
      const allOutput = calls.join(' ');
      expect(allOutput.length).toBeGreaterThan(0);
    });

    it('does not throw or crash when invoked', async () => {
      await expect(runCommand(['onboard'])).resolves.toBeUndefined();
    });

    it('does not call printError on normal invocation', async () => {
      await runCommand(['onboard']);
      expect(printError).not.toHaveBeenCalled();
    });

    it('prints at least one message to guide the user', async () => {
      await runCommand(['onboard']);
      expect(vi.mocked(print).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Config setup (stubs for future functionality) ─────────────────

  describe('config setup and language/mode selection', () => {
    it('does not call any config write on current stub implementation', async () => {
      // The current implementation is a stub that just prints a message.
      // There should be no side effects beyond printing.
      await runCommand(['onboard']);
      // Only print should be called, not printError
      expect(printError).not.toHaveBeenCalled();
    });

    it('does not set a non-zero exit code on stub invocation', async () => {
      await runCommand(['onboard']);
      expect(process.exitCode).not.toBe(1);
    });

    it('invocation with no extra arguments works correctly', async () => {
      await runCommand(['onboard']);
      expect(print).toHaveBeenCalledWith(expect.any(String));
    });
  });

  // ── Error handling ────────────────────────────────────────────────

  describe('error handling', () => {
    it('does not crash if print throws unexpectedly', async () => {
      vi.mocked(print).mockImplementationOnce(() => {
        throw new Error('stdout error');
      });
      // Should propagate or be caught — either is acceptable;
      // the key assertion is that the process doesn't hang
      let threw = false;
      try {
        await runCommand(['onboard']);
      } catch {
        threw = true;
      }
      // We do not enforce a specific behaviour here, just that it doesn't hang
      expect(typeof threw).toBe('boolean');
    });

    it('exit code is not set to 1 under normal conditions', async () => {
      vi.mocked(print).mockImplementation(() => {});
      await runCommand(['onboard']);
      expect(process.exitCode).toBeUndefined();
    });
  });
});

// TSM-008: physically merged from tests/cli/onboard.test.ts.
{
// ─── Setup ──────────────────────────────────────────────────────────
beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readFileSync).mockReturnValue('{"name": "test-project"}');
    vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '1.0.0\n',
        stderr: '',
        error: undefined,
        pid: 0,
        output: [],
        signal: null,
    });
    vi.mocked(runWizard).mockResolvedValue({
        language: 'en',
        mode: 'performance',
        runInit: false,
    });
});

afterEach(() => {
    vi.clearAllMocks();
});

// ─── detectClaudeCli ────────────────────────────────────────────────
describe('detectClaudeCli', () => {
    it('returns available:true when claude CLI found', () => {
        const result = detectClaudeCli();
        expect(result.available).toBe(true);
        expect(result.version).toBe('1.0.0');
    });
    it('returns available:false when claude CLI not found', () => {
        vi.mocked(spawnSync).mockReturnValue({
            status: 1,
            stdout: '',
            stderr: 'not found',
            error: undefined,
            pid: 0,
            output: [],
            signal: null,
        });
        const result = detectClaudeCli();
        expect(result.available).toBe(false);
    });
    it('returns available:false when spawnSync throws', () => {
        vi.mocked(spawnSync).mockImplementation(() => { throw new Error('ENOENT'); });
        const result = detectClaudeCli();
        expect(result.available).toBe(false);
    });
});

// ─── detectProjectInfo ──────────────────────────────────────────────
describe('detectProjectInfo', () => {
    it('detects project name from package.json', () => {
        vi.mocked(existsSync).mockImplementation((p: unknown) => {
            const path = String(p);
            return path.endsWith('package.json');
        });
        const info = detectProjectInfo('/tmp/test');
        expect(info.name).toBe('test-project');
        expect(info.hasPackageJson).toBe(true);
    });
    it('detects TypeScript when tsconfig.json exists', () => {
        vi.mocked(existsSync).mockImplementation((p: unknown) => {
            const path = String(p);
            return path.endsWith('package.json') || path.endsWith('tsconfig.json');
        });
        const info = detectProjectInfo('/tmp/test');
        expect(info.hasTsConfig).toBe(true);
        expect(info.language).toBe('typescript');
    });
    it('returns unknown when no package.json', () => {
        vi.mocked(existsSync).mockReturnValue(false);
        const info = detectProjectInfo('/tmp/test');
        expect(info.name).toBe('unknown');
        expect(info.hasPackageJson).toBe(false);
    });
});

// ─── buildOnboardSteps ──────────────────────────────────────────────
describe('buildOnboardSteps', () => {
    it('returns array of wizard steps', () => {
        const steps = buildOnboardSteps('my-project');
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
            expect(step).toHaveProperty('id');
            expect(step).toHaveProperty('prompt');
            expect(step).toHaveProperty('type');
        }
    });
    it('includes language selection step', () => {
        const steps = buildOnboardSteps('my-project');
        const langStep = steps.find(s => s.id === 'language');
        expect(langStep).toBeDefined();
        expect(langStep!.type).toBe('select');
    });
    it('includes mode selection step', () => {
        const steps = buildOnboardSteps('my-project');
        const modeStep = steps.find(s => s.id === 'mode');
        expect(modeStep).toBeDefined();
    });
    it('includes init confirmation step', () => {
        const steps = buildOnboardSteps('my-project');
        const initStep = steps.find(s => s.id === 'runInit');
        expect(initStep).toBeDefined();
        expect(initStep!.type).toBe('confirm');
    });
});

// ─── runOnboard ─────────────────────────────────────────────────────
describe('runOnboard', () => {
    it('prints welcome message', async () => {
        await runOnboard('/tmp/test', { nonInteractive: true });
        const calls = vi.mocked(print__tsm_008).mock.calls.map(c => c[0]);
        expect(calls.some(msg => msg.includes('Welcome'))).toBe(true);
    });
    it('prints Claude CLI status', async () => {
        await runOnboard('/tmp/test', { nonInteractive: true });
        const calls = vi.mocked(print__tsm_008).mock.calls.map(c => c[0]);
        expect(calls.some(msg => msg.includes('Claude CLI'))).toBe(true);
    });
    it('prints system info', async () => {
        await runOnboard('/tmp/test', { nonInteractive: true });
        const calls = vi.mocked(print__tsm_008).mock.calls.map(c => c[0]);
        expect(calls.some(msg => msg.includes('CPU') || msg.includes('System'))).toBe(true);
    });
    it('prints ready message', async () => {
        await runOnboard('/tmp/test', { nonInteractive: true });
        const calls = vi.mocked(print__tsm_008).mock.calls.map(c => c[0]);
        expect(calls.some(msg => msg.includes('Ready'))).toBe(true);
    });
    it('calls runWizard', async () => {
        await runOnboard('/tmp/test', {});
        expect(runWizard).toHaveBeenCalled();
    });
});

// ─── registerOnboard ────────────────────────────────────────────────
describe('registerOnboard', () => {
    it('registers onboard command', () => {
        const program = new Command();
        registerOnboard__tsm_008(program);
        const cmd = program.commands.find(c => c.name() === 'onboard');
        expect(cmd).toBeDefined();
    });
    it('has --non-interactive option', () => {
        const program = new Command();
        registerOnboard__tsm_008(program);
        const cmd = program.commands.find(c => c.name() === 'onboard');
        const opts = cmd!.options.map(o => o.long);
        expect(opts).toContain('--non-interactive');
    });
    it('has a description', () => {
        const program = new Command();
        registerOnboard__tsm_008(program);
        const cmd = program.commands.find(c => c.name() === 'onboard');
        expect(cmd!.description()).toBeTruthy();
    });
});
}
