/**
 * tests/orchestra/docker-provider-auth.test.ts
 *
 * Tests for provider-aware auth mount in DockerSpawnBackend.
 * Sprint 203 Task 203-002.
 *
 * claude→~/.claude mount, codex→OPENAI_API_KEY env only, gemini→GOOGLE_API_KEY env only.
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
  existsSync: vi.fn((path: string) => path.endsWith('/.claude/.credentials.json')),
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
  mockReadFileSync.mockImplementation(path => budgetedDockerTaskJson(path, { model }));
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

  it('mounts only the Claude credential for canonical claude-sonnet-5 in subscription mode', () => {
    spawnBudgetedClaude(
      't-auth-claude',
      'claude-sonnet-5' as ModelType,
    );

    expect(capturedDockerRunArgs.length).toBe(1);
    const argv = capturedDockerRunArgs[0]!;
    expect(hasCredentialMount(argv, '/.claude/.credentials.json')).toBe(true);
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
    expect(hasCredentialMount(argv, '/.claude/.credentials.json')).toBe(true);
    expect(argv.some(arg => arg.includes('/.claude,dst='))).toBe(false);
  });

  it('holds canonical gpt-5.5 before auth mounting because Docker usage is final-only', () => {
    expectDockerMeteringHold('t-auth-gpt5', 'gpt-5.5' as ModelType);
  });

  it('holds canonical gemini-2.5-pro before auth mounting because Docker usage is final-only', () => {
    expectDockerMeteringHold('t-auth-gemini-pro', 'gemini-2.5-pro' as ModelType);
  });
});
