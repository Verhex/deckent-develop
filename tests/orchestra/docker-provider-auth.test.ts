/**
 * tests/orchestra/docker-provider-auth.test.ts
 *
 * Tests for provider-aware auth mount in DockerSpawnBackend.
 * Sprint 203 Task 203-002.
 *
 * Each subscription provider receives only its own credential files, never a
 * complete provider home or a foreign provider credential.
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
      kill: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

vi.mock('node:fs', () => ({
  // The host-owned broker lease (prepareProviderAuthBroker) copies each
  // subscription credential into tmpdir()/deckent-provider-auth/…; the
  // principal-digest resolver re-checks those exact broker paths, so they must
  // exist alongside the host provider-home credentials.
  existsSync: vi.fn((path: string) =>
    /\.(claude|codex|gemini)\/(\.credentials\.json|auth\.json|gemini-credentials\.json|google_accounts\.json)$/.test(path)
    || path.includes('deckent-provider-auth')),
  linkSync: vi.fn(),
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
  chmodSync: vi.fn(),
  statSync: vi.fn(() => ({ mtimeMs: 1, isFile: () => true, isDirectory: () => false })),
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
import {
  buildProviderAuthIsolation,
  DockerSpawnBackend,
  resolveCursorHostCredentialRoot,
} from '../../src/orchestra/spawn-backend-docker.js';
import type { ModelType } from '../../src/core/types.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockReadFileSync = vi.mocked(readFileSync);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const capturedDockerRunArgs: string[][] = [];

function installSpawnRouter(): void {
  capturedDockerRunArgs.length = 0;
  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];
    let stdout = '';
    let status = 0;

    if (cmd === 'docker' && sub === 'images') {
      stdout = 'imghash';
    } else if (cmd === 'docker' && sub === 'run') {
      capturedDockerRunArgs.push([...argv]);
      stdout = 'container-id-abc123';
    } else if (cmd === 'docker' && sub === 'inspect') {
      stdout = 'true|0';
    } else if (cmd === 'claude' && sub === 'auth') {
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

/** Check if any Docker bind mount source contains the given substring. */
function hasVolumeMount(argv: string[], srcSubstring: string): boolean {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--mount') {
      const spec = argv[i + 1] ?? '';
      const src = spec.split(',').find(part => part.startsWith('src='));
      if (src?.includes(srcSubstring)) return true;
    }
  }
  return false;
}

/** Check if any isolated `--mount` source contains the given credential path. */
function hasCredentialMount(argv: string[], srcSubstring: string): boolean {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '--mount') {
      const spec = argv[i + 1] ?? '';
      if (spec.includes('type=bind,src=') && spec.includes(srcSubstring)) return true;
    }
  }
  return false;
}

function expectDockerMeteringHold(taskId: string, model: ModelType): void {
  const backend = new DockerSpawnBackend('/test/project');
  expect(() => backend.spawn(
    taskId,
    model,
    'prompt',
    TEST_DOCKER_EXECUTION_OPTIONS,
  )).toThrow(/does not expose incremental measured usage/);
  expect(capturedDockerRunArgs).toHaveLength(0);
}

function spawnBudgetedClaude(taskId: string, model: ModelType): void {
  // Heartbeat-authority identity readbacks must surface ENOENT: the full
  // node:fs mock cannot carry the WorkerHeartbeatAuthorityStore
  // write→readback chain, and the '{}' fallback would trip the store's schema
  // guard (E_UNSUPPORTED_WORKER_HEARTBEAT_AUTHORITY_IDENTITY). ENOENT routes
  // the store onto its honest uninitialized-attempt path; real persistence is
  // proven in tests/core/worker-heartbeat-authority-store.test.ts.
  mockReadFileSync.mockImplementation(((path: unknown) => {
    if (String(path).includes('worker-heartbeat-authority')) {
      const error = new Error(`ENOENT: no such file or directory, open '${String(path)}'`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    return budgetedDockerTaskJson(path, { model });
  }) as typeof readFileSync);
  new DockerSpawnBackend('/test/project').spawn(
    taskId,
    model,
    'prompt',
    TEST_DOCKER_EXECUTION_OPTIONS,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DockerSpawnBackend: provider-aware auth mount (Sprint 203 T-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
  });

  it('mounts only the Claude credential for claude-sonnet-5 subscription', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'claude', '.claude', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude/.credentials.json')).toBe(true);
    expect(argv.some(arg => arg.includes('/.claude:'))).toBe(false);
  });

  it('does NOT mount ~/.claude for a codex model (gpt-4.1)', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'codex', '.codex', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
    expect(hasVolumeMount(argv, '.codex/auth.json')).toBe(true);
  });

  it('does NOT mount ~/.claude for a gemini model (gemini-2.5-flash)', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'gemini', '.gemini', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
    expect(hasVolumeMount(argv, '.gemini/gemini-credentials.json')).toBe(true);
  });

  it.each([
    ['linux', '/home/test', { XDG_CONFIG_HOME: '/xdg/config' }, '/xdg/config/cursor'],
    ['darwin', '/Users/test', { XDG_CONFIG_HOME: '/custom/config' }, '/custom/config/cursor'],
    ['win32', 'C:\\Users\\test', { APPDATA: 'D:\\Roaming' }, 'D:\\Roaming\\cursor'],
  ] as const)('resolves the %s Cursor host credential root from platform authority', (platform, home, env, expected) => {
    expect(resolveCursorHostCredentialRoot(home, platform, env)).toBe(expected);
  });

  it.each([
    ['linux', '/home/test', { XDG_CONFIG_HOME: 'relative/config' }, '/home/test/.config/cursor'],
    ['darwin', '/Users/test', { XDG_CONFIG_HOME: '/unsafe,config' }, '/Users/test/.config/cursor'],
    ['win32', 'C:\\Users\\test', { APPDATA: 'relative\\Roaming' }, 'C:\\Users\\test\\.config\\cursor'],
  ] as const)('ignores unsafe or relative %s Cursor env input and uses the documented home fallback', (platform, home, env, expected) => {
    expect(resolveCursorHostCredentialRoot(home, platform, env)).toBe(expected);
  });

  it('mounts only Cursor auth.json from the resolved host root into its private Linux destination', () => {
    const auth = buildProviderAuthIsolation('/home/test', 'cursor', '.config/cursor', false, () => true, {
      hostCredentialRoot: '/xdg/config/cursor',
    });
    expect(auth.mountArgs).toEqual([
      '--mount',
      'type=bind,src=/xdg/config/cursor/auth.json,dst=/run/deckent-auth-cursor-auth.json,readonly',
    ]);
    expect(auth.bootstrapLines).toContain('cp "/run/deckent-auth-cursor-auth.json" "$HOME/.config/cursor/auth.json" || exit 78');
    expect(auth.mountArgs.some(arg => arg.includes('src=/xdg/config/cursor,dst='))).toBe(false);
  });

  it('fails closed when Cursor auth.json is absent and preserves API-only no-mount behavior', () => {
    const missing = buildProviderAuthIsolation('/home/test', 'cursor', '.config/cursor', false, () => false, {
      hostCredentialRoot: '/home/test/.config/cursor',
    });
    expect(missing.missingRequiredFiles).toEqual(['auth.json']);
    expect(missing.mountArgs).toEqual([]);
    expect(buildProviderAuthIsolation('/home/test', 'cursor', '.config/cursor', true).mountArgs).toEqual([]);
  });

  it('mounts only the Claude credential for claude-haiku-4-5-20251001', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'claude', '.claude', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude/.credentials.json')).toBe(true);
  });

  it('does NOT mount ~/.claude for gpt-5.6-sol (codex model)', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'codex', '.codex', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
    expect(hasVolumeMount(argv, '.codex/auth.json')).toBe(true);
  });

  it('does NOT mount ~/.claude for gemini-2.5-pro (gemini model)', () => {
    const argv = buildProviderAuthIsolation('/home/test', 'gemini', '.gemini', false).mountArgs;
    expect(hasVolumeMount(argv, '.claude')).toBe(false);
  });

  it('mounts only the Claude credential for canonical claude-sonnet-5 in subscription mode', () => {
    spawnBudgetedClaude(
      't-auth-claude',
      'claude-sonnet-5' as ModelType,
    );

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasCredentialMount(argv, '/claude/.credentials.json')).toBe(true);
    expect(argv.some(arg => arg.includes('dst=/run/deckent-auth-claude-.credentials.json'))).toBe(true);
    expect(argv.some(arg => arg.includes('/.claude,dst='))).toBe(false);
  });

  it('holds canonical Codex before auth mounting because Docker usage is final-only', () => {
    expectDockerMeteringHold('t-auth-codex', 'gpt-4.1' as ModelType);
  });

  it('holds canonical Gemini before auth mounting because Docker usage is final-only', () => {
    expectDockerMeteringHold('t-auth-gemini', 'gemini-2.5-flash' as ModelType);
  });

  it('mounts only the Claude credential for canonical Haiku (subscription default)', () => {
    spawnBudgetedClaude(
      't-auth-haiku',
      'claude-haiku-4-5-20251001' as ModelType,
    );

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasCredentialMount(argv, '/claude/.credentials.json')).toBe(true);
    expect(argv.some(arg => arg.includes('dst=/run/deckent-auth-claude-.credentials.json'))).toBe(true);
    expect(argv.some(arg => arg.includes('/.claude,dst='))).toBe(false);
  });

  it('holds canonical gpt-5.6-sol before auth mounting because Docker usage is final-only', () => {
    expectDockerMeteringHold('t-auth-gpt5', 'gpt-5.6-sol' as ModelType);
  });

  it('holds canonical gemini-2.5-pro before auth mounting because Docker usage is final-only', () => {
    expectDockerMeteringHold('t-auth-gemini-pro', 'gemini-2.5-pro' as ModelType);
  });
});
