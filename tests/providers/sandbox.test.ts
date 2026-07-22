import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { SandboxSpawnBackend, createSandboxBackend } from '../../src/providers/sandbox.js';
import { ProviderError } from '../../src/core/provider.js';

// ─── Mock node:child_process ─────────────────────────────────────────

const mockChildProcess = {
  stdin: {
    write: vi.fn(),
    end: vi.fn(),
  },
  once: vi.fn(),
  kill: vi.fn(),
  pid: 99999,
};

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// ─── Mock node:fs ────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
  openSync: vi.fn().mockReturnValue(5),
  closeSync: vi.fn(),
  realpathSync: vi.fn((p: string) => p),
}));

// ─── Mock node:path (resolve) ─────────────────────────────────────────

import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';

const mockSpawn = spawn as unknown as MockInstance;
const mockExistsSync = existsSync as unknown as MockInstance;
const mockRealpathSync = realpathSync as unknown as MockInstance;

// ─── Helpers ─────────────────────────────────────────────────────────

function setupMockChild(exitCode = 0) {
  const child = {
    ...mockChildProcess,
    stdin: { write: vi.fn(), end: vi.fn() },
    kill: vi.fn(),
    once: vi.fn().mockImplementation((event: string, cb: (code?: number) => void) => {
      if (event === 'exit') {
        (child as any)._exitCb = cb;
      }
      if (event === 'error') {
        (child as any)._errorCb = cb;
      }
      return child;
    }),
  };
  mockSpawn.mockReturnValue(child);
  return child;
}

function setupMockChildWithExit(exitCode: number) {
  const child = {
    once: vi.fn().mockImplementation((event: string, cb: (code?: number) => void) => {
      if (event === 'exit') cb(exitCode);
      return child;
    }),
  };
  mockSpawn.mockReturnValue(child);
  return child;
}

function setupMockChildWithError() {
  const child = {
    once: vi.fn().mockImplementation((event: string, cb: (err?: Error) => void) => {
      if (event === 'error') cb(new Error('ENOENT'));
      return child;
    }),
  };
  mockSpawn.mockReturnValue(child);
  return child;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('SandboxSpawnBackend', () => {
  const projectDir = '/tmp/sandbox-project';

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
    mockRealpathSync.mockImplementation((p: string) => p);
  });

  // ─── Identity ────────────────────────────────────────────────────

  describe('identity', () => {
    it('should have name "claude-sandbox"', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(backend.name).toBe('claude-sandbox');
    });

    it('should extend SubprocessSpawnBackend', async () => {
      const { SubprocessSpawnBackend } = await import('../../src/providers/subprocess.js');
      const backend = new SandboxSpawnBackend(projectDir);
      expect(backend).toBeInstanceOf(SubprocessSpawnBackend);
    });

    it('should support fable, opus, sonnet, haiku models', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(backend.supportedModels).toContain('claude-fable-5');
      expect(backend.supportedModels).toContain('claude-opus-4-8');
      expect(backend.supportedModels).toContain('claude-sonnet-5');
      expect(backend.supportedModels).toContain('claude-haiku-4-5-20251001');
    });

    it('should support exactly 4 models', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(backend.supportedModels).toHaveLength(4);
    });
  });

  // ─── Constructor options ──────────────────────────────────────────

  describe('constructor', () => {
    it('should default memoryLimitMb to 512', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(backend.getMemoryLimitMb()).toBe(512);
    });

    it('should use custom memoryLimitMb when provided', () => {
      const backend = new SandboxSpawnBackend(projectDir, { memoryLimitMb: 256 });
      expect(backend.getMemoryLimitMb()).toBe(256);
    });

    it('should default allowedDirs to [projectDir]', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(backend.getAllowedDirs()).toEqual([projectDir]);
    });

    it('should use custom allowedDirs when provided', () => {
      const backend = new SandboxSpawnBackend(projectDir, {
        allowedDirs: ['/allowed/dir1', '/allowed/dir2'],
      });
      const dirs = backend.getAllowedDirs();
      expect(dirs).toHaveLength(2);
    });

    it('should default blockNetwork to false', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(backend.isNetworkBlocked()).toBe(false);
    });

    it('should set blockNetwork when provided', () => {
      const backend = new SandboxSpawnBackend(projectDir, { blockNetwork: true });
      expect(backend.isNetworkBlocked()).toBe(true);
    });
  });

  // ─── enforceScope() ──────────────────────────────────────────────

  describe('enforceScope()', () => {
    it('should not throw for projectDir itself', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(() => backend.enforceScope(projectDir)).not.toThrow();
    });

    it('should not throw for a subdirectory of projectDir', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(() => backend.enforceScope(`${projectDir}/src`)).not.toThrow();
    });

    it('should throw ProviderError for a directory outside allowedDirs', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(() => backend.enforceScope('/tmp/other-project')).toThrow(ProviderError);
    });

    it('should include "Sandbox scope violation" in error message', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(() => backend.enforceScope('/etc/secrets')).toThrow(/Sandbox scope violation/);
    });

    it('should include the offending path in the error message', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(() => backend.enforceScope('/etc/passwd')).toThrow(/\/etc\/passwd/);
    });

    it('should not throw for any of multiple allowedDirs', () => {
      const backend = new SandboxSpawnBackend(projectDir, {
        allowedDirs: [projectDir, '/tmp/allowed-extra'],
      });
      expect(() => backend.enforceScope('/tmp/allowed-extra')).not.toThrow();
      expect(() => backend.enforceScope(`/tmp/allowed-extra/subdir`)).not.toThrow();
    });

    it('should throw when directory only partially matches an allowedDir', () => {
      const backend = new SandboxSpawnBackend('/tmp/project');
      // /tmp/project-evil starts with /tmp/project but is NOT a subdir
      expect(() => backend.enforceScope('/tmp/project-evil')).toThrow(ProviderError);
    });
  });

  // ─── buildEnv() ──────────────────────────────────────────────────

  describe('buildEnv()', () => {
    it('should include NODE_OPTIONS with memory limit', () => {
      const backend = new SandboxSpawnBackend(projectDir, { memoryLimitMb: 256 });
      const env = backend.buildEnv({});
      expect(env['NODE_OPTIONS']).toContain('--max-old-space-size=256');
    });

    it('should include default 512MB memory limit', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      const env = backend.buildEnv({});
      expect(env['NODE_OPTIONS']).toContain('--max-old-space-size=512');
    });

    it('should preserve existing NODE_OPTIONS and append memory flag', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      const env = backend.buildEnv({ NODE_OPTIONS: '--experimental-vm-modules' });
      expect(env['NODE_OPTIONS']).toContain('--experimental-vm-modules');
      expect(env['NODE_OPTIONS']).toContain('--max-old-space-size=512');
    });

    it('should not set proxy vars when blockNetwork is false', () => {
      const backend = new SandboxSpawnBackend(projectDir, { blockNetwork: false });
      const env = backend.buildEnv({});
      expect(env['http_proxy']).toBeUndefined();
      expect(env['https_proxy']).toBeUndefined();
    });

    it('should set proxy vars when blockNetwork is true', () => {
      const backend = new SandboxSpawnBackend(projectDir, { blockNetwork: true });
      const env = backend.buildEnv({});
      expect(env['http_proxy']).toBe('http://127.0.0.1:0');
      expect(env['https_proxy']).toBe('http://127.0.0.1:0');
      expect(env['HTTP_PROXY']).toBe('http://127.0.0.1:0');
      expect(env['HTTPS_PROXY']).toBe('http://127.0.0.1:0');
    });

    it('should set no_proxy to empty string when blockNetwork is true', () => {
      const backend = new SandboxSpawnBackend(projectDir, { blockNetwork: true });
      const env = backend.buildEnv({});
      expect(env['no_proxy']).toBe('');
    });

    it('should copy provided base env vars', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      const env = backend.buildEnv({ MY_VAR: 'hello', OTHER: 'world' });
      expect(env['MY_VAR']).toBe('hello');
      expect(env['OTHER']).toBe('world');
    });

    it('should use process.env as base when no arg provided', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      const env = backend.buildEnv();
      // Should contain NODE_OPTIONS at minimum
      expect(env['NODE_OPTIONS']).toBeDefined();
    });
  });

  // ─── spawn() ─────────────────────────────────────────────────────

  describe('spawn()', () => {
    it('should spawn when dir is within projectDir', () => {
      const child = setupMockChild();
      const backend = new SandboxSpawnBackend(projectDir);
      expect(() => backend.spawn('task-001', 'claude-opus-4-8', 'test')).not.toThrow();
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should throw ProviderError when opts.projectDir is outside allowedDirs', () => {
      setupMockChild();
      const backend = new SandboxSpawnBackend(projectDir);
      expect(() =>
        backend.spawn('task-001', 'claude-opus-4-8', 'test', { projectDir: '/outside' }),
      ).toThrow(ProviderError);
    });

    it('should not call spawn when scope is violated', () => {
      setupMockChild();
      const backend = new SandboxSpawnBackend(projectDir);
      try {
        backend.spawn('task-001', 'claude-opus-4-8', 'test', { projectDir: '/outside' });
      } catch {
        // expected
      }
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should pass through spawn options to parent when scope is valid', () => {
      setupMockChild();
      const backend = new SandboxSpawnBackend(projectDir);
      backend.spawn('task-001', 'claude-opus-4-8', 'test', {
        projectDir,
        allowedTools: 'Read',
        autoApprove: false,
      });
      expect(mockSpawn).toHaveBeenCalled();
      const [, args] = mockSpawn.mock.calls[0];
      expect(args).toContain('--allowedTools');
    });
  });

  // ─── isAvailable() ───────────────────────────────────────────────

  describe('isAvailable()', () => {
    it('should return true when both checks succeed', async () => {
      // First call: claude --version exits 0
      // Second call: node --max-old-space-size exits 0
      mockSpawn
        .mockReturnValueOnce({
          once: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
            if (event === 'exit') cb(0);
            return { once: vi.fn() };
          }),
        })
        .mockReturnValueOnce({
          once: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
            if (event === 'exit') cb(0);
            return { once: vi.fn() };
          }),
        });

      const backend = new SandboxSpawnBackend(projectDir);
      const available = await backend.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when claude is not available', async () => {
      mockSpawn.mockReturnValueOnce({
        once: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
          if (event === 'exit') cb(1);
          return { once: vi.fn() };
        }),
      });

      const backend = new SandboxSpawnBackend(projectDir);
      const available = await backend.isAvailable();
      expect(available).toBe(false);
    });

    it('should return false when node memory limit check fails', async () => {
      // claude available, node check fails
      mockSpawn
        .mockReturnValueOnce({
          once: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
            if (event === 'exit') cb(0);
            return { once: vi.fn() };
          }),
        })
        .mockReturnValueOnce({
          once: vi.fn().mockImplementation((event: string, cb: (code: number) => void) => {
            if (event === 'exit') cb(1);
            return { once: vi.fn() };
          }),
        });

      const backend = new SandboxSpawnBackend(projectDir);
      const available = await backend.isAvailable();
      expect(available).toBe(false);
    });

    it('should return a Promise', () => {
      setupMockChildWithExit(0);
      const backend = new SandboxSpawnBackend(projectDir);
      const result = backend.isAvailable();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  // ─── Accessors ───────────────────────────────────────────────────

  describe('accessors', () => {
    it('getMemoryLimitMb should return configured limit', () => {
      const backend = new SandboxSpawnBackend(projectDir, { memoryLimitMb: 1024 });
      expect(backend.getMemoryLimitMb()).toBe(1024);
    });

    it('getAllowedDirs should return a copy (not the internal array)', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      const dirs1 = backend.getAllowedDirs();
      const dirs2 = backend.getAllowedDirs();
      expect(dirs1).not.toBe(dirs2); // different references
      expect(dirs1).toEqual(dirs2);  // same content
    });

    it('isNetworkBlocked should return false by default', () => {
      const backend = new SandboxSpawnBackend(projectDir);
      expect(backend.isNetworkBlocked()).toBe(false);
    });

    it('isNetworkBlocked should return true when configured', () => {
      const backend = new SandboxSpawnBackend(projectDir, { blockNetwork: true });
      expect(backend.isNetworkBlocked()).toBe(true);
    });
  });
});

// ─── createSandboxBackend factory ────────────────────────────────────

describe('createSandboxBackend', () => {
  it('should create a SandboxSpawnBackend instance', () => {
    const backend = createSandboxBackend('/some/dir');
    expect(backend).toBeInstanceOf(SandboxSpawnBackend);
  });

  it('should create backend with given project directory', () => {
    const backend = createSandboxBackend('/my/project');
    expect(backend.getProjectDir()).toBe('/my/project');
  });

  it('should pass sandbox options to the backend', () => {
    const backend = createSandboxBackend('/dir', { memoryLimitMb: 128, blockNetwork: true });
    expect(backend.getMemoryLimitMb()).toBe(128);
    expect(backend.isNetworkBlocked()).toBe(true);
  });

  it('should use default options when none provided', () => {
    const backend = createSandboxBackend('/dir');
    expect(backend.getMemoryLimitMb()).toBe(512);
    expect(backend.isNetworkBlocked()).toBe(false);
  });
});
