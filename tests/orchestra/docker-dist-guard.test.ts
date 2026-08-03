// ─── born-644 (428-012 BUILD-VIOLATION-GUARD, B542): dist read-only mount guard ──
//
// docs/analysis/build-violation-audit-2026-07-11.md + MASTER-PLAN row 542: suspected
// in-container `npm run build` overwrote host `dist/` mid-sprint because the docker
// backend bind-mounts the whole project root READ-WRITE at CONTAINER_WORKSPACE. A prior
// task (tests/orchestra/build-violation-guard.test.ts) added an ADVISORY-ONLY post-exit
// detector — it only flags the mutation after it already happened. This suite pins the
// MECHANICAL prevention half: a nested read-only bind mount of the host `dist/` over the
// container's `/workspace/dist`, the same overlay technique as `buildDeckShadowMountArgs`
// (ADR-G-005, see tests/orchestra/deck-worker-isolation.test.ts).
//
// Coverage:
//   1. buildDistReadOnlyMountArgs — pure helper (present/absent/always-ro), mirroring
//      deck-worker-isolation.test.ts's structure for buildDeckShadowMountArgs.
//   2. Wiring — DockerSpawnBackend.spawn() actually threads the mount into the real
//      `docker run` argv, and every pre-existing mount arg (project root, .tasks/,
//      .locks/) stays byte-identical — only the new `:ro` mount is additive.
//
// Hermetic: node:child_process + node:fs mocked (this file only, same pattern as
// tests/orchestra/spawn-backend-docker.test.ts) — no real docker/filesystem touched.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => {
    const stub = {
      stdout: { on: vi.fn(), resume: vi.fn() },
      stderr: { on: vi.fn(), resume: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

// existsSync is path-aware here (unlike spawn-backend-docker.test.ts's always-true
// stub) so a single test can flip JUST the `dist/`-absent branch while every other
// existsSync call on the happy path (`.deck`, `.claude.json`, task-scope JSON reads)
// keeps returning true.
let distAbsentPath: string | undefined;

vi.mock('node:fs', () => ({
  linkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  chmodSync: vi.fn(),
  existsSync: vi.fn((p: string) => p !== distAbsentPath),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  openSync: vi.fn(() => 0),
  fsyncSync: vi.fn(),
  closeSync: vi.fn(),
  renameSync: vi.fn(),
  rmdirSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/file-lock.js', () => ({
  acquireSpawnLocks: vi.fn(),
  releaseAllSpawnLocks: vi.fn(() => 0),
  releaseStaleSpawnLocksForTask: vi.fn(() => 0),
  SpawnLockError: class extends Error {},
}));

vi.mock('../../src/core/active-workers.js', () => ({
  markPending: vi.fn(),
  markActive: vi.fn(),
  clearPending: vi.fn(),
}));

vi.mock('../../src/core/task-result-settlement.js', () => {
  return import('../helpers/task-result-settlement-stub.js')
    .then(({ createTaskResultSettlementModuleStub }) => createTaskResultSettlementModuleStub());
});

vi.mock('../../src/orchestra/execution-landing-coordinator.js', async (importActual) => ({
  ...(await importActual<typeof import('../../src/orchestra/execution-landing-coordinator.js')>()),
  prepareDockerExecutionLanding: vi.fn(({ prompt }: { prompt: string }) => ({ prompt, context: null })),
}));

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { DockerSpawnBackend, buildDistReadOnlyMountArgs } from '../../src/orchestra/spawn-backend-docker.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockReadFileSync = vi.mocked(readFileSync);
const TEST_EXECUTION_OPTIONS = TEST_DOCKER_EXECUTION_OPTIONS;

// ─── 1. Pure helper — the regression guard ──────────────────────────────────

describe('buildDistReadOnlyMountArgs (BUILD-VIOLATION-GUARD regression guard)', () => {
  it('mounts /workspace/dist read-only when dist/ exists', () => {
    const args = buildDistReadOnlyMountArgs(true, '/proj/dist');
    expect(args).toEqual(['-v', '/proj/dist:/workspace/dist:ro']);
  });

  it('emits NO mount when dist/ is absent (avoids phantom host dist/)', () => {
    // The security-critical branch: mounting a not-yet-built dist/ read-only would
    // make docker phantom-create an empty host dist/ (nested bind mount materializes
    // a missing target), blocking the next legitimate `npm run build`. No dist/ ⇒ no mount.
    expect(buildDistReadOnlyMountArgs(false, '/proj/dist')).toEqual([]);
  });

  it('always mounts read-only (never rw — a worker must not write dist/)', () => {
    const args = buildDistReadOnlyMountArgs(true, '/x/dist');
    expect(args[1]).toMatch(/:ro$/);
    expect(args[1]).toContain(':/workspace/dist:');
  });
});

// ─── 2. Wiring — DockerSpawnBackend.spawn() threads the mount into `docker run` ──

interface SpawnSyncOutcome {
  stdout: string;
  stderr: string;
  status: number;
}

/** Capture every `docker run` argv list invoked during a spawn(). */
const capturedDockerRunArgs: string[][] = [];

function installSpawnRouter(): void {
  capturedDockerRunArgs.length = 0;
  const successOutcome: SpawnSyncOutcome = { stdout: 'container-id-x', stderr: '', status: 0 };
  const imageOutcome: SpawnSyncOutcome = { stdout: 'imghash', stderr: '', status: 0 };
  const inspectOutcome: SpawnSyncOutcome = { stdout: 'true|0', stderr: '', status: 0 };
  const fallback: SpawnSyncOutcome = { stdout: '', stderr: '', status: 0 };

  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];

    let outcome: SpawnSyncOutcome;
    if (cmd === 'sleep') {
      outcome = fallback;
    } else if (cmd === 'docker' && sub === 'images') {
      outcome = imageOutcome;
    } else if (cmd === 'docker' && sub === 'run') {
      capturedDockerRunArgs.push([...argv]);
      outcome = successOutcome;
    } else if (cmd === 'docker' && sub === 'inspect') {
      outcome = inspectOutcome;
    } else if (cmd === 'claude' && argv.join(' ') === 'auth status --json') {
      outcome = { stdout: '{"loggedIn":true}', stderr: '', status: 0 };
    } else {
      outcome = fallback;
    }

    return {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      status: outcome.status,
      signal: null,
      pid: 1,
      output: ['', outcome.stdout, outcome.stderr],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

describe('DockerSpawnBackend: dist/ read-only mount wiring (born-644 B542)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    distAbsentPath = undefined;
    mockReadFileSync.mockImplementation((path: unknown) => budgetedDockerTaskJson(path));
    installSpawnRouter();
  });

  it('adds the read-only dist/ mount to `docker run` argv when dist/ exists', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('dist-guard-present', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(argv).toContain('/test/project/dist:/workspace/dist:ro');
  });

  it('omits the dist/ mount when dist/ does not exist (no phantom host dir)', () => {
    distAbsentPath = '/test/project/dist';
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('dist-guard-absent', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(argv.some((a) => a.includes(':/workspace/dist:'))).toBe(false);
  });

  it('keeps every pre-existing mount byte-identical — only the new ro-mount is additive', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('dist-guard-parity', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    // Project root still mounted read-write, unmodified (no :ro suffix on this exact arg).
    expect(argv).toContain('/test/project:/workspace');
    // .tasks/ and .locks/ still mounted read-write exactly as before.
    expect(argv.some((a) => a === '/test/project/.tasks:/workspace/.tasks')).toBe(true);
    expect(argv.some((a) => a === '/test/project/.locks:/workspace/.locks')).toBe(true);
  });
});
