/**
 * Default REPL routing tests (Sprint 219 T-219-001)
 *
 * Verifies the entry.ts decision logic that turns a bare `deckent`
 * invocation into `deckent chat --native`, while leaving explicit
 * subcommands and help/version flags untouched.
 *
 * Tests exercise the pure helper functions directly. The Command
 * instance and downstream modules are mocked so the entry-module
 * top-level side effects no-op during import.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── Hoisted Spies ──────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  parseAsyncMock: vi.fn(async () => undefined),
  hookMock: vi.fn(),
  buildProgramMock: vi.fn(),
  bootstrapMock: vi.fn(async () => undefined),
  handleCliErrorMock: vi.fn(),
  interruptActiveSprintMock: vi.fn(),
  killAllSessionsMock: vi.fn(),
}));

// Self-chaining fake Commander program so entry.ts side-effects no-op.
hoisted.buildProgramMock.mockImplementation(() => {
  const fake = {
    hook: hoisted.hookMock,
    parseAsync: hoisted.parseAsyncMock,
  };
  hoisted.hookMock.mockReturnValue(fake);
  return fake;
});

// ─── Mocks (must precede dynamic import of entry.ts) ────────────────

vi.mock('../../src/cli/index.js', () => ({
  buildProgram: hoisted.buildProgramMock,
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  handleCliError: hoisted.handleCliErrorMock,
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  interruptActiveSprint: hoisted.interruptActiveSprintMock,
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  killAllSessions: hoisted.killAllSessionsMock,
}));

vi.mock('../../src/core/model-catalog.js', () => ({
  bootstrapFromCatalog: hoisted.bootstrapMock,
}));

// ─── Dynamic import of entry.ts after mocks are wired ───────────────

let shouldLaunchDefaultRepl: (argv: readonly string[]) => boolean;
let buildEntryArgv: (argv: readonly string[]) => string[];

beforeAll(async () => {
  const mod = await import('../../src/cli/entry.js');
  shouldLaunchDefaultRepl = mod.shouldLaunchDefaultRepl;
  buildEntryArgv = mod.buildEntryArgv;
});

// ─── Tests ──────────────────────────────────────────────────────────

describe('shouldLaunchDefaultRepl', () => {
  it('returns true when argv has no subcommand and no flags (bare `deckent`)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent'])).toBe(true);
  });

  it('returns false for every explicit top-level subcommand', () => {
    for (const cmd of ['plan', 'serve', 'chat', 'status', 'kill', 'init', 'config', 'doctor']) {
      expect(
        shouldLaunchDefaultRepl(['node', 'deckent', cmd]),
        `subcommand "${cmd}" must NOT trigger default REPL`,
      ).toBe(false);
    }
  });

  it('returns false for an unknown subcommand so Commander can show its error', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', 'no-such-cmd'])).toBe(false);
  });

  it('returns false for --help / -h / help token (help UX preserved)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '--help'])).toBe(false);
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '-h'])).toBe(false);
    expect(shouldLaunchDefaultRepl(['node', 'deckent', 'help'])).toBe(false);
  });

  it('returns false for --version / -V / --version-json (version UX preserved)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '--version'])).toBe(false);
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '-V'])).toBe(false);
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '--version-json'])).toBe(false);
  });

  it('is a pure function — result depends only on argv, not on TTY/runtime state', () => {
    const argv = ['node', 'deckent'];
    expect(shouldLaunchDefaultRepl(argv)).toBe(true);
    expect(shouldLaunchDefaultRepl(argv)).toBe(true);
    // Non-TTY graceful: the helper makes no I/O, so a piped stdin would not
    // change the decision. The chat --native action consumes stdin itself
    // and terminates cleanly on EOF.
  });
});

describe('buildEntryArgv', () => {
  it('rewrites bare argv to `chat --native` while preserving argv[0]/[1]', () => {
    const result = buildEntryArgv(['/path/to/node', '/usr/local/bin/deckent']);
    expect(result).toEqual(['/path/to/node', '/usr/local/bin/deckent', 'chat', '--native']);
  });

  it('passes through argv unchanged when a subcommand is present', () => {
    const argv = ['node', 'deckent', 'plan', '--ai'];
    expect(buildEntryArgv(argv)).toEqual(argv);
  });

  it('passes through argv unchanged when --help is present', () => {
    const argv = ['node', 'deckent', '--help'];
    expect(buildEntryArgv(argv)).toEqual(argv);
  });

  it('returns a fresh array so callers cannot mutate the input', () => {
    const argv = ['node', 'deckent', 'plan'];
    const result = buildEntryArgv(argv);
    expect(result).not.toBe(argv);
    expect(result).toEqual(argv);
  });

  it('falls back to safe defaults when argv lacks argv[0]/[1] (graceful edge case)', () => {
    // A truncated argv should still produce a runnable command line — this
    // keeps non-standard invocations (sandboxed launchers, piped argv)
    // from triggering an `undefined` token in the rewritten arg list.
    expect(buildEntryArgv([])).toEqual(['node', 'deckent', 'chat', '--native']);
  });
});
