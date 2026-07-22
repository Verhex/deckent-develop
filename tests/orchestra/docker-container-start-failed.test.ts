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
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => '{}'), // task JSON parse path returns {} → no scope.filesWrite → spawn locks skipped
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
  releaseStaleSpawnLocksForTask: vi.fn(),
  SpawnLockError: class extends Error {},
}));

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  DockerSpawnBackend,
  DOCKER_ERROR_CODES,
  classifyDockerError,
  parseInspectOutput,
  HEALTH_CHECK_DELAY_MS,
  MAX_SPAWN_ATTEMPTS,
} from '../../src/orchestra/spawn-backend-docker.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const TEST_EXECUTION_OPTIONS = { executionBudget: { maxTurns: 1 } } as const;

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

// ─── Behavioral tests ───────────────────────────────────────────────────────

describe('DockerSpawnBackend: container_start_failed health check + retry', () => {
  let backend: DockerSpawnBackend;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('retry-then-success: first attempt unhealthy, second attempt healthy', () => {
    makeSpawnRouter({
      run: [
        { stdout: 'container-fail', stderr: '', status: 0 },
        { stdout: 'container-ok', stderr: '', status: 0 },
      ],
      inspect: [
        { stdout: 'false|1', stderr: '', status: 0 }, // first: dead
        { stdout: 'true|0', stderr: '', status: 0 },  // second: alive
      ],
      logs: [
        { stdout: 'some transient noise', stderr: '', status: 0 },
      ],
    });

    backend.spawn('test-retry-ok', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

    expect(countDockerCalls('run')).toBe(2);
    expect(countDockerCalls('inspect')).toBe(2);
    // After first failed attempt, container is force-removed
    expect(countDockerCalls('rm')).toBeGreaterThanOrEqual(1);
    expect(findTimeoutWrite()).toBeNull();
    expect(backend.list()).toContain('test-retry-ok');
    // MAX_SPAWN_ATTEMPTS contract: we should NOT exceed the limit
    expect(countDockerCalls('run')).toBeLessThanOrEqual(MAX_SPAWN_ATTEMPTS);
  });

  it('retry-then-fail: port collision on both attempts → graceful DECKENT_E082 in .timeout', () => {
    makeSpawnRouter({
      run: [
        { stdout: 'container-a', stderr: '', status: 0 },
        { stdout: 'container-b', stderr: '', status: 0 },
      ],
      inspect: [
        { stdout: 'false|125', stderr: '', status: 0 },
        { stdout: 'false|125', stderr: '', status: 0 },
      ],
      logs: [
        { stdout: '', stderr: 'docker: Error: bind: address already in use', status: 0 },
        { stdout: '', stderr: 'docker: Error: bind: address already in use', status: 0 },
      ],
    });

    backend.spawn('test-retry-fail', 'claude-sonnet-5', 'prompt', TEST_EXECUTION_OPTIONS);

    // Exactly MAX_SPAWN_ATTEMPTS attempts were made
    expect(countDockerCalls('run')).toBe(MAX_SPAWN_ATTEMPTS);
    expect(countDockerCalls('inspect')).toBe(MAX_SPAWN_ATTEMPTS);
    // .timeout marker written with the classified error code
    const marker = findTimeoutWrite();
    expect(marker).not.toBeNull();
    expect(marker).toContain('container_start_failed');
    expect(marker).toContain(DOCKER_ERROR_CODES.PORT_COLLISION);
    expect(marker).toContain('DECKENT_E082');
    // Spawn locks released and container NOT tracked
    expect(backend.list()).not.toContain('test-retry-fail');
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

  it('exposes all four DECKENT_E08x error codes', () => {
    expect(DOCKER_ERROR_CODES.IMAGE_NOT_FOUND).toBe('DECKENT_E081');
    expect(DOCKER_ERROR_CODES.PORT_COLLISION).toBe('DECKENT_E082');
    expect(DOCKER_ERROR_CODES.RESOURCE_LIMIT).toBe('DECKENT_E083');
    expect(DOCKER_ERROR_CODES.UNKNOWN).toBe('DECKENT_E084');
  });
});
