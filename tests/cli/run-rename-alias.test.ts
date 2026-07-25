// tests/cli/run-rename-alias.test.ts — RUN-CLI-ALIAS (Sprint 378, 378-001)
//
// `deckent run` gained `start|status|retro|history` subcommands that delegate
// to the SAME action handler already registered for the top-level
// `start`/`status`/`retro`/`history` commands (no logic duplication). This
// file proves:
//   1. Delegation equivalence — `run <target> [flags]` invokes the exact
//      same handler, with the exact same parsed args, as `<target> [flags]`
//      called directly (goCriteria: "run start = start davranış-eşitliği").
//   2. The legacy one-shot `run "<description>"` signature is unaffected,
//      including the edge case of a description that merely CONTAINS a
//      reserved word as a substring (regression guard against a naive
//      substring-match implementation).
//   3. The new `run.alias_note` i18n key resolves distinctly per language.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { getMessage } from '../../src/cli/helpers/messages.js';

// ─── Mocks (mirror tests/cli/run.test.ts — only needed for the one-shot path) ──

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  readFileSync: vi.fn(),
  renameSync: vi.fn(),
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  ensureSession: vi.fn(),
  spawnWorker: vi.fn(),
  TmuxError: class TmuxError extends Error {},
}));

vi.mock('../../src/orchestra/spawn-backend.js', () => ({
  SpawnBackendFactory: {
    create: vi.fn(() => ({
      name: 'subprocess',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      isAvailable: vi.fn().mockResolvedValue(true),
    })),
    createAsync: vi.fn(async () => ({
      name: 'subprocess',
      liveUsageBudgetSupport: 'measured-stream',
      executionLandingCapability: 'cooperative-landing',
      spawn: vi.fn(),
      kill: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      isAvailable: vi.fn().mockResolvedValue(true),
    })),
    isTmuxAvailable: vi.fn(() => true),
  },
  resolveBackend: vi.fn((b: string) => (b === 'auto' ? 'docker' : b)),
  resetTmuxDeprecationWarning: vi.fn(),
  SpawnBackendError: class SpawnBackendError extends Error {},
  TmuxBackend: class TmuxBackend {},
  SubprocessBackend: class SubprocessBackend {},
}));

vi.mock('../../src/core/config.js', () => ({
  loadConfig: vi.fn(async () => ({
    language: 'en',
    spawn_backend: 'subprocess',
    activeModeConfig: { default_model: 'claude-sonnet-5' },
    execution_budget: {
      roles: { worker: { default: { maxTurns: 1 } } },
      landing: { reserve_ratio: 0.25 },
    },
  })),
  resolveDefaultModel: vi.fn(() => 'claude-sonnet-5'),
}));

vi.mock('../../src/orchestra/brain.js', () => ({
  buildWorkerPrompt: vi.fn().mockReturnValue('You are a worker...'),
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: vi.fn().mockReturnValue('/project'),
}));

import { existsSync, readFileSync } from 'node:fs';
import { printError } from '../../src/cli/helpers/output.js';
import { registerRun } from '../../src/cli/commands/run.js';

const RUN_ALIAS_TARGETS = ['start', 'status', 'retro', 'history'] as const;

describe('run start|status|retro|history — delegation equivalence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const target of RUN_ALIAS_TARGETS) {
    it(`run ${target} [flags] invokes the exact same handler+args as ${target} [flags] directly`, async () => {
      const program = new Command();
      program.exitOverride();

      const spy = vi.fn();
      program
        .command(`${target} [description]`)
        .option('--flag <value>', 'test flag')
        .option('--bool-flag', 'test bool flag')
        .action((description: string | undefined, opts: Record<string, unknown>) => {
          spy(description, opts);
        });

      registerRun(program);

      await program.parseAsync(['node', 'deckent', 'run', target, '--flag', 'hello world', '--bool-flag']);
      const viaRun = spy.mock.calls.at(-1);

      spy.mockClear();
      await program.parseAsync(['node', 'deckent', target, '--flag', 'hello world', '--bool-flag']);
      const direct = spy.mock.calls.at(-1);

      expect(viaRun).toEqual(direct);
      expect(viaRun).toEqual([undefined, { flag: 'hello world', boolFlag: true }]);
    });

    it(`run ${target} with no flags still delegates cleanly`, async () => {
      const program = new Command();
      program.exitOverride();

      const spy = vi.fn();
      program.command(target).action(() => spy());

      registerRun(program);

      await program.parseAsync(['node', 'deckent', 'run', target]);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  }

  it('run command exposes exactly the 4 reserved alias subcommands', () => {
    const program = new Command();
    registerRun(program);
    const runCmd = program.commands.find((c) => c.name() === 'run');
    const subNames = (runCmd?.commands ?? []).map((c) => c.name()).sort();
    expect(subNames).toEqual(['history', 'retro', 'start', 'status']);
  });
});

describe('run "<description>" — legacy one-shot signature unaffected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets exit code 1 for invalid model (regression, unchanged from pre-alias behavior)', async () => {
    const origExitCode = process.exitCode;
    vi.mocked(existsSync).mockReturnValue(false);

    const program = new Command();
    program.exitOverride();
    registerRun(program);

    try {
      await program.parseAsync(['node', 'deckent', 'run', 'do something', '--model', 'invalid']);
    } catch {
      // commander may throw on exitOverride
    }

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number;
  });

  it('a description that merely CONTAINS a reserved word as a substring is NOT captured by the alias', async () => {
    // Guards against a naive "description.includes('start')"-style implementation:
    // commander only matches an EXACT subcommand token, so "start now please" must
    // still flow into the one-shot description path (and hit the invalid-model
    // guard exactly like any other description would).
    const origExitCode = process.exitCode;
    vi.mocked(existsSync).mockReturnValue(false);

    const program = new Command();
    program.exitOverride();
    registerRun(program);

    try {
      await program.parseAsync(['node', 'deckent', 'run', 'start now please', '--model', 'invalid']);
    } catch {
      // commander may throw on exitOverride
    }

    expect(printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode as number;
  });

  it('spawns worker and reports DONE result for an ordinary description (unchanged end-to-end)', async () => {
    const origExitCode = process.exitCode;
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      taskId: 'run-test',
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: ['src/foo.ts'],
      notes: 'done',
    }));

    const program = new Command();
    program.exitOverride();
    registerRun(program);

    await program.parseAsync(['node', 'deckent', 'run', 'test task', '--model', 'claude-sonnet-5']);

    expect(process.exitCode).toBe(0);
    process.exitCode = origExitCode as number;
  });
});

describe('run.alias_note — i18n key resolves distinctly per language', () => {
  it('returns a non-empty, distinct string for en vs tr', () => {
    const en = getMessage('run.alias_note', 'en');
    const tr = getMessage('run.alias_note', 'tr');
    expect(en.length).toBeGreaterThan(0);
    expect(tr.length).toBeGreaterThan(0);
    expect(en).not.toEqual(tr);
    expect(en).not.toBe('run.alias_note'); // key found, not falling back to the raw key
  });
});
