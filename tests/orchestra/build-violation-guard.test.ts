// ─── born-644 (408-002 BUILD-VIOLATION-GUARD): dist-mtime sentinel ─────────
//
// Live incident (2026-07-11): host dist/ was rediscovered rebuilt mid-sprint — suspected an
// in-container `npm run build` (the docker backend bind-mounts the whole project root
// read-write, so a container-side build writes straight through to host dist/, poisoning
// every other worker's ESM module cache). This is an ADVISORY-ONLY guard (NPM-ADVISORY
// precedent, born-454): it must NEVER block a worker or alter its selfAssessment — it only
// flags `.result.distMutated` + emits a loud stderr warning once the mutation is detected
// after container exit.
//
// Coverage:
//   1. computeDistFingerprint — pure snapshot (fileCount + maxMtimeMs), null when dist/ absent.
//   2. distFingerprintsChanged — pure comparison, incl. null<->non-null transitions.
//   3. applyDistMutationAdvisory — patches `.result` only when mutated AND the file exists;
//      never throws; adds no field on the no-mutation path.
//   4. Wiring: DockerSpawnBackend's private monitorContainer (invoked directly, same
//      interface-cast technique as docker-backend-fixpack.test.ts, to avoid the unrelated
//      image-check/auth-health-check/git-guard machinery of the full spawn() path) actually
//      calls the sentinel on container exit and never affects the worker's own result fields.
//
// Hermetic: real fs + tmpdir (ADR-D-002), `node:child_process` mocked (this file only) so no
// real `docker` binary is ever invoked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync, unlinkSync, rmSync, existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── child_process mock (this file only — isolated per vitest module) ──────

let dockerWaitDataCallback: ((data: Buffer) => void) | undefined;

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ stdout: '', stderr: '', status: 0 })),
  spawn: vi.fn(() => {
    const stub = {
      stdout: {
        on: (event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') dockerWaitDataCallback = cb;
        },
      },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

import {
  DockerSpawnBackend,
  computeDistFingerprint,
  distFingerprintsChanged,
  applyDistMutationAdvisory,
  type DistFingerprint,
} from '../../src/orchestra/spawn-backend-docker.js';

// ─── helpers ────────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

afterEach(() => {
  dockerWaitDataCallback = undefined;
  vi.restoreAllMocks();
  while (tmpDirs.length) {
    const d = tmpDirs.pop();
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
});

function freshTmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-buildguard-'));
  tmpDirs.push(d);
  return d;
}

/** Set an explicit, deterministic mtime — avoids flakiness from same-tick real-clock writes. */
function writeFileWithMtime(path: string, content: string, mtimeMs: number): void {
  writeFileSync(path, content, 'utf-8');
  const seconds = mtimeMs / 1000;
  utimesSync(path, seconds, seconds);
}

// ─── 1. computeDistFingerprint ───────────────────────────────────────────────

describe('computeDistFingerprint', () => {
  it('returns null when dist/ does not exist', () => {
    const dir = freshTmp();
    expect(computeDistFingerprint(join(dir, 'dist'))).toBeNull();
  });

  it('returns fileCount 0 for an empty dist/', () => {
    const dir = freshTmp();
    const distDir = join(dir, 'dist');
    mkdirSync(distDir, { recursive: true });
    expect(computeDistFingerprint(distDir)).toEqual({ fileCount: 0, maxMtimeMs: 0 });
  });

  it('counts nested files and tracks the max mtime', () => {
    const dir = freshTmp();
    const distDir = join(dir, 'dist');
    mkdirSync(join(distDir, 'cli'), { recursive: true });
    writeFileWithMtime(join(distDir, 'index.js'), 'a', 1_000_000);
    writeFileWithMtime(join(distDir, 'cli', 'entry.js'), 'b', 2_000_000);
    const fp = computeDistFingerprint(distDir);
    expect(fp).not.toBeNull();
    expect(fp!.fileCount).toBe(2);
    expect(fp!.maxMtimeMs).toBe(2_000_000);
  });

  it('reflects a new file added after the initial snapshot', () => {
    const dir = freshTmp();
    const distDir = join(dir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileWithMtime(join(distDir, 'index.js'), 'a', 1_000_000);
    const before = computeDistFingerprint(distDir)!;
    writeFileWithMtime(join(distDir, 'new-file.js'), 'c', 3_000_000);
    const after = computeDistFingerprint(distDir)!;
    expect(after.fileCount).toBe(before.fileCount + 1);
    expect(after.maxMtimeMs).toBeGreaterThan(before.maxMtimeMs);
  });

  it('reflects a file removed after the initial snapshot', () => {
    const dir = freshTmp();
    const distDir = join(dir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileWithMtime(join(distDir, 'index.js'), 'a', 1_000_000);
    writeFileWithMtime(join(distDir, 'gone.js'), 'b', 1_500_000);
    const before = computeDistFingerprint(distDir)!;
    unlinkSync(join(distDir, 'gone.js'));
    const after = computeDistFingerprint(distDir)!;
    expect(after.fileCount).toBe(before.fileCount - 1);
  });

  it('reflects an existing file rewritten in place (same name, bumped mtime)', () => {
    const dir = freshTmp();
    const distDir = join(dir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileWithMtime(join(distDir, 'index.js'), 'a', 1_000_000);
    const before = computeDistFingerprint(distDir)!;
    writeFileWithMtime(join(distDir, 'index.js'), 'a-rebuilt', 5_000_000);
    const after = computeDistFingerprint(distDir)!;
    expect(after.fileCount).toBe(before.fileCount);
    expect(after.maxMtimeMs).toBeGreaterThan(before.maxMtimeMs);
  });
});

// ─── 2. distFingerprintsChanged ───────────────────────────────────────────────

describe('distFingerprintsChanged', () => {
  const fp = (fileCount: number, maxMtimeMs: number): DistFingerprint => ({ fileCount, maxMtimeMs });

  it('false when both null (dist/ absent before and after)', () => {
    expect(distFingerprintsChanged(null, null)).toBe(false);
  });

  it('false when identical snapshots', () => {
    expect(distFingerprintsChanged(fp(3, 1000), fp(3, 1000))).toBe(false);
  });

  it('true when fileCount differs', () => {
    expect(distFingerprintsChanged(fp(3, 1000), fp(4, 1000))).toBe(true);
  });

  it('true when maxMtimeMs differs', () => {
    expect(distFingerprintsChanged(fp(3, 1000), fp(3, 2000))).toBe(true);
  });

  it('true when dist/ appeared (null -> non-null)', () => {
    expect(distFingerprintsChanged(null, fp(1, 1000))).toBe(true);
  });

  it('true when dist/ disappeared (non-null -> null)', () => {
    expect(distFingerprintsChanged(fp(1, 1000), null)).toBe(true);
  });
});

// ─── 3. applyDistMutationAdvisory ────────────────────────────────────────────

describe('applyDistMutationAdvisory', () => {
  it('patches distMutated:true into an existing .result when mutated', () => {
    const dir = freshTmp();
    const resultPath = join(dir, 'task-x.result');
    writeFileSync(resultPath, JSON.stringify({ taskId: 'x', selfAssessment: 'DONE' }), 'utf-8');
    const patched = applyDistMutationAdvisory(resultPath, true);
    expect(patched).toBe(true);
    const written = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    expect(written.distMutated).toBe(true);
    // advisory-only: original fields untouched
    expect(written.selfAssessment).toBe('DONE');
    expect(written.taskId).toBe('x');
  });

  it('adds no field when not mutated', () => {
    const dir = freshTmp();
    const resultPath = join(dir, 'task-x.result');
    const original = JSON.stringify({ taskId: 'x', selfAssessment: 'DONE' });
    writeFileSync(resultPath, original, 'utf-8');
    const patched = applyDistMutationAdvisory(resultPath, false);
    expect(patched).toBe(false);
    const raw = readFileSync(resultPath, 'utf-8');
    expect(JSON.parse(raw)).toEqual(JSON.parse(original));
    expect(raw.includes('distMutated')).toBe(false);
  });

  it('no-ops when .result does not exist (never blocks the worker)', () => {
    const dir = freshTmp();
    const resultPath = join(dir, 'task-missing.result');
    expect(() => applyDistMutationAdvisory(resultPath, true)).not.toThrow();
    expect(applyDistMutationAdvisory(resultPath, true)).toBe(false);
    expect(existsSync(resultPath)).toBe(false);
  });

  it('tolerates malformed JSON in .result without throwing', () => {
    const dir = freshTmp();
    const resultPath = join(dir, 'task-corrupt.result');
    writeFileSync(resultPath, '{not valid json', 'utf-8');
    expect(() => applyDistMutationAdvisory(resultPath, true)).not.toThrow();
    expect(applyDistMutationAdvisory(resultPath, true)).toBe(false);
  });
});

// ─── 4. Wiring — DockerSpawnBackend.monitorContainer actually calls the sentinel ──

interface MonitorContainerAccess {
  monitorContainer(
    taskId: string,
    containerName: string,
    tasksDir: string,
    model: string,
    projectDir: string,
    distFingerprintBefore: DistFingerprint | null,
  ): void;
}

function invokeMonitor(
  backend: DockerSpawnBackend,
  args: { taskId: string; tasksDir: string; projectDir: string; distFingerprintBefore: DistFingerprint | null },
): void {
  (backend as unknown as MonitorContainerAccess).monitorContainer(
    args.taskId,
    `deckent-w-${args.taskId}`,
    args.tasksDir,
    'claude-sonnet-5',
    args.projectDir,
    args.distFingerprintBefore,
  );
  // The mocked `docker wait` spawn stub captured the 'data' handler synchronously above.
  expect(dockerWaitDataCallback).toBeDefined();
  dockerWaitDataCallback!(Buffer.from('0\n'));
}

describe('DockerSpawnBackend.monitorContainer — dist-mutation wiring', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('flags .result.distMutated + warns when dist/ was mutated during the container run', () => {
    const projectDir = freshTmp();
    const tasksDir = join(projectDir, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const distDir = join(projectDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileWithMtime(join(distDir, 'index.js'), 'a', 1_000_000);

    const taskId = 'guard-001';
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    writeFileSync(resultPath, JSON.stringify({ taskId, selfAssessment: 'DONE' }), 'utf-8');

    const before = computeDistFingerprint(distDir);
    // Simulate an in-container `npm run build` rewriting dist/ before exit.
    writeFileWithMtime(join(distDir, 'index.js'), 'a-rebuilt', 9_000_000);

    const backend = new DockerSpawnBackend(projectDir);
    invokeMonitor(backend, { taskId, tasksDir, projectDir, distFingerprintBefore: before });

    const written = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    expect(written.distMutated).toBe(true);
    // Advisory-only: the worker's own honest self-assessment is untouched — never blocked.
    expect(written.selfAssessment).toBe('DONE');
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/BUILD-VIOLATION-GUARD/);
  });

  it('adds no distMutated field and does not warn when dist/ was untouched', () => {
    const projectDir = freshTmp();
    const tasksDir = join(projectDir, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const distDir = join(projectDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileWithMtime(join(distDir, 'index.js'), 'a', 1_000_000);

    const taskId = 'guard-002';
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    writeFileSync(resultPath, JSON.stringify({ taskId, selfAssessment: 'DONE' }), 'utf-8');

    const before = computeDistFingerprint(distDir);
    // No mutation this time.

    const backend = new DockerSpawnBackend(projectDir);
    invokeMonitor(backend, { taskId, tasksDir, projectDir, distFingerprintBefore: before });

    const raw = readFileSync(resultPath, 'utf-8');
    expect(raw.includes('distMutated')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('never throws / never blocks even when there is no .result to patch (advisory-only)', () => {
    const projectDir = freshTmp();
    const tasksDir = join(projectDir, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    const distDir = join(projectDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileWithMtime(join(distDir, 'index.js'), 'a', 1_000_000);

    const taskId = 'guard-003';
    const before = computeDistFingerprint(distDir);
    writeFileWithMtime(join(distDir, 'index.js'), 'a-rebuilt', 9_000_000);

    const backend = new DockerSpawnBackend(projectDir);
    expect(() => invokeMonitor(backend, { taskId, tasksDir, projectDir, distFingerprintBefore: before }))
      .not.toThrow();
    // A host-fallback .result gets written by the pre-existing EXIT_WITHOUT_RESULT path
    // (exitCode 0 here, so no fallback is expected either — just proving no crash + no
    // dangling exception surfaces to the caller).
  });
});
