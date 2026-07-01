/**
 * SIGTERM-CLEANUP (Sprint 350 Task 350-005, ADR-G-013 born item)
 *
 * Verifies `onSignal()` in src/cli/entry.ts runs the IDENTICAL cleanup path
 * for SIGTERM as it already does for SIGINT — interruptActiveSprint() +
 * killAllSessions() — before exiting. Prior to this fix the cleanup calls
 * were gated behind `if (signal === 'SIGINT')`, so a `kill <pid>` / systemd
 * stop / docker stop of the coordinator left INTERRUPTED-unmarked tasks,
 * live locks, and orphan tmux sessions behind.
 *
 * Hermeticity: this test NEVER sends a real OS signal to the test process
 * (no `process.kill`, no `process.emit('SIGTERM', ...)`). It calls the
 * exported `onSignal()` function directly — a mocked seam — and stubs
 * `process.exit` so the test runner itself is never terminated. Mirrors the
 * hoisted-mock import pattern already used by
 * tests/cli/cli-bin-invocation.test.ts to import entry.js in-process
 * without triggering its `isEntryMain()` dispatch branch.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

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

let onSignal: (signal: string) => void;

beforeAll(async () => {
  const mod = await import('../../src/cli/entry.js');
  onSignal = mod.onSignal;
});

beforeEach(() => {
  hoisted.interruptActiveSprintMock.mockClear();
  hoisted.killAllSessionsMock.mockClear();
});

describe('onSignal — SIGTERM shares the SIGINT cleanup path (ADR-G-013)', () => {
  it('SIGTERM invokes interruptActiveSprint() and killAllSessions() (same as SIGINT)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      return undefined as never;
    }) as never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    onSignal('SIGTERM');

    expect(hoisted.interruptActiveSprintMock).toHaveBeenCalledTimes(1);
    expect(hoisted.killAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stderrSpy).toHaveBeenCalledWith('\nReceived SIGTERM, exiting…\n');

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('SIGINT still invokes the same cleanup calls (parity, no regression)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      return undefined as never;
    }) as never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    onSignal('SIGINT');

    expect(hoisted.interruptActiveSprintMock).toHaveBeenCalledTimes(1);
    expect(hoisted.killAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(stderrSpy).toHaveBeenCalledWith('\nReceived SIGINT, exiting…\n');

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('cleanup call order is unchanged: interruptActiveSprint() before killAllSessions()', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      return undefined as never;
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const order: string[] = [];
    hoisted.interruptActiveSprintMock.mockImplementationOnce(() => { order.push('interrupt'); });
    hoisted.killAllSessionsMock.mockImplementationOnce(() => { order.push('killSessions'); });

    onSignal('SIGTERM');

    expect(order).toEqual(['interrupt', 'killSessions']);

    exitSpy.mockRestore();
    vi.mocked(process.stderr.write).mockRestore();
  });

  it('a thrown interruptActiveSprint() does not prevent killAllSessions() or exit (non-fatal try/catch preserved)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((): never => {
      return undefined as never;
    }) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    hoisted.interruptActiveSprintMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });

    expect(() => onSignal('SIGTERM')).not.toThrow();
    expect(hoisted.killAllSessionsMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
    vi.mocked(process.stderr.write).mockRestore();
  });
});
