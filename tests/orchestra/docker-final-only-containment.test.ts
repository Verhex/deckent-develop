// ─── tests/orchestra/docker-final-only-containment.test.ts ──────────────────
//
// XVER-CODEX (MASTER-PLAN 657) — the Docker-level half of final-only usage
// containment. The cross-verify wire tests inject `spawnVerifier` and the
// spawn-settlement tests mock `SpawnBackendFactory`, so neither reaches
// `DockerSpawnBackend.spawn`. These cases exercise the real backend seam:
//
//   A) a final-only provider carrying a live usage ceiling is STILL refused
//      when the owner authorized no containment (fail-closed default),
//   B) an authorized grant narrows the container wall clock to the owner window,
//   C) a grant wider than the configured timeout never widens it,
//   D) an incremental-usage provider is unaffected by the grant.
//
// Mock harness mirrors docker-provider-cli.test.ts (same spawn-seam router).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn(), resume: vi.fn() },
    on: vi.fn(),
    once: vi.fn(),
    kill: vi.fn(),
  } as unknown as ChildProcess)),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
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

vi.mock('../../src/core/utils.js', () => ({ debugLog: vi.fn() }));

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
import { DockerSpawnBackend } from '../../src/orchestra/spawn-backend-docker.js';
import type { ModelType } from '../../src/core/types.js';
import {
  budgetedDockerTaskJson,
  TEST_DOCKER_EXECUTION_OPTIONS,
} from '../helpers/budgeted-docker-execution-fixture.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockReadFileSync = vi.mocked(readFileSync);

const capturedRunArgs: string[][] = [];

/**
 * Owner-authored ceiling that makes this a live-usage-ceiling spawn. Reuses the
 * shared fixture so the options match the task JSON's admission envelope
 * (`maxTurns` alone already satisfies `hasLiveUsageCeiling`).
 */
const LIVE_CEILING_OPTIONS = TEST_DOCKER_EXECUTION_OPTIONS;

const GRANT = {
  maxWallClockSeconds: 300,
  profileRef: 'execution_budget.final_only_usage',
  policyDigest: 'b'.repeat(64),
} as const;

function installSpawnRouter(): void {
  capturedRunArgs.length = 0;
  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];
    let stdout = '';
    if (cmd === 'docker' && sub === 'images') stdout = 'imghash';
    else if (cmd === 'docker' && sub === 'run' && !argv.includes('--rm')) {
      capturedRunArgs.push([...argv]);
      stdout = 'container-id-x';
    } else if (cmd === 'docker' && sub === 'inspect') stdout = 'true|0';
    else if (cmd === 'claude') stdout = '{"loggedIn":true}';
    return {
      stdout, stderr: '', status: 0, signal: null, pid: 1, output: ['', stdout, ''],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

/** The container receives its hard wall clock as TASK_TIMEOUT=<seconds>. */
function capturedTaskTimeout(): number | null {
  const argv = capturedRunArgs.at(-1) ?? [];
  const entry = argv.find(arg => arg.startsWith('TASK_TIMEOUT='));
  return entry ? Number.parseInt(entry.slice('TASK_TIMEOUT='.length), 10) : null;
}

describe('DockerSpawnBackend: final-only usage containment (XVER-CODEX)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpawnRouter();
    mockReadFileSync.mockImplementation(path => budgetedDockerTaskJson(path, { model: 'gpt-5.6-sol' }));
  });

  it('refuses a final-only provider with a live ceiling when the owner authorized no containment', () => {
    expect(() => new DockerSpawnBackend('/test/project', { timeoutSeconds: 2700 }).spawn(
      'final-only-unauthorized',
      'gpt-5.6-sol' as ModelType,
      'bounded verifier prompt',
      LIVE_CEILING_OPTIONS,
    )).toThrow(/does not expose incremental measured usage/);
    expect(capturedRunArgs).toHaveLength(0);
  });

  it('rejects a containment grant whose wall clock is not a positive integer', () => {
    expect(() => new DockerSpawnBackend('/test/project', { timeoutSeconds: 2700 }).spawn(
      'final-only-bad-grant',
      'gpt-5.6-sol' as ModelType,
      'bounded verifier prompt',
      { ...LIVE_CEILING_OPTIONS, finalOnlyUsageContainment: { ...GRANT, maxWallClockSeconds: 0 } },
    )).toThrow(/requires a positive integer wall clock/);
    expect(capturedRunArgs).toHaveLength(0);
  });

  it('narrows the container wall clock to the owner-authorized window', () => {
    new DockerSpawnBackend('/test/project', { timeoutSeconds: 2700 }).spawn(
      'final-only-narrowed',
      'gpt-5.6-sol' as ModelType,
      'bounded verifier prompt',
      { ...LIVE_CEILING_OPTIONS, finalOnlyUsageContainment: GRANT },
    );
    expect(capturedRunArgs).toHaveLength(1);
    expect(capturedTaskTimeout()).toBe(300);
  });

  it('never widens the configured timeout, even with a larger authorization', () => {
    new DockerSpawnBackend('/test/project', { timeoutSeconds: 600 }).spawn(
      'final-only-no-widen',
      'gpt-5.6-sol' as ModelType,
      'bounded verifier prompt',
      { ...LIVE_CEILING_OPTIONS, finalOnlyUsageContainment: { ...GRANT, maxWallClockSeconds: 3000 } },
    );
    expect(capturedTaskTimeout()).toBe(600);
  });

  it('leaves an incremental-usage provider on its configured timeout', () => {
    mockReadFileSync.mockImplementation(path => budgetedDockerTaskJson(path, { model: 'claude-sonnet-5' }));
    new DockerSpawnBackend('/test/project', { timeoutSeconds: 2700 }).spawn(
      'incremental-untouched',
      'claude-sonnet-5' as ModelType,
      'bounded verifier prompt',
      { ...LIVE_CEILING_OPTIONS, finalOnlyUsageContainment: GRANT },
    );
    expect(capturedTaskTimeout()).toBe(2700);
  });
});
