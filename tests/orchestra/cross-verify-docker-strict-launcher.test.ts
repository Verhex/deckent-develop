import { createHash } from 'node:crypto';
import type { ChildProcess } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function strictTaskSnapshot(id: string) {
  return {
    id,
    model: 'claude-fable-5',
    budget: { maxTurns: 3 },
    budgetPolicy: {
      admissionMode: 'unattended',
      landingPolicy: { reserve_ratio: 0.25 },
    },
  };
}

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn(), resume: vi.fn() },
    stderr: { on: vi.fn(), resume: vi.fn() },
    on: vi.fn(),
    once: vi.fn(),
  } as unknown as ChildProcess)),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn((path: string, encoding?: unknown) => {
    const normalized = String(path).replaceAll('\\', '/');
    if (normalized.endsWith('/.gemini/settings.json')) {
      return '{"security":{"auth":{"selectedType":"gemini-api-key"}}}';
    }
    if (/\/task-([^/]+)\.json$/u.test(normalized)) {
      const id = normalized.match(/\/task-([^/]+)\.json$/u)?.[1] ?? 'strict-xverify';
      const value = JSON.stringify(strictTaskSnapshot(id));
      return encoding === undefined ? Buffer.from(value) : value;
    }
    return encoding === undefined ? Buffer.from('{}') : '{}';
  }),
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
  statSync: vi.fn(() => ({
    isFile: () => true,
    isDirectory: () => true,
    mtimeMs: 0,
    size: 0,
  })),
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
vi.mock('../../src/core/worker-heartbeat-authority-store.js', () => ({
  WorkerHeartbeatAuthorityStore: class {
    initialize() { return { state: 'READY' }; }
    read() { return null; }
    observe() { return { state: 'ACCEPTED', authority: { holds: [], latest: null } }; }
  },
}));
vi.mock('../../src/core/task-result-settlement.js', () =>
  import('../helpers/task-result-settlement-stub.js')
    .then(({ createTaskResultSettlementModuleStub }) => createTaskResultSettlementModuleStub()));
vi.mock('../../src/core/cross-verify-evidence-broker.js', () => ({
  crossVerifyEvidenceBrokerDirectory: vi.fn(() =>
    '/host-state/task-result-settlements/strict-xverify/cross-verify-evidence'),
  readCrossVerifyEvidenceReceipt: vi.fn(() => ({
    manifestSha256: 'a'.repeat(64),
  })),
  crossVerifyEvidenceReceiptRef: vi.fn(() =>
    `cross-verify-evidence-manifest:sha256:${'a'.repeat(64)}`),
}));
vi.mock('../../src/orchestra/execution-landing-coordinator.js', async importActual => ({
  ...(await importActual<typeof import('../../src/orchestra/execution-landing-coordinator.js')>()),
  prepareDockerExecutionLanding: vi.fn(({ prompt }: { prompt: string }) => ({
    prompt,
    context: null,
  })),
}));

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  createTaskResultSettlementRef,
  readTaskResultSettlementExecutionContract,
  readTaskResultSettlementPrompt,
} from '../../src/core/task-result-settlement.js';
import { canonicalJson } from '../../src/core/audit-writer.js';
import {
  createCrossVerifyEnforcedAttemptContract,
  createCrossVerifyEnforcedAttemptContractV2,
  type CrossVerifyEnforcedAttemptContractV1,
} from '../../src/core/cross-verify-execution-contract.js';
import type { SpawnBackendOptions } from '../../src/orchestra/spawn-backend.js';
import {
  DockerSpawnBackend,
} from '../../src/orchestra/spawn-backend-docker.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockReadExecutionContract = vi.mocked(readTaskResultSettlementExecutionContract);
const mockReadPrompt = vi.mocked(readTaskResultSettlementPrompt);
const dockerRuns: string[][] = [];
const bindPreparedAttempt = vi.fn(() => ({
  bindingId: 'binding-strict-xverify',
  evidenceRef: 'execution-termination-binding:strict-xverify-0001',
  authorityRef: 'execution-termination-authority:strict-xverify-0001',
}));

function installDockerRouter(): void {
  dockerRuns.length = 0;
  mockSpawnSync.mockImplementation((command, args) => {
    const argv = (args as string[] | undefined) ?? [];
    let stdout = '';
    if (command === 'docker' && argv[0] === 'images') stdout = 'image-hash';
    if (command === 'docker' && argv[0] === 'run') {
      dockerRuns.push([...argv]);
      stdout = 'container-id-strict';
    }
    if (command === 'docker' && argv[0] === 'inspect') stdout = 'true|0';
    if (command === 'claude' && argv.join(' ') === 'auth status --json') {
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

function exactOptions(): SpawnBackendOptions {
  return {
    projectDir: '/test/project',
    executionBudget: { maxTurns: 3 },
    executionLandingPolicy: { reserve_ratio: 0.25 },
    executionAdmissionMode: 'unattended',
    executionLandingContext: {} as NonNullable<SpawnBackendOptions['executionLandingContext']>,
    taskTimeoutSeconds: 120,
    isolatedContext: true,
  };
}

function exactContract(
  taskId: string,
  prompt: string,
  settlementRef: ReturnType<typeof createTaskResultSettlementRef>,
  overrides: Partial<CrossVerifyEnforcedAttemptContractV1> = {},
) {
  return createCrossVerifyEnforcedAttemptContract({
    tenantId: 'tenant-a',
    projectId: 'project-a',
    runId: 'run-a',
    taskId: 'task-a',
    verifierTaskId: taskId,
    callId: 'call-a',
    attemptId: settlementRef.attemptId,
    fenceTokenHash: '1'.repeat(64),
    operationClass: 'verify-implementation',
    basePromptSha256: createHash('sha256').update('base prompt').digest('hex'),
    dispatchedPromptSha256: createHash('sha256').update(prompt).digest('hex'),
    taskSnapshotSha256: createHash('sha256')
      .update(canonicalJson(strictTaskSnapshot(taskId)))
      .digest('hex'),
    budget: { maxTurns: 3 },
    budgetFingerprint: '2'.repeat(64),
    budgetProfileRef: 'execution-budget:strict-xverify-0001',
    budgetPolicyDigest: '3'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    attendanceMode: 'unattended',
    provider: 'claude',
    model: 'claude-fable-5',
    authMode: 'subscription',
    accountRefHash: '4'.repeat(64),
    transport: 'cli',
    executionBackend: 'docker',
    endpointRefHash: null,
    executionProfileRef: 'execution-profile:claude-xverify-0001',
    providerLimitEstimates: [{ windowId: 'tokens-all', unit: 'tokens', amount: 100 }],
    timeoutMs: 120_000,
    modelEffort: 'low',
    toolProfileDigest: '5'.repeat(64),
    isolatedContext: true,
    settlementAttemptRef: settlementRef,
    ...overrides,
  });
}

function exactInput(
  contractOverrides: Partial<CrossVerifyEnforcedAttemptContractV1> = {},
) {
  const taskId = 'strict-xverify';
  const prompt = 'strict immutable verifier prompt';
  const settlementRef = createTaskResultSettlementRef('/test/project', taskId);
  return {
    taskId,
    model: 'claude-fable-5',
    prompt,
    executionContract: exactContract(taskId, prompt, settlementRef, contractOverrides),
    settlementRef,
    options: exactOptions(),
    terminationAuthority: { bindPreparedAttempt },
  } as const;
}

function exactV2Input() {
  const base = exactInput();
  const v1 = base.executionContract;
  const {
    schemaVersion: _schemaVersion,
    contractSha256: _contractSha256,
    evidenceRef: _evidenceRef,
    ...input
  } = v1;
  const promptDigest = createHash('sha256').update(base.prompt).digest('hex');
  return {
    ...base,
    executionContract: createCrossVerifyEnforcedAttemptContractV2({
      ...input,
      adjudication: {
        protocol: 'xverify-adjudication-v2',
        producerSettlementDigest: `sha256:${'5'.repeat(64)}`,
        claimDigest: `sha256:${'6'.repeat(64)}`,
        evidenceManifestDigest: `sha256:${'7'.repeat(64)}`,
        adjudicationContractDigest: `sha256:${'8'.repeat(64)}`,
        evidenceBrokerRef:
          `cross-verify-evidence-manifest:sha256:${'a'.repeat(64)}`,
        evidenceBrokerManifestSha256: 'a'.repeat(64),
        evidenceMountPath: '/deckent/xverify-evidence',
        evidenceManifestRelativePath: 'manifest.json',
        runtimeImageRef: `sha256:${'9'.repeat(64)}`,
        finalPromptDigest: `sha256:${promptDigest}`,
        finalPromptChars: base.prompt.length,
        maxPromptChars: 16_000,
        maxEvidenceOutputChars: 12_000,
        maxRationaleChars: 2_000,
        evidenceAccess: 'snapshot-read-only',
        artifactMutationPolicy: 'attempt-private-output-only',
      },
    }),
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  installDockerRouter();
  bindPreparedAttempt.mockClear();
});

describe('DockerSpawnBackend exact xverify entrypoint', () => {
  it('derives an immutable runtime identity from the local image and in-image CLI', async () => {
    const imageId = `sha256:${'c'.repeat(64)}`;
    const commands: string[][] = [];
    const identity = await new DockerSpawnBackend('/test/project', {
      crossVerifyRuntimeCommandRunner: async (_command, args) => {
        commands.push([...args]);
        return {
          status: 0,
          stdout: args[0] === 'image' ? imageId : '/usr/local/bin/claude\n',
          stderr: '',
        };
      },
    })
      .inspectExactCrossVerifyRuntime('claude', 'claude-fable-5');

    expect(identity).toMatchObject({
      state: 'ready',
      executionProfileRef: expect.stringMatching(/^docker-execution-profile:[a-f0-9]{64}$/u),
      toolProfileDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      authorityEvidenceRef: expect.stringMatching(/^docker-xverify-runtime:[a-f0-9]{64}$/u),
    });
    expect(commands[1]).toContain(imageId);
  });

  it('holds before a provider call when immutable image identity is unavailable', async () => {
    await expect(new DockerSpawnBackend('/test/project', {
      crossVerifyRuntimeCommandRunner: async () => ({
        stdout: 'mutable-tag-only',
        stderr: '',
        status: 0,
      }),
    }).inspectExactCrossVerifyRuntime('claude', 'claude-fable-5'))
      .resolves.toMatchObject({
        state: 'hold',
        reasonCode: 'docker_image_identity_unavailable',
      });
  });

  it('leaves the ordinary worker prompt transport unchanged', async () => {
    new DockerSpawnBackend('/test/project')
      .spawn('ordinary-worker', 'claude-fable-5', 'ordinary worker prompt', {
        ...exactOptions(),
      });

    await vi.waitFor(() => expect(dockerRuns).toHaveLength(1));
    expect(mockWriteFileSync.mock.calls.some(
      ([path, value]) =>
        /\/\.tasks\/\.prompt-ordinary-worker-[a-f0-9]+\.txt$/u
          .test(String(path).replaceAll('\\', '/'))
        && value === 'ordinary worker prompt',
    )).toBe(true);
    expect(dockerRuns[0]!.join(' '))
      .not.toContain('target=/run/deckent-xverify-prompt.txt');
  });

  it('mounts only the host-authority prompt read-only and returns a two-field handle', async () => {
    const input = exactInput();
    const handle = await new DockerSpawnBackend('/test/project')
      .spawnExactCrossVerify(input);

    expect(Object.keys(handle).sort()).toEqual(['outputArtifactRef', 'settlementRef']);
    expect(handle.settlementRef).toEqual(input.settlementRef);
    expect(handle.outputArtifactRef).toMatch(/^task-result-output:[a-f0-9]{64}$/u);
    expect(bindPreparedAttempt).toHaveBeenCalledTimes(1);
    expect(dockerRuns).toHaveLength(1);
    const argv = dockerRuns[0]!;
    const mountIndex = argv.findIndex(
      (value, index) => value === '--mount'
        && argv[index + 1]?.includes('target=/run/deckent-xverify-prompt.txt'),
    );
    expect(mountIndex).toBeGreaterThan(-1);
    expect(argv[mountIndex + 1]).toContain('source=/host-state/task-result-settlements/');
    expect(argv[mountIndex + 1]).toContain('target=/run/deckent-xverify-prompt.txt');
    expect(argv[mountIndex + 1]).toContain('readonly');
    expect(argv.join(' ')).toContain('/run/deckent-xverify-prompt.txt');
    expect(argv.join(' ')).not.toMatch(/\/workspace\/\.tasks\/\.prompt-strict-xverify/u);
    expect(mockWriteFileSync.mock.calls.some(
      ([path]) => String(path).includes('.prompt-strict-xverify'),
    )).toBe(false);
  });

  it('isolates typed v2 from the project and mounts only broker evidence read-only', async () => {
    await new DockerSpawnBackend('/test/project')
      .spawnExactCrossVerify(exactV2Input());

    expect(dockerRuns).toHaveLength(1);
    const argv = dockerRuns[0]!;
    const command = argv.join(' ');
    expect(command).not.toContain('-v /test/project:/workspace');
    expect(command).toContain('--tmpfs /workspace:size=64m');
    expect(command).toContain(
      'source=/host-state/task-result-settlements/strict-xverify/cross-verify-evidence,'
      + 'target=/deckent/xverify-evidence,readonly',
    );
    expect(command).toMatch(
      /provider-output:\/workspace\/\.tasks/u,
    );
    expect(command).not.toContain('/test/project/.locks:/workspace/.locks');
    expect(command).not.toContain('GIT_WORK_TREE=/workspace');
    expect(command).toContain(`sha256:${'9'.repeat(64)} sh -c`);
  });

  it('holds prompt byte drift before durable preparation or docker run', async () => {
    const input = exactInput();
    await expect(new DockerSpawnBackend('/test/project').spawnExactCrossVerify({
      ...input,
      prompt: 'substituted prompt bytes',
    })).rejects.toThrow(/prompt bytes differ/i);
    expect(dockerRuns).toHaveLength(0);
  });

  it('re-verifies the immutable prompt after prepared evidence and before docker run', async () => {
    mockReadPrompt.mockReturnValueOnce(null);
    await expect(new DockerSpawnBackend('/test/project')
      .spawnExactCrossVerify(exactInput()))
      .rejects.toThrow(/final pre-dispatch authority verification failed/i);
    expect(dockerRuns).toHaveLength(0);
  });

  it('re-verifies the immutable execution contract before docker run', async () => {
    mockReadExecutionContract.mockReturnValueOnce(null);
    await expect(new DockerSpawnBackend('/test/project')
      .spawnExactCrossVerify(exactInput()))
      .rejects.toThrow(/final pre-dispatch authority verification failed/i);
    expect(dockerRuns).toHaveLength(0);
  });

  it('re-verifies the persisted task snapshot immediately before docker run', async () => {
    await expect(new DockerSpawnBackend('/test/project').spawnExactCrossVerify({
      ...exactInput({ taskSnapshotSha256: 'e'.repeat(64) }),
    })).rejects.toThrow(/final pre-dispatch authority verification failed/i);
    expect(dockerRuns).toHaveLength(0);
  });

  it('holds a termination-binding failure before docker run', async () => {
    bindPreparedAttempt.mockImplementationOnce(() => {
      throw new Error('termination ledger unavailable');
    });
    await expect(new DockerSpawnBackend('/test/project')
      .spawnExactCrossVerify(exactInput()))
      .rejects.toThrow(/termination ledger unavailable/i);
    expect(dockerRuns).toHaveLength(0);
  });
});
