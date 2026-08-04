/**
 * tests/orchestra/docker-auth-precedence.test.ts
 *
 * Sprint 214 T-214-001 — Docker env-forwarding must be provider + auth-aware.
 *
 * Regression guard for the long-standing footgun where ANTHROPIC_API_KEY in
 * host env was forwarded into the container UNCONDITIONALLY, silently
 * demoting `auth_mode: subscription` into API mode (the claude CLI inside
 * the container preferred the env var over the mounted ~/.claude session,
 * causing Tier-1 timeouts under post-beta budgets).
 *
 * Forwarding rules tested here:
 * - claude provider + subscription → ANTHROPIC_API_KEY NOT forwarded
 * - claude provider + api authMode → ANTHROPIC_API_KEY forwarded
 * - codex/gemini subscription    → OAuth credential file, no API key
 * - codex/gemini API authMode    → own API key only
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// fs mock is mutable per-test so we can simulate task JSON presence + content
// (needed to flip useApiOnly via readTaskAuthMode).
const fsState = {
  existsSyncImpl: (_path: string): boolean => false,
  readFileSyncImpl: (path: string): string => path.endsWith('/.gemini/settings.json')
    ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
    : '{}',
};

vi.mock('node:fs', () => ({
  linkSync: vi.fn(),
  existsSync: vi.fn((p: string) => fsState.existsSyncImpl(p)),
  readFileSync: vi.fn((p: string) => fsState.readFileSyncImpl(p)),
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
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import type { ModelType } from '../../src/core/types.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';

const mockSpawnSync = vi.mocked(spawnSync);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const capturedDockerRunArgs: string[][] = [];

function installSpawnRouter(): void {
  capturedDockerRunArgs.length = 0;
  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];
    let stdout = '';

    if (cmd === 'docker' && sub === 'images') {
      stdout = 'imghash';
    } else if (cmd === 'docker' && sub === 'run') {
      capturedDockerRunArgs.push([...argv]);
      stdout = 'container-id-abc123';
    } else if (cmd === 'docker' && sub === 'inspect') {
      stdout = 'true|0';
    } else if (cmd === 'claude' && argv.join(' ') === 'auth status --json') {
      stdout = '{"loggedIn":true}';
    }

    return {
      stdout,
      stderr: '',
      status: 0,
      signal: null,
      pid: 1,
      output: ['', stdout, ''],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

/** Returns true iff `-e <KEY>=...` appears in argv. */
function hasEnvFlag(argv: string[], key: string): boolean {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '-e' && typeof argv[i + 1] === 'string') {
      const spec = argv[i + 1]!;
      if (spec.startsWith(`${key}=`)) return true;
    }
  }
  return false;
}

/**
 * Configure the fs mock so readTaskAuthMode() returns the requested authMode
 * value for taskId. Subscription cases expose only the allowlisted Claude
 * credential plus the task JSON; no provider home or unrelated host state is
 * made visible to the backend.
 */
function isProviderCredentialPath(path: string): boolean {
  return path.endsWith('/.claude/.credentials.json')
    || path.endsWith('/.codex/auth.json')
    || path.endsWith('/.gemini/gemini-credentials.json')
    || path.endsWith('/.gemini/google_accounts.json');
}

// Heartbeat-authority identity readbacks must surface ENOENT: the full node:fs
// mock cannot carry the WorkerHeartbeatAuthorityStore write→readback chain, and
// the '{}' fallback would trip the store's schema guard
// (E_UNSUPPORTED_WORKER_HEARTBEAT_AUTHORITY_IDENTITY). ENOENT routes the store
// onto its honest uninitialized-attempt path (read → null, observe → typed
// HOLD); real persistence is proven in tests/core/worker-heartbeat-authority-store.test.ts.
function throwHeartbeatAuthorityEnoentIfMatched(p: string): void {
  if (!p.includes('worker-heartbeat-authority')) return;
  const error = new Error(`ENOENT: no such file or directory, open '${p}'`) as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  throw error;
}

function stubTaskEnvelope(
  taskId: string,
  model: string,
  authMode: 'subscription' | 'api',
): void {
  fsState.existsSyncImpl = (p: string) =>
    p.endsWith(`task-${taskId}.json`)
    || (authMode === 'subscription' && p.endsWith('/.claude/.credentials.json'))
    // The host-owned broker lease (prepareProviderAuthBroker) copies the
    // subscription credential into tmpdir()/deckent-provider-auth/…; the
    // principal-digest resolver then re-checks those exact broker paths.
    || (authMode === 'subscription' && p.includes('deckent-provider-auth'));
  fsState.readFileSyncImpl = (p: string) => {
    throwHeartbeatAuthorityEnoentIfMatched(p);
    if (p.endsWith(`task-${taskId}.json`)) {
      return budgetedDockerTaskJson(p, { authMode, model });
    }
    return '{}';
  };
}

function resetFsStubs(): void {
  fsState.existsSyncImpl = isProviderCredentialPath;
  fsState.readFileSyncImpl = (path) => {
    throwHeartbeatAuthorityEnoentIfMatched(path);
    return path.endsWith('/.gemini/settings.json')
      ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
      : '{}';
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DockerSpawnBackend: env-forwarding auth-precedence (Sprint 214 T-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
    resetFsStubs();
    // Test-default: clear all four keys so each test sets only what it needs.
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('subscription + ANTHROPIC_API_KEY set → does NOT forward ANTHROPIC_API_KEY', () => {
    // Subscription = no task-level "Auth: api" override. existsSync defaults
    // to the explicit persisted subscription envelope.
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-host-leak');
    stubTaskEnvelope('t-auth-sub', 'claude-sonnet-5', 'subscription');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn(
      't-auth-sub',
      'claude-sonnet-5' as ModelType,
      'prompt',
      TEST_DOCKER_EXECUTION_OPTIONS,
    );

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'ANTHROPIC_API_KEY')).toBe(false);
  });

  it('api authMode + ANTHROPIC_API_KEY set → forwards ANTHROPIC_API_KEY', () => {
    stubTaskEnvelope('t-auth-api', 'claude-sonnet-5', 'api');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-api-mode');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn(
      't-auth-api',
      'claude-sonnet-5' as ModelType,
      'prompt',
      TEST_DOCKER_EXECUTION_OPTIONS,
    );

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'ANTHROPIC_API_KEY')).toBe(true);
  });

  it('codex provider (gpt-4.1) → metering HOLD before any credential forwarding', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic-irrelevant');

    const backend = new DockerSpawnBackend('/test/project');
    expect(() => backend.spawn(
      't-auth-codex',
      'gpt-4.1' as ModelType,
      'prompt',
      TEST_DOCKER_EXECUTION_OPTIONS,
    )).toThrow(/does not expose incremental measured usage/);
    expect(capturedDockerRunArgs).toHaveLength(0);
  });

  it('gemini provider → metering HOLD before any credential forwarding', () => {
    vi.stubEnv('GOOGLE_API_KEY', 'ya29-google');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic-irrelevant');

    const backend = new DockerSpawnBackend('/test/project');
    expect(() => backend.spawn(
      't-auth-gemini',
      'gemini-2.5-flash' as ModelType,
      'prompt',
      TEST_DOCKER_EXECUTION_OPTIONS,
    )).toThrow(/does not expose incremental measured usage/);
    expect(capturedDockerRunArgs).toHaveLength(0);
  });

  it('claude provider + subscription → does NOT forward OPENAI_API_KEY even if set', () => {
    // Regression bonus: OPENAI_API_KEY should also not leak into a claude
    // worker (cross-provider auth confusion guard, symmetric to ANTHROPIC).
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-leak');
    stubTaskEnvelope('t-auth-claude-pure', 'claude-haiku-4-5-20251001', 'subscription');

    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn(
      't-auth-claude-pure',
      'claude-haiku-4-5-20251001' as ModelType,
      'prompt',
      TEST_DOCKER_EXECUTION_OPTIONS,
    );

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasEnvFlag(argv, 'OPENAI_API_KEY')).toBe(false);
  });

  it.each([
    ['t-auth-codex-api', 'gpt-5.6-sol', 'OPENAI_API_KEY'],
    ['t-auth-gemini-api', 'gemini-2.5-flash', 'GOOGLE_API_KEY'],
  ] as const)('%s remains held in API mode until incremental Docker usage exists', (taskId, model, envName) => {
    stubTaskEnvelope(taskId, model, 'api');
    vi.stubEnv(envName, 'provider-api-key');

    expect(() => new DockerSpawnBackend('/test/project')
      .spawn(taskId, model as ModelType, 'prompt', TEST_DOCKER_EXECUTION_OPTIONS))
      .toThrow(/does not expose incremental measured usage/);
    expect(capturedDockerRunArgs).toHaveLength(0);
  });
});
