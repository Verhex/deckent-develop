/**
 * CLI-EPIPE-GRACEFUL (Sprint 390 Task 390-001, born-501; extended by
 * Sprint 410 Task 410-002 for Windows cross-platform coverage)
 *
 * `deckent status | head` (or any piped invocation) closes its read end once
 * the downstream consumer is done reading. The next stdout/stderr write then
 * fails — POSIX (linux/darwin) reports `EPIPE`; Windows has no EPIPE errno
 * for a closed named pipe and reports the same condition as `EOF` (Law #2 —
 * every environment). Before this fix, neither `process.stdout` nor
 * `process.stderr` had an `'error'` listener anywhere in the codebase — Node's
 * EventEmitter default (throw when no listener) turned that into an
 * uncaughtException, caught by `installFatalHandlers` (helpers/error-handler.ts)
 * which prints a FATAL line AND persists a crash-log under
 * `.deckent/crashes/<ts>.log`. This accounted for ~80% of crash-logs even
 * though a closed downstream pipe is routine shell plumbing, not a real crash.
 *
 * This suite verifies:
 *   1. RED-proof: with the handler removed, an EPIPE error on stdout DOES
 *      throw (Node's default no-listener EventEmitter behavior) — a literal
 *      demonstration that the fix is necessary, not an assumption.
 *   2. EPIPE and EOF on stdout/stderr → silent `process.exit(0)`, no throw.
 *   3. A non-EPIPE/EOF stream error is NOT swallowed — the listener
 *      re-throws, preserving the existing behavior (would still surface as
 *      an uncaughtException and hit the pre-existing crash-log path
 *      unchanged).
 *   4. Crash-log pin: with the REAL (unmocked) `installFatalHandlers` wired
 *      up against a tmpdir cwd, emitting EPIPE/EOF never creates
 *      `.deckent/crashes` — a real filesystem check, not an inference from
 *      "didn't throw".
 *
 * Hermeticity: no real subprocess, no real pipe, no `spawnSync`. Emits
 * synthetic 'error' events directly on `process.stdout`/`process.stderr` (the
 * exact seam Node uses for a real EPIPE/EOF) and stubs `process.exit` so the
 * test runner itself is never terminated. Mirrors the hoisted-mock import
 * pattern already used by `tests/cli/sigterm-cleanup.test.ts` so importing
 * entry.ts does not trigger its `isEntryMain()` dispatch branch or touch
 * unrelated modules (sprint-controller/tmux/model-catalog/cli/index all
 * mocked). The crash-log pin uses a real `os.tmpdir()` fixture (mkdtempSync,
 * cleaned in `afterEach`) rather than touching the repo's own `.deckent/`.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installFatalHandlers,
  __resetFatalHandlersForTest,
} from '../../src/cli/helpers/error-handler.js';

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

function eofError(): NodeJS.ErrnoException {
  return Object.assign(new Error('write EOF'), { code: 'EOF' });
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

describe('RED-proof — without the handler, EPIPE throws (born-501 necessity)', () => {
  it('removing the installed listener reproduces the pre-fix throw', () => {
    // entry.ts (imported in beforeAll) already registered handleStdStreamError
    // as the 'error' listener on process.stdout. Temporarily strip it to
    // reproduce the exact pre-501 state — zero 'error' listeners — and prove
    // Node's default EventEmitter behavior (throw when an 'error' event has
    // no listener) is what previously turned every piped invocation into an
    // uncaughtException/crash-log. Restored in `finally` so later tests in
    // this file still see the real handler installed.
    const listeners = process.stdout.listeners('error') as Array<(...args: unknown[]) => void>;
    expect(listeners.length).toBeGreaterThan(0);
    process.stdout.removeAllListeners('error');
    try {
      expect(() => process.stdout.emit('error', epipeError())).toThrow(/EPIPE/);
    } finally {
      for (const l of listeners) process.stdout.on('error', l);
    }
  });
});

describe('process stdout/stderr EPIPE/EOF → graceful exit (born-501, 410-002)', () => {
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

  it('EOF on stdout (Windows equivalent, 410-002) exits silently, no throw', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => process.stdout.emit('error', eofError())).not.toThrow();

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stdoutWriteSpy).not.toHaveBeenCalled();
    expect(stderrWriteSpy).not.toHaveBeenCalled();
  });

  it('EOF on stderr (Windows equivalent, 410-002) exits silently, no throw', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => process.stderr.emit('error', eofError())).not.toThrow();

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

describe('crash-log pin — EPIPE/EOF never reach the crash-log path (410-002)', () => {
  // Wires up the REAL (unmocked) installFatalHandlers so the production
  // uncaughtException→crash-log path is actually live, then proves via a
  // real filesystem check (not an inference from "didn't throw") that
  // .deckent/crashes is never created for EPIPE/EOF. cwd is pointed at a
  // tmpdir fixture so this never touches the repo's own .deckent/crashes.
  let tmpDir: string | undefined;
  let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    __resetFatalHandlersForTest();
    cwdSpy?.mockRestore();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
    cwdSpy = undefined;
  });

  function setUp(): string {
    const dir = mkdtempSync(join(tmpdir(), 'deckent-epipe-crashlog-'));
    tmpDir = dir;
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir);
    installFatalHandlers({ force: true });
    return dir;
  }

  it('EPIPE on stdout leaves .deckent/crashes uncreated', () => {
    const dir = setUp();
    vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);

    process.stdout.emit('error', epipeError());

    expect(existsSync(join(dir, '.deckent', 'crashes'))).toBe(false);
  });

  it('EOF on stderr leaves .deckent/crashes uncreated', () => {
    const dir = setUp();
    vi.spyOn(process, 'exit').mockImplementation(((): never => undefined as never) as never);

    process.stderr.emit('error', eofError());

    expect(existsSync(join(dir, '.deckent', 'crashes'))).toBe(false);
  });
});
