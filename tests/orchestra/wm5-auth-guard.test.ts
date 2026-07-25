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
      stderr: { on: vi.fn(), resume: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn((path: string) => /\.(claude|codex|gemini)\/(\.credentials\.json|auth\.json|gemini-credentials\.json|google_accounts\.json)$/.test(path)),
  readFileSync: vi.fn((path: string) => path.endsWith('/.gemini/settings.json')
    ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
    : '{}'),
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

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import { buildProviderCommand, getProviderCommandSpec } from '../../src/core/provider-command-spec.js';
import type { ModelType } from '../../src/core/types.js';

const mockSpawnSync = vi.mocked(spawnSync);
const TEST_EXECUTION_OPTIONS = { executionBudget: { maxTurns: 1 } } as const;
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WM-5: CLAUDE_AUTH_REQUIRED provider-gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  it('sets CLAUDE_AUTH_REQUIRED for a claude model (sonnet)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-claude', 'claude-sonnet-5' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'CLAUDE_AUTH_REQUIRED')).toBe(true);
  });

  it('sets CLAUDE_AUTH_REQUIRED for opus (claude model)', () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('t-wm5-opus', 'claude-opus-4-8' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS);

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'CLAUDE_AUTH_REQUIRED')).toBe(true);
  });

  it.each([
    ['t-wm5-codex', 'gpt-4.1'],
    ['t-wm5-gpt5', 'gpt-5.6-sol'],
    ['t-wm5-gemini', 'gemini-2.5-flash'],
    ['t-wm5-gemini-pro', 'gemini-2.5-pro'],
  ] as const)('%s is held before CLAUDE_AUTH_REQUIRED can leak', (taskId, model) => {
    expect(() => new DockerSpawnBackend('/test/project')
      .spawn(taskId, model as ModelType, 'prompt', TEST_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);
    expect(capturedDockerRunArgs).toHaveLength(0);
  });
});

describe('WM-5: --dangerously-skip-permissions non-leak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  it('codex command uses its own approval flag, never Claude skip-permissions', () => {
    const command = buildProviderCommand(
      getProviderCommandSpec('codex')!,
      'gpt-4.1',
      '/prompt',
      { autoApprove: true },
    );
    expect(command).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(command).not.toContain('--dangerously-skip-permissions');
  });

  it('gemini command never receives Claude skip-permissions', () => {
    const command = buildProviderCommand(
      getProviderCommandSpec('gemini')!,
      'gemini-2.5-flash',
      '/prompt',
      { autoApprove: true },
    );
    expect(command).not.toContain('--dangerously-skip-permissions');
  });

  it('budgeted codex Docker spawn fails before writing a worker script', () => {
    expect(() => new DockerSpawnBackend('/test/project')
      .spawn('t-wm5-codex-bypass', 'gpt-4.1' as ModelType, 'prompt', TEST_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });
});
