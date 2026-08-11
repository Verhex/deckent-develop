// ═══ Runner Death Records (row 3311, sprint-512) ═════════════════════
// Sprint 507's detached runner (PID 55905) died mid scheduler-shadow journal
// line with NOTHING in the crashes directory; the status read model went HOLD
// and cleanup went run-orphaned HOLD. Sprint 508 exited leaving its PID file
// behind while 510/511 exited cleanly — exit hygiene was path-dependent.
//
// These tests pin the two halves of the fix:
//   1. every CATCHABLE exit path writes a typed record into the crashes
//      directory and releases only the PID file the process owns;
//   2. the UNCATCHABLE path (SIGKILL/OOM) is typed posthumously by the next
//      runner's startup detection — no watchdog, no daemon.
//
// Hermetic: mkdtemp roots, fixture PID files, no spawned processes, no timers.
// `process.on` is captured through a spy so the handlers under test are never
// attached to the vitest process itself.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DECKENT_DIR } from '../../src/core/constants.js';
import { writePid } from '../../src/orchestra/sprint-pid-manager.js';
import {
  IPC_ERROR_FILE,
  IPC_STATUS_FILE,
  _resetCrashHandlersForTesting,
  formatRunnerExitRecord,
  installCrashHandlers,
  publishPosthumousRunnerDeaths,
  releaseOwnedSprintPidFiles,
  writeRunnerExitRecord,
  type CrashContext,
  type RunnerExitRecord,
} from '../../src/orchestra/sprint-runner-entry.js';

// ─── Helpers ──────────────────────────────────────────────────────────

const DEAD_PID = 999_001;

function crashesDir(root: string): string {
  return join(root, DECKENT_DIR, 'crashes');
}

function readCrashRecords(root: string): { name: string; body: string }[] {
  const dir = crashesDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .map(name => ({ name, body: readFileSync(join(dir, name), 'utf-8') }));
}

function pidFilePath(root: string, sprintId: string): string {
  return join(root, DECKENT_DIR, 'pids', `${sprintId}.pid`);
}

/** Fixture PID file for a runner that is NOT this process. */
function writeFixturePid(
  root: string,
  sprintId: string,
  record: { pid: number; startToken?: string | null; startedAt?: string },
): string {
  const dir = join(root, DECKENT_DIR, 'pids');
  mkdirSync(dir, { recursive: true });
  const filePath = pidFilePath(root, sprintId);
  writeFileSync(
    filePath,
    JSON.stringify({
      pid: record.pid,
      sprintId,
      startedAt: record.startedAt ?? '2026-08-10T00:43:21.000Z',
      startToken: record.startToken ?? null,
      leaseId: 'fixture-lease',
    }, null, 2),
    'utf-8',
  );
  return filePath;
}

type CapturedHandlers = Record<string, (...args: unknown[]) => void>;

/**
 * Install the crash handlers with `process.on` stubbed, so the listeners are
 * captured for direct invocation instead of being attached to the test runner.
 */
function captureHandlers(ctx: CrashContext): CapturedHandlers {
  const handlers: CapturedHandlers = {};
  const onSpy = vi.spyOn(process, 'on').mockImplementation(((
    event: string,
    fn: (...args: unknown[]) => void,
  ) => {
    handlers[event] = fn;
    return process;
  }) as never);
  try {
    _resetCrashHandlersForTesting();
    installCrashHandlers(ctx);
  } finally {
    onSpy.mockRestore();
  }
  return handlers;
}

// ─── Suite ────────────────────────────────────────────────────────────

describe('row 3311 — the sprint runner cannot die without a typed record', () => {
  let root: string;
  let ipcDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-runner-death-'));
    ipcDir = join(root, DECKENT_DIR, 'job-ipc');
    mkdirSync(ipcDir, { recursive: true });
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => {
      throw new Error('process.exit called');
    }) as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    _resetCrashHandlersForTesting();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    _resetCrashHandlersForTesting();
    rmSync(root, { recursive: true, force: true });
  });

  // ─── Record format ──────────────────────────────────────────────────

  describe('typed exit record format', () => {
    it('reuses the crashes-directory line format and adds the typed runner fields', () => {
      const record: RunnerExitRecord = {
        exitPath: 'signal',
        timestamp: '2026-08-10T00:43:21.000Z',
        pid: 55905,
        jobId: 'sprint-507-job',
        sprintId: 'sprint-507',
        exitCode: 143,
        signal: 'SIGTERM',
        detail: 'runner terminated by SIGTERM',
      };

      const body = formatRunnerExitRecord(record);
      const lines = body.split('\n');

      // Existing format (src/cli/helpers/error-handler.ts) — same key: value shape.
      expect(lines[0]).toBe('timestamp: 2026-08-10T00:43:21.000Z');
      expect(body).toContain('\nname: ');
      expect(body).toContain('\nmessage: ');
      expect(body).toMatch(/\nstack:/);
      // Typed runner fields.
      expect(body).toContain('kind: runner-exit');
      expect(body).toContain('exitPath: signal');
      expect(body).toContain('pid: 55905');
      expect(body).toContain('jobId: sprint-507-job');
      expect(body).toContain('sprintId: sprint-507');
      expect(body).toContain('exitCode: 143');
      expect(body).toContain('signal: SIGTERM');
      expect(body.endsWith('\n')).toBe(true);
    });

    it('redacts secrets carried by the dying error', () => {
      const leaked = 'sk-ant-' + 'B'.repeat(48);
      const body = formatRunnerExitRecord({
        exitPath: 'uncaughtException',
        timestamp: '2026-08-10T00:43:21.000Z',
        pid: 55905,
        error: new Error(`spawn failed ANTHROPIC_API_KEY=${leaked}`),
      });

      expect(body).not.toContain(leaked);
      expect(body).toContain('[REDACTED');
      expect(body).toContain('name: Error');
    });

    it('writes into .deckent/crashes and is idempotent under skipIfExists', () => {
      const record: RunnerExitRecord = {
        exitPath: 'fatal',
        timestamp: '2026-08-10T00:43:21.000Z',
        pid: 55905,
        detail: 'first',
      };
      const first = writeRunnerExitRecord(root, record, { fileName: 'fixed.log' });
      expect(first).toBe(join(crashesDir(root), 'fixed.log'));
      expect(readFileSync(first!, 'utf-8')).toContain('first');

      const second = writeRunnerExitRecord(
        root,
        { ...record, detail: 'second' },
        { fileName: 'fixed.log', skipIfExists: true },
      );
      expect(second).toBeNull();
      expect(readFileSync(first!, 'utf-8')).toContain('first');
      expect(readCrashRecords(root)).toHaveLength(1);
    });

    it('never throws when the crashes directory cannot be created', () => {
      // A regular file where `.deckent` must be a directory — mkdirSync fails.
      const blocked = mkdtempSync(join(tmpdir(), 'deckent-blocked-'));
      writeFileSync(join(blocked, DECKENT_DIR), 'not a directory', 'utf-8');
      try {
        expect(writeRunnerExitRecord(blocked, {
          exitPath: 'exit',
          timestamp: '2026-08-10T00:43:21.000Z',
          pid: 55905,
        })).toBeNull();
      } finally {
        rmSync(blocked, { recursive: true, force: true });
      }
    });
  });

  // ─── PID ownership ──────────────────────────────────────────────────

  describe('PID release is ownership-fenced', () => {
    it('releases the PID file this exact process owns', () => {
      writePid(root, 'sprint-512');
      expect(existsSync(pidFilePath(root, 'sprint-512'))).toBe(true);

      expect(releaseOwnedSprintPidFiles(root)).toEqual(['sprint-512']);
      expect(existsSync(pidFilePath(root, 'sprint-512'))).toBe(false);
    });

    it('never deletes a PID file owned by another process', () => {
      const foreign = writeFixturePid(root, 'sprint-508', { pid: DEAD_PID });

      expect(releaseOwnedSprintPidFiles(root)).toEqual([]);
      expect(existsSync(foreign)).toBe(true);
    });

    it('never deletes a same-PID record whose start token proves a recycled PID', () => {
      const inherited = writeFixturePid(root, 'sprint-509', {
        pid: process.pid,
        startToken: 'token-of-a-dead-predecessor',
      });

      const released = releaseOwnedSprintPidFiles(root, { startToken: () => 'our-live-token' });

      expect(released).toEqual([]);
      expect(existsSync(inherited)).toBe(true);
    });

    it('is a no-op when there is no PID directory at all', () => {
      expect(releaseOwnedSprintPidFiles(root)).toEqual([]);
    });
  });

  // ─── Posthumous detection (uncatchable death) ───────────────────────

  describe('startup posthumous detection (SIGKILL / OOM)', () => {
    it('publishes a typed death record for a stale PID file with no live process', () => {
      const stale = writeFixturePid(root, 'sprint-507', {
        pid: DEAD_PID,
        startedAt: '2026-08-10T00:12:00.000Z',
      });

      const reports = publishPosthumousRunnerDeaths(root, { isAlive: () => false });

      expect(reports).toHaveLength(1);
      expect(reports[0]!.sprintId).toBe('sprint-507');
      expect(reports[0]!.pid).toBe(DEAD_PID);
      expect(reports[0]!.ownership).toBe('dead');

      const records = readCrashRecords(root);
      expect(records).toHaveLength(1);
      expect(records[0]!.name).toContain('runner-posthumous-sprint-507-999001');
      expect(records[0]!.body).toContain('exitPath: posthumous');
      expect(records[0]!.body).toContain('sprintId: sprint-507');
      expect(records[0]!.body).toContain(`pid: ${DEAD_PID}`);

      // Detection publishes; it never deletes a PID file it does not own.
      expect(existsSync(stale)).toBe(true);
    });

    it('publishes exactly once — a second startup against the same stale PID file is silent', () => {
      writeFixturePid(root, 'sprint-507', { pid: DEAD_PID });

      expect(publishPosthumousRunnerDeaths(root, { isAlive: () => false })).toHaveLength(1);
      expect(publishPosthumousRunnerDeaths(root, { isAlive: () => false })).toEqual([]);
      expect(readCrashRecords(root)).toHaveLength(1);
    });

    it('types a recycled PID as a death — the recorded runner is provably gone', () => {
      writeFixturePid(root, 'sprint-508', { pid: DEAD_PID, startToken: 'token-of-the-dead-runner' });

      const reports = publishPosthumousRunnerDeaths(root, {
        isAlive: () => true,
        startToken: () => 'token-of-whoever-holds-the-pid-now',
      });

      expect(reports).toHaveLength(1);
      expect(reports[0]!.ownership).toBe('reused');
      expect(readCrashRecords(root)[0]!.body).toContain('exitPath: posthumous');
    });

    it('never claims a death for a live, provably-owned runner', () => {
      writeFixturePid(root, 'sprint-511', { pid: DEAD_PID, startToken: 'live-token' });

      const reports = publishPosthumousRunnerDeaths(root, {
        isAlive: () => true,
        startToken: () => 'live-token',
      });

      expect(reports).toEqual([]);
      expect(readCrashRecords(root)).toEqual([]);
    });

    it('never claims a death when liveness is real but ownership is unprovable', () => {
      // No start token (old PID file / non-Linux host) → 'unknown', not a death.
      writeFixturePid(root, 'sprint-510', { pid: DEAD_PID, startToken: null });

      const reports = publishPosthumousRunnerDeaths(root, {
        isAlive: () => true,
        startToken: () => null,
      });

      expect(reports).toEqual([]);
      expect(readCrashRecords(root)).toEqual([]);
    });

    it('ignores this process\'s own live PID file', () => {
      writePid(root, 'sprint-512');

      expect(publishPosthumousRunnerDeaths(root)).toEqual([]);
      expect(readCrashRecords(root)).toEqual([]);
    });
  });

  // ─── Catchable exit paths ───────────────────────────────────────────

  describe('every catchable exit path is typed', () => {
    const ctx = (): CrashContext => ({ ipcDir, jobId: 'sprint-512-job', projectRoot: root });

    it('uncaughtException: records the death WITHOUT swallowing the original error', () => {
      const handlers = captureHandlers(ctx());
      const err = new Error('scheduler shadow journal write failed');

      expect(() => handlers.uncaughtException!(err)).toThrow('process.exit called');

      // Original surfacing preserved: IPC error.json + stderr + exit code 1.
      const payload = JSON.parse(readFileSync(join(ipcDir, IPC_ERROR_FILE), 'utf-8'));
      expect(payload.kind).toBe('uncaughtException');
      expect(payload.error.message).toContain('scheduler shadow journal write failed');
      expect(stderrSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);

      // Plus the new typed record.
      const records = readCrashRecords(root);
      expect(records).toHaveLength(1);
      expect(records[0]!.body).toContain('exitPath: uncaughtException');
      expect(records[0]!.body).toContain('jobId: sprint-512-job');
      expect(records[0]!.body).toContain('scheduler shadow journal write failed');
    });

    it('unhandledRejection: records the death alongside error.json', () => {
      const handlers = captureHandlers(ctx());

      expect(() => handlers.unhandledRejection!(new Error('provider wedge')))
        .toThrow('process.exit called');

      expect(existsSync(join(ipcDir, IPC_ERROR_FILE))).toBe(true);
      const records = readCrashRecords(root);
      expect(records).toHaveLength(1);
      expect(records[0]!.body).toContain('exitPath: unhandledRejection');
      expect(records[0]!.body).toContain('provider wedge');
    });

    it.each([
      ['SIGTERM', 143],
      ['SIGINT', 130],
      ['SIGHUP', 129],
    ] as const)('%s: writes TERMINATED status, a typed record, and exits %i', (signal, code) => {
      const handlers = captureHandlers(ctx());
      expect(handlers[signal]).toBeTypeOf('function');

      expect(() => handlers[signal]!()).toThrow('process.exit called');

      const status = JSON.parse(readFileSync(join(ipcDir, IPC_STATUS_FILE), 'utf-8'));
      expect(status.phase).toBe('TERMINATED');
      expect(status.terminatedBy).toBe(signal);
      expect(exitSpy).toHaveBeenCalledWith(code);

      const records = readCrashRecords(root);
      expect(records).toHaveLength(1);
      expect(records[0]!.body).toContain('exitPath: signal');
      expect(records[0]!.body).toContain(`signal: ${signal}`);
      expect(records[0]!.body).toContain(`exitCode: ${code}`);
    });

    it('exit: a non-zero exit nobody typed still gets a record, and the owned PID file is released', () => {
      writePid(root, 'sprint-512');
      const handlers = captureHandlers(ctx());
      expect(handlers.exit).toBeTypeOf('function');

      handlers.exit!(1);

      const records = readCrashRecords(root);
      expect(records).toHaveLength(1);
      expect(records[0]!.body).toContain('exitPath: exit');
      expect(records[0]!.body).toContain('exitCode: 1');
      expect(existsSync(pidFilePath(root, 'sprint-512'))).toBe(false);
    });

    it('exit: does not duplicate a record a specific handler already wrote', () => {
      const handlers = captureHandlers(ctx());

      expect(() => handlers.uncaughtException!(new Error('boom'))).toThrow('process.exit called');
      handlers.exit!(1);

      const records = readCrashRecords(root);
      expect(records).toHaveLength(1);
      expect(records[0]!.body).toContain('exitPath: uncaughtException');
    });

    it('exit(0): normal COMPLETE settlement writes no crash record but still releases the PID file', () => {
      writePid(root, 'sprint-512');
      const handlers = captureHandlers(ctx());

      handlers.exit!(0);

      expect(readCrashRecords(root)).toEqual([]);
      expect(existsSync(pidFilePath(root, 'sprint-512'))).toBe(false);
    });

    it('without a projectRoot the legacy IPC-only behaviour is preserved', () => {
      const handlers = captureHandlers({ ipcDir, jobId: 'legacy-job' });

      expect(handlers.exit).toBeUndefined();
      expect(() => handlers.uncaughtException!(new Error('legacy'))).toThrow('process.exit called');

      expect(existsSync(join(ipcDir, IPC_ERROR_FILE))).toBe(true);
      expect(existsSync(crashesDir(root))).toBe(false);
    });
  });
});
