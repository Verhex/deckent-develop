/**
 * CLI-EPIPE-GRACEFUL (Sprint 390 Task 390-001, born-501)
 *
 * `deckent status | head` (or any piped invocation) closes its read end once
 * the downstream consumer is done reading. The next stdout/stderr write then
 * fails with EPIPE. Before this fix, neither `process.stdout` nor
 * `process.stderr` had an `'error'` listener anywhere in the codebase — Node's
 * EventEmitter default (throw when no listener) turned that into an
 * uncaughtException, caught by `installFatalHandlers` (helpers/error-handler.ts)
 * which prints a FATAL line AND persists a crash-log under
 * `.deckent/crashes/<ts>.log`. This accounted for ~80% of crash-logs even
 * though a closed downstream pipe is routine shell plumbing, not a real crash.
 *
 * This suite verifies:
 *   1. EPIPE on stdout/stderr → silent `process.exit(0)`, no throw. Silent +
 *      non-throwing is exactly what proves no crash-log write happens: the
 *      crash-log is only ever written from `formatFatalAndExit`, which is
 *      only ever reached via an `uncaughtException` — and an uncaughtException
 *      can only fire here if the listener throws. `writeFileSync` itself
 *      (node:fs, a non-configurable ESM built-in export) cannot be spied on
 *      in this test runner, so "no throw" is the direct, provable stand-in.
 *   2. A non-EPIPE stream error is NOT swallowed — the listener re-throws,
 *      preserving the existing behavior (would still surface as an
 *      uncaughtException and hit the pre-existing crash-log path unchanged).
 *
 * Hermeticity: no real subprocess, no real pipe, no `spawnSync`. Emits
 * synthetic 'error' events directly on `process.stdout`/`process.stderr` (the
 * exact seam Node uses for a real EPIPE) and stubs `process.exit` so the test
 * runner itself is never terminated. Mirrors the hoisted-mock import pattern
 * already used by `tests/cli/sigterm-cleanup.test.ts` so importing entry.ts
 * does not trigger its `isEntryMain()` dispatch branch or touch unrelated
 * modules (sprint-controller/tmux/model-catalog/cli/index all mocked).
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

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

function epipeError(): NodeJS.ErrnoException {
  return Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
}

function otherStreamError(): NodeJS.ErrnoException {
  return Object.assign(new Error('write EIO'), { code: 'EIO' });
}

beforeAll(async () => {
  await import('../../src/cli/entry.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('process stdout/stderr EPIPE → graceful exit (born-501)', () => {
  it('EPIPE on stdout exits silently (exit code 0), no throw → no crash-log path reached', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => process.stdout.emit('error', epipeError())).not.toThrow();

    expect(exitSpy).toHaveBeenCalledWith(0);
    // Silent: the handler itself writes nothing (no FATAL line, no message).
    expect(stdoutWriteSpy).not.toHaveBeenCalled();
    expect(stderrWriteSpy).not.toHaveBeenCalled();
  });

  it('EPIPE on stderr exits silently (exit code 0), no throw → no crash-log path reached', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => process.stderr.emit('error', epipeError())).not.toThrow();

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stdoutWriteSpy).not.toHaveBeenCalled();
    expect(stderrWriteSpy).not.toHaveBeenCalled();
  });

  it('non-EPIPE stream error is re-thrown (existing crash-log behavior preserved)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);

    const err = otherStreamError();
    expect(() => process.stdout.emit('error', err)).toThrow(err);
    expect(exitSpy).not.toHaveBeenCalledWith(0);
  });

  it('non-EPIPE stream error on stderr is re-thrown too', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);

    const err = otherStreamError();
    expect(() => process.stderr.emit('error', err)).toThrow(err);
    expect(exitSpy).not.toHaveBeenCalledWith(0);
  });
});
