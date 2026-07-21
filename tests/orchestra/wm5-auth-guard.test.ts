/**
 * tests/orchestra/wm5-auth-guard.test.ts
 *
 * WM-5: CLAUDE_AUTH_REQUIRED must be injected only when provider === 'claude'.
 * Also verifies --dangerously-skip-permissions does not leak to codex/gemini args.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => {
    const stub = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
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

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import type { ModelType } from '../../src/core/types.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const capturedDockerRunArgs: string[][] = [];

function installSpawnRouter(): void {
  capturedDockerRunArgs.length = 0;
  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];
    let stdout = '';
    const status = 0;

    if (cmd === 'docker' && sub === 'images') {
      stdout = 'imghash';
    } else if (cmd === 'docker' && sub === 'run') {
      capturedDockerRunArgs.push([...argv]);
      stdout = 'container-id-wm5';
    } else if (cmd === 'docker' && sub === 'inspect') {
      stdout = 'true|0';
    } else if (cmd === 'claude' && argv.join(' ') === 'auth status --json') {
      // A23: a healthy auth envelope, not mere binary/version presence.
      stdout = '{"loggedIn":true}';
    }

    return {
      stdout,
      stderr: '',
      status,
      signal: null,
      pid: 1,
      output: ['', stdout, ''],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

/** Returns true if the docker run argv contains `-e KEY=...` or `-e KEY`. */
function hasEnvFlag(argv: string[], key: string): boolean {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '-e') {
      const val = argv[i + 1] ?? '';
      if (val === key || val.startsWith(`${key}=`)) return true;
    }
  }
  return false;
}

/** Returns true if the docker run argv contains the exact string in any position. */
function hasArg(argv: string[], arg: string): boolean {
  return argv.includes(arg);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WM-5: CLAUDE_AUTH_REQUIRED provider-gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  it('sets CLAUDE_AUTH_REQUIRED for a claude model (sonnet)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-claude', 'sonnet' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'CLAUDE_AUTH_REQUIRED')).toBe(true);
  });

  it('sets CLAUDE_AUTH_REQUIRED for opus (claude model)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-opus', 'opus' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'CLAUDE_AUTH_REQUIRED')).toBe(true);
  });

  it('does NOT set CLAUDE_AUTH_REQUIRED for a codex model (gpt-4.1)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-codex', 'gpt-4.1' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'CLAUDE_AUTH_REQUIRED')).toBe(false);
  });

  it('does NOT set CLAUDE_AUTH_REQUIRED for gpt-5 (codex model)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-gpt5', 'gpt-5' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'CLAUDE_AUTH_REQUIRED')).toBe(false);
  });

  it('does NOT set CLAUDE_AUTH_REQUIRED for a gemini model (gemini-2.5-flash)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-gemini', 'gemini-2.5-flash' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'CLAUDE_AUTH_REQUIRED')).toBe(false);
  });

  it('does NOT set CLAUDE_AUTH_REQUIRED for gemini-2.5-pro', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-gemini-pro', 'gemini-2.5-pro' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'CLAUDE_AUTH_REQUIRED')).toBe(false);
  });
});

describe('WM-5: --dangerously-skip-permissions non-leak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  it('does NOT pass --dangerously-skip-permissions in docker run args for codex', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-dsp-codex', 'gpt-4.1' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    // --dangerously-skip-permissions is embedded inside the container command string
    // (the sh -c "..." arg). It must NOT appear as a separate docker flag.
    const rawArgs = argv.join(' ');
    // The container cmd string is the last element (sh -c "<cmd>").
    // Verify the claude-only flag does not appear at the docker-args level.
    const dockerArgsBeforeCmd = argv.slice(0, argv.indexOf('sh'));
    expect(hasArg(dockerArgsBeforeCmd, '--dangerously-skip-permissions')).toBe(false);
    // Also verify it's not in any -e env var value
    expect(hasEnvFlag(rawArgs.split(' '), '--dangerously-skip-permissions')).toBe(false);
  });

  it('does NOT pass --dangerously-skip-permissions in docker env for gemini', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-dsp-gemini', 'gemini-2.5-flash' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    const dockerArgsBeforeCmd = argv.slice(0, argv.indexOf('sh'));
    expect(hasArg(dockerArgsBeforeCmd, '--dangerously-skip-permissions')).toBe(false);
  });

  it('worker script for codex contains --dangerously-bypass-approvals-and-sandbox (not skip-permissions)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-codex-bypass', 'gpt-4.1' as ModelType, 'prompt');

    expect(capturedDockerRunArgs.length).toBe(1);
    // The worker command is written to a .sh script via writeFileSync — find the call
    // that wrote the script content (the call with a string that starts with '#!/bin/sh').
    const scriptCall = mockWriteFileSync.mock.calls.find(
      (call) => typeof call[1] === 'string' && (call[1] as string).startsWith('#!/bin/sh'),
    );
    expect(scriptCall).toBeDefined();
    const scriptContent = scriptCall![1] as string;
    expect(scriptContent).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(scriptContent).not.toContain('--dangerously-skip-permissions');
  });
});
