import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/task-result-settlement.js', () => {
  return import('../helpers/task-result-settlement-stub.js')
    .then(({ createTaskResultSettlementModuleStub }) => createTaskResultSettlementModuleStub());
});

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  DockerSpawnBackend,
  isDockerAvailable,
  classifyDockerPreflight,
  DOCKER_ERROR_CODES,
} from '../../src/orchestra/spawn-backend-docker.js';
import { SpawnBackendError } from '../../src/orchestra/spawn-backend.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);
const TEST_EXECUTION_OPTIONS = { executionBudget: { maxTurns: 1 } } as const;

/** Build a spawnSync-shaped return object for the mock. */
function spawnResult(over: { stdout?: string; stderr?: string; status?: number | null; error?: Error }): any {
  return {
    stdout: over.stdout ?? '',
    stderr: over.stderr ?? '',
    status: over.status ?? 0,
    signal: null,
    pid: 1,
    output: ['', over.stdout ?? '', over.stderr ?? ''],
    ...(over.error ? { error: over.error } : {}),
  };
}

function seedOwnedContainer(backend: DockerSpawnBackend, taskId: string, containerId: string): void {
  const internal = backend as unknown as {
    containers: Map<string, {
      containerId: string;
      containerName: string;
      model: string;
      projectDir: string;
      tasksDir: string;
    }>;
  };
  internal.containers.set(taskId, {
    containerId,
    containerName: 'display-only',
    model: 'claude-sonnet-5',
    projectDir: '/test/project',
    tasksDir: '/test/project/.tasks',
  });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('DockerSpawnBackend', () => {
  let backend: DockerSpawnBackend;

  beforeEach(() => {
    vi.restoreAllMocks();
    backend = new DockerSpawnBackend('/test/project', {
      image: 'test-image:latest',
      timeoutSeconds: 600,
    });

    mockExistsSync.mockReturnValue(true);
  });

  describe('spawn', () => {
    it('should throw SpawnBackendError when Docker image is not found', () => {
      // 455-003: call 1 = `docker info` daemon preflight (healthy), call 2 =
      // `docker images -q` (empty → image not found).
      mockSpawnSync
        .mockReturnValueOnce(spawnResult({ stdout: 'Server: healthy', status: 0 }))
        .mockReturnValueOnce(spawnResult({ stdout: '', status: 0 }));

      expect(() => backend.spawn('001-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS))
        .toThrow(/not found locally for provider 'claude'/);
    });

    it('image-missing failure carries the distinct IMAGE_NOT_FOUND code (not a daemon/CLI collapse)', () => {
      mockSpawnSync
        .mockReturnValueOnce(spawnResult({ stdout: 'Server: healthy', status: 0 }))
        .mockReturnValueOnce(spawnResult({ stdout: '', status: 0 }));

      expect(() => backend.spawn('001-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS))
        .toThrow(DOCKER_ERROR_CODES.IMAGE_NOT_FOUND);
    });

    it('daemon permission-denied preflight is NOT reported as image-missing (distinct code)', () => {
      // 455-003 core NO-GO guard: a permission-denied daemon must surface E086,
      // never the IMAGE_NOT_FOUND path. `docker info` fails first → we never
      // reach the image lookup at all.
      mockSpawnSync.mockReturnValueOnce(spawnResult({
        status: 1,
        stderr: 'Got permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock',
      }));

      let error: SpawnBackendError | null = null;
      try {
        backend.spawn('001-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);
      } catch (e) {
        error = e as SpawnBackendError;
      }
      expect(error).toBeInstanceOf(SpawnBackendError);
      expect(error!.message).toContain(DOCKER_ERROR_CODES.DAEMON_PERMISSION);
      expect(error!.message).not.toContain(DOCKER_ERROR_CODES.IMAGE_NOT_FOUND);
      // The image lookup never ran — only the `docker info` preflight was spawned.
      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    });

    it('daemon-unavailable preflight surfaces E085 with evidence, never image-missing', () => {
      mockSpawnSync.mockReturnValueOnce(spawnResult({
        status: 1,
        stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
      }));

      expect(() => backend.spawn('001-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS))
        .toThrow(DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE);
    });

    it('should throw a SpawnBackendError instance with correct backendName', () => {
      mockSpawnSync
        .mockReturnValueOnce(spawnResult({ stdout: 'Server: healthy', status: 0 }))
        .mockReturnValueOnce(spawnResult({ stdout: '', status: 0 }));

      let error: SpawnBackendError | null = null;
      try {
        backend.spawn('001-001', 'claude-sonnet-5', 'test prompt', TEST_EXECUTION_OPTIONS);
      } catch (e) {
        error = e as SpawnBackendError;
      }

      expect(error).toBeInstanceOf(SpawnBackendError);
      expect(error!.backendName).toBe('docker');
    });
  });

  // ─── 455-003: daemon preflight classifier (distinct daemon/permission/absent) ──
  describe('classifyDockerPreflight', () => {
    it('returns null for a healthy daemon (status 0)', () => {
      expect(classifyDockerPreflight({ status: 0, stderr: '' })).toBeNull();
    });

    it('classifies a permission-denied socket as DAEMON_PERMISSION (E086)', () => {
      const out = classifyDockerPreflight({
        status: 1,
        stderr: 'Got permission denied while trying to connect to the Docker daemon socket',
      });
      expect(out?.code).toBe(DOCKER_ERROR_CODES.DAEMON_PERMISSION);
      expect(out?.evidence).toContain('permission denied');
    });

    it('classifies an unreachable daemon as DAEMON_UNAVAILABLE (E085)', () => {
      const out = classifyDockerPreflight({
        status: 1,
        stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?',
      });
      expect(out?.code).toBe(DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE);
    });

    it('classifies an absent docker binary (ENOENT) as DOCKER_ABSENT (E087)', () => {
      const out = classifyDockerPreflight({
        status: null,
        stderr: '',
        spawnError: { code: 'ENOENT' },
      });
      expect(out?.code).toBe(DOCKER_ERROR_CODES.DOCKER_ABSENT);
    });

    it('classifies status 127 as DOCKER_ABSENT (command not found)', () => {
      const out = classifyDockerPreflight({ status: 127, stderr: 'docker: command not found' });
      expect(out?.code).toBe(DOCKER_ERROR_CODES.DOCKER_ABSENT);
    });

    it('permission-denied is distinguished from image-missing — the three classes never share a code', () => {
      const perm = classifyDockerPreflight({ status: 1, stderr: 'permission denied' })?.code;
      const down = classifyDockerPreflight({ status: 1, stderr: 'Is the docker daemon running?' })?.code;
      const absent = classifyDockerPreflight({ status: 127, stderr: '' })?.code;
      expect(new Set([perm, down, absent, DOCKER_ERROR_CODES.IMAGE_NOT_FOUND]).size).toBe(4);
    });
  });

  describe('kill', () => {
    it('should use docker stop --time=15 for graceful shutdown', () => {
      const containerId = 'a'.repeat(64);
      seedOwnedContainer(backend, '001-001', containerId);
      mockSpawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: 0,
        signal: null,
        pid: 1,
        output: [],
      } as any);

      backend.kill('001-001');

      // Lifecycle mutations use the exact owned container ID; the display name is not authority.
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['stop', '--time=15', containerId],
        expect.objectContaining({ encoding: 'utf-8', timeout: 20000 }),
      );
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['rm', containerId],
        expect.any(Object),
      );
    });

    it('should fallback to docker kill when docker stop fails', () => {
      const containerId = 'b'.repeat(64);
      seedOwnedContainer(backend, '001-001', containerId);
      // First call (docker stop) fails, second call (docker kill) succeeds, third (docker rm) succeeds
      mockSpawnSync
        .mockReturnValueOnce({
          stdout: '', stderr: 'stop failed', status: 1,
          signal: null, pid: 1, output: [],
        } as any)
        .mockReturnValue({
          stdout: '', stderr: '', status: 0,
          signal: null, pid: 1, output: [],
        } as any);

      backend.kill('001-001');

      // Should call docker stop first, then fallback to docker kill
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['stop', '--time=15', containerId],
        expect.objectContaining({ encoding: 'utf-8', timeout: 20000 }),
      );
      // Sprint 149: fallback changed from bare `docker kill` (SIGKILL) to
      // `docker kill --signal=SIGTERM` so the worker trap still runs fsync.
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['kill', '--signal=SIGTERM', containerId],
        expect.any(Object),
      );
    });

    it('should handle kill errors gracefully', () => {
      seedOwnedContainer(backend, '001-001', 'c'.repeat(64));
      mockSpawnSync.mockImplementation(() => {
        throw new Error('docker not running');
      });

      // Should not throw — errors caught internally
      expect(() => backend.kill('001-001')).not.toThrow();
    });
  });

  describe('isAvailable', () => {
    it('should return true when docker info succeeds', async () => {
      mockSpawnSync.mockReturnValue({
        stdout: 'docker info output',
        stderr: '',
        status: 0,
        signal: null,
        pid: 1,
        output: [],
      } as any);

      const available = await backend.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when docker info fails', async () => {
      mockSpawnSync.mockReturnValue({
        stdout: '',
        stderr: 'Cannot connect to Docker',
        status: 1,
        signal: null,
        pid: 1,
        output: [],
      } as any);

      const available = await backend.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array initially', () => {
      expect(backend.list()).toEqual([]);
    });
  });

  describe('constructor', () => {
    it('should set backend name to docker', () => {
      expect(backend.name).toBe('docker');
    });

    it('should accept custom image and timeout options', () => {
      const custom = new DockerSpawnBackend('/project', {
        image: 'custom:v2',
        timeoutSeconds: 300,
      });
      expect(custom.name).toBe('docker');
    });
  });
});

describe('isDockerAvailable', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return true when docker info exits with 0', () => {
    mockSpawnSync.mockReturnValue({
      stdout: 'ok',
      stderr: '',
      status: 0,
      signal: null,
      pid: 1,
      output: [],
    } as any);

    expect(isDockerAvailable()).toBe(true);
  });

  it('should return false when docker info exits with non-zero', () => {
    mockSpawnSync.mockReturnValue({
      stdout: '',
      stderr: 'not found',
      status: 127,
      signal: null,
      pid: 1,
      output: [],
    } as any);

    expect(isDockerAvailable()).toBe(false);
  });
});
