/**
 * M5-NATIVE-FLIP (376-003) — native-agent default-ON flip.
 *
 * The Ink REPL's native-agent tool-use loop (`nativeEngine`) is now the
 * DEFAULT engine (superseding the old `DECKENT_NATIVE_AGENT=1` / `--native`
 * opt-in gate, `isNativeAgentEnabled` in native-flag.ts — no longer called
 * from run.tsx). Two rollback paths restore the legacy `runChatNativeLoop`
 * engine:
 *   1. the `--legacy-loop` CLI flag
 *   2. project config `terminal.native_agent: false`
 *
 * Part 1 exercises `isNativeAgentSelected` (src/cli/repl/run.tsx), the pure
 * decision function — exported specifically so this is testable without
 * mounting Ink (same "pull pure logic out of the entrypoint" pattern as
 * `wireApprovalCrossProcess`, see tests/cli/repl/approval-xproc-wire.test.ts).
 *
 * Part 2 verifies the CLI-flag rollback actually reaches the REPL: bare
 * `deckent --legacy-loop` must still route to the default-REPL branch
 * (src/cli/entry.ts's `shouldLaunchDefaultRepl`/`REPL_ONLY_FLAGS`) rather than
 * erroring in Commander as an unrecognized top-level option — otherwise the
 * flag documented in Part 1 could never actually be reached at runtime.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { isNativeAgentSelected } from '../../src/cli/repl/run.js';

// ─── Part 1 — isNativeAgentSelected (pure decision function) ───────────────

describe('isNativeAgentSelected — M5 default-flip decision', () => {
  it('default (no config, no flag) → native selected', () => {
    expect(isNativeAgentSelected([], {})).toBe(true);
  });

  it('unrelated argv + empty config → still native (default)', () => {
    expect(isNativeAgentSelected(['--some-other-flag'], { terminal: {} })).toBe(true);
  });

  it('rollback path 1: config terminal.native_agent=false → legacy selected', () => {
    expect(isNativeAgentSelected([], { terminal: { native_agent: false } })).toBe(false);
  });

  it('config terminal.native_agent=true (explicit) → native selected', () => {
    expect(isNativeAgentSelected([], { terminal: { native_agent: true } })).toBe(true);
  });

  it('rollback path 2: --legacy-loop CLI flag → legacy selected', () => {
    expect(isNativeAgentSelected(['--legacy-loop'], {})).toBe(false);
  });

  it('--legacy-loop wins even when config explicitly sets native_agent=true', () => {
    expect(isNativeAgentSelected(['--legacy-loop'], { terminal: { native_agent: true } })).toBe(false);
  });

  it('both rollback paths set simultaneously → still legacy (no contradiction)', () => {
    expect(isNativeAgentSelected(['--legacy-loop'], { terminal: { native_agent: false } })).toBe(false);
  });
});

// ─── Part 2 — --legacy-loop reaches the REPL via entry.ts routing ──────────
//
// Mirrors tests/cli/default-repl.test.ts's mock scaffold: entry.ts's
// module-level side effects (the isEntryMain() dispatch at the bottom of the
// file) must no-op on import, since `import.meta.url` never matches
// `process.argv[1]` under vitest — these mocks just guarantee that stays true
// even if a future refactor changes the guard.

const hoisted = vi.hoisted(() => ({
  parseAsyncMock: vi.fn(async () => undefined),
  hookMock: vi.fn(),
  buildProgramMock: vi.fn(),
  bootstrapMock: vi.fn(async () => undefined),
  handleCliErrorMock: vi.fn(),
  interruptActiveSprintMock: vi.fn(),
  killAllSessionsMock: vi.fn(),
}));

hoisted.buildProgramMock.mockImplementation(() => {
  const fake = { hook: hoisted.hookMock, parseAsync: hoisted.parseAsyncMock };
  hoisted.hookMock.mockReturnValue(fake);
  return fake;
});

vi.mock('../../src/cli/index.js', () => ({ buildProgram: hoisted.buildProgramMock }));
vi.mock('../../src/cli/helpers/process.js', () => ({ handleCliError: hoisted.handleCliErrorMock }));
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  interruptActiveSprint: hoisted.interruptActiveSprintMock,
}));
vi.mock('../../src/orchestra/tmux.js', () => ({ killAllSessions: hoisted.killAllSessionsMock }));
vi.mock('../../src/core/model-catalog.js', () => ({ bootstrapFromCatalog: hoisted.bootstrapMock }));

let shouldLaunchDefaultRepl: (argv: readonly string[]) => boolean;

beforeAll(async () => {
  const mod = await import('../../src/cli/entry.js');
  shouldLaunchDefaultRepl = mod.shouldLaunchDefaultRepl;
});

describe('entry.ts routing — --legacy-loop is a REPL-only flag', () => {
  it('`deckent --legacy-loop` (flag-only, no subcommand) still routes to the default REPL', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '--legacy-loop'])).toBe(true);
  });

  it('a real subcommand alongside --legacy-loop still defers to Commander (unchanged routing contract)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', 'plan', '--legacy-loop'])).toBe(false);
  });
});
