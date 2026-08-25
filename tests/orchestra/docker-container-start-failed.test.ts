// ─── Sprint 163 T-002: Docker container_start_failed Health Check + Retry ─
//
// Verifies the health-check + retry policy added to DockerSpawnBackend.runSpawn
// can distinguish:
//   1. Clean start (docker run + Running=true)               → spawn success, no retry
//   2. Transient fail → success on 2nd attempt               → spawn success after retry
//   3. Persistent fail on both attempts                       → graceful error code (DECKENT_E08x)
//   4. Instant-exit with ExitCode=0                           → treated as success (no retry)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

const { mockFsFiles } = vi.hoisted(() => ({
  mockFsFiles: new Map<string, string>(),
}));

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:child_process', async () => {
  const { PassThrough } = await vi.importActual<typeof import('node:stream')>('node:stream');
  return {
    spawnSync: vi.fn(),
    spawn: vi.fn(() => {
    // monitorContainer uses nodeSpawn('docker', ['wait', …]) and listens on
    // child.stdout. Returning live, never-ending streams keeps the
    // monitor parked silently for the duration of the test.
    const stub = {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      on: vi.fn(),
      once: vi.fn(),
      kill: vi.fn(),
    };
    return stub as unknown as ChildProcess;
    }),
  };
});

vi.mock('node:fs', () => ({
  linkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  chmodSync: vi.fn(),
  existsSync: vi.fn((path: unknown) => (
    String(path).endsWith('.result') ? mockFsFiles.has(String(path)) : true
  )),
  readFileSync: vi.fn(() => '{}'), // task JSON parse path returns {} → no scope.filesWrite → spawn locks skipped
  writeFileSync: vi.fn((path: unknown, data: unknown) => {
    mockFsFiles.set(String(path), String(data));
  }),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  openSync: vi.fn(() => 0),
  fsyncSync: vi.fn(),
  closeSync: vi.fn(),
  renameSync: vi.fn((from: unknown, to: unknown) => {
    const value = mockFsFiles.get(String(from));
    if (value !== undefined) {
      mockFsFiles.set(String(to), value);
      mockFsFiles.delete(String(from));
    }
  }),
  rmdirSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/file-lock.js', () => ({
  acquireSpawnLocks: vi.fn(),
  releaseAllSpawnLocks: vi.fn(() => 0),
  releaseStaleSpawnLocksForTask: vi.fn(),
  SpawnLockError: class extends Error {},
}));

// This suite isolates Docker retry/error classification. Settlement persistence
// is exercised with real tmpdir state in docker-backend-owned-settlement.test.ts;
// keep this legacy whole-fs mock from becoming a second settlement implementation.
vi.mock('../../src/core/task-result-settlement.js', () => {
  return import('../helpers/task-result-settlement-stub.js')
    .then(({ createTaskResultSettlementModuleStub }) => createTaskResultSettlementModuleStub());
});

vi.mock('../../src/orchestra/execution-landing-coordinator.js', async (importActual) => ({
  ...(await importActual<typeof import('../../src/orchestra/execution-landing-coordinator.js')>()),
  prepareDockerExecutionLanding: vi.fn(({ prompt }: { prompt: string }) => ({ prompt, context: null })),
}));

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  DockerSpawnBackend,
  DOCKER_ERROR_CODES,
  classifyDockerError,
  parseDockerAuthorityInspectOutput,
  parseInspectOutput,
  HEALTH_CHECK_DELAY_MS,
  MAX_SPAWN_ATTEMPTS,
} from '../../src/orchestra/spawn-backend-docker.js';
import { DOCKER_ATTEMPT_LABELS } from '../../src/core/task-result-settlement.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const TEST_EXECUTION_OPTIONS = TEST_DOCKER_EXECUTION_OPTIONS;

// ─── Helpers ────────────────────────────────────────────────────────────────

interface SpawnSyncOutcome {
  stdout: string;
  stderr: string;
  status: number;
}

/**
 * Build a router that dispatches spawnSync calls by docker subcommand.
 * Each entry is consumed once in order so we can model "first call fails,
 * second succeeds" semantics needed for retry verification.
 */
function makeSpawnRouter(handlers: {
  image?: SpawnSyncOutcome;
  run?: SpawnSyncOutcome[];
  inspect?: SpawnSyncOutcome[];
  logs?: SpawnSyncOutcome[];
  rm?: SpawnSyncOutcome;
  sleep?: SpawnSyncOutcome;
  fallback?: SpawnSyncOutcome;
}): void {
  const imageDefault: SpawnSyncOutcome = handlers.image ?? { stdout: 'imghash', stderr: '', status: 0 };
  const rmDefault: SpawnSyncOutcome = handlers.rm ?? { stdout: '', stderr: '', status: 0 };
  const sleepDefault: SpawnSyncOutcome = handlers.sleep ?? { stdout: '', stderr: '', status: 0 };
  const fallback: SpawnSyncOutcome = handlers.fallback ?? { stdout: '', stderr: '', status: 0 };

  const runQueue = [...(handlers.run ?? [])];
  const inspectQueue = [...(handlers.inspect ?? [])];
  const logsQueue = [...(handlers.logs ?? [])];

  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];

    let outcome: SpawnSyncOutcome;
    if (cmd === 'sleep') {
      outcome = sleepDefault;
    } else if (cmd === 'docker' && sub === 'images') {
      outcome = imageDefault;
    } else if (cmd === 'docker' && sub === 'run') {
      outcome = runQueue.shift() ?? fallback;
    } else if (cmd === 'docker' && sub === 'inspect') {
      outcome = inspectQueue.shift() ?? fallback;
    } else if (cmd === 'docker' && sub === 'logs') {
      outcome = logsQueue.shift() ?? fallback;
    } else if (cmd === 'docker' && sub === 'rm') {
      outcome = rmDefault;
    } else if (cmd === 'docker' && sub === 'wait') {
      // monitorContainer fork — not actually used because nodeSpawn handles it
      outcome = fallback;
    } else if (cmd === 'claude' && sub === 'auth') {
      // A23: host-side authHealthCheck requires structured auth truth before spawn.
      outcome = { stdout: JSON.stringify({ loggedIn: true }), stderr: '', status: 0 };
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

function countDockerCalls(sub: string): number {
  return mockSpawnSync.mock.calls.filter(
    (c) => c[0] === 'docker' && Array.isArray(c[1]) && c[1][0] === sub,
  ).length;
}

function findTimeoutWrite(): string | null {
  for (const call of mockWriteFileSync.mock.calls) {
    const path = String(call[0] ?? '');
    if (path.endsWith('.timeout')) {
      return String(call[1] ?? '');
    }
  }
  return null;
}

// ─── Pure helper tests ──────────────────────────────────────────────────────

describe('classifyDockerError', () => {
  it('maps image-not-found stderr to DECKENT_E081', () => {
    const out = classifyDockerError("Unable to find image 'foo:bar' locally", 125);
    expect(out.code).toBe(DOCKER_ERROR_CODES.IMAGE_NOT_FOUND);
    expect(out.code).toBe('DECKENT_E081');
  });

  it('maps port-collision stderr to DECKENT_E082', () => {
    const out = classifyDockerError('bind: address already in use', 125);
    expect(out.code).toBe(DOCKER_ERROR_CODES.PORT_COLLISION);
    expect(out.code).toBe('DECKENT_E082');
  });

  it('maps resource-limit stderr to DECKENT_E083', () => {
    const out = classifyDockerError('cannot allocate memory', 125);
    expect(out.code).toBe(DOCKER_ERROR_CODES.RESOURCE_LIMIT);
    expect(out.code).toBe('DECKENT_E083');
  });

  it('falls back to DECKENT_E084 with exitCode + stderr in message', () => {
    const out = classifyDockerError('mysterious failure xyz', 42);
    expect(out.code).toBe(DOCKER_ERROR_CODES.UNKNOWN);
    expect(out.message).toContain('exitCode=42');
    expect(out.message).toContain('mysterious failure xyz');
  });
});

describe('parseInspectOutput', () => {
  it('parses true|0 as running', () => {
    expect(parseInspectOutput('true|0')).toEqual({ running: true, exitCode: 0 });
  });
  it('parses false|137 as stopped', () => {
    expect(parseInspectOutput('false|137')).toEqual({ running: false, exitCode: 137 });
  });
  it('returns null on malformed input', () => {
    expect(parseInspectOutput('garbage')).toBeNull();
    expect(parseInspectOutput('')).toBeNull();
    expect(parseInspectOutput('true|notanumber')).toBeNull();
  });
});

describe('parseDockerAuthorityInspectOutput', () => {
  it('preserves the full container ID and exact ownership labels', () => {
    const id = 'a'.repeat(64);
    expect(parseDockerAuthorityInspectOutput(
      `${id}|true|0|true|project-hash|task-hash|00000000-0000-4000-8000-000000000001`,
    )).toEqual({
      containerId: id,
      running: true,
      exitCode: 0,
      labels: {
        [DOCKER_ATTEMPT_LABELS.managed]: 'true',
        [DOCKER_ATTEMPT_LABELS.project]: 'project-hash',
        [DOCKER_ATTEMPT_LABELS.task]: 'task-hash',
        [DOCKER_ATTEMPT_LABELS.attempt]: '00000000-0000-4000-8000-000000000001',
      },
    });
  });

  it('rejects malformed identity/state projections', () => {
    expect(parseDockerAuthorityInspectOutput('short|true|0|true|p|t|a')).toBeNull();
    expect(parseDockerAuthorityInspectOutput(`${'a'.repeat(64)}|unknown|0|true|p|t|a`)).toBeNull();
  });
});

// ─── Behavioral tests ───────────────────────────────────────────────────────

describe('DockerSpawnBackend: container_start_failed health check + retry', () => {
  let backend: DockerSpawnBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFsFiles.clear();
    // Heartbeat-authority identity readbacks must surface ENOENT: the full
    // node:fs mock cannot carry the WorkerHeartbeatAuthorityStore
    // write→readback chain, and the '{}' fallback would trip the store's
    // schema guard (E_UNSUPPORTED_WORKER_HEARTBEAT_AUTHORITY_IDENTITY).
    // ENOENT routes the store onto its honest uninitialized-attempt path
    // (read → null, observe → typed HOLD); real persistence is proven in
    // tests/core/worker-heartbeat-authority-store.test.ts.
    mockReadFileSync.mockImplementation(((path: unknown) => {
      const stored = mockFsFiles.get(String(path));
      if (stored !== undefined) return stored;
      if (String(path).includes('worker-heartbeat-authority') || String(path).endsWith('.result')) {
        const error = new Error(`ENOENT: no such file or directory, open '${String(path)}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return budgetedDockerTaskJson(path);
    }) as typeof readFileSync);
    backend = new DockerSpawnBackend('/test/project', {
      image: 'deckent-worker:latest',
      timeoutSeconds: 60,
    });
  });

  it('clean start: docker run + Running=true → no retry, no .timeout marker', () => {
    makeSpawnRouter({
      run: [{ stdout: 'container-id-abc123', stderr: '', status: 0 }],
      inspect: [{ stdout: 'true|0', stderr: '', status: 0 }],
    });

    backend.spawn('test-clean', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

    expect(countDockerCalls('run')).toBe(1);
    expect(countDockerCalls('inspect')).toBe(1);
    // No retry → no `docker rm` between attempts
    expect(countDockerCalls('rm')).toBe(0);
    // No .timeout marker because spawn succeeded
    expect(findTimeoutWrite()).toBeNull();
    // Container is tracked
    expect(backend.list()).toContain('test-clean');
  });

  it('stopped non-zero current container is finalized without duplicate provider dispatch', () => {
    makeSpawnRouter({
      run: [
        { stdout: 'container-fail', stderr: '', status: 0 },
      ],
      inspect: [
        { stdout: 'false|1', stderr: '', status: 0 }, // first: dead
      ],
    });

    backend.spawn('test-retry-ok', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

    expect(countDockerCalls('run')).toBe(1);
    expect(countDockerCalls('inspect')).toBe(1);
    expect(countDockerCalls('rm')).toBe(0);
    expect(findTimeoutWrite()).toBeNull();
    expect(backend.list()).toContain('test-retry-ok');
  });

  it('docker-run failure with no created container retries boundedly without rm', () => {
    makeSpawnRouter({
      run: [
        { stdout: '', stderr: 'bind: address already in use', status: 125 },
        { stdout: '', stderr: 'bind: address already in use', status: 125 },
      ],
      inspect: [
        { stdout: '', stderr: 'No such container', status: 1 },
        { stdout: '', stderr: 'No such container', status: 1 },
      ],
    });

    backend.spawn('test-retry-fail', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

    // Exactly MAX_SPAWN_ATTEMPTS attempts were made
    expect(countDockerCalls('run')).toBe(MAX_SPAWN_ATTEMPTS);
    expect(countDockerCalls('inspect')).toBe(MAX_SPAWN_ATTEMPTS);
    expect(countDockerCalls('rm')).toBe(0);
    // .timeout marker written with the classified error code
    const marker = findTimeoutWrite();
    expect(marker).not.toBeNull();
    expect(marker).toContain('container_start_failed');
    expect(marker).toContain(DOCKER_ERROR_CODES.PORT_COLLISION);
    expect(marker).toContain('DECKENT_E082');
    // Spawn locks released and container NOT tracked
    expect(backend.list()).not.toContain('test-retry-fail');
  });

  it('foreign name collision fails loud without rm, kill or second docker run', () => {
    makeSpawnRouter({
      run: [{ stdout: '', stderr: 'Conflict. The container name is already in use.', status: 125 }],
      inspect: [{
        stdout: `${'d'.repeat(64)}|true|0|true|foreign-project|foreign-task|foreign-attempt`,
        stderr: '',
        status: 0,
      }],
    });

    backend.spawn('test-foreign', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

    expect(countDockerCalls('run')).toBe(1);
    expect(countDockerCalls('rm')).toBe(0);
    expect(countDockerCalls('kill')).toBe(0);
    expect(findTimeoutWrite()).toContain(DOCKER_ERROR_CODES.OWNERSHIP_CONFLICT);
    expect(backend.list()).not.toContain('test-foreign');
  });

  it('authority inspect permission failure fails closed without rm, kill or second docker run', () => {
    makeSpawnRouter({
      run: [{ stdout: '', stderr: 'name already in use', status: 125 }],
      inspect: [{
        stdout: '',
        stderr: 'permission denied while trying to connect to the Docker daemon socket',
        status: 1,
      }],
    });

    expect(() => backend.spawn(
      'test-authority-unavailable',
      'claude-sonnet-5',
      'prompt',
      TEST_EXECUTION_OPTIONS,
    )).toThrow(DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE);

    expect(countDockerCalls('run')).toBe(1);
    expect(countDockerCalls('inspect')).toBe(1);
    expect(countDockerCalls('rm')).toBe(0);
    expect(countDockerCalls('kill')).toBe(0);
    expect(findTimeoutWrite()).toContain(DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE);
    expect(backend.list()).not.toContain('test-authority-unavailable');
  });

  it('exact-attempt collision adopts the full container ID without redispatch', () => {
    const labels = new Map<string, string>();
    mockSpawnSync.mockImplementation((cmd, args) => {
      const argv = (args as string[] | undefined) ?? [];
      const sub = argv[0];
      let outcome: SpawnSyncOutcome = { stdout: '', stderr: '', status: 0 };
      if (cmd === 'docker' && sub === 'images') {
        outcome = { stdout: 'imghash', stderr: '', status: 0 };
      } else if (cmd === 'docker' && sub === 'run') {
        for (let i = 0; i < argv.length; i++) {
          if (argv[i] !== '--label') continue;
          const [key, value] = String(argv[i + 1] ?? '').split('=', 2);
          if (key && value) labels.set(key, value);
        }
        outcome = { stdout: '', stderr: 'name already in use', status: 125 };
      } else if (cmd === 'docker' && sub === 'inspect') {
        outcome = {
          stdout: [
            'e'.repeat(64),
            'true',
            '0',
            labels.get(DOCKER_ATTEMPT_LABELS.managed) ?? '',
            labels.get(DOCKER_ATTEMPT_LABELS.project) ?? '',
            labels.get(DOCKER_ATTEMPT_LABELS.task) ?? '',
            labels.get(DOCKER_ATTEMPT_LABELS.attempt) ?? '',
          ].join('|'),
          stderr: '',
          status: 0,
        };
      } else if (cmd === 'claude' && sub === 'auth') {
        outcome = { stdout: JSON.stringify({ loggedIn: true }), stderr: '', status: 0 };
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

    backend.spawn('test-adopt', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

    expect(countDockerCalls('run')).toBe(1);
    expect(countDockerCalls('rm')).toBe(0);
    expect(backend.list()).toContain('test-adopt');
    const runArgs = mockSpawnSync.mock.calls.find(call => call[0] === 'docker' && call[1]?.[0] === 'run')?.[1] as string[];
    expect(runArgs[runArgs.indexOf('--name') + 1]).toMatch(/^deckent-w-[a-f0-9]{12}-[a-f0-9]{16}$/);
  });

  it('instant-exit ExitCode=0: container started and gracefully exited → success, no retry', () => {
    makeSpawnRouter({
      run: [{ stdout: 'container-instant', stderr: '', status: 0 }],
      inspect: [{ stdout: 'false|0', stderr: '', status: 0 }],
    });

    backend.spawn('test-instant', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

    // No retry — instant-exit-success is treated as a clean spawn
    expect(countDockerCalls('run')).toBe(1);
    expect(countDockerCalls('inspect')).toBe(1);
    expect(countDockerCalls('rm')).toBe(0);
    // No .timeout marker because this is NOT a failure
    expect(findTimeoutWrite()).toBeNull();
    // Container is tracked (monitor will handle the eventual wait → cleanup)
    expect(backend.list()).toContain('test-instant');
  });
});

// ─── Sanity: contract / wiring ──────────────────────────────────────────────

describe('DockerSpawnBackend: retry policy constants', () => {
  it('exposes MAX_SPAWN_ATTEMPTS=2 (task spec)', () => {
    expect(MAX_SPAWN_ATTEMPTS).toBe(2);
  });

  it('exposes HEALTH_CHECK_DELAY_MS=3000 (task spec — 3 seconds)', () => {
    expect(HEALTH_CHECK_DELAY_MS).toBe(3_000);
  });

  it('keeps the original start codes and exposes fail-closed ownership conflict', () => {
    expect(DOCKER_ERROR_CODES.IMAGE_NOT_FOUND).toBe('DECKENT_E081');
    expect(DOCKER_ERROR_CODES.PORT_COLLISION).toBe('DECKENT_E082');
    expect(DOCKER_ERROR_CODES.RESOURCE_LIMIT).toBe('DECKENT_E083');
    expect(DOCKER_ERROR_CODES.UNKNOWN).toBe('DECKENT_E084');
    expect(DOCKER_ERROR_CODES.OWNERSHIP_CONFLICT).toBe('DECKENT_E089');
    expect(DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE).toBe('DECKENT_E090');
  });
});
