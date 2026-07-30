/**
 * tests/orchestra/worker-auth-isolation.test.ts
 *
 * F1-014r (Sprint 331) — RUNTIME spawn-time per-worker auth NON-LEAK guarantee.
 *
 * The per-worker auth-isolation UNIT contract landed earlier (auth-matrix.test.ts
 * on `applyDeckSecretsToEnv`). This file locks the *runtime* spawn-time invariant
 * at the docker env-assembly seam — exactly the inverse of the bug that KILLED
 * Sprint 213 (unconditional `ANTHROPIC_API_KEY` → claude CLI flips to API mode →
 * Tier-1 timeout → mass synthetic NO_GO; ADR-076).
 *
 * The invariant, asserted on the ASSEMBLED `docker run` argv (no real docker,
 * captured via the existing spawnSync mock seam):
 *   - subscription-Claude worker      → NO `ANTHROPIC_API_KEY` forwarded
 *   - api-mode Claude worker          → ONLY `ANTHROPIC_API_KEY`
 *   - subscription Codex/Gemini       → no API key; isolated OAuth files
 *   - api-mode Codex/Gemini           → only their own API key
 *   - any non-claude worker           → NO foreign credential (cross-leak = fail)
 *
 * Every case runs with ALL THREE host keys set simultaneously — the realistic
 * developer / mixed-provider-sprint environment that makes a cross-leak observable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

// ─── Mocks (mirror docker-auth-precedence.test.ts isolation) ──────────────────

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
  statSync: vi.fn(() => ({ mtimeMs: 1 })),
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

/** The three built-in provider credential env vars (the cross-leak surface). */
const CREDENTIAL_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'] as const;

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

/**
 * Collect the set of provider credential env vars (`ANTHROPIC_API_KEY` /
 * `OPENAI_API_KEY` / `GOOGLE_API_KEY`) forwarded via `-e KEY=...` in the
 * captured `docker run` argv. Returns them sorted for stable comparison.
 */
function collectForwardedCredentialKeys(argv: string[]): string[] {
  const found = new Set<string>();
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === '-e' && typeof argv[i + 1] === 'string') {
      const spec = argv[i + 1]!;
      const eq = spec.indexOf('=');
      const key = eq >= 0 ? spec.slice(0, eq) : spec;
      if ((CREDENTIAL_KEYS as readonly string[]).includes(key)) found.add(key);
    }
  }
  return [...found].sort();
}

/**
 * Configure the fs mock so readTaskAuthMode() returns the requested authMode
 * for taskId. existsSync returns true ONLY for the task JSON path; everything
 * else (auth mount, .claude.json) defaults to false — mirrors the isolation in
 * docker-auth-precedence.test.ts.
 */
function isProviderCredentialPath(path: string): boolean {
  return path.endsWith('/.claude/.credentials.json')
    || path.endsWith('/.codex/auth.json')
    || path.endsWith('/.gemini/gemini-credentials.json')
    || path.endsWith('/.gemini/google_accounts.json');
}

function stubTaskEnvelope(
  taskId: string,
  model: string,
  authMode: 'subscription' | 'api',
): void {
  fsState.existsSyncImpl = (p: string) =>
    p.endsWith(`task-${taskId}.json`)
    || (model.startsWith('claude-')
      && authMode === 'subscription'
      && p.endsWith('/.claude/.credentials.json'));
  fsState.readFileSyncImpl = (p: string) => {
    if (p.endsWith(`task-${taskId}.json`)) {
      return budgetedDockerTaskJson(p, { authMode, model });
    }
    return '{}';
  };
}

function resetFsStubs(): void {
  fsState.existsSyncImpl = isProviderCredentialPath;
  fsState.readFileSyncImpl = (path) => path.endsWith('/.gemini/settings.json')
    ? '{"security":{"auth":{"selectedType":"gemini-api-key"}}}'
    : '{}';
}

/** Spawn one worker and return the credential keys forwarded into its container. */
function forwardedKeysFor(
  model: ModelType,
  taskId: string,
  authMode: 'subscription' | 'api' = 'subscription',
): string[] {
  stubTaskEnvelope(taskId, model, authMode);
  const backend = new DockerSpawnBackend('/test/project');
  backend.spawn(taskId, model, 'prompt', TEST_DOCKER_EXECUTION_OPTIONS);
  expect(capturedDockerRunArgs.length).toBe(1);
  return collectForwardedCredentialKeys(capturedDockerRunArgs[0]!);
}

function expectMeteringHold(model: ModelType, taskId: string): void {
  const backend = new DockerSpawnBackend('/test/project');
  expect(() => backend.spawn(
    taskId,
    model,
    'prompt',
    TEST_DOCKER_EXECUTION_OPTIONS,
  )).toThrow(/does not expose incremental measured usage/);
  expect(capturedDockerRunArgs).toHaveLength(0);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DockerSpawnBackend: runtime per-worker auth non-leak (F1-014r)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
    resetFsStubs();
    // The realistic dev / mixed-provider env: every provider key is present in
    // the host shell. A correct backend still hands each worker ONLY its own.
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic-host');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-host');
    vi.stubEnv('GOOGLE_API_KEY', 'ya29-google-host');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── subscription-Claude: the Sprint-213 killer — must carry NO Anthropic key ──
  it.each([
    'claude-sonnet-5',
    'claude-opus-4-8',
    'claude-haiku-4-5-20251001',
  ] as ModelType[])(
    'subscription-Claude (%s) forwards NO credential key (no ANTHROPIC_API_KEY leak)',
    (model) => {
      expect(forwardedKeysFor(model, `t-sub-${model}`)).toEqual([]);
    },
  );

  // ── api-mode Claude: ONLY Anthropic, no foreign keys ──
  it('api-mode canonical Claude forwards ONLY ANTHROPIC_API_KEY', () => {
    expect(forwardedKeysFor(
      'claude-sonnet-5' as ModelType,
      't-api-claude',
      'api',
    )).toEqual(['ANTHROPIC_API_KEY']);
  });

  // ── codex: final-only usage cannot safely enter Docker env assembly ──
  it.each(['gpt-4.1', 'gpt-5.6-sol'] as ModelType[])(
    'codex worker (%s) HOLDs before any provider key enters a container',
    (model) => {
      expectMeteringHold(model, `t-codex-${model}`);
    },
  );

  // ── gemini: final-only usage cannot safely enter Docker env assembly ──
  it.each(['gemini-2.5-flash', 'gemini-2.5-pro'] as ModelType[])(
    'gemini worker (%s) HOLDs before any provider key enters a container',
    (model) => {
      expectMeteringHold(model, `t-gemini-${model}`);
    },
  );

  // ── API auth cannot override the live-metering capability gate ──
  it('Codex with authMode=api still HOLDs before provider env assembly', () => {
    stubTaskEnvelope('t-codex-api', 'gpt-4.1', 'api');
    expectMeteringHold('gpt-4.1' as ModelType, 't-codex-api');
  });

  it('Gemini with authMode=api still HOLDs before provider env assembly', () => {
    stubTaskEnvelope('t-gemini-api', 'gemini-2.5-flash', 'api');
    expectMeteringHold('gemini-2.5-flash' as ModelType, 't-gemini-api');
  });
});
