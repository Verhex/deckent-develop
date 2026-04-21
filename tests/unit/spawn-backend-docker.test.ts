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

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { DockerSpawnBackend, isDockerAvailable } from '../../src/orchestra/spawn-backend-docker.js';
import { SpawnBackendError } from '../../src/orchestra/spawn-backend.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);

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
      // Image check returns empty stdout → image not found
      mockSpawnSync.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        status: 0,
        signal: null,
        pid: 1,
        output: ['', '', ''],
      } as any);

      expect(() => backend.spawn('001-001', 'sonnet', 'test prompt'))
        .toThrow("Docker image 'test-image:latest' not found");
    });

    it('should throw a SpawnBackendError instance with correct backendName', () => {
      mockSpawnSync.mockReturnValueOnce({
        stdout: '',
        stderr: '',
        status: 0,
        signal: null,
        pid: 1,
        output: [],
      } as any);

      let error: SpawnBackendError | null = null;
      try {
        backend.spawn('001-001', 'sonnet', 'test prompt');
      } catch (e) {
        error = e as SpawnBackendError;
      }

      expect(error).toBeInstanceOf(SpawnBackendError);
      expect(error!.backendName).toBe('docker');
    });
  });

  describe('kill', () => {
    it('should use docker stop --time=15 for graceful shutdown', () => {
      mockSpawnSync.mockReturnValue({
        stdout: '',
        stderr: '',
        status: 0,
        signal: null,
        pid: 1,
        output: [],
      } as any);

      backend.kill('001-001');

      // docker stop --time=15 (graceful, Sprint 139 increase) + docker rm -f (cleanup)
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['stop', '--time=15', 'deckent-w-001-001'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 20000 }),
      );
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['rm', '-f', 'deckent-w-001-001'],
        expect.any(Object),
      );
    });

    it('should fallback to docker kill when docker stop fails', () => {
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
        ['stop', '--time=15', 'deckent-w-001-001'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 20000 }),
      );
      // Sprint 149: fallback changed from bare `docker kill` (SIGKILL) to
      // `docker kill --signal=SIGTERM` so the worker trap still runs fsync.
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['kill', '--signal=SIGTERM', 'deckent-w-001-001'],
        expect.any(Object),
      );
    });

    it('should handle kill errors gracefully', () => {
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
