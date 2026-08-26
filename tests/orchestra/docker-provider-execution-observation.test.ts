import { execFile, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createInitialProviderExecutionObservationState,
  foldProviderExecutionObservations,
  getProviderExecutionAttainedConcurrency,
  listProviderExecutionIncompleteIntervals,
  parseProviderExecutionObservationInput,
} from '../../src/core/provider-execution-observation.js';
import {
  DockerSpawnBackend,
  buildDockerProviderExecutionObservationShell,
  resolveDockerProviderPrincipalDigest,
  type DockerProviderExecutionObservationBinding,
} from '../../src/orchestra/spawn-backend-docker.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: vi.fn(),
    spawn: vi.fn(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn(), resume: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
      kill: vi.fn(),
    } as unknown as ChildProcess)),
  };
});

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

const roots: string[] = [];
const PRINCIPAL = 'a'.repeat(64);
const FENCE = 'f'.repeat(64);

function freshRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function binding(executionId: string): DockerProviderExecutionObservationBinding {
  return {
    executionId,
    runId: 'run-486-020',
    taskId: '486-020',
    attemptId: 'attempt-486-020',
    providerPrincipalDigest: PRINCIPAL,
  };
}

function runShell(script: string, env: NodeJS.ProcessEnv = {}): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise(resolve => {
    execFile(
      'sh',
      ['-c', script],
      { env: { ...process.env, ...env }, encoding: 'utf-8' },
      (error, stdout, stderr) => {
        const code = error && 'code' in error && typeof error.code === 'number'
          ? error.code
          : error ? null : 0;
        resolve({ code, stdout, stderr });
      },
    );
  });
}

function observationScript(
  input: DockerProviderExecutionObservationBinding,
  directory: string,
  body: readonly string[],
  retention = 2,
): string {
  return [
    'fsync_file() { :; }',
    ...buildDockerProviderExecutionObservationShell(input, {
      observationDirectory: directory,
      closedRetentionLimit: retention,
    }),
    ...body,
  ].join('\n');
}

function readObservation(directory: string, executionId: string, type: 'start' | 'end') {
  return parseProviderExecutionObservationInput(JSON.parse(readFileSync(
    join(directory, `${executionId}.${type}.json`),
    'utf-8',
  )));
}

afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('Docker provider execution boundary persistence', () => {
  it('emits schema-valid start/end only around the provider command and folds to a closed interval', async () => {
    const root = freshRoot('deckent-provider-observation-golden-');
    const directory = join(root, 'observations');
    const providerMarker = join(root, 'provider-ran');
    const input = binding('execution-golden');

    const result = await runShell(observationScript(input, directory, [
      'record_provider_execution_start || exit 79',
      `[ -f ${JSON.stringify(join(directory, 'execution-golden.start.json'))} ] || exit 80`,
      `printf provider > ${JSON.stringify(providerMarker)}`,
      'record_provider_execution_end completed || exit 79',
    ]), { DECKENT_PROVIDER_EXECUTION_FENCE: FENCE });

    expect(result).toMatchObject({ code: 0, stderr: '' });
    expect(readFileSync(providerMarker, 'utf-8')).toBe('provider');
    const start = readObservation(directory, input.executionId, 'start');
    const end = readObservation(directory, input.executionId, 'end');
    expect(start).toMatchObject({
      type: 'start',
      executionId: input.executionId,
      runId: input.runId,
      taskId: input.taskId,
      attemptId: input.attemptId,
      providerPrincipalDigest: PRINCIPAL,
      fence: FENCE,
      sequence: 1,
    });
    expect(end).toMatchObject({
      type: 'end', runId: input.runId, outcome: 'completed', sequence: 2,
    });

    const state = foldProviderExecutionObservations(
      createInitialProviderExecutionObservationState(),
      [start, end],
    );
    expect(getProviderExecutionAttainedConcurrency(state)).toBe(0);
    expect(listProviderExecutionIncompleteIntervals(state)).toEqual([]);
    expect(state.holds).toEqual([]);
  });

  it('does not equate container lifecycle with provider execution and refuses a missing fence', async () => {
    const root = freshRoot('deckent-provider-observation-boundary-');
    const directory = join(root, 'observations');
    const containerMarker = join(root, 'container-running');
    const input = binding('execution-boundary');

    const lifecycleOnly = await runShell(observationScript(input, directory, [
      `printf running > ${JSON.stringify(containerMarker)}`,
    ]), { DECKENT_PROVIDER_EXECUTION_FENCE: FENCE });
    expect(lifecycleOnly.code).toBe(0);
    expect(existsSync(containerMarker)).toBe(true);
    expect(existsSync(directory)).toBe(false);

    const missingFence = await runShell(observationScript(input, directory, [
      'record_provider_execution_start',
    ]), { DECKENT_PROVIDER_EXECUTION_FENCE: '' });
    expect(missingFence.code).toBe(79);
    expect(existsSync(directory)).toBe(false);
  });

  it('persists idempotently, classifies terminal outcomes, and retains incomplete intervals while bounding closed pairs', async () => {
    const root = freshRoot('deckent-provider-observation-retention-');
    const directory = join(root, 'observations');
    const execute = async (executionId: string, outcome?: 'completed' | 'failed' | 'aborted') => {
      const body = ['record_provider_execution_start || exit 79'];
      if (outcome) body.push(`record_provider_execution_end ${outcome} || exit 79`);
      return runShell(
        observationScript(binding(executionId), directory, body, 2),
        { DECKENT_PROVIDER_EXECUTION_FENCE: FENCE },
      );
    };

    expect((await execute('execution-idempotent', 'failed')).code).toBe(0);
    const firstStart = readFileSync(join(directory, 'execution-idempotent.start.json'));
    const firstEnd = readFileSync(join(directory, 'execution-idempotent.end.json'));
    expect((await execute('execution-idempotent', 'aborted')).code).toBe(0);
    expect(readFileSync(join(directory, 'execution-idempotent.start.json'))).toEqual(firstStart);
    expect(readFileSync(join(directory, 'execution-idempotent.end.json'))).toEqual(firstEnd);
    expect(readObservation(directory, 'execution-idempotent', 'end')).toMatchObject({
      outcome: 'failed',
    });

    expect((await execute('execution-incomplete')).code).toBe(0);
    expect((await execute('execution-closed-2', 'aborted')).code).toBe(0);
    expect((await execute('execution-closed-3', 'completed')).code).toBe(0);

    const names = readdirSync(directory);
    expect(names.filter(name => name.endsWith('.end.json'))).toHaveLength(2);
    expect(names).toContain('execution-incomplete.start.json');
    expect(names).not.toContain('execution-incomplete.end.json');
    const incomplete = readObservation(directory, 'execution-incomplete', 'start');
    const state = foldProviderExecutionObservations(
      createInitialProviderExecutionObservationState(),
      [incomplete],
    );
    expect(listProviderExecutionIncompleteIntervals(state)).toMatchObject([
      { executionId: 'execution-incomplete', fence: FENCE },
    ]);
  });
});

describe('DockerSpawnBackend production wiring', () => {
  const capturedDockerRuns: string[][] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-provider-secret');
    capturedDockerRuns.length = 0;
    vi.mocked(spawnSync).mockImplementation((command, args) => {
      const argv = (args as string[] | undefined) ?? [];
      let stdout = '';
      if (command === 'docker' && argv[0] === 'images') stdout = 'image-id';
      if (command === 'docker' && argv[0] === 'run') {
        capturedDockerRuns.push([...argv]);
        stdout = 'c'.repeat(64);
      }
      if (command === 'docker' && argv[0] === 'inspect') stdout = 'true|0';
      return {
        stdout,
        stderr: '',
        status: 0,
        signal: null,
        pid: 1,
        output: ['', stdout, ''],
      } as unknown as ReturnType<typeof spawnSync>;
    });
  });

  it('wires the host-authored wrapper and active claim fence into the real Docker spawn ingress', async () => {
    vi.stubEnv('DECKENT_AUTH_SKIP', '1');
    const root = freshRoot('deckent-provider-observation-spawn-');
    const tasksDir = join(root, '.tasks');
    mkdirSync(tasksDir, { recursive: true });
    mkdirSync(join(root, '.locks'), { recursive: true });
    const taskId = 'observation-wire';
    const taskPath = join(tasksDir, `task-${taskId}.json`);
    const task = JSON.parse(budgetedDockerTaskJson(taskPath, {
        authMode: 'api',
        model: 'claude-sonnet-5',
      })) as Record<string, unknown>;
    writeFileSync(
      taskPath,
      JSON.stringify({
        ...task,
        scope: {
          directories: ['src/orchestra/', 'tests/orchestra/'],
          filesRead: [],
          filesWrite: [
            'src/orchestra/spawn-backend-docker.ts',
            'tests/orchestra/docker-provider-execution-observation.test.ts',
          ],
        },
      }),
      'utf-8',
    );

    const backend = new DockerSpawnBackend(root);
    backend.spawn(taskId, 'claude-sonnet-5', 'prompt', {
      ...TEST_DOCKER_EXECUTION_OPTIONS,
      finalOnlyUsageContainment: {
        maxWallClockSeconds: 60,
        profileRef: 'test-final-only',
        policyDigest: 'b'.repeat(64),
      },
    });
    await backend.lastSpawnCompletion;

    expect(capturedDockerRuns).toHaveLength(1);
    const runArgs = capturedDockerRuns[0];
    const fenceIndex = runArgs.findIndex(value =>
      /^DECKENT_PROVIDER_EXECUTION_FENCE=[a-f0-9]{64}$/u.test(value));
    const imageIndex = runArgs.indexOf('deckent-worker:latest');
    expect(fenceIndex).toBeGreaterThan(0);
    expect(fenceIndex).toBeLessThan(imageIndex);

    const script = readFileSync(join(tasksDir, `.worker-${taskId}.sh`), 'utf-8');
    const startIndex = script.indexOf('record_provider_execution_start || exit 79');
    const launchIndex = script.indexOf('timeout -k 30 $TIMEOUT');
    const waitIndex = script.indexOf('wait "$PROVIDER_PID"');
    const endIndex = script.lastIndexOf('record_provider_execution_end "$PROVIDER_OBSERVATION_OUTCOME"');
    expect(startIndex).toBeGreaterThan(script.indexOf('fsync_file "$PRFILE"'));
    expect(startIndex).toBeLessThan(launchIndex);
    expect(endIndex).toBeGreaterThan(waitIndex);
    expect(script).toContain(`"taskId":"${taskId}"`);
    expect(script).toContain('\\"runId\\":');
    expect(script).not.toContain('test-provider-secret');
    // docker run/health alone only materialize the wrapper. No provider event
    // exists until that wrapper reaches its explicit provider call boundary.
    expect(existsSync(join(tasksDir, 'provider-execution-observations'))).toBe(false);
  });

  it('derives a stable principal pseudonym without persisting raw auth material', () => {
    const first = resolveDockerProviderPrincipalDigest({
      provider: 'claude',
      authMode: 'api',
      apiCredential: 'secret-one',
    });
    const replay = resolveDockerProviderPrincipalDigest({
      provider: 'claude',
      authMode: 'api',
      apiCredential: 'secret-one',
    });
    const other = resolveDockerProviderPrincipalDigest({
      provider: 'claude',
      authMode: 'api',
      apiCredential: 'secret-two',
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(replay).toBe(first);
    expect(other).not.toBe(first);
    expect(first).not.toContain('secret-one');
  });
});
