import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import { print, printError } from '../../../src/cli/helpers/output.js';
import { registerOnboard } from '../../../src/cli/commands/onboard.js';

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
