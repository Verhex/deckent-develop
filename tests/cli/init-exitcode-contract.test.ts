/**
 * INIT-EXITCODE-CONTRACT (Task 417-001, born-665, WIN665)
 *
 * `deckent init --yes` on windows-latest CI (ba3190db Cross-Platform E2E)
 * printed the CORRECT 'Setup outcome: SETUP_INCOMPLETE' block (contract:
 * exit 2) yet the packed-install process exited 1. init.ts's outcome-exitCode
 * write (init.ts, `process.exitCode = initOutcomeExitCode(outcome)`) is the
 * LAST statement in its action handler's try block — nothing in init.ts runs
 * after it. The crushing path is entry.ts's own `unhandledRejection` handler,
 * which used to call `handleCliError` UNCONDITIONALLY (no lock check): a
 * stray async rejection from an already-finished init step (a fire-and-forget
 * docker/MCP/cursor probe, plausibly Windows-only) firing AFTER the command's
 * top-level promise settles would silently overwrite the already-decided
 * exit code with 1.
 *
 * This suite pins the fix: an exit-code contract lock (entry.ts's
 * `lockExitCodeContract` / `guardUnhandledRejection`) that activates only
 * once the top-level command dispatch has settled, so a post-settle
 * rejection is surfaced as an honest warning instead of silently crushing
 * the decided outcome exit code.
 *
 * Hermeticity: no real subprocess, no real unhandledRejection is ever emitted
 * on the actual process (a real emit would race with vitest's own promise
 * bookkeeping) — the guarded handler is invoked DIRECTLY as a function, and
 * `process.exit` is mocked so the test runner itself is never terminated.
 * Mirrors the hoisted-mock import pattern already used by
 * tests/cli/sigterm-cleanup.test.ts / tests/cli/epipe-graceful.test.ts so
 * importing entry.ts does not trigger its `isEntryMain()` dispatch branch.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// ─── Hoisted mocks so importing entry.ts has no top-level side-effects ──

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

let entryMod: typeof import('../../src/cli/entry.js');

beforeAll(async () => {
  entryMod = await import('../../src/cli/entry.js');
});

beforeEach(() => {
  hoisted.handleCliErrorMock.mockClear();
  // Mirrors the REAL handleCliError (helpers/process.ts): printError + exitCode=1.
  hoisted.handleCliErrorMock.mockImplementation(() => {
    process.exitCode = 1;
  });
  entryMod.__resetExitCodeContractLockForTest();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe('RED-proof — the pre-417-001 pattern crushes a decided outcome exit code (born-665 necessity)', () => {
  it('unconditional handleCliError on a post-settle rejection overwrites an already-decided SETUP_INCOMPLETE(2)', () => {
    // Mirrors init.ts's outcome decision (initOutcomeExitCode('SETUP_INCOMPLETE') === 2)
    // landing as process.exitCode's LAST write before the command settles.
    process.exitCode = 2;
    entryMod.lockExitCodeContract();

    // The OLD entry.ts handler (before this fix) called handleCliError
    // unconditionally, with no lock check at all — reproduce that exact call
    // to prove the crush is real, not hypothetical.
    hoisted.handleCliErrorMock(new Error('stray post-outcome async rejection (e.g. a Windows-only probe)'));

    expect(process.exitCode).toBe(1); // the observed WIN665 symptom: 2 → 1
  });
});

describe('guardUnhandledRejection — unlocked (mid-command) behavior is unchanged', () => {
  it('delegates to handleCliError exactly as before, for a rejection during normal execution', () => {
    entryMod.guardUnhandledRejection(new Error('mid-command rejection'));

    expect(hoisted.handleCliErrorMock).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });
});

describe('guardUnhandledRejection — locked (post-settle) behavior preserves the outcome contract (GREEN)', () => {
  it('SETUP_INCOMPLETE(2): a later rejection no longer crushes the exit code', () => {
    process.exitCode = 2;
    entryMod.lockExitCodeContract();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    entryMod.guardUnhandledRejection(new Error('stray post-outcome async rejection (Windows-only probe)'));

    expect(hoisted.handleCliErrorMock).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2); // preserved — the WIN665 fix
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stderrSpy).toHaveBeenCalled(); // honest warning — never silent
    expect(String(stderrSpy.mock.calls[0]?.[0])).toContain('exit code contract preserved at 2');
  });

  it('READY(0, captured as undefined): a later rejection still resolves to exit 0, never 1', () => {
    process.exitCode = undefined; // init.ts never writes exitCode for READY
    entryMod.lockExitCodeContract();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    entryMod.guardUnhandledRejection(new Error('stray rejection after a READY outcome'));

    expect(process.exitCode).toBeUndefined();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('FAILED(1, a genuine earlier crash): still preserved at 1, not silently changed', () => {
    process.exitCode = 1;
    entryMod.lockExitCodeContract();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    entryMod.guardUnhandledRejection(new Error('another stray rejection'));

    expect(process.exitCode).toBe(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('lockExitCodeContract — idempotency', () => {
  it('a second lock() call does not re-capture a later exitCode mutation', () => {
    process.exitCode = 2;
    entryMod.lockExitCodeContract();
    process.exitCode = 99; // some unrelated later mutation after the lock armed
    entryMod.lockExitCodeContract(); // no-op — already locked

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    entryMod.guardUnhandledRejection(new Error('x'));

    expect(exitSpy).toHaveBeenCalledWith(2); // the FIRST lock's value wins, not 99
  });
});

describe('production wiring — the guard is actually registered', () => {
  it('guardUnhandledRejection is registered as an unhandledRejection listener on process', () => {
    expect(process.listeners('unhandledRejection')).toContain(entryMod.guardUnhandledRejection);
  });
});
