// ─── 593-001 F2c: design-catalog mount mask (flag-gated, default OFF) ───────
//
// Measured leak: spawn-backend-docker bind-mounts the WHOLE project root read-write
// at /workspace, so the repo's design catalogs travel into every worker container —
// `.claude/skills/` (11 SKILL.md, ~118.8KB) + `.claude/agents/` (3 files, ~8KB) —
// irrelevant to the typical worker task. `buildCatalogMaskMountArgs` overlays an
// EMPTY read-only host directory on those paths (same nested-overlay technique as
// buildDeckShadowMountArgs / buildDistReadOnlyMountArgs), so the worker sees them
// empty while the host tree is untouched.
//
// ADR-G-027 boundary: the mask closes MOUNT-side discovery only. The bodies of the
// skills ASSIGNED to a task are injected verbatim into the prompt by buildSkillBlock
// (prompt-god-template.ts) and are not touched here — no truncation, no access loss.
//
// Coverage:
//   1. buildCatalogMaskMountArgs — pure helper: flag OFF ⇒ zero args (byte-identical
//      argv pin), flag ON ⇒ one `:ro` overlay per PRESENT catalog, absent catalog ⇒
//      no arg (nested bind over a missing target would phantom-create it in the repo).
//   2. ensureCatalogMaskDir — idempotent empty mask source under `.tasks/`.
//   3. Wiring — DockerSpawnBackend.spawn() emits ZERO catalog mounts by default and
//      threads the overlays into the real `docker run` argv when the flag is on, with
//      every pre-existing mount arg unchanged.
//
// Hermetic: node:child_process + node:fs mocked (this file only, same pattern as
// tests/orchestra/docker-dist-guard.test.ts) — no real docker/filesystem touched.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/core/audit-writer.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(() => {
    const stub = {
      stdout: { on: vi.fn(), resume: vi.fn() },
      stderr: { on: vi.fn(), resume: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
    };
    return stub as unknown as ChildProcess;
  }),
}));

// Path-aware existsSync so a single test can flip JUST one catalog directory to
// "absent" while every other existsSync call on the happy path keeps returning true.
let absentPaths: Set<string> = new Set();

vi.mock('node:fs', () => ({
  linkSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
  chmodSync: vi.fn(),
  existsSync: vi.fn((p: string) => !absentPaths.has(String(p))),
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
    .then(({ createTaskResultSettlementModuleStub }) => ({
      ...createTaskResultSettlementModuleStub(),
      createTaskResultSettlementRefForAttempt: vi.fn((
        _projectRoot: string,
        taskId: string,
        attemptId: string,
      ) => ({
        schemaVersion: 1,
        taskId,
        backend: 'docker',
        projectRootSha256: '1'.repeat(64),
        attemptId,
      })),
    }));
});

vi.mock('../../src/orchestra/execution-landing-coordinator.js', async (importActual) => ({
  ...(await importActual<typeof import('../../src/orchestra/execution-landing-coordinator.js')>()),
  prepareDockerExecutionLanding: vi.fn(({ prompt }: { prompt: string }) => ({ prompt, context: null })),
}));

vi.mock('../../src/orchestra/execution-effect-store-adapter.js', async (importActual) => {
  const actual = await importActual<
    typeof import('../../src/orchestra/execution-effect-store-adapter.js')
  >();
  return {
    ...actual,
    createExecutionEffectLifecycleStoreAdmissionAdapterV1: vi.fn(
      actual.createExecutionEffectLifecycleStoreAdmissionAdapterV1,
    ),
  };
});

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import {
  DockerSpawnBackend,
  buildCatalogMaskMountArgs,
  buildExactDockerCustodyMountArgs,
  exactDockerWorkspaceVolumeName,
  exactDockerCustodyPid1Source,
  exactDockerCustodyNativeProbeSource,
  exactDockerEffectDependencyHelperSource,
  exactDockerEffectPopulationHelperSource,
  buildExactDockerRunnerSource,
  isExactDockerEffectLandingPolicyAdmitted,
  verifyExactDockerEffectNativeManifestParity,
  verifyExactDockerProviderStartAuthorization,
  verifyExactDockerProviderStartAck,
  verifyExactDockerProviderExecutionAck,
  verifyExactDockerExecutionCommit,
  parseExactDockerCustodyPrepareInput,
  createExactDockerPromptDeliveryAuthority,
  isExactDockerContainerAbsent,
  isExactDockerVolumeAbsent,
  parseExactDockerWorkspaceVolumeInspect,
  exactDockerEffectVolumeIdentity,
  exactDockerCausalObservedAt,
  createExactDockerEffectLifecycleAdapterV1,
  verifyExactDockerWorkspaceVolumeInspect,
  buildExactDockerWorkspaceVolumeCreateArgs,
  buildExactDockerNativeSnapshotArgs,
  parseExactDockerCustodyInspect,
  parseExactDockerWorkspaceInventory,
  readExactDockerWorkspaceInventory,
  createExactDockerCustodyPolicy,
  ensureCatalogMaskDir,
  CATALOG_MASK_RELATIVE_PATHS,
} from '../../src/orchestra/spawn-backend-docker.js';
import { SpawnBackendFactory } from '../../src/orchestra/spawn-backend.js';
import { DEFAULT_PROMPT_CONFIG, getConfigHelp } from '../../src/core/config.js';
import {
  TEST_DOCKER_EXECUTION_OPTIONS,
  budgetedDockerTaskJson,
} from '../helpers/budgeted-docker-execution-fixture.js';
import { createTaskResultSettlementV2TestPolicy } from '../helpers/task-result-settlement-v2-fixture.js';
import { taskResultV2Digest } from '../../src/core/task-result-schema.js';
import { assembleCanonicalIngressResultV2 } from '../../src/orchestra/result-ingress.js';
import { parseExactDockerDispatchTaskSnapshotAuthority } from '../../src/orchestra/exact-docker-dispatch-task-authority.js';
import { createExactNormalTaskApprovedMaterialV3 } from '../../src/orchestra/exact-evaluation-policy-authority.js';
import {
  createExecutionEffectResultProjectionV1,
  createTaskAttemptEffectLandingBindingV2,
} from '../../src/core/execution-effect-persistence-contract.js';
import { createExecutionEffectLifecycleStoreAdmissionAdapterV1 } from '../../src/orchestra/execution-effect-store-adapter.js';

const mockSpawn = vi.mocked(spawn);
const mockSpawnSync = vi.mocked(spawnSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockLifecycleStoreAdmissionAdapter = vi.mocked(
  createExecutionEffectLifecycleStoreAdmissionAdapterV1,
);
const TEST_EXECUTION_OPTIONS = TEST_DOCKER_EXECUTION_OPTIONS;

const MASK_SOURCE = '/test/project/.tasks/.catalog-mask';
const SKILLS_HOST = '/test/project/.claude/skills';
const AGENTS_HOST = '/test/project/.claude/agents';

function digest(character: string): `sha256:${string}` {
  return `sha256:${character.repeat(64)}`;
}

function promptDeliveryAuthorityFixture(
  task: Record<string, unknown>,
  segments: readonly Readonly<{
    tier: 'T0' | 'T1' | 'T2'; kind: string; content: string;
  }>[] = [{ tier: 'T2', kind: 'task', content: 'bounded prompt' }],
) {
  const prompt = segments.map(segment => segment.content).join('\n\n');
  task.promptCompilePlanId ??= `prompt-compile-plan:sha256:${'a'.repeat(64)}`;
  return {
    prompt,
    authority: createExactDockerPromptDeliveryAuthority({
      taskId: String(task.id),
      prompt,
      promptCompilePlanId: String(task.promptCompilePlanId),
      rolePolicyIdentity: `worker:${String(task.assignedAgent ?? 'generic')}`,
      ...(typeof task.assignedAgent === 'string'
        ? { assignedAgentId: task.assignedAgent } : {}),
      assignedSkillIds: Array.isArray(task.assignedSkills)
        ? task.assignedSkills as string[] : [],
      forcedSkillIds: Array.isArray(task.forceSkills) ? task.forceSkills as string[] : [],
      segments,
    }),
  };
}

function releasedReplayFixture() {
  const identity = {
    schemaVersion: 2 as const,
    backend: 'docker' as const,
    projectRootSha256: '1'.repeat(64),
    projectId: 'project',
    taskId: 'task',
    attemptId: '11111111-1111-4111-8111-111111111111',
    generation: 1,
  };
  const admissionRef = {
    schemaVersion: 2 as const,
    kind: 'task-attempt-custody-dispatch-admission-ref' as const,
    dispatchRequestId: `dreq-${'2'.repeat(64)}`,
    dispatchRequestMaterialDigest: digest('2'),
    identity,
    admissionReceiptDigest: digest('3'),
    refDigest: digest('4'),
  };
  const providerExecutionAttempt = {
    schemaVersion: 2 as const,
    kind: 'task-attempt-custody-provider-execution-attempt' as const,
    providerExecutionAttemptId: 'provider-attempt-1',
    custodyIdentity: identity,
    admissionReceiptDigest: admissionRef.admissionReceiptDigest,
    backendExecutionId: 'container-1',
    identityDigest: digest('5'),
  };
  const authority = {
    state: 'RELEASED' as const,
    admissionRef,
    receiptDigest: digest('6'),
    releaseReceiptDigest: digest('7'),
    releaseEvidenceDigest: digest('8'),
    projectionFence: digest('9'),
    providerExecutionAttempt,
    backendExecutionId: providerExecutionAttempt.backendExecutionId,
    mountReceiptDigest: digest('a'),
    releaseEvidence: { releasedAt: '2026-09-01T00:00:00.000Z' },
  };
  const providerStartReceipt = { ref: digest('b'), digest: digest('c') };
  const providerExecutionReceipt = { ref: digest('d'), digest: digest('e') };
  const custodyRef = {
    dispatchRequestId: admissionRef.dispatchRequestId,
    identity,
    admissionReceiptDigest: admissionRef.admissionReceiptDigest,
    admissionRefDigest: admissionRef.refDigest,
    providerStartReceipt,
  };
  const query = {
    custodyRef,
    releaseReceipt: {
      ref: authority.releaseReceiptDigest,
      digest: authority.releaseEvidenceDigest,
    },
    providerStartReceipt,
    projectionFence: authority.projectionFence,
  };
  const store = {
    readDispatchAuthority: vi.fn(() => ({ state: 'terminal' as const, authority })),
    readDispatchObservation: vi.fn((input: { observationClass: string }) => ({
      receipt: {
        evidenceDigest: input.observationClass === 'PROVIDER_EXECUTION'
          ? providerExecutionReceipt.digest
          : providerStartReceipt.digest,
        observedAt: '2026-09-01T00:00:01.000Z',
      },
    })),
    readDispatchObservationByClass: vi.fn((input: { observationClass: string }) => ({
      receipt: {
        evidenceDigest: input.observationClass === 'PROVIDER_EXECUTION'
          ? providerExecutionReceipt.digest
          : providerStartReceipt.digest,
        observedAt: '2026-09-01T00:00:01.000Z',
      },
      bytes: Buffer.from('{}'),
    })),
    readArtifactReceipt: vi.fn(() => null),
    readChain: vi.fn(() => null),
  };
  const scope = {
    store,
    policy: { policyDigest: digest('d') },
    identity,
    admission: {
      admittedAt: '2026-09-01T00:00:00.000Z',
      taskSnapshot: { sha256: digest('e') },
    },
    admissionRef,
    taskSnapshot: { dispatch: { providerInvocationDigest: digest('f') } },
    execution: { executionLandingPolicy: Object.freeze({ reserve_ratio: 0.25 }) },
    state: 'RELEASED',
    launch: {
      dockerBaseArgs: ['-e', 'FOREIGN_SECRET=must-not-project'],
      providerStartToken: Buffer.from('raw-nonce-must-not-project'),
    },
  };
  const completion = {
    scope,
    query,
    providerStartReceipt,
    providerExecutionReceipt,
    promise: Promise.resolve({ kind: 'capture-hold' }),
  };
  return {
    identity, admissionRef, authority, providerStartReceipt, providerExecutionReceipt,
    query, store, scope, completion,
  };
}

function custodyArtifactFixture(input: Readonly<{
  identity: ReturnType<typeof releasedReplayFixture>['identity'];
  admissionReceiptDigest: `sha256:${string}`;
  policyDigest: `sha256:${string}`;
  artifactClass: string;
  artifactKey: string;
  capturedAt: string;
  bytes: Uint8Array;
  receiptCharacter: string;
}>) {
  const contentDigest = `sha256:${createHash('sha256').update(input.bytes).digest('hex')}` as const;
  const receipt = Object.freeze({
    schemaVersion: 2 as const,
    artifactClass: input.artifactClass,
    captureMode: 'host-authority-publication' as const,
    identity: input.identity,
    admissionReceiptDigest: input.admissionReceiptDigest,
    policyDigest: input.policyDigest,
    artifactKey: input.artifactKey,
    capturedAt: input.capturedAt,
    artifact: Object.freeze({ sha256: contentDigest, byteLength: input.bytes.byteLength }),
    receiptDigest: digest(input.receiptCharacter),
  });
  return Object.freeze({
    receipt,
    bytes: Uint8Array.from(input.bytes),
    proof: Object.freeze({ sha256: contentDigest, byteLength: input.bytes.byteLength }),
  });
}

function exactHostWorkMonitorFixture(
  failure: 'measurement-hold' | 'publication-failure' | 'reread-failure',
) {
  const replay = releasedReplayFixture();
  const policy = createTaskResultSettlementV2TestPolicy();
  const observedAt = '2026-09-01T00:00:02.000Z';
  const providerExit = Object.freeze({
    containerId: replay.authority.backendExecutionId,
    exitCode: 0,
    observedAt,
    waitEvidenceDigest: digest('1'),
    observationReceiptDigest: digest('2'),
    observationEvidenceDigest: digest('3'),
  });
  const scopeDigest = createHash('sha256').update(canonicalJson([])).digest('hex');
  const validBaseline = `#deckent-scope-attribution-v1\t${replay.admissionRef.dispatchRequestId}\t${scopeDigest}\n`;
  const scopeBaseline = failure === 'measurement-hold' ? '#invalid-baseline\n' : validBaseline;
  const scopeBaselineSha256 = `sha256:${createHash('sha256')
    .update(scopeBaseline).digest('hex')}` as const;
  const providerStream = custodyArtifactFixture({
    identity: replay.identity,
    admissionReceiptDigest: replay.admissionRef.admissionReceiptDigest,
    policyDigest: policy.policyDigest,
    artifactClass: 'pristine-provider-stream',
    artifactKey: `provider-${replay.identity.attemptId}`,
    capturedAt: observedAt,
    bytes: Buffer.from(JSON.stringify({
      total_cost_usd: 0,
      modelUsage: { 'fixture-model': { inputTokens: 1, outputTokens: 1 } },
    })),
    receiptCharacter: '4',
  });
  const workerResult = custodyArtifactFixture({
    identity: replay.identity,
    admissionReceiptDigest: replay.admissionRef.admissionReceiptDigest,
    policyDigest: policy.policyDigest,
    artifactClass: 'worker-result',
    artifactKey: `result-${replay.identity.attemptId}`,
    capturedAt: observedAt,
    bytes: Buffer.from('{}'),
    receiptCharacter: '5',
  });
  let publishedHostWork: ReturnType<typeof custodyArtifactFixture> | null = null;
  const store = {
    ...replay.store,
    readDispatchObservation: vi.fn(() => ({
      receipt: { evidenceDigest: replay.providerExecutionReceipt.digest },
      bytes: Buffer.from('{}'),
    })),
    readArtifactReceipt: vi.fn((input: { artifactClass: string }) => {
      if (input.artifactClass === 'pristine-provider-stream') return providerStream.receipt;
      if (input.artifactClass === 'worker-result') return workerResult.receipt;
      return null;
    }),
    readVerifiedArtifact: vi.fn((input: { artifactClass: string }) => {
      if (input.artifactClass === 'pristine-provider-stream') return providerStream;
      if (input.artifactClass === 'worker-result') return workerResult;
      if (input.artifactClass === 'host-work-attribution') {
        return failure === 'reread-failure' ? null : publishedHostWork;
      }
      return null;
    }),
    publishHostArtifact: vi.fn((input: {
      artifactClass: string; artifactKey: string; capturedAt: string; bytes: Uint8Array;
    }) => {
      if (failure === 'publication-failure') throw new Error('durable publication unavailable');
      publishedHostWork = custodyArtifactFixture({
        identity: replay.identity,
        admissionReceiptDigest: replay.admissionRef.admissionReceiptDigest,
        policyDigest: policy.policyDigest,
        artifactClass: input.artifactClass,
        artifactKey: input.artifactKey,
        capturedAt: input.capturedAt,
        bytes: input.bytes,
        receiptCharacter: '6',
      });
      return publishedHostWork.receipt;
    }),
  };
  const scope = {
    ...replay.scope,
    store,
    policy,
    provider: 'fixture-provider',
    execution: { executionLandingPolicy: null },
    taskSnapshot: {
      material: { dispatch: { scope: { filesWrite: [] } } },
      dispatch: { scopeBaseline, scopeBaselineSha256 },
    },
  };
  return Object.freeze({ replay, scope, store, providerExit });
}

function coldExactDockerCompletionFixture(timestampOverrides: Readonly<{
  hostWork?: string;
  result?: string;
  landing?: string;
}> = {}) {
  const replay = releasedReplayFixture();
  const policy = createTaskResultSettlementV2TestPolicy();
  const observedAt = '2026-09-01T00:00:02.000Z';
  const providerExit = Object.freeze({
    containerId: replay.authority.backendExecutionId,
    exitCode: 0,
    observedAt,
    waitEvidenceDigest: digest('1'),
    observationReceiptDigest: digest('2'),
    observationEvidenceDigest: digest('3'),
  });
  const scopeDigest = createHash('sha256').update(canonicalJson([])).digest('hex');
  const scopeBaseline = `#deckent-scope-attribution-v1\t${replay.admissionRef.dispatchRequestId}\t${scopeDigest}\n`;
  const scopeBaselineSha256 = `sha256:${createHash('sha256')
    .update(scopeBaseline).digest('hex')}` as const;
  const hostWorkBody = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'exact-docker-host-work-attribution' as const,
    state: 'VERIFIED' as const,
    attemptId: replay.identity.attemptId,
    dispatchRequestId: replay.admissionRef.dispatchRequestId,
    admissionRefDigest: replay.admissionRef.refDigest,
    providerExitObservationReceiptDigest: providerExit.observationReceiptDigest,
    baselineRef: `task-attempt-custody-provider-exit:${providerExit.observationReceiptDigest}#scope-baseline:sha256:${scopeBaselineSha256.slice(7)}`,
    baselineSha256: scopeBaselineSha256.slice(7),
    scopeDigest,
    filesChanged: Object.freeze([]),
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    reasonCode: 'NONE' as const,
  });
  const hostWork = Object.freeze({
    ...hostWorkBody,
    evidenceDigest: `sha256:${createHash('sha256')
      .update(canonicalJson(hostWorkBody)).digest('hex')}` as const,
  });
  const proposal = Object.freeze({
    version: 3 as const,
    taskId: replay.identity.taskId,
    dispatchRequestId: replay.admissionRef.dispatchRequestId,
    sequence: 1,
    summary: 'Exact custody result is durably ready.',
    completedWork: Object.freeze(['captured exact result']),
    remainingWork: Object.freeze([]),
    nextAction: 'publish canonical accepted result',
    unresolvedRisks: Object.freeze([]),
    updatedAt: observedAt,
  });
  const artifacts = [
    custodyArtifactFixture({
      identity: replay.identity,
      admissionReceiptDigest: replay.admissionRef.admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      artifactClass: 'host-work-attribution',
      artifactKey: `host-work-${replay.identity.attemptId}`,
      capturedAt: timestampOverrides.hostWork ?? observedAt,
      bytes: Buffer.from(canonicalJson(hostWork)),
      receiptCharacter: '4',
    }),
    custodyArtifactFixture({
      identity: replay.identity,
      admissionReceiptDigest: replay.admissionRef.admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      artifactClass: 'pristine-provider-stream',
      artifactKey: `provider-${replay.identity.attemptId}`,
      capturedAt: observedAt,
      bytes: Buffer.from(JSON.stringify({
        total_cost_usd: 0,
        modelUsage: { 'fixture-model': { inputTokens: 1, outputTokens: 1 } },
      })),
      receiptCharacter: '5',
    }),
    custodyArtifactFixture({
      identity: replay.identity,
      admissionReceiptDigest: replay.admissionRef.admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      artifactClass: 'worker-result',
      artifactKey: `result-${replay.identity.attemptId}`,
      capturedAt: timestampOverrides.result ?? observedAt,
      bytes: Buffer.from('{}'),
      receiptCharacter: '6',
    }),
    custodyArtifactFixture({
      identity: replay.identity,
      admissionReceiptDigest: replay.admissionRef.admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      artifactClass: 'worker-landing-proposal',
      artifactKey: `landing-${replay.identity.attemptId}`,
      capturedAt: timestampOverrides.landing ?? observedAt,
      bytes: Buffer.from(canonicalJson(proposal)),
      receiptCharacter: '7',
    }),
  ];
  const artifactByKey = new Map(artifacts.map(artifact => [
    `${artifact.receipt.artifactClass}:${artifact.receipt.artifactKey}`,
    artifact,
  ]));
  const store = {
    readArtifactReceipt: vi.fn((input: { artifactClass: string; artifactKey: string }) => (
      artifactByKey.get(`${input.artifactClass}:${input.artifactKey}`)?.receipt ?? null
    )),
    readVerifiedArtifact: vi.fn((input: { artifactClass: string; artifactKey: string }) => (
      artifactByKey.get(`${input.artifactClass}:${input.artifactKey}`) ?? null
    )),
  };
  const transactionDigest = digest('8');
  const landingArtifactKey = `effect-landing-${transactionDigest.slice(7, 39)}`;
  const effectProjection = createExecutionEffectResultProjectionV1({
    disposition: 'COMMITTED_NO_CHANGE',
    effectDecisionDigest: digest('9'),
    transactionDigest,
    decisionEffectCount: 0,
    effects: [],
  });
  const effectBinding = createTaskAttemptEffectLandingBindingV2({
    identity: {
      projectId: replay.identity.projectId,
      taskId: replay.identity.taskId,
      attemptId: replay.identity.attemptId,
      generation: replay.identity.generation,
    },
    admissionReceiptDigest: replay.admissionRef.admissionReceiptDigest,
    custodyPolicyDigest: policy.policyDigest,
    landingArtifactKey,
    landingArtifactReceiptDigest: digest('a'),
    landingReceiptDigest: digest('b'),
    effectLandingChainDigest: digest('c'),
    readyLifecycleAuthorityDigest: digest('d'),
    disposition: effectProjection.disposition,
    effectDecisionDigest: effectProjection.effectDecisionDigest,
    transactionDigest,
  });
  const adapter = {
    readLandingRecoveryAnchor: vi.fn(() => ({ transactionDigest })),
    readAcceptedAuthority: vi.fn(() => ({
      projection: effectProjection,
      binding: effectBinding,
    })),
  };
  const scope = {
    store,
    policy,
    identity: replay.identity,
    admissionRef: replay.admissionRef,
    taskSnapshot: {
      material: { dispatch: { scope: { filesWrite: [] } } },
      dispatch: { scopeBaseline, scopeBaselineSha256 },
    },
    provider: 'fixture-provider',
    execution: { executionLandingPolicy: Object.freeze({ state: 'required' }) },
  };
  return Object.freeze({ replay, scope, store, providerExit, adapter, landingArtifactKey });
}

describe('exact Docker custody mounts', () => {
  it('keeps causal custody time ordered when the WSL2 wall clock steps backwards', () => {
    expect(exactDockerCausalObservedAt(
      () => '2026-09-03T06:12:26.740Z',
      '2026-09-03T06:12:28.319Z',
    )).toBe('2026-09-03T06:12:28.319Z');
    expect(exactDockerCausalObservedAt(
      () => '2026-09-03T06:12:29.001Z',
      '2026-09-03T06:12:28.319Z',
    )).toBe('2026-09-03T06:12:29.001Z');
    expect(() => exactDockerCausalObservedAt(
      () => '2026-09-03T06:12:29.001Z',
      'not-a-canonical-timestamp',
    )).toThrow('EXACT_DOCKER_OBSERVATION_INVALID');
  });

  it('admits zero-byte staged effect content without weakening nonempty metadata artifacts', () => {
    const policy = createExactDockerCustodyPolicy();
    expect(policy.artifactLimits['execution-effect-staged-content'].minBytes).toBe(0);
    expect(policy.artifactLimits['pristine-provider-stream'].minBytes).toBe(0);
    expect(policy.artifactLimits['execution-effect-manifest'].minBytes).toBe(1);
    expect(policy.artifactLimits['execution-effect-landing-journal'].minBytes).toBe(1);
    expect(policy.artifactLimits['execution-effect-lifecycle-authority']).toEqual({
      minBytes: 1,
      maxBytes: 64 * 1024 * 1024,
      requireSingleLink: true,
    });
  });

  it('accepts only an exact daemon no-such-container observation as no effect', () => {
    const name = 'deckent-x-attempt-a';
    expect(isExactDockerContainerAbsent({
      status: 1, stdout: '', stderr: `Error: No such object: ${name}`,
    }, name)).toBe(true);
    expect(isExactDockerContainerAbsent({
      status: 1, stdout: '', stderr: `Error response from daemon: No such container: ${name}`,
    }, name)).toBe(true);
    expect(isExactDockerContainerAbsent({
      status: 1, stdout: '[]\n', stderr: `error: no such object: ${name}`,
    }, name)).toBe(true);
    expect(isExactDockerContainerAbsent({
      status: 1, stdout: '[]\n', stderr: `Error: No such object: ${name}`,
    }, name)).toBe(true);
    expect(isExactDockerContainerAbsent({
      status: 1, stdout: '[{}]\n', stderr: `Error: No such object: ${name}`,
    }, name)).toBe(false);
    expect(isExactDockerContainerAbsent({
      status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon',
    }, name)).toBe(false);
    expect(isExactDockerContainerAbsent({
      status: 1, stdout: '', stderr: 'permission denied',
    }, name)).toBe(false);
    expect(isExactDockerContainerAbsent({
      status: 1, stdout: '', stderr: `Error: No such object: ${name}-foreign`,
    }, name)).toBe(false);
  });

  it('accepts only exact local-volume absence and a strict named-volume projection', () => {
    const name = `deckent-xw-${'a'.repeat(48)}`;
    expect(isExactDockerVolumeAbsent({
      status: 1, stdout: '', stderr: `Error: No such volume: ${name}`,
    }, name)).toBe(true);
    expect(isExactDockerVolumeAbsent({
      status: 1,
      stdout: '[]\n',
      stderr: `Error response from daemon: get ${name}: no such volume`,
    }, name)).toBe(true);
    expect(isExactDockerVolumeAbsent({
      status: 1, stdout: '', stderr: `Error: No such volume: ${name}-foreign`,
    }, name)).toBe(false);
    expect(isExactDockerVolumeAbsent({
      status: 1,
      stdout: '[]\n',
      stderr: `Error response from daemon: get ${name}-foreign: no such volume`,
    }, name)).toBe(false);
    expect(isExactDockerVolumeAbsent({
      status: 1,
      stdout: '[{}]\n',
      stderr: `Error response from daemon: get ${name}: no such volume`,
    }, name)).toBe(false);
    expect(isExactDockerVolumeAbsent({
      status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon',
    }, name)).toBe(false);

    expect(parseExactDockerWorkspaceVolumeInspect(JSON.stringify([{
      Name: name,
      Driver: 'local',
      Scope: 'local',
      Labels: { 'io.deckent.exact-custody.managed': 'true' },
      Options: {},
      Mountpoint: `/var/lib/docker/volumes/${name}/_data`,
      CreatedAt: '2026-09-01T00:00:00Z',
    }]))).toEqual({
      name,
      driver: 'local',
      createdAt: '2026-09-01T00:00:00Z',
      scope: 'local',
      labels: { 'io.deckent.exact-custody.managed': 'true' },
      options: {},
      mountpoint: `/var/lib/docker/volumes/${name}/_data`,
    });
    const labels = { 'io.deckent.exact-custody.managed': 'true' };
    const projection = parseExactDockerWorkspaceVolumeInspect(JSON.stringify([{
      Name: name,
      Driver: 'local',
      Scope: 'local',
      Labels: labels,
      Options: null,
      Mountpoint: `/var/lib/docker/volumes/${name}/_data`,
      CreatedAt: '2026-09-01T00:00:00.123456789Z',
    }]));
    expect(projection && verifyExactDockerWorkspaceVolumeInspect(projection, {
      name,
      labels,
      canonicalProjectRoot: '/test/project',
    })).toBe(true);
    expect(projection && verifyExactDockerWorkspaceVolumeInspect(projection, {
      name,
      labels: { ...labels, foreign: 'true' },
      canonicalProjectRoot: '/test/project',
    })).toBe(false);
    expect(parseExactDockerWorkspaceVolumeInspect(JSON.stringify([{
      Name: name, Driver: 'local', Scope: 'local', Labels: labels,
      Options: { type: 'none', device: '/test/project', o: 'bind' },
      Mountpoint: `/var/lib/docker/volumes/${name}/_data`,
      CreatedAt: '2026-09-01T00:00:00Z',
    }]))).toMatchObject({ options: { device: '/test/project', o: 'bind', type: 'none' } });
    const optionAlias = parseExactDockerWorkspaceVolumeInspect(JSON.stringify([{
      Name: name, Driver: 'local', Scope: 'local', Labels: labels,
      Options: { type: 'none', device: '/test/project', o: 'bind' },
      Mountpoint: `/var/lib/docker/volumes/${name}/_data`,
      CreatedAt: '2026-09-01T00:00:00Z',
    }]));
    expect(optionAlias && verifyExactDockerWorkspaceVolumeInspect(optionAlias, {
      name, labels, canonicalProjectRoot: '/test/project',
    })).toBe(false);
    const lexicalAlias = parseExactDockerWorkspaceVolumeInspect(JSON.stringify([{
      Name: name, Driver: 'local', Scope: 'local', Labels: labels,
      Options: null, Mountpoint: '/test/project/.volume',
      CreatedAt: '2026-09-01T00:00:00Z',
    }]));
    expect(lexicalAlias && verifyExactDockerWorkspaceVolumeInspect(lexicalAlias, {
      name, labels, canonicalProjectRoot: '/test/project',
    })).toBe(false);
    expect(parseExactDockerWorkspaceVolumeInspect(JSON.stringify([{
      Name: name, Driver: 'nfs', Scope: 'local', Labels: {}, Options: {}, Mountpoint: '/volume',
      CreatedAt: '2026-09-01T00:00:00Z',
    }]))).toBeNull();
    expect(parseExactDockerWorkspaceVolumeInspect(JSON.stringify([{
      Name: name, Driver: 'local', Scope: 'local', Labels: labels, Options: {},
      Mountpoint: `/var/lib/docker/volumes/${name}/_data`,
    }]))).toBeNull();
    expect(parseExactDockerWorkspaceVolumeInspect(JSON.stringify([{
      Name: name, Driver: 'local', Scope: 'local', Labels: labels, Options: {},
      Mountpoint: `/var/lib/docker/volumes/${name}/_data`, CreatedAt: 'not-a-timestamp',
    }]))).toBeNull();
    const recreated = parseExactDockerWorkspaceVolumeInspect(JSON.stringify([{
      Name: name, Driver: 'local', Scope: 'local', Labels: labels, Options: {},
      Mountpoint: `/var/lib/docker/volumes/${name}/_data`,
      CreatedAt: '2026-09-01T00:00:00.123456788Z',
    }]));
    const volumeIdentityAuthority = {
      labelsDigest: digest('a'),
      resourceInstanceDigest: digest('b'),
      mountPlanDigest: digest('c'),
    } as const;
    expect(projection && recreated
      && exactDockerEffectVolumeIdentity(projection, volumeIdentityAuthority)
        !== exactDockerEffectVolumeIdentity(recreated, volumeIdentityAuthority)).toBe(true);
    expect(projection?.createdAt).toBe('2026-09-01T00:00:00.123456789Z');
    expect(buildExactDockerWorkspaceVolumeCreateArgs(name, labels)).toEqual([
      'volume', 'create', '--driver', 'local', '--label',
      'io.deckent.exact-custody.managed=true', name,
    ]);
  });

  it('accepts one sorted portable snapshot inventory and excludes protected authority trees', () => {
    const inventory = parseExactDockerWorkspaceInventory(Buffer.from(
      'AGENTS.md\0src/core/a.ts\0tests/a.test.ts\0',
      'utf8',
    ));
    expect(inventory).toMatchObject({
      version: 1,
      paths: ['AGENTS.md', 'src/core/a.ts', 'tests/a.test.ts'],
      pathCount: 3,
    });
    expect(inventory?.inventoryDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(parseExactDockerWorkspaceInventory(Buffer.from(
      'src/z.ts\0src/a.ts\0',
      'utf8',
    ))).toBeNull();
    expect(parseExactDockerWorkspaceInventory(Buffer.from(
      '.tasks/task-1.result\0',
      'utf8',
    ))).toBeNull();
    expect(parseExactDockerWorkspaceInventory(Buffer.from(
      'src/Foo.ts\0src/foo.ts\0',
      'utf8',
    ))).toBeNull();
    expect(parseExactDockerWorkspaceInventory(Buffer.alloc(0))).toMatchObject({
      paths: [], pathCount: 0, totalPathBytes: 0,
    });
  });

  it('reads inventory through the bounded async git seam and rejects stderr ambiguity', async () => {
    const bytes = Buffer.from('src/a.ts\0AGENTS.md\0', 'utf8');
    const runner = vi.fn(async () => ({
      status: 0,
      signal: null,
      stdout: bytes,
      stderr: Buffer.alloc(0),
      error: false,
      overflow: false,
    }));
    await expect(readExactDockerWorkspaceInventory('/test/project', runner))
      .resolves.toMatchObject({ paths: ['AGENTS.md', 'src/a.ts'], pathCount: 2 });
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      command: 'git',
      args: ['-C', '/test/project', 'ls-files', '-z', '--cached', '--others',
        '--exclude-standard', '--', '.',
        ':(top,exclude).brain', ':(top,exclude).brain/**',
        ':(top,exclude).deck', ':(top,exclude).deck/**',
        ':(top,exclude).deckent', ':(top,exclude).deckent/**',
        ':(top,exclude).git', ':(top,exclude).git/**',
        ':(top,exclude).locks', ':(top,exclude).locks/**',
        ':(top,exclude).tasks', ':(top,exclude).tasks/**'],
    }));
    await expect(readExactDockerWorkspaceInventory('/test/project', async () => ({
      status: 0,
      signal: null,
      stdout: bytes,
      stderr: Buffer.from('warning'),
      error: false,
      overflow: false,
    }))).resolves.toBeNull();
  });

  it('mounts only the immutable snapshot RO and attempt-private output RW', () => {
    const workspaceVolumeName = `deckent-xw-${'a'.repeat(48)}`;
    const dependencyVolumeName = `deckent-xd-${'b'.repeat(48)}`;
    const args = buildExactDockerCustodyMountArgs({
      taskSnapshot: { sourcePath: '/private/store/snapshot/task.json' },
      workerOutput: { sourcePath: '/private/store/output' },
    } as never, workspaceVolumeName, dependencyVolumeName);

    expect(args).toEqual([
      '--mount',
      `type=volume,src=${workspaceVolumeName},dst=/workspace,volume-nocopy`,
      '--mount',
      `type=volume,src=${dependencyVolumeName},dst=/workspace/node_modules,readonly,volume-nocopy`,
      '--mount',
      'type=bind,src=/private/store/snapshot,dst=/run/deckent/snapshot,readonly,bind-propagation=rprivate',
      '--mount',
      'type=bind,src=/private/store/output,dst=/workspace/.tasks,bind-propagation=rprivate',
    ]);
    expect(args.join(' ')).not.toContain('/test/project/.tasks');
    expect(args.join(' ')).not.toContain('src=/test/project,dst=/workspace');
  });

  it('derives one path-free restart-stable private volume identity per exact admission', () => {
    const identity = {
      schemaVersion: 2 as const,
      backend: 'docker' as const,
      projectRootSha256: '1'.repeat(64),
      projectId: 'project',
      taskId: 'task',
      attemptId: '11111111-1111-4111-8111-111111111111',
      generation: 1,
    };
    const first = exactDockerWorkspaceVolumeName({ identity, admissionRefDigest: digest('a') });
    const replay = exactDockerWorkspaceVolumeName({ identity, admissionRefDigest: digest('a') });
    const sibling = exactDockerWorkspaceVolumeName({
      identity: { ...identity, generation: 2 },
      admissionRefDigest: digest('b'),
    });
    expect(first).toBe(replay);
    expect(first).toMatch(/^deckent-xw-[a-f0-9]{48}$/u);
    expect(sibling).not.toBe(first);
    expect(first).not.toContain('/test/project');
  });

  it('reads the named workspace volume by Docker Name, not daemon host mountpoint', () => {
    const name = `deckent-xw-${'a'.repeat(48)}`;
    const dependencyName = `deckent-xd-${'d'.repeat(48)}`;
    const containerId = 'b'.repeat(64);
    const projection = parseExactDockerCustodyInspect(JSON.stringify([{
      Id: containerId,
      Image: digest('c'),
      Config: {
        Labels: { 'io.deckent.exact-custody.workspace-volume': name },
        Entrypoint: ['node'],
        Cmd: ['--input-type=module', '-e', 'pid1'],
      },
      Mounts: [
        {
          Type: 'volume', Name: name,
          Source: `/var/lib/docker/volumes/${name}/_data`,
          Destination: '/workspace', RW: true, Propagation: '',
        },
        {
          Type: 'volume', Name: dependencyName,
          Source: `/var/lib/docker/volumes/${dependencyName}/_data`,
          Destination: '/workspace/node_modules', RW: false, Propagation: '',
        },
        {
          Type: 'bind', Source: '/private/store/snapshot',
          Destination: '/run/deckent/snapshot', RW: false, Propagation: 'rprivate',
        },
        {
          Type: 'bind', Source: '/private/store/output',
          Destination: '/workspace/.tasks', RW: true, Propagation: 'rprivate',
        },
      ],
    }]));
    expect(projection?.workspaceMount).toMatchObject({
      name,
      source: `/var/lib/docker/volumes/${name}/_data`,
      destination: '/workspace',
      type: 'volume',
      rw: true,
    });
    expect(projection?.dependencyMount).toMatchObject({
      name: dependencyName,
      source: `/var/lib/docker/volumes/${dependencyName}/_data`,
      destination: '/workspace/node_modules',
      type: 'volume',
      rw: false,
    });
    expect(projection?.mounts).toHaveLength(4);
  });

  it('keeps image-owned dependency population bounded and verifies the copied tree', () => {
    const source = exactDockerEffectDependencyHelperSource();
    expect(source).toContain('opendirSync(absolute)');
    expect(source).toContain('if (names.length > MAX_ENTRIES) process.exit(78)');
    expect(source).toContain('readSync(fd, buffer, 0, buffer.length, null)');
    expect(source).toContain('if (stat.size > MAX_FILE_BYTES) process.exit(78)');
    expect(source).not.toContain('stat.nlink');
    expect(source).toContain('cpSync writes');
    expect(source).toContain("update(JSON.stringify(authority.limits), 'utf8')");
    expect(source).toContain('const before = tree(source)');
    expect(source).toContain('const after = tree(destination)');
    expect(source).toContain('before.digest !== after.digest');
    expect(source).toContain('verbatimSymlinks: true');
    expect(source).not.toContain('readFileSync(absolute)');
  });

  it('binds workspace population to equal bounded pre, destination and post content manifests', () => {
    const source = exactDockerEffectPopulationHelperSource();
    const pre = source.indexOf("const sourcePre = scan('/source', true)");
    const copy = source.indexOf('for (const relative of paths)', pre + 1);
    const mountPoints = source.indexOf('for (const relative of infrastructureMountPoints)', copy);
    const rootModeSeal = source.indexOf("chmodSync('/workspace', 0o700)", copy);
    const directoryOwnership = source.indexOf('for (const directory of [...ownedDirectories]', copy);
    const destination = source.indexOf("const destination = scan('/workspace', false)");
    const post = source.indexOf("const sourcePost = scan('/source', false)");
    expect(pre).toBeGreaterThan(0);
    expect(copy).toBeGreaterThan(pre);
    expect(mountPoints).toBeGreaterThan(copy);
    expect(rootModeSeal).toBeGreaterThan(mountPoints);
    expect(rootModeSeal).toBeGreaterThan(copy);
    expect(directoryOwnership).toBeGreaterThan(rootModeSeal);
    expect(destination).toBeGreaterThan(copy);
    expect(post).toBeGreaterThan(destination);
    expect(source).toContain('execution-effect-population-content-manifest-v1');
    expect(source).toContain('inventoryAdmissionReceiptDigest: authority.inventoryAdmissionReceiptDigest');
    expect(source).toContain('sourcePre.digest !== destination.digest');
    expect(source).toContain('destination.digest !== sourcePost.digest');
    expect(source).toContain('totalBytes > MAX_TOTAL_BYTES');
    expect(source).toContain('byteLength > MAX_FILE_BYTES');
    expect(source).toContain('Date.now() > authority.deadlineUnixMs');
    expect(source).toContain("content.update(buffer.subarray(0, count))");
    expect(source).toContain('const entries = retainEntries ? new Map() : null');
    expect(source).toContain("const ownedDirectories = new Set(['/workspace'])");
    expect(source).toContain(
      "const infrastructureMountPoints = Object.freeze(['.locks', '.tasks', 'node_modules'])",
    );
    expect(source).toContain("path === relative || path.startsWith(relative + '/')");
    expect(source).toContain('mkdirSync(absolute, { recursive: false, mode: 0o755 })');
    expect(source).toContain('Number(stat.mode & 0o777n) !== 0o755');
    expect(source).toContain('ownedDirectories.add(absolute)');
    expect(source).toContain('chownSync(destination, authority.workspaceOwnerUid');
    expect(source).toContain("chmodSync('/workspace', 0o700)");
    expect(source).toContain('process.setgroups([])');
    expect(source).toContain('process.setgid(authority.workspaceOwnerGid)');
    expect(source).toContain('process.setuid(authority.workspaceOwnerUid)');
    expect(source).toContain('ownedRoot.uid !== BigInt(authority.workspaceOwnerUid)');
    expect(source).toContain('ownedRoot.gid !== BigInt(authority.workspaceOwnerGid)');
    expect(source).not.toContain("'--cap-add', 'FOWNER'");
    expect(source).toContain('sourcePre.entries.clear()');
    expect(source).toContain("const destination = scan('/workspace', false)");
    expect(source).toContain("const sourcePost = scan('/source', false)");
    expect(source).toContain('if (!Number.isSafeInteger(written) || written <= 0) process.exit(78)');
    expect(source).not.toContain('readFileSync(absolute)');
  });

  it('gives populate and capture helpers an owner-private executable native snapshot tmpfs', () => {
    const source = createExactDockerEffectLifecycleAdapterV1.toString();
    expect(source).toMatch(
      /\.\.\.buildExactDockerNativeSnapshotArgs\(\s*input\.workspaceOwnerUid,\s*input\.workspaceOwnerGid\s*\)/u,
    );
    expect(source).toMatch(/["']--cap-add["'],\s*["']DAC_READ_SEARCH["']/u);
    expect(source.match(/DAC_READ_SEARCH/gu)).toHaveLength(1);
    expect(source).toContain('dst=/source,readonly,bind-propagation=rprivate');
  });

  it('runs exact provider auth phases asynchronously with bounded output and lifetime', () => {
    const source = buildExactDockerRunnerSource({
      taskId: '001',
      model: 'model',
      provider: 'provider',
      invocation: { binary: 'provider-cli', args: [], promptFeed: 'stdin' },
      timeoutSeconds: 120,
      authBootstrapLines: ['true'],
      authWritebackLines: ['true'],
    });
    expect(source).toContain("import { spawn } from 'node:child_process'");
    expect(source).not.toContain('spawnSync');
    expect(source).toContain('SHELL_PHASE_OUTPUT_MAX_BYTES');
    expect(source).toContain('SHELL_PHASE_TIMEOUT_MS');
    expect(source).toContain("child.kill('SIGKILL')");
    expect(source).toContain("child.once('error'");
    expect(source).toContain("child.once('close'");
    expect(source).toContain('await shellPhase(config.authBootstrapLines)');
    expect(source).toContain('await shellPhase(config.authWritebackLines)');
  });

  it('fails exact execution closed before provider or Docker launch when landing policy is absent', () => {
    expect(isExactDockerEffectLandingPolicyAdmitted(null)).toBe(false);
    expect(isExactDockerEffectLandingPolicyAdmitted({ reserve_ratio: 0.25 })).toBe(true);
    expect(isExactDockerEffectLandingPolicyAdmitted({})).toBe(false);
    expect(isExactDockerEffectLandingPolicyAdmitted({ reserve_ratio: 0 })).toBe(false);
    expect(isExactDockerEffectLandingPolicyAdmitted({ reserve_ratio: 1 })).toBe(false);
    expect(isExactDockerEffectLandingPolicyAdmitted({ reserve_ratio: 0.25, foreign: true })).toBe(false);
    expect(isExactDockerEffectLandingPolicyAdmitted(new Proxy({}, {}))).toBe(false);
    const source = DockerSpawnBackend.prototype.dispatchExactDockerCustody.toString();
    const policyGate = source.indexOf('isExactDockerEffectLandingPolicyAdmitted');
    const policyDisposition = source.indexOf('EXECUTION_POLICY_REJECTED');
    const providerAuthGate = source.indexOf('providerAuth.missingRequiredFiles');
    const daemonPreflight = source.indexOf('daemonPreflight');
    expect(policyGate).toBeGreaterThan(0);
    expect(policyDisposition).toBeGreaterThan(policyGate);
    expect(providerAuthGate).toBeGreaterThan(policyDisposition);
    expect(daemonPreflight).toBeGreaterThan(policyDisposition);
  });

  it('binds exact native probe parity and compensation evidence into terminal no-effect truth', () => {
    const nativeManifest = Object.freeze({
      schemaVersion: 1,
      effectContract: Object.freeze({
        abiVersion: '2.1.0',
        trustDomain: 'deckent.execution-effect-linux-v1',
      }),
    });
    expect(verifyExactDockerEffectNativeManifestParity(
      JSON.parse(JSON.stringify(nativeManifest)), nativeManifest,
    )).toBe(true);
    expect(verifyExactDockerEffectNativeManifestParity(
      { ...nativeManifest, extra: true }, nativeManifest,
    )).toBe(false);
    expect(verifyExactDockerEffectNativeManifestParity(
      { ...nativeManifest, effectContract: { ...nativeManifest.effectContract, abiVersion: '2.0.0' } },
      nativeManifest,
    )).toBe(false);
    expect(verifyExactDockerEffectNativeManifestParity(new Proxy({}, {}), nativeManifest)).toBe(false);
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, 'schemaVersion', { enumerable: true, get: () => 1 });
    expect(verifyExactDockerEffectNativeManifestParity(accessor, nativeManifest)).toBe(false);

    const dispatch = DockerSpawnBackend.prototype.dispatchExactDockerCustody.toString();
    expect(dispatch.match(/\.\.\.providerAuth\.mountArgs/gu)).toHaveLength(1);
    expect(dispatch).toMatch(/providerSpec\.binary === ["']claude["']/u);
    expect(dispatch.match(/src=\/dev\/null,dst=/gu)).toHaveLength(1);
    const nativeLoad = dispatch.indexOf('loadExecAuthorityNative');
    const nativeParity = dispatch.indexOf('verifyExactDockerEffectNativeManifestParity');
    const capability = dispatch.indexOf('nativeCapabilityDigest');
    const allocation = dispatch.indexOf('allocateExecutionEffectDockerWorkspaceV1');
    const lifecyclePublication = dispatch.indexOf('publishLifecycleAuthority', allocation);
    const durableAuthorization = dispatch.indexOf(
      'authorizeDurableExecutionEffectDockerAllocationV1',
      lifecyclePublication,
    );
    expect(nativeLoad).toBeGreaterThan(0);
    expect(capability).toBeGreaterThan(nativeLoad);
    expect(allocation).toBeGreaterThan(capability);
    expect(lifecyclePublication).toBeGreaterThan(allocation);
    expect(durableAuthorization).toBeGreaterThan(lifecyclePublication);
    expect(nativeParity).toBeGreaterThan(durableAuthorization);

    const compensate = (DockerSpawnBackend.prototype as unknown as {
      compensateExactDockerEffectPreparation: (...args: unknown[]) => unknown;
    }).compensateExactDockerEffectPreparation.toString();
    expect(compensate).toContain('resources.workspace');
    expect(compensate).toContain('resources.dependency');
    expect(compensate).toContain('readLatestCompensationProgress');
    expect(compensate).toContain('publishCompensationPrepared');
    expect(compensate).toContain('publishCleanupDeleteIntent');
    expect(compensate).toContain('publishCleanupAbsence');
    expect(compensate).toContain('publishCleanupTerminal');
    expect(compensate).toContain('execution-effect-lifecycle-authority');
    expect(compensate).toContain('exactDockerEffectVolumeIdentity(observed, expected)');
    expect(compensate).not.toContain('publishHostArtifact');
    const settle = (DockerSpawnBackend.prototype as unknown as {
      settleExactNoEffect: (...args: unknown[]) => unknown;
    }).settleExactNoEffect.toString();
    expect(settle).toContain('preMountCompensation');
    expect(settle.indexOf('preMountCompensation')).toBeLessThan(
      settle.indexOf('publishAndRereadExactObservation'),
    );
  });

  it('contains only the durable-identity-matched pre-provider container before volume compensation', async () => {
    const attemptId = '23ed8b85-d2e9-8401-8d61-d2dc5b665858';
    const containerName = `deckent-x-${attemptId}`;
    const containerId = 'a'.repeat(64);
    const imageDigest = digest('b');
    const imageReference = `deckent-worker@${imageDigest}`;
    const workspaceVolumeName = `deckent-xw-${'c'.repeat(48)}`;
    const dependencyVolumeName = `deckent-xd-${'d'.repeat(48)}`;
    const rootId = digest('1');
    const scopeDigest = digest('2');
    const releaseNonceSha256 = digest('3');
    const providerInvocationDigest = digest('4');
    const preparedWorkspaceAuthorityDigest = digest('5');
    const workspaceResourceInstanceDigest = digest('6');
    const dependencyResourceInstanceDigest = digest('7');
    const labels = {
      'io.deckent.exact-custody.managed': 'true',
      'io.deckent.exact-custody.root-id': rootId,
      'io.deckent.exact-custody.scope-digest': scopeDigest,
      'io.deckent.exact-custody.effect-op-digest': digest('8'),
      'io.deckent.exact-custody.attempt-id': attemptId,
      'io.deckent.exact-custody.generation': '1',
      'io.deckent.exact-custody.release-nonce-sha256': releaseNonceSha256,
      'io.deckent.exact-custody.provider-invocation-digest': providerInvocationDigest,
      'io.deckent.exact-custody.pid1-sha256': digest('9'),
      'io.deckent.exact-custody.workspace-volume': workspaceVolumeName,
      'io.deckent.exact-custody.dependency-volume': dependencyVolumeName,
      'io.deckent.exact-custody.prepared-workspace-authority':
        preparedWorkspaceAuthorityDigest,
      'io.deckent.exact-custody.workspace-resource-instance':
        workspaceResourceInstanceDigest,
      'io.deckent.exact-custody.dependency-resource-instance':
        dependencyResourceInstanceDigest,
    };
    const inspection = (running: boolean, observedLabels = labels) => JSON.stringify([{
      Id: containerId,
      Name: `/${containerName}`,
      Image: imageDigest,
      Config: { Image: imageReference, Labels: observedLabels },
      State: { Running: running },
    }]);
    const commandResult = (
      status: number,
      stdout: string,
      stderr = '',
    ) => ({
      status, signal: null, stdout: Buffer.from(stdout), stderr: Buffer.from(stderr),
      error: false, overflow: false,
    });
    let inspectCount = 0;
    const exactWorkspaceCommandRunner = vi.fn(async (input: { args: readonly string[] }) => {
      if (input.args[0] === 'inspect') {
        inspectCount += 1;
        if (inspectCount === 1) return commandResult(0, inspection(true));
        if (inspectCount === 2) return commandResult(0, inspection(false));
        return commandResult(1, '', `Error: No such object: ${containerName}`);
      }
      if (input.args[0] === 'stop') return commandResult(0, `${containerId}\n`);
      if (input.args[0] === 'rm') return commandResult(0, `${containerId}\n`);
      throw new Error(`unexpected pre-provider cleanup command: ${input.args.join(' ')}`);
    });
    const backend = new DockerSpawnBackend('/test/project', {
      custodyStateDir: '/test/state', exactWorkspaceCommandRunner,
    });
    const internals = backend as unknown as {
      ensureExactDockerPreProviderContainerAbsent(
        scope: unknown,
        lifecycle: unknown,
        storeAdapter: unknown,
      ): Promise<boolean>;
    };
    const scope = {
      identity: { attemptId, generation: 1 },
      store: { root: { rootId } },
      access: { scopeDigest },
      taskSnapshot: { dispatch: {
        releaseCommitNonceSha256: releaseNonceSha256,
        providerInvocationDigest,
      } },
    };
    const lifecycle = {
      state: 'PROVIDER_START_AUTHORIZED',
      workspacePlan: {
        imageReference,
        imageDigest,
        volumeName: workspaceVolumeName,
        workspaceResourceInstanceDigest,
        dependencyResourceInstanceDigest,
        dependencyPlan: { volumeName: dependencyVolumeName },
      },
    };
    const storeAdapter = {
      readPreparedWorkspace: () => ({ authorityDigest: preparedWorkspaceAuthorityDigest }),
    };
    await expect(internals.ensureExactDockerPreProviderContainerAbsent(
      scope,
      lifecycle,
      storeAdapter,
    )).resolves.toBe(true);
    expect(exactWorkspaceCommandRunner.mock.calls.map(([input]) => input.args[0]))
      .toEqual(['inspect', 'stop', 'inspect', 'rm', 'inspect']);

    const foreignRunner = vi.fn(async () => commandResult(0, inspection(true, {
      ...labels,
      'io.deckent.exact-custody.workspace-resource-instance': digest('f'),
    })));
    const foreignBackend = new DockerSpawnBackend('/test/project', {
      custodyStateDir: '/test/state', exactWorkspaceCommandRunner: foreignRunner,
    }) as unknown as typeof internals;
    await expect(foreignBackend.ensureExactDockerPreProviderContainerAbsent(
      scope,
      lifecycle,
      storeAdapter,
    )).resolves.toBe(false);
    expect(foreignRunner).toHaveBeenCalledTimes(1);
  });

  it('freshly rereads each exact volume generation around helpers and quiescence checks', () => {
    const source = createExactDockerEffectLifecycleAdapterV1.toString();
    expect(source).toMatch(/"run",\s*\.\.\.populate \? \["-i"\] : \[\]/u);
    expect(source).toContain('stdin: populate ? input.inventory.nulDelimitedPaths : Buffer.alloc(0)');
    expect(source).toContain('EXACT_DOCKER_EFFECT_CLOCK_REGRESSION_TOLERANCE_MS');
    expect(source).toContain('return new Date(lastTimestampMs).toISOString()');
    const captureBefore = source.indexOf('const beforeGeneration = await inspectExactVolumeGeneration');
    const helperRun = source.indexOf('const result = await run', captureBefore);
    const captureAfter = source.indexOf('const afterGeneration = await inspectExactVolumeGeneration', helperRun);
    expect(captureBefore).toBeGreaterThan(0);
    expect(helperRun).toBeGreaterThan(captureBefore);
    expect(captureAfter).toBeGreaterThan(helperRun);
    expect(source.indexOf('beforeGeneration.createdAt !== afterGeneration.createdAt', captureAfter))
      .toBeGreaterThan(captureAfter);

    const dependencyBefore = source.indexOf('const beforePopulation = await inspectExactVolumeGeneration');
    const dependencyRun = source.indexOf('const population = await run', dependencyBefore);
    const dependencyAfter = source.indexOf('const afterPopulation = await inspectExactVolumeGeneration', dependencyRun);
    expect(dependencyBefore).toBeGreaterThan(0);
    expect(dependencyRun).toBeGreaterThan(dependencyBefore);
    expect(dependencyAfter).toBeGreaterThan(dependencyRun);
    expect(source.indexOf('afterPopulation.createdAt !== beforePopulation.createdAt', dependencyAfter))
      .toBeGreaterThan(dependencyAfter);

    const exclusivity = source.indexOf('async verifyExclusiveAttachments');
    const exclusiveBefore = source.indexOf('const beforeGeneration = await inspectExactVolumeGeneration', exclusivity);
    const attachmentQuery = source.indexOf('--filter', exclusiveBefore);
    const exclusiveAfter = source.indexOf('const afterGeneration = await inspectExactVolumeGeneration', attachmentQuery);
    expect(exclusivity).toBeGreaterThan(0);
    expect(exclusiveBefore).toBeGreaterThan(exclusivity);
    expect(attachmentQuery).toBeGreaterThan(exclusiveBefore);
    expect(exclusiveAfter).toBeGreaterThan(attachmentQuery);
    expect(source).not.toContain('volumeIdentities');
    expect(source).not.toContain('volumeAuthorities');
    expect(source).toContain('authority.workspacePlan.workspaceLabels');
    expect(source).toContain('authority.dependencyAuthority.volumeIdentityDigest');
  });

  it('writes and rereads cleanup authority before each destructive release effect', () => {
    const release = (DockerSpawnBackend.prototype as unknown as {
      releaseExactDockerEffectLanding: (...args: unknown[]) => unknown;
    }).releaseExactDockerEffectLanding.toString();
    const prepared = release.indexOf('publishReleasePrepared');
    const firstIntent = release.indexOf('publishCleanupDeleteIntent', prepared);
    const containerDelete = release.indexOf('await deleteContainer', firstIntent);
    const firstAbsence = release.indexOf('publishCleanupAbsence', containerDelete);
    const outcomes = release.indexOf('readReleaseOutcomes', firstAbsence);
    const releaseProjection = release.indexOf(
      'projectWorkspaceReleaseFromDurableCleanup',
      outcomes,
    );
    const acceptedLanding = release.indexOf('publishLanding', releaseProjection);
    expect(prepared).toBeGreaterThan(0);
    expect(firstIntent).toBeGreaterThan(prepared);
    expect(containerDelete).toBeGreaterThan(firstIntent);
    expect(firstAbsence).toBeGreaterThan(containerDelete);
    expect(release).toContain('WORKSPACE_VOLUME_DELETE_INTENT');
    expect(release).toContain('DEPENDENCY_VOLUME_DELETE_INTENT');
    expect(release).toContain('DEPENDENCY_VOLUME_ABSENT');
    expect(release).toContain('readReleaseOutcomes');
    expect(outcomes).toBeGreaterThan(firstAbsence);
    expect(releaseProjection).toBeGreaterThan(outcomes);
    expect(acceptedLanding).toBeGreaterThan(releaseProjection);
    expect(release).toContain('readLatestReleaseProgress');
    expect(release).toContain('deleteIntentDigest');
    expect(release).not.toContain('landingReceiptDigest,\n        deletedAt');
  });

  it('durably anchors terminal landing recovery before release can begin', () => {
    const commit = (DockerSpawnBackend.prototype as unknown as {
      commitExactDockerEffectLanding: (...args: unknown[]) => unknown;
    }).commitExactDockerEffectLanding.toString();
    const terminal = commit.indexOf('createExactDockerEffectTerminalSeal');
    const context = commit.indexOf('createExactDockerEffectLandingRecoveryContext', terminal);
    const publish = commit.indexOf('publishLandingRecoveryAnchor', context);
    const reread = commit.indexOf('readLandingRecoveryAnchor', publish);
    expect(terminal).toBeGreaterThan(0);
    expect(context).toBeGreaterThan(terminal);
    expect(publish).toBeGreaterThan(context);
    expect(reread).toBeGreaterThan(publish);
  });

  it('keeps PID1 provider creation behind the one-shot post-settlement start gate', () => {
    const source = exactDockerCustodyPid1Source();
    const armedAck = source.indexOf('exact-docker-pid1-release-armed-ack');
    const startRead = source.indexOf('readFileSync(providerStartPath)');
    const startAck = source.indexOf('exact-docker-pid1-provider-start-ack');
    const earlyCommitGuard = source.indexOf('existsSync(executionCommitPath)');
    const executionCommitRead = source.indexOf(
      'readNonce(executionCommitPath, dispatch.executionCommitNonceSha256)',
    );
    const providerSpawn = source.indexOf("spawn(process.execPath, ['/run/deckent/runner.mjs']");
    const executionAck = source.indexOf('exact-docker-pid1-provider-execution-ack');
    expect(armedAck).toBeGreaterThan(0);
    expect(startRead).toBeGreaterThan(armedAck);
    expect(startAck).toBeGreaterThan(startRead);
    expect(earlyCommitGuard).toBeLessThan(startAck);
    expect(executionCommitRead).toBeGreaterThan(startAck);
    expect(providerSpawn).toBeGreaterThan(startAck);
    expect(providerSpawn).toBeGreaterThan(executionCommitRead);
    expect(executionAck).toBeGreaterThan(providerSpawn);
    expect(source.indexOf("child.once('spawn'", providerSpawn)).toBeGreaterThan(providerSpawn);
    expect(source.indexOf('providerState: \'STARTED\'', executionAck)).toBeGreaterThan(executionAck);
    expect(source).toContain('/^[a-f0-9]{64}$/');
    expect(source).toContain('ownKeys.length !== keys.length');
  });

  it('loads native custody only from trusted image code, never mutable workspace bytes', () => {
    const source = exactDockerCustodyNativeProbeSource();
    expect(source).toContain("from '/app/dist/core/exec-authority-native.js'");
    expect(source).toContain("'/app/native/exec-authority/build/Release'");
    expect(source).toContain("path: '/run/deckent/snapshot'");
    expect(source).toContain("name: 'task.json'");
    expect(source).toContain("path: '/workspace/.tasks'");
    expect(source).toContain("path: '/workspace'");
    expect(source).toContain('execution-effect-docker-mount-separation-v1');
    expect(source).not.toContain('prove-root-separation');
    expect(source).not.toContain('/workspace/dist');
    expect(source).not.toContain('/workspace/native');
    expect(buildExactDockerNativeSnapshotArgs()).toEqual([
      '-e', 'TMPDIR=/run/deckent-native-snapshot',
      '--tmpfs', '/run/deckent-native-snapshot:rw,exec,nosuid,nodev,size=2m,mode=0700',
    ]);
    expect(buildExactDockerNativeSnapshotArgs(1000, 1000)).toEqual([
      '-e', 'TMPDIR=/run/deckent-native-snapshot',
      '--tmpfs',
      '/run/deckent-native-snapshot:rw,exec,nosuid,nodev,size=2m,mode=0700,uid=1000,gid=1000',
    ]);
    expect(() => buildExactDockerNativeSnapshotArgs(1000)).toThrow('EXACT_DOCKER_INPUT_INVALID');
    expect(() => buildExactDockerNativeSnapshotArgs(-1, 1000)).toThrow(
      'EXACT_DOCKER_INPUT_INVALID',
    );
  });

  it('rejects missing, wrong and early execution commits and delivers only after durable reread', async () => {
    const commit = Buffer.alloc(32, 0x33);
    const commitDigest = `sha256:${createHash('sha256').update(commit).digest('hex')}` as const;
    expect(verifyExactDockerExecutionCommit(commit, commitDigest)).toBe(true);
    expect(verifyExactDockerExecutionCommit(Buffer.alloc(0), commitDigest)).toBe(false);
    expect(verifyExactDockerExecutionCommit(Buffer.alloc(32, 0x44), commitDigest)).toBe(false);

    const order: string[] = [];
    const exactWorkspaceCommandRunner = vi.fn(async (input: { stdin: Uint8Array }) => {
      order.push('raw-commit');
      return {
        status: 0, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0),
        error: false, overflow: false, input,
      };
    });
    const backend = new DockerSpawnBackend('/test/project', {
      custodyStateDir: '/test/state', exactWorkspaceCommandRunner,
    });
    const providerStartToken = Buffer.alloc(32, 0x55);
    const authorization = {
      schemaVersion: 2,
      kind: 'exact-docker-provider-start-authorization',
      nonce: providerStartToken.toString('hex'),
      admissionRefDigest: digest('1'),
      taskSnapshotSha256: digest('2'),
      providerInvocationDigest: digest('3'),
      authorityLabelsDigest: digest('4'),
      executionCommitNonceSha256: commitDigest,
      providerExecutionAttemptId: 'provider-attempt-1',
      providerExecutionAttemptIdentityDigest: digest('5'),
      dispatchReceiptDigest: digest('6'),
      releaseReceiptRef: digest('7'),
      releaseReceiptDigest: digest('8'),
      projectionFence: digest('9'),
    } as const;
    const startBundle = {
      schemaVersion: 2,
      kind: 'exact-docker-provider-start',
      admissionRefDigest: authorization.admissionRefDigest,
      containerId: 'a'.repeat(64),
      taskSnapshotSha256: authorization.taskSnapshotSha256,
      providerInvocationDigest: authorization.providerInvocationDigest,
      authorityLabelsDigest: authorization.authorityLabelsDigest,
      providerStartNonceSha256: `sha256:${createHash('sha256').update(providerStartToken).digest('hex')}`,
      executionCommitNonceSha256: commitDigest,
      providerExecutionAttemptId: authorization.providerExecutionAttemptId,
      providerExecutionAttemptIdentityDigest: authorization.providerExecutionAttemptIdentityDigest,
      dispatchReceiptDigest: authorization.dispatchReceiptDigest,
      releaseReceiptRef: authorization.releaseReceiptRef,
      releaseReceiptDigest: authorization.releaseReceiptDigest,
      projectionFence: authorization.projectionFence,
      startAuthorizationDigest: `sha256:${createHash('sha256').update(canonicalJson(authorization)).digest('hex')}`,
      pid1StartAckDigest: digest('a'),
      state: 'START_AUTHORIZATION_ACCEPTED',
      providerState: 'NOT_STARTED',
      observedAt: '2026-09-01T00:00:01.000Z',
    } as const;
    const bytes = Buffer.from(canonicalJson(startBundle));
    const observation = { receiptDigest: digest('b'), evidenceDigest: digest('c'), bytes };
    const store = {
      readDispatchObservation: vi.fn(() => {
        order.push('durable-reread');
        return {
          receipt: { receiptDigest: observation.receiptDigest, evidenceDigest: observation.evidenceDigest },
          bytes,
        };
      }),
    };
    const deliver = (backend as unknown as {
      deliverExactDockerExecutionCommit(
        scope: unknown, launch: unknown, containerId: string,
        observed: unknown, bundle: unknown,
      ): Promise<void>;
    }).deliverExactDockerExecutionCommit.bind(backend);
    await deliver({
      store,
      admissionRef: { refDigest: authorization.admissionRefDigest },
      admission: { taskSnapshot: { sha256: authorization.taskSnapshotSha256 } },
      policy: {},
    }, {
      providerStartToken,
      executionCommitToken: commit,
    }, startBundle.containerId, observation, startBundle);
    expect(order).toEqual(['durable-reread', 'raw-commit']);
    expect(exactWorkspaceCommandRunner).toHaveBeenLastCalledWith(expect.objectContaining({
      command: 'docker', stdin: commit,
    }));

    exactWorkspaceCommandRunner.mockClear();
    const failingStore = { readDispatchObservation: vi.fn(() => { throw new Error('lost'); }) };
    await expect(deliver({
      store: failingStore,
      admissionRef: { refDigest: authorization.admissionRefDigest },
      admission: { taskSnapshot: { sha256: authorization.taskSnapshotSha256 } },
      policy: {},
    }, {
      providerStartToken,
      executionCommitToken: commit,
    }, startBundle.containerId, observation, startBundle)).rejects.toThrow(/lost/);
    expect(exactWorkspaceCommandRunner).not.toHaveBeenCalled();
  });

  it('behaviorally rejects missing, extra and wrong raw start authorizations before PID1 ack', () => {
    const nonce = Buffer.alloc(32, 0x11);
    const nonceSha256 = `sha256:${createHash('sha256').update(nonce).digest('hex')}`;
    const expected = {
      admissionRefDigest: digest('1'),
      taskSnapshotSha256: digest('2'),
      providerInvocationDigest: digest('3'),
      authorityLabelsDigest: digest('4'),
      providerStartNonceSha256: nonceSha256,
      executionCommitNonceSha256: digest('a'),
    } as const;
    const authorization = {
      schemaVersion: 2,
      kind: 'exact-docker-provider-start-authorization',
      nonce: nonce.toString('hex'),
      admissionRefDigest: expected.admissionRefDigest,
      taskSnapshotSha256: expected.taskSnapshotSha256,
      providerInvocationDigest: expected.providerInvocationDigest,
      authorityLabelsDigest: expected.authorityLabelsDigest,
      executionCommitNonceSha256: expected.executionCommitNonceSha256,
      providerExecutionAttemptId: 'provider-attempt-1',
      providerExecutionAttemptIdentityDigest: digest('5'),
      dispatchReceiptDigest: digest('6'),
      releaseReceiptRef: digest('7'),
      releaseReceiptDigest: digest('8'),
      projectionFence: digest('9'),
    };
    const hash = (bytes: Uint8Array): string =>
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    expect(verifyExactDockerProviderStartAuthorization(authorization, expected, hash)).toBe(true);
    for (const key of Object.keys(authorization)) {
      const missing = { ...authorization } as Record<string, unknown>;
      delete missing[key];
      expect(
        verifyExactDockerProviderStartAuthorization(missing, expected, hash),
        `missing ${key}`,
      ).toBe(false);
    }
    expect(verifyExactDockerProviderStartAuthorization(
      { ...authorization, nonce: Buffer.alloc(32, 0x22).toString('hex') }, expected, hash,
    )).toBe(false);
    expect(verifyExactDockerProviderStartAuthorization(
      { ...authorization, extraNonce: authorization.nonce }, expected, hash,
    )).toBe(false);
    const source = exactDockerCustodyPid1Source();
    expect(source.indexOf('verifyProviderStartAuthorization(authorization'))
      .toBeLessThan(source.indexOf('exact-docker-pid1-provider-start-ack'));
    expect(source.indexOf('exact-docker-pid1-provider-start-ack'))
      .toBeLessThan(source.indexOf("spawn(process.execPath, ['/run/deckent/runner.mjs']"));
  });

  it('snapshots nested prepare authority without invoking accessors or retaining caller mutation', () => {
    const task = JSON.parse(budgetedDockerTaskJson('/test/project/.tasks/task-task.json')) as
      Record<string, unknown>;
    task.assignedWorker = 'worker-task';
    const approved = { taskId: 'task', authority: 'approved' };
    const lineage = { ordinal: 1 };
    const execution = {
      allowedTools: null,
      availableTools: null,
      authMode: 'subscription',
      isolatedContext: true,
      reasoningEffort: null,
      excludeDynamicPromptSections: false,
      taskTimeoutSeconds: 120,
      actionId: null,
      executionBudget: { maxTurns: 1 },
      executionLandingPolicy: null,
      executionAdmissionMode: null,
      executionApprovalEvidenceRef: null,
      finalOnlyUsageContainment: null,
    };
    const promptDelivery = promptDeliveryAuthorityFixture(task);
    const input = {
      dispatchRequestId: `dreq-${'1'.repeat(64)}`,
      projectId: 'project',
      taskId: 'task',
      approvedTaskMaterial: approved,
      approvedTaskMaterialDigest: `sha256:${createHash('sha256').update(canonicalJson(approved)).digest('hex')}`,
      dispatchTaskMaterial: task,
      dispatchTaskMaterialDigest: `sha256:${createHash('sha256').update(canonicalJson(task)).digest('hex')}`,
      lineageMaterial: lineage,
      lineageMaterialDigest: `sha256:${createHash('sha256').update(canonicalJson(lineage)).digest('hex')}`,
      prompt: promptDelivery.prompt,
      promptDeliveryAuthority: promptDelivery.authority,
      systemPromptCore: null,
      model: 'claude-sonnet-5',
      execution,
      predecessor: null,
    };
    const snapshotted = parseExactDockerCustodyPrepareInput(input);
    expect(snapshotted).not.toBeNull();
    (task.scope as { filesWrite: string[] }).filesWrite.push('foreign.ts');
    execution.executionBudget.maxTurns = 99;
    expect((snapshotted!.dispatchTaskMaterial as typeof task).scope).toEqual({
      directories: [], filesRead: [], filesWrite: [],
    });
    expect(snapshotted!.execution.executionBudget).toEqual({ maxTurns: 1 });
    const immutableTask = JSON.parse(canonicalJson(snapshotted!.dispatchTaskMaterial));
    const immutableInput = {
      ...input,
      dispatchTaskMaterial: immutableTask,
      dispatchTaskMaterialDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(immutableTask)).digest('hex')}`,
    };

    let getterCalls = 0;
    const accessorExecution = { ...execution } as Record<string, unknown>;
    Object.defineProperty(accessorExecution, 'allowedTools', {
      enumerable: true,
      get: () => { getterCalls += 1; return null; },
    });
    expect(parseExactDockerCustodyPrepareInput({ ...immutableInput, execution: accessorExecution }))
      .toBeNull();
    expect(getterCalls).toBe(0);
    const proxiedScope = new Proxy({ directories: [], filesRead: [], filesWrite: [] }, {});
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      dispatchTaskMaterial: { ...immutableTask, scope: proxiedScope },
    })).toBeNull();
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      execution: { ...execution, extraAuthority: true },
    })).toBeNull();
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      execution: { ...execution, executionLandingPolicy: {} },
    })).toBeNull();
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      execution: {
        ...execution,
        executionLandingPolicy: { reserve_ratio: 0.25, foreignAuthority: true },
      },
    })).toBeNull();
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      dispatchTaskMaterial: { ...immutableTask, assignedWorker: 7 },
    })).toBeNull();
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      dispatchTaskMaterial: {
        ...immutableTask,
        verification: { version: 1, source: 'planner', commands: 7 },
      },
    })).toBeNull();

    const oversizedArray = new Array(25_001).fill(null);
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      approvedTaskMaterial: oversizedArray,
      approvedTaskMaterialDigest: digest('f'),
    })).toBeNull();
    const oversizedObject = Object.fromEntries(
      Array.from({ length: 4_097 }, (_, index) => [`key-${index}`, null]),
    );
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      lineageMaterial: oversizedObject,
      lineageMaterialDigest: digest('f'),
    })).toBeNull();
    const sparse = [] as unknown[];
    sparse.length = 25_001;
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      lineageMaterial: sparse,
      lineageMaterialDigest: digest('f'),
    })).toBeNull();

    for (const key of Object.keys(promptDelivery.authority)) {
      const missing = { ...promptDelivery.authority } as Record<string, unknown>;
      delete missing[key];
      expect(parseExactDockerCustodyPrepareInput({
        ...immutableInput,
        promptDeliveryAuthority: missing,
      }), `missing prompt authority ${key}`).toBeNull();
      expect(parseExactDockerCustodyPrepareInput({
        ...immutableInput,
        promptDeliveryAuthority: { ...promptDelivery.authority, [key]: 'foreign' },
      }), `foreign prompt authority ${key}`).toBeNull();
    }
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      promptDeliveryAuthority: { ...promptDelivery.authority, extra: true },
    })).toBeNull();
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      promptDeliveryAuthority: new Proxy({ ...promptDelivery.authority }, {}),
    })).toBeNull();
    let promptGetterCalls = 0;
    const accessorAuthority = { ...promptDelivery.authority } as Record<string, unknown>;
    Object.defineProperty(accessorAuthority, 'basePromptSha256', {
      enumerable: true,
      get: () => { promptGetterCalls += 1; return promptDelivery.authority.basePromptSha256; },
    });
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      promptDeliveryAuthority: accessorAuthority,
    })).toBeNull();
    expect(promptGetterCalls).toBe(0);
    for (const [field, value] of [
      ['ordinal', 9],
      ['tier', 'T1'],
      ['kind', 'foreign-kind'],
      ['contentSha256', digest('f')],
      ['byteLength', 999],
    ] as const) {
      const segmentMismatch = JSON.parse(canonicalJson(promptDelivery.authority));
      segmentMismatch.segmentManifest[0][field] = value;
      expect(parseExactDockerCustodyPrepareInput({
        ...immutableInput,
        promptDeliveryAuthority: segmentMismatch,
      }), `segment ${field}`).toBeNull();
    }
    let segmentGetterCalls = 0;
    const manifestWithAccessor = promptDelivery.authority.segmentManifest.map(entry => ({ ...entry }));
    Object.defineProperty(manifestWithAccessor[0], 'contentSha256', {
      enumerable: true,
      get: () => {
        segmentGetterCalls += 1;
        return promptDelivery.authority.segmentManifest[0]!.contentSha256;
      },
    });
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      promptDeliveryAuthority: {
        ...promptDelivery.authority,
        segmentManifest: manifestWithAccessor,
      },
    })).toBeNull();
    expect(segmentGetterCalls).toBe(0);
    expect(parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      prompt: `${promptDelivery.prompt} mutated`,
    })).toBeNull();
    const mutableAuthority = JSON.parse(canonicalJson(promptDelivery.authority));
    const authoritySnapshot = parseExactDockerCustodyPrepareInput({
      ...immutableInput,
      promptDeliveryAuthority: mutableAuthority,
    });
    expect(authoritySnapshot).not.toBeNull();
    mutableAuthority.deliveredSkillIds.push('mutated-after-call');
    expect(authoritySnapshot!.promptDeliveryAuthority.deliveredSkillIds).toEqual([]);
  });

  it('binds actual segment order and rendered delivery without assignment phantom credit', () => {
    const task = JSON.parse(budgetedDockerTaskJson('/test/project/.tasks/task-task.json')) as
      Record<string, unknown>;
    task.assignedWorker = 'worker-task';
    task.assignedAgent = 'backend-specialist';
    task.assignedSkills = ['ä-skill', 'agent-named-skill', 'z-skill', 'delivered-skill'];
    task.forceSkills = ['delivered-skill'];
    const segments = [
      { tier: 'T1' as const, kind: 'skills', content: '--- delivered-skill ---\nbody' },
      { tier: 'T0' as const, kind: 'worker-contract', content: 'worker contract' },
      { tier: 'T2' as const, kind: 'task', content: 'bounded task' },
    ];
    const delivery = promptDeliveryAuthorityFixture(task, segments);
    expect(delivery.authority.segmentManifest.map(entry => entry.tier))
      .toEqual(['T1', 'T0', 'T2']);
    expect(delivery.authority.deliveredAgentId).toBeNull();
    expect(delivery.authority.rolePolicyIdentity).toBe('worker:backend-specialist');
    expect(delivery.authority.assignedSkillIds)
      .toEqual(['agent-named-skill', 'delivered-skill', 'z-skill', 'ä-skill']);
    expect(delivery.authority.deliveredSkillIds).toEqual(['delivered-skill']);

    const approved = { taskId: 'task' };
    const lineage = { ordinal: 1 };
    const input = {
      dispatchRequestId: `dreq-${'b'.repeat(64)}`,
      projectId: 'project', taskId: 'task',
      approvedTaskMaterial: approved,
      approvedTaskMaterialDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(approved)).digest('hex')}`,
      dispatchTaskMaterial: task,
      dispatchTaskMaterialDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(task)).digest('hex')}`,
      lineageMaterial: lineage,
      lineageMaterialDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(lineage)).digest('hex')}`,
      prompt: delivery.prompt,
      promptDeliveryAuthority: delivery.authority,
      systemPromptCore: null,
      model: 'claude-sonnet-5',
      execution: {
        allowedTools: null, availableTools: null, authMode: 'subscription',
        isolatedContext: true, reasoningEffort: null,
        excludeDynamicPromptSections: false, taskTimeoutSeconds: 120,
        actionId: null, executionBudget: null, executionLandingPolicy: null,
        executionAdmissionMode: null, executionApprovalEvidenceRef: null,
        finalOnlyUsageContainment: null,
      },
      predecessor: null,
    };
    expect(parseExactDockerCustodyPrepareInput(input)).not.toBeNull();
    expect(() => createExactDockerPromptDeliveryAuthority({
      taskId: 'task', prompt: 'bounded task',
      promptCompilePlanId: String(task.promptCompilePlanId),
      rolePolicyIdentity: 'worker:backend-specialist',
      assignedAgentId: 'backend-specialist',
      forcedSkillIds: ['missing-forced-skill'],
      segments: [{ tier: 'T2', kind: 'task', content: 'bounded task' }],
    })).toThrow(/PROMPT_DELIVERY_AUTHORITY_HOLD/);
    expect(() => createExactDockerPromptDeliveryAuthority({
      taskId: 'task', prompt: 'bounded task',
      promptCompilePlanId: String(task.promptCompilePlanId),
      rolePolicyIdentity: `worker:${'a'.repeat(257)}`,
      assignedAgentId: 'a'.repeat(257),
      segments: [{ tier: 'T2', kind: 'task', content: 'bounded task' }],
    })).toThrow(/EXACT_DOCKER_INPUT_INVALID/);
    expect(() => createExactDockerPromptDeliveryAuthority({
      taskId: 'task', prompt: `=== Agent: ${'a'.repeat(257)} ===\npersona`,
      promptCompilePlanId: String(task.promptCompilePlanId),
      rolePolicyIdentity: 'worker:generic',
      segments: [{
        tier: 'T1', kind: 'persona',
        content: `=== Agent: ${'a'.repeat(257)} ===\npersona`,
      }],
    })).toThrow(/EXACT_DOCKER_INPUT_INVALID/);
    const changedTask = { ...task, forceSkills: ['missing-forced-skill'] };
    expect(parseExactDockerCustodyPrepareInput({
      ...input,
      dispatchTaskMaterial: changedTask,
      dispatchTaskMaterialDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(changedTask)).digest('hex')}`,
    })).toBeNull();
    const absent = { ...input } as Record<string, unknown>;
    delete absent.promptDeliveryAuthority;
    expect(parseExactDockerCustodyPrepareInput(absent)).toBeNull();
    const noCompilePlanTask = { ...task } as Record<string, unknown>;
    delete noCompilePlanTask.promptCompilePlanId;
    expect(parseExactDockerCustodyPrepareInput({
      ...input,
      dispatchTaskMaterial: noCompilePlanTask,
      dispatchTaskMaterialDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(noCompilePlanTask)).digest('hex')}`,
    })).toBeNull();
  });

  it('rejects every missing, extra, foreign or mutated provider-start ack field', () => {
    const digest = (character: string) => `sha256:${character.repeat(64)}`;
    const expected = {
      admissionRefDigest: digest('1'),
      taskSnapshotSha256: digest('2'),
      providerInvocationDigest: digest('3'),
      authorityLabelsDigest: digest('4'),
      providerStartNonceSha256: digest('5'),
      executionCommitNonceSha256: digest('b'),
      providerExecutionAttemptId: 'provider-attempt-1',
      providerExecutionAttemptIdentityDigest: digest('6'),
      dispatchReceiptDigest: digest('7'),
      releaseReceiptRef: digest('8'),
      releaseReceiptDigest: digest('9'),
      projectionFence: digest('a'),
      startAuthorizationDigest: digest('b'),
    } as const;
    const ack = {
      schemaVersion: 2,
      kind: 'exact-docker-pid1-provider-start-ack',
      ...expected,
      state: 'START_AUTHORIZATION_ACCEPTED',
      providerState: 'NOT_STARTED',
    } as const;
    expect(verifyExactDockerProviderStartAck(ack, expected)).toBe(true);
    for (const key of Object.keys(ack)) {
      const missing = { ...ack } as Record<string, unknown>;
      delete missing[key];
      expect(verifyExactDockerProviderStartAck(missing, expected), key).toBe(false);
      expect(verifyExactDockerProviderStartAck({
        ...ack,
        [key]: key === 'schemaVersion' ? 3 : `foreign-${String(ack[key as keyof typeof ack])}`,
      }, expected), key).toBe(false);
    }
    expect(verifyExactDockerProviderStartAck({ ...ack, extra: true }, expected)).toBe(false);
  });

  it('accepts provider execution only from the strict post-spawn PID1 acknowledgement', () => {
    const expected = {
      admissionRefDigest: digest('1'),
      taskSnapshotSha256: digest('2'),
      providerInvocationDigest: digest('3'),
      authorityLabelsDigest: digest('4'),
      executionCommitNonceSha256: digest('5'),
      providerExecutionAttemptId: 'provider-attempt-1',
      providerExecutionAttemptIdentityDigest: digest('6'),
      dispatchReceiptDigest: digest('7'),
      releaseReceiptRef: digest('8'),
      releaseReceiptDigest: digest('9'),
      projectionFence: digest('a'),
      startAuthorizationDigest: digest('b'),
      providerStartAckBytesSha256: digest('c'),
    } as const;
    const ack = {
      schemaVersion: 2,
      kind: 'exact-docker-pid1-provider-execution-ack',
      ...expected,
      childPid: 17,
      state: 'PROVIDER_PROCESS_SPAWNED',
      providerState: 'STARTED',
    } as const;
    expect(verifyExactDockerProviderExecutionAck(ack, expected)).toBe(true);
    for (const key of Object.keys(ack)) {
      const missing = { ...ack } as Record<string, unknown>;
      delete missing[key];
      expect(verifyExactDockerProviderExecutionAck(missing, expected), key).toBe(false);
    }
    expect(verifyExactDockerProviderExecutionAck({ ...ack, childPid: 0 }, expected)).toBe(false);
    expect(verifyExactDockerProviderExecutionAck({ ...ack, childPid: 1.5 }, expected)).toBe(false);
    expect(verifyExactDockerProviderExecutionAck({ ...ack, extra: true }, expected)).toBe(false);
  });

  it('orders Store settlement and reread before start delivery and durable start before release', () => {
    const source = DockerSpawnBackend.prototype.dispatchExactDockerCustody.toString();
    const settle = source.indexOf('settleReleasedDispatch');
    const reread = source.indexOf('readDispatchAuthority', settle);
    const startWrite = source.indexOf('EXACT_DOCKER_PROVIDER_START_FILE', reread);
    const startObservation = source.indexOf('PROVIDER_START', startWrite);
    const executionAckObserver = source.indexOf(
      'beginExactDockerProviderExecutionAckObservation', startObservation,
    );
    const executionCommit = source.indexOf('deliverExactDockerExecutionCommit', startObservation);
    const executionObservationPublication = source.indexOf(
      'observeExactDockerProviderExecution', executionCommit,
    );
    const durableStartReceipt = source.indexOf('exactCustodyProviderStarts.set', executionCommit);
    expect(settle).toBeGreaterThan(0);
    expect(reread).toBeGreaterThan(settle);
    expect(startWrite).toBeGreaterThan(reread);
    expect(startObservation).toBeGreaterThan(startWrite);
    expect(executionAckObserver).toBeGreaterThan(startObservation);
    expect(executionAckObserver).toBeLessThan(executionCommit);
    expect(executionCommit).toBeGreaterThan(startObservation);
    expect(executionObservationPublication).toBeGreaterThan(executionCommit);
    expect(durableStartReceipt).toBeGreaterThan(executionObservationPublication);
    expect(source).toContain('EXACT_DOCKER_PROVIDER_START_RECONCILIATION_REQUIRED');
    expect(source).not.toContain('this.spawn(');
  });

  it('keeps unknown daemon/permission inspect failures UNKNOWN during reconciliation', () => {
    const source = (DockerSpawnBackend.prototype as unknown as {
      recordExactAmbiguity: (...args: unknown[]) => unknown;
    }).recordExactAmbiguity.toString();
    expect(source).toContain('isExactDockerContainerAbsent(projectedInspection, inspectSelector)');
    expect(source).not.toContain("inspected.status !== 0 ? 'ABSENT'");
    expect(isExactDockerContainerAbsent({
      status: 1, stdout: '', stderr: 'permission denied by daemon',
    }, 'container-1')).toBe(false);
  });

  it('keeps pre-release reconciliation evidence internally consistent', async () => {
    const attemptId = 'attempt-release-not-started';
    const admissionRef = {
      dispatchRequestId: 'dreq-release-not-started',
      identity: {
        schemaVersion: 2 as const,
        backend: 'docker' as const,
        projectRootSha256: digest('1'),
        projectId: digest('1'),
        taskId: 'task-release-not-started',
        attemptId,
        generation: 1,
      },
      reservationReceiptDigest: digest('2'),
      admissionReceiptDigest: digest('3'),
      dispatchRequestMaterialDigest: digest('4'),
      refDigest: digest('5'),
    };
    let observationBytes = new Uint8Array();
    let reconciliationEvidence: Record<string, unknown> | null = null;
    const backend = new DockerSpawnBackend('/test/project', {
      custodyStateDir: '/test/state',
      exactWorkspaceCommandRunner: async input => ({
        status: 1,
        stdout: Buffer.from('[]\n'),
        stderr: Buffer.from(`error: no such object: ${input.args.at(-1)}`),
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false,
      }),
    });
    const store = {
      publishDispatchObservation: vi.fn((input: { bytes: Uint8Array }) => {
        observationBytes = Uint8Array.from(input.bytes);
        return { receiptDigest: digest('6'), evidenceDigest: digest('7') };
      }),
      readDispatchObservation: vi.fn(() => ({
        receipt: {
          receiptDigest: digest('6'),
          evidenceDigest: digest('7'),
          observedAt: '2026-09-03T00:00:00.000Z',
        },
        bytes: observationBytes,
      })),
      recordAmbiguousDispatch: vi.fn((input: {
        reconciliationEvidence: Record<string, unknown>;
        reasonCode: string;
      }) => {
        reconciliationEvidence = input.reconciliationEvidence;
        return {
          reasonCode: input.reasonCode,
          reconciliationRef: digest('8'),
          receiptDigest: digest('9'),
        };
      }),
    };
    const scope = {
      identity: admissionRef.identity,
      admission: { admittedAt: '2026-09-03T00:00:00.000Z' },
      admissionRef,
      policy: {},
      store,
      state: 'PREPARED',
      mountTransferReceipt: null,
      launch: {
        spawnOutcome: null,
        releaseCommitTokenSha256: digest('a'),
        providerInvocationDigest: digest('b'),
      },
    };
    await (backend as unknown as {
      recordExactAmbiguity(
        scope: typeof scope,
        reasonCode: 'MOUNT_RECONCILIATION_REQUIRED',
        releaseState: 'NOT_ATTEMPTED',
      ): Promise<unknown>;
    }).recordExactAmbiguity(scope, 'MOUNT_RECONCILIATION_REQUIRED', 'NOT_ATTEMPTED');

    const observation = JSON.parse(Buffer.from(observationBytes).toString('utf8')) as {
      releaseNonceDigest: unknown;
      providerInvocationDigest: unknown;
    };
    expect(observation.releaseNonceDigest).toBeNull();
    expect(observation.providerInvocationDigest).toBeNull();
    expect(reconciliationEvidence).toMatchObject({
      releaseState: 'NOT_ATTEMPTED',
      releaseNonceDigest: null,
      providerInvocationDigest: null,
    });
  });

  it('rejects corrupt Store observation bytes or receipt evidence before release projection', () => {
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const invoke = (mode: 'clean' | 'receipt' | 'bytes') => {
      let published = new Uint8Array();
      const store = {
        publishDispatchObservation: vi.fn((input: { bytes: Uint8Array }) => {
          published = Uint8Array.from(input.bytes);
          return { receiptDigest: digest('1'), evidenceDigest: digest('2') };
        }),
        readDispatchObservation: vi.fn(() => ({
          receipt: { receiptDigest: digest('1'), evidenceDigest: mode === 'receipt' ? digest('9') : digest('2') },
          bytes: mode === 'bytes' ? Buffer.from('{"forged":true}') : published,
        })),
      };
      return (backend as unknown as {
        publishAndRereadExactObservation(
          scope: unknown, observationClass: string, bundle: object, observedAt: string,
        ): unknown;
      }).publishAndRereadExactObservation(
        { store, admissionRef: {}, policy: {} },
        'PROVIDER_START',
        { schemaVersion: 2, kind: 'exact-docker-provider-start-test' },
        '2026-09-01T00:00:00.000Z',
      );
    };
    expect(() => invoke('clean')).not.toThrow();
    expect(() => invoke('receipt')).toThrow(/EXACT_DOCKER_OBSERVATION_REREAD_INVALID/);
    expect(() => invoke('bytes')).toThrow(/EXACT_DOCKER_OBSERVATION_REREAD_INVALID/);
  });

  it('reopens the same live released dispatch without a second start and fails closed on map loss', async () => {
    const fixture = releasedReplayFixture();
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const envelope = Object.freeze({});
    const internals = backend as unknown as {
      exactCustodyScopes: WeakMap<object, unknown>;
      exactCustodyProviderStarts: Map<string, unknown>;
      exactCustodyProviderExecutions: Map<string, unknown>;
      exactCustodyCompletions: Map<string, unknown>;
    };
    internals.exactCustodyScopes.set(envelope, fixture.scope);
    internals.exactCustodyProviderStarts.set(
      fixture.admissionRef.refDigest, fixture.providerStartReceipt,
    );
    internals.exactCustodyProviderExecutions.set(
      fixture.admissionRef.refDigest, fixture.providerExecutionReceipt,
    );
    internals.exactCustodyCompletions.set(
      fixture.admissionRef.refDigest, {
        ...fixture.completion,
        promise: Promise.resolve({
          kind: 'capture-hold',
          custodyRef: fixture.query.custodyRef,
          releaseReceipt: fixture.query.releaseReceipt,
          projectionFence: fixture.query.projectionFence,
          reasonCode: 'LIVE_MONITOR_UNAVAILABLE',
          evidence: { kind: 'release-authority', receipt: fixture.query.releaseReceipt },
        }),
      },
    );
    mockSpawnSync.mockClear();
    const replay = await backend.dispatchExactDockerCustody(envelope as never);
    expect(replay.kind).toBe('released');
    expect(mockSpawnSync).not.toHaveBeenCalled();
    const projection = JSON.stringify(replay);
    expect(projection).not.toContain('raw-nonce-must-not-project');
    expect(projection).not.toContain('FOREIGN_SECRET');
    expect(projection).not.toContain('/workspace/.tasks');
    expect(projection).not.toContain('/test/state');

    internals.exactCustodyCompletions.delete(fixture.admissionRef.refDigest);
    await expect(backend.dispatchExactDockerCustody(envelope as never))
      .rejects.toThrow(/EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED/);
    internals.exactCustodyCompletions.set(
      fixture.admissionRef.refDigest, {
        ...fixture.completion,
        promise: Promise.resolve({
          kind: 'capture-hold',
          custodyRef: fixture.query.custodyRef,
          releaseReceipt: fixture.query.releaseReceipt,
          projectionFence: fixture.query.projectionFence,
          reasonCode: 'LIVE_MONITOR_UNAVAILABLE',
          evidence: { kind: 'release-authority', receipt: fixture.query.releaseReceipt },
        }),
      },
    );
    internals.exactCustodyProviderStarts.delete(fixture.admissionRef.refDigest);
    await expect(backend.dispatchExactDockerCustody(envelope as never))
      .rejects.toThrow(/EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED/);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('rehydrates one durable released exact attempt once without redispatching the provider', async () => {
    const fixture = releasedReplayFixture();
    const providerExit = {
      containerId: fixture.authority.backendExecutionId,
      exitCode: 0,
      observedAt: '2026-09-01T00:00:02.000Z',
      waitEvidenceDigest: digest('1'),
      observationReceiptDigest: digest('2'),
      observationEvidenceDigest: digest('3'),
    };
    const admitted = {
      state: 'admitted' as const,
      ref: fixture.admissionRef,
      admission: fixture.scope.admission,
      reservation: {},
    };
    const startObservation = {
      receipt: {
        receiptDigest: fixture.providerStartReceipt.ref,
        evidenceDigest: fixture.providerStartReceipt.digest,
      },
    };
    const store = {
      ...fixture.store,
      listDispatchAdmissionsForRecovery: vi.fn(() => ({ entries: [admitted], heldAdmissions: [] })),
      readDispatchObservationByClass: vi.fn(() => startObservation),
    };
    const scope = { ...fixture.scope, store };
    const startBundle = {
      containerId: fixture.authority.backendExecutionId,
      observedAt: '2026-09-01T00:00:01.000Z',
    };
    const completion = {
      kind: 'capture-hold' as const,
      custodyRef: fixture.query.custodyRef,
      releaseReceipt: fixture.query.releaseReceipt,
      projectionFence: fixture.query.projectionFence,
      reasonCode: 'LIVE_MONITOR_UNAVAILABLE' as const,
      evidence: { kind: 'release-authority' as const, receipt: fixture.query.releaseReceipt },
    };
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      openExactDockerRecoveryStore: ReturnType<typeof vi.fn>;
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
      rereadExactProviderStartObservation: ReturnType<typeof vi.fn>;
      readExactDockerRecoveryProviderExecution: ReturnType<typeof vi.fn>;
      readExactDockerRecoveryProviderExit: ReturnType<typeof vi.fn>;
      rehydrateExactDockerEffectLaunch: ReturnType<typeof vi.fn>;
      monitorExactDockerCustody: ReturnType<typeof vi.fn>;
      exactCustodyProviderStarts: Map<string, unknown>;
      exactCustodyProviderExecutions: Map<string, unknown>;
      exactCustodyCompletions: Map<string, unknown>;
    };
    internals.openExactDockerRecoveryStore = vi.fn(() => ({
      store,
      policy: fixture.scope.policy,
    }));
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => scope);
    internals.rereadExactProviderStartObservation = vi.fn(() => startBundle);
    internals.readExactDockerRecoveryProviderExecution = vi.fn(
      () => fixture.providerExecutionReceipt,
    );
    internals.readExactDockerRecoveryProviderExit = vi.fn(() => providerExit);
    let releaseRehydrate!: () => void;
    const rehydrateGate = new Promise<void>(resolve => { releaseRehydrate = resolve; });
    internals.rehydrateExactDockerEffectLaunch = vi.fn(async () => await rehydrateGate);
    internals.monitorExactDockerCustody = vi.fn(() => Promise.resolve(completion));

    mockSpawnSync.mockClear();
    const firstPending = backend.reconcilePendingAttempts();
    await vi.waitFor(() => {
      expect(internals.rehydrateExactDockerEffectLaunch).toHaveBeenCalledTimes(1);
    });
    const secondPending = backend.reconcilePendingAttempts();
    await Promise.resolve();
    expect(internals.rehydrateExactDockerEffectLaunch).toHaveBeenCalledTimes(1);
    releaseRehydrate();
    const [first, second] = await Promise.all([firstPending, secondPending]);
    expect(first.adopted).toEqual([fixture.identity.taskId]);
    expect(second.adopted).toEqual([fixture.identity.taskId]);
    expect(internals.rehydrateExactDockerEffectLaunch).toHaveBeenCalledTimes(1);
    expect(internals.monitorExactDockerCustody).toHaveBeenCalledTimes(1);
    expect(internals.monitorExactDockerCustody).toHaveBeenCalledWith(
      scope,
      fixture.authority.backendExecutionId,
      expect.objectContaining({
        projectionFence: fixture.authority.projectionFence,
        providerStartReceipt: fixture.providerStartReceipt,
      }),
      fixture.providerExecutionReceipt,
      providerExit,
    );
    await Promise.resolve();
    expect(internals.exactCustodyProviderStarts.has(fixture.admissionRef.refDigest)).toBe(false);
    expect(internals.exactCustodyProviderExecutions.has(fixture.admissionRef.refDigest)).toBe(false);
    expect(internals.exactCustodyCompletions.has(fixture.admissionRef.refDigest)).toBe(false);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('retains exact resources when effect capture HOLDs and never enters release', async () => {
    const fixture = releasedReplayFixture();
    const providerExit = Object.freeze({
      containerId: fixture.authority.backendExecutionId,
      exitCode: 0,
      observedAt: '2026-09-01T00:00:02.000Z',
      waitEvidenceDigest: digest('1'),
      observationReceiptDigest: digest('2'),
      observationEvidenceDigest: digest('3'),
    });
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      monitorExactDockerCustody: (...args: unknown[]) => Promise<Record<string, unknown>>;
      rereadExactProviderExitObservation: ReturnType<typeof vi.fn>;
      commitExactDockerEffectLanding: ReturnType<typeof vi.fn>;
      releaseExactDockerEffectLanding: ReturnType<typeof vi.fn>;
    };
    internals.rereadExactProviderExitObservation = vi.fn();
    internals.commitExactDockerEffectLanding = vi.fn(async () => null);
    internals.releaseExactDockerEffectLanding = vi.fn(async () => null);

    const completion = await internals.monitorExactDockerCustody(
      fixture.scope,
      fixture.authority.backendExecutionId,
      fixture.query,
      fixture.providerExecutionReceipt,
      providerExit,
    );
    expect(completion).toMatchObject({
      kind: 'capture-hold',
      reasonCode: 'EFFECT_LANDING_HOLD',
      evidence: { kind: 'provider-exit-observation', providerExit },
    });
    expect(internals.commitExactDockerEffectLanding).toHaveBeenCalledTimes(1);
    expect(internals.releaseExactDockerEffectLanding).not.toHaveBeenCalled();
  });

  it.each([
    'measurement-hold',
    'publication-failure',
    'reread-failure',
  ] as const)(
    'retains exact resources when host-work %s prevents durable attribution',
    async (failure) => {
      const fixture = exactHostWorkMonitorFixture(failure);
      const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
      const internals = backend as unknown as {
        monitorExactDockerCustody: (...args: unknown[]) => Promise<Record<string, unknown>>;
        rereadExactProviderExitObservation: ReturnType<typeof vi.fn>;
        commitExactDockerEffectLanding: ReturnType<typeof vi.fn>;
        releaseExactDockerEffectLanding: ReturnType<typeof vi.fn>;
      };
      internals.rereadExactProviderExitObservation = vi.fn();
      internals.commitExactDockerEffectLanding = vi.fn(async () => ({ state: 'COMMITTED' }));
      internals.releaseExactDockerEffectLanding = vi.fn(async () => ({ state: 'RELEASED' }));

      const completion = await internals.monitorExactDockerCustody(
        fixture.scope,
        fixture.replay.authority.backendExecutionId,
        fixture.replay.query,
        fixture.replay.providerExecutionReceipt,
        fixture.providerExit,
      );

      expect(completion).toMatchObject({
        kind: 'capture-hold',
        reasonCode: 'HOST_WORK_ATTRIBUTION_HOLD',
        evidence: { kind: 'provider-exit-observation', providerExit: fixture.providerExit },
      });
      expect(internals.commitExactDockerEffectLanding).toHaveBeenCalledTimes(1);
      expect(internals.releaseExactDockerEffectLanding).not.toHaveBeenCalled();
      expect(fixture.store.publishHostArtifact).toHaveBeenCalledTimes(
        failure === 'measurement-hold' ? 0 : 1,
      );
    },
  );

  it('reconstructs cold exact completion only from durable post-cleanup artifacts', () => {
    const fixture = coldExactDockerCompletionFixture();
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      readColdExactDockerCompletion: (...args: unknown[]) => Record<string, unknown> | null;
      rehydrateExactDockerEffectLaunch: ReturnType<typeof vi.fn>;
      monitorExactDockerCustody: ReturnType<typeof vi.fn>;
      releaseExactDockerEffectLanding: ReturnType<typeof vi.fn>;
    };
    internals.rehydrateExactDockerEffectLaunch = vi.fn();
    internals.monitorExactDockerCustody = vi.fn();
    internals.releaseExactDockerEffectLanding = vi.fn();
    mockSpawn.mockClear();
    mockSpawnSync.mockClear();

    mockLifecycleStoreAdmissionAdapter.mockReturnValueOnce(fixture.adapter as never);
    const completion = internals.readColdExactDockerCompletion(
      fixture.scope,
      fixture.replay.query,
      fixture.providerExit,
    );

    expect(completion).toMatchObject({
      kind: 'landing-captured',
      providerExit: fixture.providerExit,
      hostWorkAttribution: { state: 'VERIFIED', reasonCode: 'NONE' },
      hostEffectAuthority: {
        binding: { landingArtifactKey: fixture.landingArtifactKey },
      },
      result: {
        sourceResult: {
          artifactClass: 'worker-result',
          artifactKey: `result-${fixture.replay.identity.attemptId}`,
        },
      },
      landingProposal: {
        proposal: {
          taskId: fixture.replay.identity.taskId,
          dispatchRequestId: fixture.replay.admissionRef.dispatchRequestId,
        },
      },
    });
    expect(fixture.adapter.readLandingRecoveryAnchor).toHaveBeenCalledTimes(1);
    expect(fixture.adapter.readAcceptedAuthority).toHaveBeenCalledWith(
      fixture.landingArtifactKey,
    );
    expect(internals.rehydrateExactDockerEffectLaunch).not.toHaveBeenCalled();
    expect(internals.monitorExactDockerCustody).not.toHaveBeenCalled();
    expect(internals.releaseExactDockerEffectLanding).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockSpawnSync).not.toHaveBeenCalled();
    const source = internals.readColdExactDockerCompletion.toString();
    expect(source).not.toContain('measureExactDockerHostWorkAttribution');
    expect(source).not.toContain('captureDockerLogs');
    expect(source).not.toContain('rehydrateExactDockerEffectLaunch');
  });

  it.each([
    ['host-work', { hostWork: '2026-09-01T00:00:01.999Z' }],
    ['result', { result: '2026-09-01T00:00:01.999Z' }],
    ['landing', { landing: '2026-09-01T00:00:01.999Z' }],
  ] as const)('fails closed on stale %s timestamp during cold reconstruction', (_label, times) => {
    const fixture = coldExactDockerCompletionFixture(times);
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const readCold = (backend as unknown as {
      readColdExactDockerCompletion: (...args: unknown[]) => Record<string, unknown> | null;
    }).readColdExactDockerCompletion.bind(backend);

    if (_label !== 'host-work') {
      mockLifecycleStoreAdmissionAdapter.mockReturnValueOnce(fixture.adapter as never);
    }
    expect(() => readCold(fixture.scope, fixture.replay.query, fixture.providerExit))
      .toThrow(/EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED/u);
  });

  it('keeps leadership-free recovery out of exact adoption and HOLDs a gapped start chain', async () => {
    const fixture = releasedReplayFixture();
    const admitted = {
      state: 'admitted' as const,
      ref: fixture.admissionRef,
      admission: fixture.scope.admission,
      reservation: {},
    };
    const store = {
      ...fixture.store,
      listDispatchAdmissionsForRecovery: vi.fn(() => ({ entries: [admitted], heldAdmissions: [] })),
      readDispatchObservationByClass: vi.fn(() => null),
    };
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      openExactDockerRecoveryStore: ReturnType<typeof vi.fn>;
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
    };
    internals.openExactDockerRecoveryStore = vi.fn(() => ({
      store,
      policy: fixture.scope.policy,
    }));
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => ({
      ...fixture.scope,
      store,
    }));

    await expect(backend.reconcilePendingAttempts({ mode: 'terminal-only' }))
      .resolves.toMatchObject({ adopted: [] });
    expect(internals.openExactDockerRecoveryStore).not.toHaveBeenCalled();
    await expect(backend.reconcilePendingAttempts())
      .resolves.toMatchObject({
        adopted: [],
        closedNotDispatched: [],
        held: [{
          kind: 'spawn-backend-recovery-hold',
          dispatchRequestId: fixture.admissionRef.dispatchRequestId,
          taskId: fixture.identity.taskId,
          admissionRefDigest: fixture.admissionRef.refDigest,
          authorityState: 'DISPATCH_TERMINAL',
          reasonCode: 'TERMINAL_RECONCILIATION_REQUIRED',
        }],
      });
  });

  it('rejects NOT_DISPATCHED recovery when durable provider execution evidence exists', async () => {
    const fixture = releasedReplayFixture();
    const admitted = {
      state: 'admitted' as const,
      ref: fixture.admissionRef,
      admission: fixture.scope.admission,
      reservation: {},
    };
    const readDispatchObservationByClass = vi.fn((input: { observationClass: string }) => (
      input.observationClass === 'PROVIDER_EXECUTION'
        ? { receipt: { receiptDigest: digest('1'), evidenceDigest: digest('2') }, bytes: Buffer.from('{}') }
        : null
    ));
    const store = {
      ...fixture.store,
      listDispatchAdmissionsForRecovery: vi.fn(() => ({ entries: [admitted], heldAdmissions: [] })),
      readDispatchAuthority: vi.fn(() => ({
        state: 'terminal' as const,
        authority: {
          state: 'NOT_DISPATCHED' as const,
          admissionRef: fixture.admissionRef,
        },
      })),
      readDispatchObservationByClass,
    };
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      openExactDockerRecoveryStore: ReturnType<typeof vi.fn>;
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
    };
    internals.openExactDockerRecoveryStore = vi.fn(() => ({
      store,
      policy: fixture.scope.policy,
    }));
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => ({
      ...fixture.scope,
      store,
    }));

    await expect(backend.reconcilePendingAttempts())
      .resolves.toMatchObject({ adopted: [], closedNotDispatched: [] });
    expect(readDispatchObservationByClass.mock.calls.map(([input]) => input.observationClass))
      .toEqual(['PROVIDER_START', 'PROVIDER_EXECUTION']);
    expect(internals.reconstructExactDockerRecoveryScope).toHaveBeenCalledTimes(1);
  });

  it('isolates one pending admission HOLD and still closes a later terminal zero-work record', async () => {
    const fixture = releasedReplayFixture();
    const pending = {
      state: 'reserved-pending-admission' as const,
      reservation: {
        dispatchRequestId: `dreq-${'3'.repeat(64)}`,
        identity: fixture.identity,
      },
      reconciliationRef: digest('3'),
    };
    const admitted = {
      state: 'admitted' as const,
      ref: fixture.admissionRef,
      admission: fixture.scope.admission,
      reservation: {},
    };
    const store = {
      ...fixture.store,
      listDispatchAdmissionsForRecovery: vi.fn(() => ({ entries: [pending, admitted], heldAdmissions: [] })),
      readDispatchAuthority: vi.fn(() => ({
        state: 'terminal' as const,
        authority: {
          state: 'NOT_DISPATCHED' as const,
          admissionRef: fixture.admissionRef,
        },
      })),
      readDispatchObservationByClass: vi.fn(() => null),
    };
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      openExactDockerRecoveryStore: ReturnType<typeof vi.fn>;
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
    };
    internals.openExactDockerRecoveryStore = vi.fn(() => ({
      store,
      policy: fixture.scope.policy,
    }));
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => ({
      ...fixture.scope,
      store,
    }));

    await expect(backend.reconcilePendingAttempts()).resolves.toMatchObject({
      adopted: [],
      closedNotDispatched: [fixture.identity.taskId],
      held: [{
        kind: 'spawn-backend-recovery-hold',
        dispatchRequestId: pending.reservation.dispatchRequestId,
        taskId: fixture.identity.taskId,
        admissionRefDigest: null,
        authorityState: 'RESERVED_PENDING_ADMISSION',
        reasonCode: 'ADMISSION_RECONCILIATION_REQUIRED',
      }],
    });
    expect(store.readDispatchAuthority).toHaveBeenCalledTimes(1);
    expect(internals.reconstructExactDockerRecoveryScope).toHaveBeenCalledTimes(1);
  });

  it('reports one identity-bound discovery HOLD and still reconciles its valid sibling', async () => {
    const fixture = releasedReplayFixture();
    const rejectedReservation = {
      dispatchRequestId: `dreq-${'4'.repeat(64)}`,
      identity: {
        ...fixture.identity,
        taskId: 'identity-bound-unreadable-admission',
      },
    };
    const admitted = {
      state: 'admitted' as const,
      ref: fixture.admissionRef,
      admission: fixture.scope.admission,
      reservation: {},
    };
    const store = {
      ...fixture.store,
      listDispatchAdmissionsForRecovery: vi.fn(() => ({
        entries: [admitted],
        heldAdmissions: [{
          state: 'admission-hold' as const,
          reservation: rejectedReservation,
          candidateLocatorDigest: digest('4'),
          custodyHoldCode: 'INCOMPLETE_PUBLICATION' as const,
        }],
      })),
      readDispatchAuthority: vi.fn(() => ({
        state: 'terminal' as const,
        authority: {
          state: 'NOT_DISPATCHED' as const,
          admissionRef: fixture.admissionRef,
        },
      })),
      readDispatchObservationByClass: vi.fn(() => null),
    };
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      openExactDockerRecoveryStore: ReturnType<typeof vi.fn>;
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
    };
    internals.openExactDockerRecoveryStore = vi.fn(() => ({
      store,
      policy: fixture.scope.policy,
    }));
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => ({
      ...fixture.scope,
      store,
    }));

    await expect(backend.reconcilePendingAttempts()).resolves.toMatchObject({
      adopted: [],
      closedNotDispatched: [fixture.identity.taskId],
      held: [{
        kind: 'spawn-backend-recovery-hold',
        dispatchRequestId: rejectedReservation.dispatchRequestId,
        taskId: rejectedReservation.identity.taskId,
        admissionRefDigest: null,
        authorityState: 'ADMISSION_DISCOVERY_REJECTED',
        reasonCode: 'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE',
        custodyHoldCode: 'INCOMPLETE_PUBLICATION',
      }],
    });
    expect(store.readDispatchAuthority).toHaveBeenCalledTimes(1);
    expect(internals.reconstructExactDockerRecoveryScope).toHaveBeenCalledTimes(1);
  });

  it('HOLDs a released exact attempt whose admitted landing policy is missing', async () => {
    const fixture = releasedReplayFixture();
    const admitted = {
      state: 'admitted' as const,
      ref: fixture.admissionRef,
      admission: fixture.scope.admission,
      reservation: {},
    };
    const store = {
      ...fixture.store,
      listDispatchAdmissionsForRecovery: vi.fn(() => ({ entries: [admitted], heldAdmissions: [] })),
    };
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      openExactDockerRecoveryStore: ReturnType<typeof vi.fn>;
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
      rereadExactProviderStartObservation: ReturnType<typeof vi.fn>;
      rehydrateExactDockerEffectLaunch: ReturnType<typeof vi.fn>;
    };
    internals.openExactDockerRecoveryStore = vi.fn(() => ({
      store,
      policy: fixture.scope.policy,
    }));
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => ({
      ...fixture.scope,
      store,
      execution: { executionLandingPolicy: null },
    }));
    internals.rereadExactProviderStartObservation = vi.fn();
    internals.rehydrateExactDockerEffectLaunch = vi.fn();

    await expect(backend.reconcilePendingAttempts()).resolves.toMatchObject({
      adopted: [],
      closedNotDispatched: [],
      held: [{
        kind: 'spawn-backend-recovery-hold',
        dispatchRequestId: fixture.admissionRef.dispatchRequestId,
        taskId: fixture.identity.taskId,
        admissionRefDigest: fixture.admissionRef.refDigest,
        authorityState: 'DISPATCH_TERMINAL',
        reasonCode: 'TERMINAL_RECONCILIATION_REQUIRED',
      }],
    });
    expect(internals.rereadExactProviderStartObservation).not.toHaveBeenCalled();
    expect(internals.rehydrateExactDockerEffectLaunch).not.toHaveBeenCalled();
  });

  it('contains every exact durable admission through stop-and-record without monitor or landing', async () => {
    const fixture = releasedReplayFixture();
    const admitted = {
      state: 'admitted' as const,
      ref: fixture.admissionRef,
      admission: fixture.scope.admission,
      reservation: {},
    };
    const startObservation = {
      receipt: {
        receiptDigest: fixture.providerStartReceipt.ref,
        evidenceDigest: fixture.providerStartReceipt.digest,
      },
    };
    const store = {
      ...fixture.store,
      listDispatchAdmissionsForRecovery: vi.fn(() => ({ entries: [admitted], heldAdmissions: [] })),
      readDispatchObservationByClass: vi.fn(() => startObservation),
    };
    const scope = { ...fixture.scope, store };
    const startBundle = {
      containerId: fixture.authority.backendExecutionId,
      observedAt: '2026-09-01T00:00:01.000Z',
    };
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      openExactDockerRecoveryStore: ReturnType<typeof vi.fn>;
      reconstructExactDockerRecoveryScope: ReturnType<typeof vi.fn>;
      rereadExactProviderStartObservation: ReturnType<typeof vi.fn>;
      readExactDockerRecoveryProviderExecution: ReturnType<typeof vi.fn>;
      readExactDockerRecoveryProviderExit: ReturnType<typeof vi.fn>;
      containExactDockerCustodyAttempt: ReturnType<typeof vi.fn>;
      rehydrateExactDockerEffectLaunch: ReturnType<typeof vi.fn>;
      monitorExactDockerCustody: ReturnType<typeof vi.fn>;
      commitExactDockerEffectLanding: ReturnType<typeof vi.fn>;
    };
    internals.openExactDockerRecoveryStore = vi.fn(() => ({
      store,
      policy: fixture.scope.policy,
    }));
    internals.reconstructExactDockerRecoveryScope = vi.fn(() => scope);
    internals.rereadExactProviderStartObservation = vi.fn(() => startBundle);
    internals.readExactDockerRecoveryProviderExecution = vi.fn(
      () => fixture.providerExecutionReceipt,
    );
    internals.readExactDockerRecoveryProviderExit = vi.fn(() => null);
    internals.containExactDockerCustodyAttempt = vi.fn(async () => ({
      containerId: fixture.authority.backendExecutionId,
    }));
    internals.rehydrateExactDockerEffectLaunch = vi.fn(async () => undefined);
    internals.monitorExactDockerCustody = vi.fn();
    internals.commitExactDockerEffectLanding = vi.fn();

    expect(backend.workerInventoryState(fixture.identity.taskId)).toBe('unknown');
    await expect(backend.reconcilePendingAttempts({ mode: 'contain' }))
      .resolves.toMatchObject({ adopted: [fixture.identity.taskId] });
    expect(internals.containExactDockerCustodyAttempt).toHaveBeenCalledWith(
      scope,
      fixture.authority,
      startBundle,
      null,
    );
    expect(internals.rehydrateExactDockerEffectLaunch).not.toHaveBeenCalled();
    expect(internals.monitorExactDockerCustody).not.toHaveBeenCalled();
    expect(internals.commitExactDockerEffectLanding).not.toHaveBeenCalled();
    expect(backend.workerInventoryState(fixture.identity.taskId)).toBe('absent');
    expect(backend.workerInventoryState('never-observed')).toBe('unknown');
  });

  it('contains a live exact container through async inspect-stop-wait and durable exit reread', async () => {
    const fixture = releasedReplayFixture();
    const commandResult = (stdout = '') => ({
      status: 0,
      signal: null,
      stdout: Buffer.from(stdout),
      stderr: Buffer.alloc(0),
      error: false,
      overflow: false,
    });
    const exactWorkspaceCommandRunner = vi.fn(async (input: { args: readonly string[] }) => {
      if (input.args[0] === 'inspect') return commandResult('true|0\n');
      if (input.args[0] === 'stop') return commandResult();
      if (input.args[0] === 'wait') return commandResult('143\n');
      throw new Error(`unexpected exact containment command: ${input.args.join(' ')}`);
    });
    const backend = new DockerSpawnBackend('/test/project', {
      custodyStateDir: '/test/state',
      exactWorkspaceCommandRunner,
    });
    const internals = backend as unknown as {
      rehydrateExactDockerEffectLaunch: ReturnType<typeof vi.fn>;
      publishAndRereadExactObservation: ReturnType<typeof vi.fn>;
      rereadExactProviderExitObservation: ReturnType<typeof vi.fn>;
      monitorExactDockerCustody: ReturnType<typeof vi.fn>;
      commitExactDockerEffectLanding: ReturnType<typeof vi.fn>;
      containExactDockerCustodyAttempt: (
        scope: unknown,
        terminal: unknown,
        start: unknown,
        recoveredExit: null,
      ) => Promise<{ containerId: string; exitCode: number }>;
    };
    internals.rehydrateExactDockerEffectLaunch = vi.fn(async () => undefined);
    internals.publishAndRereadExactObservation = vi.fn(() => ({
      receiptDigest: digest('8'),
      evidenceDigest: digest('9'),
    }));
    internals.rereadExactProviderExitObservation = vi.fn();
    internals.monitorExactDockerCustody = vi.fn();
    internals.commitExactDockerEffectLanding = vi.fn();

    const providerExit = await internals.containExactDockerCustodyAttempt(
      fixture.scope,
      fixture.authority,
      {
        containerId: fixture.authority.backendExecutionId,
        observedAt: '2026-09-01T00:00:00.500Z',
      },
      null,
    );

    expect(exactWorkspaceCommandRunner.mock.calls.map(([input]) => input.args[0]))
      .toEqual(['inspect', 'stop', 'wait']);
    expect(providerExit).toMatchObject({
      containerId: fixture.authority.backendExecutionId,
      exitCode: 143,
    });
    expect(internals.publishAndRereadExactObservation).toHaveBeenCalledWith(
      fixture.scope,
      'PROVIDER_EXIT',
      expect.objectContaining({
        kind: 'exact-docker-provider-exit',
        containerId: fixture.authority.backendExecutionId,
        exitCode: 143,
      }),
      expect.any(String),
    );
    expect(internals.rereadExactProviderExitObservation).toHaveBeenCalledWith(
      fixture.scope,
      expect.objectContaining({
        containerId: fixture.authority.backendExecutionId,
        exitCode: 143,
      }),
    );
    expect(internals.monitorExactDockerCustody).not.toHaveBeenCalled();
    expect(internals.commitExactDockerEffectLanding).not.toHaveBeenCalled();
  });

  it('re-observes Docker before accepting a recovered provider-exit as contained', async () => {
    const fixture = releasedReplayFixture();
    const commandResult = (stdout: string) => ({
      status: 0,
      signal: null,
      stdout: Buffer.from(stdout),
      stderr: Buffer.alloc(0),
      error: false,
      overflow: false,
    });
    const exactWorkspaceCommandRunner = vi.fn(async () => commandResult('false|0\n'));
    const backend = new DockerSpawnBackend('/test/project', {
      custodyStateDir: '/test/state',
      exactWorkspaceCommandRunner,
    });
    const internals = backend as unknown as {
      rehydrateExactDockerEffectLaunch: ReturnType<typeof vi.fn>;
      containExactDockerCustodyAttempt: (
        scope: unknown,
        terminal: unknown,
        start: unknown,
        recoveredExit: unknown,
      ) => Promise<unknown>;
    };
    internals.rehydrateExactDockerEffectLaunch = vi.fn(async () => undefined);
    const recoveredExit = {
      containerId: fixture.authority.backendExecutionId,
      exitCode: 0,
      observedAt: '2026-09-01T00:00:03.000Z',
    };

    await expect(internals.containExactDockerCustodyAttempt(
      fixture.scope,
      fixture.authority,
      { containerId: fixture.authority.backendExecutionId },
      recoveredExit,
    )).resolves.toBe(recoveredExit);
    expect(exactWorkspaceCommandRunner).toHaveBeenCalledWith(expect.objectContaining({
      command: 'docker',
      args: ['inspect', '--format', '{{.State.Running}}|{{.State.ExitCode}}',
        fixture.authority.backendExecutionId],
    }));

    exactWorkspaceCommandRunner.mockResolvedValueOnce(commandResult('true|0\n'));
    await expect(internals.containExactDockerCustodyAttempt(
      fixture.scope,
      fixture.authority,
      { containerId: fixture.authority.backendExecutionId },
      recoveredExit,
    )).rejects.toMatchObject({
      reasonCode: 'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
    });
  });

  it('retains observed completion until accepted-result consumption and keeps HOLD state', async () => {
    const fixture = releasedReplayFixture();
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      exactCustodyProviderStarts: Map<string, unknown>;
      exactCustodyProviderExecutions: Map<string, unknown>;
      exactCustodyCompletions: Map<string, unknown>;
    };
    const completed = {
      kind: 'result-captured',
      custodyRef: fixture.query.custodyRef,
      releaseReceipt: fixture.query.releaseReceipt,
      projectionFence: fixture.query.projectionFence,
    };
    internals.exactCustodyProviderStarts.set(
      fixture.admissionRef.refDigest, fixture.providerStartReceipt,
    );
    internals.exactCustodyProviderExecutions.set(
      fixture.admissionRef.refDigest, fixture.providerExecutionReceipt,
    );
    internals.exactCustodyCompletions.set(fixture.admissionRef.refDigest, {
      ...fixture.completion,
      promise: Promise.resolve(completed),
    });
    await expect(backend.awaitExactDockerCustodyTerminal(fixture.query as never))
      .resolves.toMatchObject({ kind: 'result-captured' });
    expect(internals.exactCustodyProviderStarts.size).toBe(1);
    expect(internals.exactCustodyCompletions.size).toBe(1);
  });

  it('surfaces automatic acceptance rejection and HOLD through the public terminal await', async () => {
    const run = async (outcome: 'reject' | 'hold') => {
      const fixture = releasedReplayFixture();
      const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
      let resolveCompletion!: (value: Record<string, unknown>) => void;
      const completion = new Promise<Record<string, unknown>>(resolve => {
        resolveCompletion = resolve;
      });
      const internals = backend as unknown as {
        exactCustodyProviderStarts: Map<string, unknown>;
        exactCustodyProviderExecutions: Map<string, unknown>;
        exactCustodyCompletions: Map<string, unknown>;
        observeExactDockerCompletionAcceptance(
          scope: unknown,
          query: unknown,
          completion: Promise<Record<string, unknown>>,
        ): void;
        exactCanonicalIngressAuthority: ReturnType<typeof vi.fn>;
      };
      internals.exactCustodyProviderStarts.set(
        fixture.admissionRef.refDigest, fixture.providerStartReceipt,
      );
      internals.exactCustodyProviderExecutions.set(
        fixture.admissionRef.refDigest, fixture.providerExecutionReceipt,
      );
      internals.exactCustodyCompletions.set(fixture.admissionRef.refDigest, {
        ...fixture.completion,
        promise: completion,
      });
      internals.exactCanonicalIngressAuthority = vi.fn(() => ({
        taskId: fixture.identity.taskId,
        workerId: 'worker-fixture',
        provider: 'fixture-provider',
        model: 'fixture-model',
        isPriorityFix: false,
        fixForTaskId: null,
      }));
      const acceptance = vi.spyOn(backend, 'acceptExactDockerCustodyResult');
      if (outcome === 'reject') {
        acceptance.mockRejectedValueOnce(new Error('durable accepted publication failed'));
      } else {
        acceptance.mockResolvedValueOnce({
          kind: 'capture-hold',
          reasonCode: 'HOST_WORK_ATTRIBUTION_HOLD',
          custodyRef: fixture.query.custodyRef,
          releaseReceipt: fixture.query.releaseReceipt,
          projectionFence: fixture.query.projectionFence,
        });
      }
      internals.observeExactDockerCompletionAcceptance(
        fixture.scope,
        fixture.query,
        completion,
      );
      const terminal = backend.awaitExactDockerCustodyTerminal(fixture.query as never);
      resolveCompletion({
        kind: 'result-captured',
        custodyRef: fixture.query.custodyRef,
        releaseReceipt: fixture.query.releaseReceipt,
        projectionFence: fixture.query.projectionFence,
      });
      return { terminal, acceptance };
    };

    const rejected = await run('reject');
    await expect(rejected.terminal).rejects.toThrow(/durable accepted publication failed/);
    expect(rejected.acceptance).toHaveBeenCalledTimes(1);

    const held = await run('hold');
    await expect(held.terminal).resolves.toMatchObject({
      kind: 'capture-hold',
      reasonCode: 'HOST_WORK_ATTRIBUTION_HOLD',
    });
    expect(held.acceptance).toHaveBeenCalledTimes(1);
  });

  it('publishes accepted result from durable host authority, then evicts and rereads by opaque token', async () => {
    const policy = createTaskResultSettlementV2TestPolicy();
    const identity = {
      schemaVersion: 2 as const,
      backend: 'docker' as const,
      projectRootSha256: '0'.repeat(64),
      projectId: 'fixture-project',
      taskId: 'fixture-001',
      attemptId: '123e4567-e89b-42d3-a456-426614174000',
      generation: 1,
    };
    const admissionReceiptDigest = digest('d');
    const providerExitObservedAt = '2026-09-01T00:00:00.500Z';
    const rawWorkerResultBytes = Buffer.from(JSON.stringify({
      taskId: identity.taskId,
      selfAssessment: 'DONE',
      testsPassed: true,
      filesChanged: [],
      tokenUsage: { inputTokens: 999999, outputTokens: 999999 },
      cost: { usd: 999999 },
      providerBilling: { providerReportedUsd: 999999 },
      promptDeliveryAttribution: { state: 'LEGACY_FALLBACK' },
      agentId: 'forged-agent',
      skillIds: ['forged-skill'],
    }));
    const sourceArtifactDigest = `sha256:${createHash('sha256')
      .update(rawWorkerResultBytes).digest('hex')}` as const;
    const sourceReceipt = {
      identity,
      admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      artifactClass: 'worker-result',
      artifactKey: 'primary',
      capturedAt: providerExitObservedAt,
      receiptDigest: digest('e'),
      artifact: { sha256: sourceArtifactDigest, byteLength: rawWorkerResultBytes.byteLength },
    };
    const sourceBinding = {
      version: 2 as const,
      identity,
      policyDigest: policy.policyDigest,
      admissionReceiptDigest,
      sourceResult: {
        artifactClass: 'worker-result' as const,
        artifactKey: sourceReceipt.artifactKey,
        artifactReceiptDigest: sourceReceipt.receiptDigest,
        artifactSha256: sourceArtifactDigest,
        byteLength: rawWorkerResultBytes.byteLength,
      },
    };
    const effectProjection = createExecutionEffectResultProjectionV1({
      disposition: 'COMMITTED_NO_CHANGE',
      effectDecisionDigest: digest('2'),
      transactionDigest: digest('3'),
      decisionEffectCount: 0,
      effects: [],
    });
    const effectLandingBinding = createTaskAttemptEffectLandingBindingV2({
      identity: {
        projectId: identity.projectId,
        taskId: identity.taskId,
        attemptId: identity.attemptId,
        generation: identity.generation,
      },
      admissionReceiptDigest,
      custodyPolicyDigest: policy.policyDigest,
      landingArtifactKey: 'primary-landing',
      landingArtifactReceiptDigest: digest('f'),
      landingReceiptDigest: digest('0'),
      effectLandingChainDigest: digest('1'),
      readyLifecycleAuthorityDigest: digest('a'),
      disposition: effectProjection.disposition,
      effectDecisionDigest: effectProjection.effectDecisionDigest,
      transactionDigest: effectProjection.transactionDigest,
    });
    const effectLandingReleasedAt = '2026-09-01T00:00:01.000Z';
    const verifiedEffectLanding = {
      landing: {
        receiptDigest: effectLandingBinding.landingReceiptDigest,
        releasedAt: effectLandingReleasedAt,
      },
    };
    const effectLandingChain = {
      stage: 'effect-landing',
      occurredAt: effectLandingReleasedAt,
      predecessorDigest: admissionReceiptDigest,
      artifactKey: effectLandingBinding.landingArtifactKey,
      artifactReceiptDigest: effectLandingBinding.landingArtifactReceiptDigest,
      receiptDigest: effectLandingBinding.effectLandingChainDigest,
    };
    const admissionRefDigest = digest('1');
    const providerStartReceipt = { ref: digest('2'), digest: digest('3') };
    const providerExecutionReceipt = { ref: digest('a'), digest: digest('b') };
    const releaseReceipt = { ref: digest('4'), digest: digest('5') };
    const projectionFence = digest('6');
    const query = {
      custodyRef: {
        dispatchRequestId: `dreq-${'7'.repeat(64)}`,
        identity,
        admissionReceiptDigest,
        admissionRefDigest,
        providerStartReceipt,
      },
      releaseReceipt,
      providerStartReceipt,
      projectionFence,
    };
    const providerExitReceiptDigest = digest('f');
    const providerExitEvidenceDigest = digest('0');
    const waitEvidence = {
      admissionRefDigest,
      containerId: 'container-fixture-001',
      exitCode: 0,
      dockerWaitProcessExitCode: 0,
      dockerWaitSignal: null,
      stdoutSha256: digest('1'),
      stderrSha256: digest('2'),
      observedAt: providerExitObservedAt,
    };
    const providerExit = {
      containerId: waitEvidence.containerId,
      exitCode: 0,
      observedAt: providerExitObservedAt,
      waitEvidenceDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(waitEvidence)).digest('hex')}` as const,
      observationReceiptDigest: providerExitReceiptDigest,
      observationEvidenceDigest: providerExitEvidenceDigest,
    };
    const providerExitBytes = Buffer.from(canonicalJson({
      schemaVersion: 2,
      kind: 'exact-docker-provider-exit',
      ...waitEvidence,
      waitEvidenceDigest: providerExit.waitEvidenceDigest,
    }));
    const providerStreamReceiptDigest = digest('8');
    const billingEvidence = {
      source: 'provider-envelope' as const,
      provider: 'fixture-provider',
      currency: 'USD' as const,
      providerReportedUsd: 2.5,
      modelUsage: {
        'fixture-model': { inputTokens: 20, outputTokens: 10, cacheReadTokens: 3 },
      },
      capturedAt: providerExitObservedAt,
    };
    let providerStreamBytes = Buffer.from(JSON.stringify({
      total_cost_usd: billingEvidence.providerReportedUsd,
      modelUsage: billingEvidence.modelUsage,
    }));
    const providerStreamDigest = `sha256:${createHash('sha256')
      .update(providerStreamBytes).digest('hex')}` as const;
    const billingEvidenceDigest = `sha256:${createHash('sha256')
      .update(canonicalJson(billingEvidence)).digest('hex')}` as const;
    const durableProviderStreamArtifact = custodyArtifactFixture({
      identity,
      admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      artifactClass: 'pristine-provider-stream',
      artifactKey: `provider-${identity.attemptId}`,
      capturedAt: providerExitObservedAt,
      bytes: providerStreamBytes,
      receiptCharacter: '8',
    });
    const task = JSON.parse(budgetedDockerTaskJson('/test/project/.tasks/task-fixture-001.json'));
    task.assignedWorker = 'worker-fixture-001';
    task.provider = 'fixture-provider';
    task.model = 'fixture-model';
    task.assignedAgent = 'backend-specialist';
    task.assignedSkills = ['delivered-skill', 'assigned-only-skill'];
    task.forceSkills = ['delivered-skill'];
    const promptDelivery = promptDeliveryAuthorityFixture(task, [
      { tier: 'T1', kind: 'skills', content: '--- delivered-skill ---\nbody' },
      { tier: 'T0', kind: 'worker-contract', content: 'worker contract' },
      { tier: 'T1', kind: 'persona', content: '=== Agent: backend-specialist ===\npersona' },
      { tier: 'T2', kind: 'task', content: 'bounded task' },
    ]);
    const exactExecution = {
      allowedTools: null, availableTools: null, authMode: 'api' as const,
      isolatedContext: true, reasoningEffort: null,
      excludeDynamicPromptSections: false, taskTimeoutSeconds: 120,
      actionId: null, executionBudget: null, executionLandingPolicy: null,
      executionAdmissionMode: null, executionApprovalEvidenceRef: null,
      finalOnlyUsageContainment: null,
    };
    const scopeDigest = createHash('sha256').update(canonicalJson([])).digest('hex');
    const scopeBaseline = `#deckent-scope-attribution-v1\t${query.custodyRef.dispatchRequestId}\t${scopeDigest}\n`;
    const scopeBaselineSha256 = `sha256:${createHash('sha256')
      .update(scopeBaseline).digest('hex')}` as const;
    const dispatchTaskMaterialDigest = `sha256:${createHash('sha256')
      .update(canonicalJson(task)).digest('hex')}` as const;
    const approved = createExactNormalTaskApprovedMaterialV3({
      sprintId: task.sprintId ?? 'sprint-fixture',
      task,
      dispatchTaskMaterialDigest,
      policy,
    });
    const lineage = { ordinal: 1 };
    const runnerSource = 'export const exactRunner = true;';
    const taskSnapshot = {
      schemaVersion: 2 as const,
      kind: 'exact-docker-dispatch-snapshot' as const,
      dispatchRequestId: query.custodyRef.dispatchRequestId,
      projectId: identity.projectId,
      taskId: identity.taskId,
      material: {
        approved,
        approvedSha256: `sha256:${createHash('sha256')
          .update(canonicalJson(approved)).digest('hex')}` as const,
        dispatch: task,
        dispatchSha256: dispatchTaskMaterialDigest,
        lineage,
        lineageSha256: `sha256:${createHash('sha256')
          .update(canonicalJson(lineage)).digest('hex')}` as const,
      },
      dispatch: {
        model: 'fixture-model', provider: 'fixture-provider', execution: exactExecution,
        prompt: promptDelivery.prompt,
        promptSha256: `sha256:${createHash('sha256')
          .update(promptDelivery.prompt).digest('hex')}` as const,
        promptDeliveryAuthority: promptDelivery.authority,
        systemPromptCore: null,
        systemPromptCoreSha256: null,
        scopeBaseline,
        scopeBaselineSha256,
        runnerSource,
        runnerSourceSha256: `sha256:${createHash('sha256')
          .update(runnerSource).digest('hex')}` as const,
        providerInvocationDigest: digest('9'),
        releaseIntentNonceSha256: digest('a'),
        releaseCommitNonceSha256: digest('b'),
        providerStartNonceSha256: digest('c'),
        executionCommitNonceSha256: digest('d'),
      },
    };
    let taskSnapshotBytes = Buffer.from(canonicalJson(taskSnapshot));
    const taskSnapshotSha256 = `sha256:${createHash('sha256')
      .update(taskSnapshotBytes).digest('hex')}` as const;
    const persistedTaskAuthority = parseExactDockerDispatchTaskSnapshotAuthority(
      taskSnapshotBytes,
      policy,
    );
    if (persistedTaskAuthority === null) {
      throw new Error('persisted exact task snapshot fixture is invalid');
    }
    const persistedTaskSnapshot = {
      schemaVersion: 2 as const,
      kind: 'exact-docker-dispatch-snapshot' as const,
      dispatchRequestId: persistedTaskAuthority.dispatchRequestId,
      projectId: persistedTaskAuthority.projectId,
      taskId: persistedTaskAuthority.taskId,
      material: {
        approved: persistedTaskAuthority.approved,
        approvedSha256: persistedTaskAuthority.approvedDigest,
        dispatch: persistedTaskAuthority.task,
        dispatchSha256: persistedTaskAuthority.taskDigest,
        lineage: persistedTaskAuthority.lineage,
        lineageSha256: persistedTaskAuthority.lineageDigest,
      },
      dispatch: persistedTaskAuthority.dispatch,
    };
    const providerExecutionAttempt = {
      providerExecutionAttemptId: 'provider-attempt-fixture-001',
      identityDigest: digest('e'),
    };
    const dispatchReceiptDigest = digest('7');
    const authorityLabelsDigest = digest('8');
    let providerStartBytes = Buffer.from(canonicalJson({
      schemaVersion: 2,
      kind: 'exact-docker-provider-start',
      admissionRefDigest,
      containerId: providerExit.containerId,
      taskSnapshotSha256,
      providerInvocationDigest: taskSnapshot.dispatch.providerInvocationDigest,
      authorityLabelsDigest,
      providerStartNonceSha256: taskSnapshot.dispatch.providerStartNonceSha256,
      executionCommitNonceSha256: taskSnapshot.dispatch.executionCommitNonceSha256,
      providerExecutionAttemptId: providerExecutionAttempt.providerExecutionAttemptId,
      providerExecutionAttemptIdentityDigest: providerExecutionAttempt.identityDigest,
      dispatchReceiptDigest,
      releaseReceiptRef: releaseReceipt.ref,
      releaseReceiptDigest: releaseReceipt.digest,
      projectionFence,
      startAuthorizationDigest: digest('9'),
      pid1StartAckDigest: digest('a'),
      state: 'START_AUTHORIZATION_ACCEPTED',
      providerState: 'NOT_STARTED',
      observedAt: '2026-09-01T00:00:00.250Z',
    }));
    let acceptedBytes: Uint8Array | null = null;
    let acceptedReceipt: Record<string, unknown> | null = null;
    let acceptedChain: Record<string, unknown> | null = null;
    let durableHostWorkArtifact: ReturnType<typeof custodyArtifactFixture> | null = null;
    const store = {
      readDispatchAuthority: vi.fn(() => ({
        state: 'terminal',
        authority: {
          state: 'RELEASED',
          admissionRef: {
            identity,
            admissionReceiptDigest,
            refDigest: admissionRefDigest,
            dispatchRequestId: query.custodyRef.dispatchRequestId,
          },
          releaseReceiptDigest: releaseReceipt.ref,
          releaseEvidenceDigest: releaseReceipt.digest,
          projectionFence,
          backendExecutionId: providerExit.containerId,
          providerExecutionAttempt,
          receiptDigest: dispatchReceiptDigest,
          releaseEvidence: {
            providerInvocationDigest: taskSnapshot.dispatch.providerInvocationDigest,
            daemonAuthorityLabelDigest: authorityLabelsDigest,
          },
        },
      })),
      readDispatchObservation: vi.fn((input: { observationClass: string }) => {
        if (input.observationClass === 'PROVIDER_EXIT') return {
            receipt: {
              receiptDigest: providerExitReceiptDigest,
              evidenceDigest: providerExitEvidenceDigest,
              observedAt: providerExit.observedAt,
            },
            bytes: providerExitBytes,
          };
        if (input.observationClass === 'PROVIDER_EXECUTION') return {
          receipt: {
            receiptDigest: providerExecutionReceipt.ref,
            evidenceDigest: providerExecutionReceipt.digest,
          },
          bytes: Buffer.from('{}'),
        };
        return {
            receipt: {
              receiptDigest: providerStartReceipt.ref,
              evidenceDigest: providerStartReceipt.digest,
              observedAt: '2026-09-01T00:00:00.250Z',
            },
            bytes: providerStartBytes,
          };
      }),
      readTaskSnapshot: vi.fn(() => ({
        admission: { receiptDigest: admissionReceiptDigest },
        proof: {
          sha256: taskSnapshotSha256,
          byteLength: taskSnapshotBytes.byteLength,
        },
        bytes: taskSnapshotBytes,
      })),
      readArtifactReceipt: vi.fn((input: { artifactClass: string }) => {
        if (input.artifactClass === 'host-work-attribution') {
          return durableHostWorkArtifact?.receipt ?? null;
        }
        if (input.artifactClass === 'pristine-provider-stream') {
          return durableProviderStreamArtifact.receipt;
        }
        if (input.artifactClass === 'canonical-accepted-result') return acceptedReceipt;
        return null;
      }),
      readVerifiedArtifact: vi.fn((input: { artifactClass: string }) => {
        if (input.artifactClass === 'host-work-attribution') {
          return durableHostWorkArtifact;
        }
        if (input.artifactClass === 'worker-result') {
          return { receipt: sourceReceipt, bytes: rawWorkerResultBytes };
        }
        if (input.artifactClass === 'pristine-provider-stream') {
          return { ...durableProviderStreamArtifact, bytes: providerStreamBytes };
        }
        return acceptedBytes && acceptedReceipt
          ? { receipt: acceptedReceipt, bytes: acceptedBytes }
          : null;
      }),
      readVerifiedEffectLanding: vi.fn(() => verifiedEffectLanding),
      publishHostArtifact: vi.fn((input: { artifactKey: string; capturedAt: string; bytes: Uint8Array }) => {
        acceptedBytes = Uint8Array.from(input.bytes);
        acceptedReceipt = {
          schemaVersion: 2,
          artifactClass: 'canonical-accepted-result',
          captureMode: 'host-authority-publication',
          identity,
          admissionReceiptDigest,
          policyDigest: policy.policyDigest,
          artifactKey: input.artifactKey,
          capturedAt: input.capturedAt,
          artifact: {
            sha256: `sha256:${createHash('sha256').update(input.bytes).digest('hex')}`,
            byteLength: input.bytes.byteLength,
          },
          receiptDigest: digest('a'),
        };
        return acceptedReceipt;
      }),
      appendChain: vi.fn((input: {
        occurredAt: string;
        predecessorDigest: string;
        artifactReceipt: { artifactKey: string; receiptDigest: string };
      }) => {
        acceptedChain = {
          stage: 'accepted-result',
          occurredAt: input.occurredAt,
          predecessorDigest: input.predecessorDigest,
          artifactKey: input.artifactReceipt.artifactKey,
          artifactReceiptDigest: input.artifactReceipt.receiptDigest,
          receiptDigest: digest('b'),
        };
        return acceptedChain;
      }),
      readChain: vi.fn((_identity: unknown, _policy: unknown, stage: string) => (
        stage === 'effect-landing' ? effectLandingChain : acceptedChain
      )),
    };
    const hostWorkBody = {
      schemaVersion: 2 as const,
      kind: 'exact-docker-host-work-attribution' as const,
      state: 'VERIFIED' as const,
      attemptId: identity.attemptId,
      dispatchRequestId: query.custodyRef.dispatchRequestId,
      admissionRefDigest,
      providerExitObservationReceiptDigest: providerExitReceiptDigest,
      baselineRef: `task-attempt-custody-provider-exit:${providerExitReceiptDigest}#scope-baseline:sha256:${scopeBaselineSha256.slice('sha256:'.length)}`,
      baselineSha256: scopeBaselineSha256.slice('sha256:'.length),
      scopeDigest,
      filesChanged: [],
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      reasonCode: 'NONE' as const,
    };
    const hostWorkAttribution = {
      ...hostWorkBody,
      evidenceDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(hostWorkBody)).digest('hex')}` as const,
    };
    durableHostWorkArtifact = custodyArtifactFixture({
      identity,
      admissionReceiptDigest,
      policyDigest: policy.policyDigest,
      artifactClass: 'host-work-attribution',
      artifactKey: `host-work-${identity.attemptId}`,
      capturedAt: providerExitObservedAt,
      bytes: Buffer.from(canonicalJson(hostWorkAttribution)),
      receiptCharacter: 'c',
    });
    const hostWorkArtifactBinding = {
      artifactClass: 'host-work-attribution' as const,
      artifactKey: durableHostWorkArtifact.receipt.artifactKey,
      artifactReceiptDigest: durableHostWorkArtifact.receipt.receiptDigest,
      artifactSha256: durableHostWorkArtifact.receipt.artifact.sha256,
      byteLength: durableHostWorkArtifact.receipt.artifact.byteLength,
    };
    const hostWorkAuthorityBody = {
      filesChanged: [],
      totalLinesAdded: 0,
      totalLinesRemoved: 0,
      workAttribution: {
        state: 'VERIFIED' as const,
        attemptId: identity.attemptId,
        baselineRef: hostWorkBody.baselineRef,
        baselineSha256: hostWorkBody.baselineSha256,
        scopeDigest,
      },
      providerExitObservationReceiptDigest: providerExitReceiptDigest,
    };
    const hostWorkAuthority = {
      ...hostWorkAuthorityBody,
      evidenceDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(hostWorkAuthorityBody)).digest('hex')}` as const,
    };
    const hostPromptBody = {
      promptDeliveryAttribution: { state: 'CURRENT' as const },
      agentId: promptDelivery.authority.deliveredAgentId,
      skillIds: [...promptDelivery.authority.deliveredSkillIds],
      promptCompilePlanId: promptDelivery.authority.promptCompilePlanId,
      receiptIdentity: promptDelivery.authority.receiptIdentity,
      promptDeliveryAuthorityDigest: promptDelivery.authority.authorityDigest,
      basePromptSha256: promptDelivery.authority.basePromptSha256,
      segmentManifestDigest: promptDelivery.authority.segmentManifestDigest,
      taskSnapshotSha256,
      providerInvocationDigest: taskSnapshot.dispatch.providerInvocationDigest,
      providerStartObservationReceiptDigest: providerStartReceipt.ref,
      providerStartObservationEvidenceDigest: providerStartReceipt.digest,
      executionCommitNonceSha256: taskSnapshot.dispatch.executionCommitNonceSha256,
    };
    const hostPromptDeliveryAuthority = {
      ...hostPromptBody,
      bindingDigest: `sha256:${createHash('sha256')
        .update(canonicalJson(hostPromptBody)).digest('hex')}` as const,
    };
    const scope = {
      store,
      policy,
      identity,
      admission: { taskSnapshot: { sha256: taskSnapshotSha256 } },
      admissionRef: {
        dispatchRequestId: query.custodyRef.dispatchRequestId,
        identity,
        admissionReceiptDigest,
        refDigest: admissionRefDigest,
      },
      taskSnapshot: persistedTaskSnapshot,
      provider: 'fixture-provider',
      model: 'fixture-model',
      execution: exactExecution,
    };
    const completion = {
      kind: 'result-captured',
      custodyRef: query.custodyRef,
      releaseReceipt,
      projectionFence,
      providerExit,
      hostWorkAttribution,
      hostEffectAuthority: {
        projection: effectProjection,
        binding: effectLandingBinding,
      },
      result: sourceBinding,
      resultArtifact: {
        artifactKey: sourceReceipt.artifactKey,
        receiptDigest: sourceReceipt.receiptDigest,
      },
      providerStream: {
        artifactKey: durableProviderStreamArtifact.receipt.artifactKey,
        receiptDigest: providerStreamReceiptDigest,
        contentDigest: providerStreamDigest,
        byteLength: providerStreamBytes.byteLength,
        capturedAt: billingEvidence.capturedAt,
      },
      providerBilling: {
        evidence: billingEvidence,
        evidenceDigest: billingEvidenceDigest,
        providerStreamReceiptDigest,
      },
    };
    const backend = new DockerSpawnBackend('/test/project', { custodyStateDir: '/test/state' });
    const internals = backend as unknown as {
      exactCustodyProviderStarts: Map<string, unknown>;
      exactCustodyProviderExecutions: Map<string, unknown>;
      exactCustodyCompletions: Map<string, unknown>;
    };
    internals.exactCustodyProviderStarts.set(admissionRefDigest, providerStartReceipt);
    internals.exactCustodyProviderExecutions.set(
      admissionRefDigest, providerExecutionReceipt,
    );
    internals.exactCustodyCompletions.set(admissionRefDigest, {
      scope, query, providerStartReceipt, providerExecutionReceipt,
      promise: Promise.resolve(completion),
    });

    await expect(backend.awaitExactDockerCustodyTerminal(query as never))
      .resolves.toMatchObject({ kind: 'result-captured' });
    expect(internals.exactCustodyCompletions.size).toBe(1);
    await expect(backend.acceptExactDockerCustodyResult({
      query,
      authority: {
        taskId: identity.taskId,
        workerId: 'forged-worker',
        provider: 'fixture-provider',
        model: 'fixture-model',
        promptCompilePlanId: task.promptCompilePlanId,
        isPriorityFix: false,
        fixForTaskId: null,
      },
    } as never)).rejects.toThrow(/COMPLETION_IDENTITY_MISMATCH/);
    expect(store.publishHostArtifact).not.toHaveBeenCalled();

    const heldWorkBody = {
      ...hostWorkBody,
      state: 'HOLD' as const,
      reasonCode: 'DIFF_UNMEASURABLE' as const,
    };
    const heldCompletion = {
      ...completion,
      hostWorkAttribution: {
        ...heldWorkBody,
        evidenceDigest: `sha256:${createHash('sha256')
          .update(canonicalJson(heldWorkBody)).digest('hex')}` as const,
      },
    };
    internals.exactCustodyCompletions.set(admissionRefDigest, {
      scope, query, providerStartReceipt, providerExecutionReceipt,
      promise: Promise.resolve(heldCompletion),
    });
    await expect(backend.acceptExactDockerCustodyResult({
      query,
      authority: {
        taskId: identity.taskId,
        workerId: 'worker-fixture-001',
        provider: 'fixture-provider',
        model: 'fixture-model',
        promptCompilePlanId: task.promptCompilePlanId,
        isPriorityFix: false,
        fixForTaskId: null,
      },
    } as never)).resolves.toMatchObject({
      kind: 'capture-hold', reasonCode: 'HOST_WORK_ATTRIBUTION_HOLD',
    });
    expect(store.publishHostArtifact).not.toHaveBeenCalled();
    internals.exactCustodyCompletions.set(admissionRefDigest, {
      scope, query, providerStartReceipt, providerExecutionReceipt,
      promise: Promise.resolve(completion),
    });

    const accepted = await backend.acceptExactDockerCustodyResult({
      query,
      authority: {
        taskId: identity.taskId,
        workerId: 'worker-fixture-001',
        provider: 'fixture-provider',
        model: 'fixture-model',
        promptCompilePlanId: task.promptCompilePlanId,
        isPriorityFix: false,
        fixForTaskId: null,
      },
    } as never);
    expect(store.publishHostArtifact).toHaveBeenCalledWith(expect.objectContaining({
      artifactClass: 'canonical-accepted-result',
      capturedAt: effectLandingReleasedAt,
    }));
    expect(store.appendChain).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'accepted-result',
      occurredAt: effectLandingReleasedAt,
      predecessorDigest: effectLandingBinding.effectLandingChainDigest,
    }));
    expect(acceptedReceipt).toMatchObject({ capturedAt: effectLandingReleasedAt });
    expect(acceptedChain).toMatchObject({
      occurredAt: effectLandingReleasedAt,
      predecessorDigest: effectLandingBinding.effectLandingChainDigest,
    });
    expect(accepted).toMatchObject({
      kind: 'accepted-result',
      result: {
        workerId: 'worker-fixture-001',
        tokenUsage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 3 },
        cost: { usd: 2.5, billingMode: 'api' },
        providerBilling: billingEvidence,
        promptDeliveryAttribution: { state: 'CURRENT' },
        agent: 'backend-specialist',
        skills: ['delivered-skill'],
      },
    });
    expect(internals.exactCustodyProviderStarts.size).toBe(0);
    expect(internals.exactCustodyCompletions.size).toBe(0);
    if (accepted.kind !== 'accepted-result') throw new Error('accepted result expected');
    expect(Object.isFrozen(accepted.result)).toBe(true);
    expect(Object.isFrozen(accepted.result.tokenUsage)).toBe(true);
    expect(() => {
      (accepted.result.tokenUsage as { inputTokens: number }).inputTokens = 999;
    }).toThrow();
    expect(backend.readExactDockerAcceptedResult(accepted.reader).resultDigest)
      .toBe(accepted.resultDigest);

    const acceptedEffectAuthority = {
      projection: effectProjection,
      binding: effectLandingBinding,
      verifiedLanding: verifiedEffectLanding,
    };
    const coldBackend = new DockerSpawnBackend('/test/project', {
      custodyStateDir: '/test/state',
    });
    const readColdAccepted = (coldBackend as unknown as {
      readColdExactDockerAcceptedResult(
        scope: unknown,
        query: unknown,
        providerExit: unknown,
      ): Record<string, unknown> | null;
    }).readColdExactDockerAcceptedResult.bind(coldBackend);
    const pristineAcceptedChain = acceptedChain;
    acceptedChain = null;
    store.appendChain.mockClear();
    mockLifecycleStoreAdmissionAdapter.mockReturnValueOnce({
      readAcceptedAuthority: vi.fn(() => acceptedEffectAuthority),
    } as never);
    expect(readColdAccepted(scope, query, providerExit)).toMatchObject({
      kind: 'accepted-result',
      acceptedResultChainDigest: digest('b'),
    });
    expect(store.appendChain).toHaveBeenCalledTimes(1);
    expect(store.appendChain).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'accepted-result',
      predecessorDigest: effectLandingBinding.effectLandingChainDigest,
    }));

    store.appendChain.mockClear();
    mockLifecycleStoreAdmissionAdapter.mockReturnValueOnce({
      readAcceptedAuthority: vi.fn(() => acceptedEffectAuthority),
    } as never);
    expect(readColdAccepted(scope, query, providerExit)).toMatchObject({
      kind: 'accepted-result',
      acceptedResultChainDigest: digest('b'),
    });
    expect(store.appendChain).not.toHaveBeenCalled();

    const repairedAcceptedChain = acceptedChain as Record<string, unknown>;
    for (const siblingOrWrongChain of [
      { ...repairedAcceptedChain, artifactKey: 'accepted-sibling-attempt' },
      { ...repairedAcceptedChain, predecessorDigest: digest('f') },
    ]) {
      acceptedChain = siblingOrWrongChain;
      mockLifecycleStoreAdmissionAdapter.mockReturnValueOnce({
        readAcceptedAuthority: vi.fn(() => acceptedEffectAuthority),
      } as never);
      expect(() => readColdAccepted(scope, query, providerExit))
        .toThrow(/EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED/);
    }
    acceptedChain = pristineAcceptedChain;

    const acceptedReaderInternals = backend as unknown as {
      exactAcceptedResultReaders: WeakMap<object, Record<string, unknown>>;
    };
    const pristineReaderEntry = acceptedReaderInternals.exactAcceptedResultReaders
      .get(accepted.reader as object)!;
    const pristineAcceptedBytes = acceptedBytes!;
    const pristineAcceptedReceipt = acceptedReceipt!;
    const forgedAcceptedResult = assembleCanonicalIngressResultV2(
      JSON.parse(Buffer.from(rawWorkerResultBytes).toString('utf8')),
      {
        taskId: identity.taskId,
        workerId: 'forged-semantic-worker',
        provider: 'fixture-provider',
        model: 'fixture-model',
        promptCompilePlanId: task.promptCompilePlanId,
        isPriorityFix: false,
        fixForTaskId: null,
      },
      {
        attemptCustody: sourceBinding,
        hostWorkArtifact: hostWorkArtifactBinding,
        jsonBounds: policy.jsonBounds,
        hostTerminalBilling: {
          evidence: billingEvidence,
          evidenceDigest: billingEvidenceDigest,
          providerStreamReceiptDigest,
          billingMode: 'api',
        },
        hostWorkAuthority,
        hostPromptDeliveryAuthority,
        hostEffectAuthority: {
          projection: effectProjection,
          binding: effectLandingBinding,
        },
      },
    );
    acceptedBytes = Buffer.from(canonicalJson(forgedAcceptedResult));
    acceptedReceipt = {
      ...pristineAcceptedReceipt,
      artifact: {
        sha256: `sha256:${createHash('sha256').update(acceptedBytes).digest('hex')}`,
        byteLength: acceptedBytes.byteLength,
      },
    };
    acceptedReaderInternals.exactAcceptedResultReaders.set(accepted.reader as object, {
      ...pristineReaderEntry,
      resultDigest: taskResultV2Digest(forgedAcceptedResult, policy.jsonBounds),
    });
    expect(() => backend.readExactDockerAcceptedResult(accepted.reader))
      .toThrow(/ACCEPTED_RESULT_READER_INVALID/);
    acceptedBytes = pristineAcceptedBytes;
    acceptedReceipt = pristineAcceptedReceipt;
    acceptedReaderInternals.exactAcceptedResultReaders.set(
      accepted.reader as object, pristineReaderEntry,
    );
    const pristineProviderStartBytes = providerStartBytes;
    const providerStartBundle = JSON.parse(pristineProviderStartBytes.toString('utf8'));
    for (const key of Object.keys(providerStartBundle)) {
      providerStartBytes = Buffer.from(canonicalJson({
        ...providerStartBundle,
        [key]: key === 'schemaVersion' ? 3 : 'foreign',
      }));
      expect(() => backend.readExactDockerAcceptedResult(accepted.reader), key)
        .toThrow(/ACCEPTED_RESULT_READER_INVALID/);
    }
    providerStartBytes = Buffer.from(canonicalJson({ forged: true }));
    expect(() => backend.readExactDockerAcceptedResult(accepted.reader))
      .toThrow(/ACCEPTED_RESULT_READER_INVALID/);
    providerStartBytes = pristineProviderStartBytes;
    const pristineTaskSnapshotBytes = taskSnapshotBytes;
    taskSnapshotBytes = Buffer.from(canonicalJson({ forged: true }));
    expect(() => backend.readExactDockerAcceptedResult(accepted.reader))
      .toThrow(/ACCEPTED_RESULT_READER_INVALID/);
    taskSnapshotBytes = pristineTaskSnapshotBytes;
    providerStreamBytes = Buffer.from('no durable billing envelope');
    expect(() => backend.readExactDockerAcceptedResult(accepted.reader))
      .toThrow(/ACCEPTED_RESULT_READER_INVALID/);
    expect(completion.kind).toBe('result-captured');
  });

  it('rejects terminal queries with a missing or foreign provider-start receipt', async () => {
    const digest = (character: string) => `sha256:${character.repeat(64)}`;
    const providerStartReceipt = { ref: digest('1'), digest: digest('2') };
    const providerExecutionReceipt = { ref: digest('a'), digest: digest('b') };
    const custodyRef = {
      dispatchRequestId: 'dispatch-request-1',
      identity: {
        schemaVersion: 2, backend: 'docker', projectRootSha256: '3'.repeat(64),
        projectId: 'project', taskId: 'task', attemptId: 'attempt-1', generation: 1,
      },
      admissionReceiptDigest: digest('4'),
      admissionRefDigest: digest('5'),
      providerStartReceipt,
    };
    const releaseReceipt = { ref: digest('6'), digest: digest('7') };
    const projectionFence = digest('8');
    const query = { custodyRef, releaseReceipt, providerStartReceipt, projectionFence };
    const store = {
      readDispatchAuthority: vi.fn(() => ({
        state: 'terminal',
        authority: {
          state: 'RELEASED',
          admissionRef: {
            identity: custodyRef.identity,
            admissionReceiptDigest: custodyRef.admissionReceiptDigest,
            refDigest: custodyRef.admissionRefDigest,
            dispatchRequestId: custodyRef.dispatchRequestId,
          },
          releaseReceiptDigest: releaseReceipt.ref,
          releaseEvidenceDigest: releaseReceipt.digest,
          projectionFence,
        },
      })),
      readDispatchObservation: vi.fn((input: { observationClass: string }) => ({
        receipt: {
          evidenceDigest: input.observationClass === 'PROVIDER_EXECUTION'
            ? providerExecutionReceipt.digest
            : providerStartReceipt.digest,
        },
      })),
    };
    const completed = {
      kind: 'capture-hold', custodyRef, releaseReceipt, projectionFence,
      reasonCode: 'LIVE_MONITOR_UNAVAILABLE',
      evidence: { kind: 'release-authority', receipt: releaseReceipt },
    };
    const exactBackend = new DockerSpawnBackend('/test/project', {
      custodyStateDir: '/test/state',
    });
    (exactBackend as never as {
      exactCustodyCompletions: Map<string, unknown>;
    }).exactCustodyCompletions.set(custodyRef.admissionRefDigest, {
      scope: { store, admissionRef: {}, policy: {} },
      query,
      providerStartReceipt,
      providerExecutionReceipt,
      promise: Promise.resolve(completed),
    });

    let nestedGetterCalls = 0;
    const accessorIdentity = { ...custodyRef.identity } as Record<string, unknown>;
    Object.defineProperty(accessorIdentity, 'taskId', {
      enumerable: true,
      get: () => { nestedGetterCalls += 1; return 'task'; },
    });
    await expect(exactBackend.awaitExactDockerCustodyTerminal({
      ...query,
      custodyRef: { ...custodyRef, identity: accessorIdentity },
    } as never)).rejects.toThrow(/IDENTITY_MISMATCH/);
    expect(nestedGetterCalls).toBe(0);
    await expect(exactBackend.awaitExactDockerCustodyTerminal({
      ...query,
      custodyRef: { ...custodyRef, identity: new Proxy({ ...custodyRef.identity }, {}) },
    } as never)).rejects.toThrow(/IDENTITY_MISMATCH/);

    await expect(exactBackend.awaitExactDockerCustodyTerminal({
      custodyRef, releaseReceipt, projectionFence,
    } as never)).rejects.toThrow(/IDENTITY_MISMATCH/);
    await expect(exactBackend.awaitExactDockerCustodyTerminal({
      ...query,
      providerStartReceipt: { ...providerStartReceipt, digest: digest('9') },
    } as never)).rejects.toThrow(/IDENTITY_MISMATCH/);
    const mutableQuery = JSON.parse(canonicalJson(query));
    const snapshottedWait = exactBackend.awaitExactDockerCustodyTerminal(mutableQuery as never);
    mutableQuery.providerStartReceipt.digest = digest('9');
    mutableQuery.custodyRef.identity.taskId = 'mutated-after-call';
    await expect(snapshottedWait).resolves.toEqual(completed);
    store.readDispatchObservation.mockReturnValueOnce({
      receipt: { evidenceDigest: digest('0') },
    });
    await expect(exactBackend.awaitExactDockerCustodyTerminal(query as never))
      .rejects.toThrow(/IDENTITY_MISMATCH/);
    store.readDispatchObservation.mockImplementationOnce(() => {
      throw new Error('durable provider-start observation missing');
    });
    await expect(exactBackend.awaitExactDockerCustodyTerminal(query as never))
      .rejects.toThrow(/durable provider-start observation missing/);
    (exactBackend as never as {
      exactCustodyCompletions: Map<string, unknown>;
    }).exactCustodyCompletions.delete(custodyRef.admissionRefDigest);
    await expect(exactBackend.awaitExactDockerCustodyTerminal(query as never))
      .resolves.toMatchObject({
        kind: 'capture-hold',
        reasonCode: 'LIVE_MONITOR_UNAVAILABLE',
      });
  });
});

// ─── 1. Config default — the flag ships OFF ─────────────────────────────────

describe('prompt.catalog_mount_mask default (593-001 F2c)', () => {
  it('defaults to false so worker mounts stay byte-identical until opted in', () => {
    expect(DEFAULT_PROMPT_CONFIG.catalog_mount_mask).toBe(false);
  });

  it('publishes English and Turkish config-reference metadata', () => {
    expect(getConfigHelp('prompt.catalog_mount_mask')).toMatchObject({
      type: 'boolean',
      default: false,
      category: 'Prompt',
      description: expect.any(String),
      descriptionTr: expect.any(String),
    });
  });
});

// ─── 2. Pure helper — mask-arg generation ───────────────────────────────────

describe('buildCatalogMaskMountArgs (593-001 F2c)', () => {
  it('masks exactly the two design catalogs, read-only, when the flag is on', () => {
    const args = buildCatalogMaskMountArgs(true, MASK_SOURCE, CATALOG_MASK_RELATIVE_PATHS);
    expect(args).toEqual([
      '-v', `${MASK_SOURCE}:/workspace/.claude/skills:ro`,
      '-v', `${MASK_SOURCE}:/workspace/.claude/agents:ro`,
    ]);
  });

  it('emits ZERO args when the flag is off — the default, byte-identical argv pin', () => {
    // The whole point of the gate: nothing new lands in `docker run` argv while
    // prompt.catalog_mount_mask is false, even if both catalogs exist on the host.
    expect(buildCatalogMaskMountArgs(false, MASK_SOURCE, CATALOG_MASK_RELATIVE_PATHS)).toEqual([]);
    expect(buildCatalogMaskMountArgs(false, MASK_SOURCE, ['.claude/skills'])).toEqual([]);
  });

  it('emits NO arg for a catalog the caller reports absent (no phantom host dir)', () => {
    // A nested bind mount materializes a MISSING target on the host underlying dir
    // before mounting, and /workspace IS the project root (same inode) — masking a
    // non-existent `.claude/agents` would create it inside the user's repo.
    const args = buildCatalogMaskMountArgs(true, MASK_SOURCE, ['.claude/skills']);
    expect(args).toEqual(['-v', `${MASK_SOURCE}:/workspace/.claude/skills:ro`]);
    expect(args.some(a => a.includes('.claude/agents'))).toBe(false);
  });

  it('emits zero args when NO catalog exists on the host, even with the flag on', () => {
    expect(buildCatalogMaskMountArgs(true, MASK_SOURCE, [])).toEqual([]);
  });

  it('always mounts read-only (a worker must never write through the mask)', () => {
    const args = buildCatalogMaskMountArgs(true, MASK_SOURCE, CATALOG_MASK_RELATIVE_PATHS);
    for (let i = 0; i < args.length; i += 2) {
      expect(args[i]).toBe('-v');
      expect(args[i + 1]).toMatch(/:ro$/);
    }
  });
});

describe('ensureCatalogMaskDir (593-001 F2c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the shared empty mask source under .tasks/ idempotently', () => {
    expect(ensureCatalogMaskDir('/test/project/.tasks')).toBe(MASK_SOURCE);
    expect(ensureCatalogMaskDir('/test/project/.tasks')).toBe(MASK_SOURCE);
    // recursive: true — a second worker in the same sprint must not throw on EEXIST.
    expect(mockMkdirSync).toHaveBeenCalledWith(MASK_SOURCE, { recursive: true });
    expect(mockMkdirSync).toHaveBeenCalledTimes(2);
  });
});

// ─── 3. Wiring — DockerSpawnBackend.spawn() argv ────────────────────────────

interface SpawnSyncOutcome {
  stdout: string;
  stderr: string;
  status: number;
}

/** Capture every `docker run` argv list invoked during a spawn(). */
const capturedDockerRunArgs: string[][] = [];

function installSpawnRouter(): void {
  capturedDockerRunArgs.length = 0;
  const successOutcome: SpawnSyncOutcome = { stdout: 'container-id-x', stderr: '', status: 0 };
  const imageOutcome: SpawnSyncOutcome = { stdout: 'imghash', stderr: '', status: 0 };
  const inspectOutcome: SpawnSyncOutcome = { stdout: 'true|0', stderr: '', status: 0 };
  const fallback: SpawnSyncOutcome = { stdout: '', stderr: '', status: 0 };

  mockSpawnSync.mockImplementation((cmd, args) => {
    const argv = (args as string[] | undefined) ?? [];
    const sub = argv[0];

    let outcome: SpawnSyncOutcome;
    if (cmd === 'sleep') {
      outcome = fallback;
    } else if (cmd === 'docker' && sub === 'images') {
      outcome = imageOutcome;
    } else if (cmd === 'docker' && sub === 'run') {
      capturedDockerRunArgs.push([...argv]);
      outcome = successOutcome;
    } else if (cmd === 'docker' && sub === 'inspect') {
      outcome = inspectOutcome;
    } else if (cmd === 'claude' && argv.join(' ') === 'auth status --json') {
      outcome = { stdout: '{"loggedIn":true}', stderr: '', status: 0 };
    } else {
      outcome = fallback;
    }

    return {
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      status: outcome.status,
      signal: null,
      pid: 1,
      output: ['', outcome.stdout, outcome.stderr],
    } as unknown as ReturnType<typeof spawnSync>;
  });
}

/** Args from a captured `docker run` argv that touch /workspace/.claude/. */
function catalogMountArgs(argv: string[]): string[] {
  return argv.filter(a => a.includes(':/workspace/.claude/'));
}

describe('DockerSpawnBackend: catalog mount mask wiring (593-001 F2c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    absentPaths = new Set();
    // Heartbeat-authority identity readbacks must surface ENOENT: the full node:fs
    // mock cannot carry the WorkerHeartbeatAuthorityStore write→readback chain, and
    // the '{}' fallback would trip its schema guard. ENOENT routes the store onto
    // its honest uninitialized-attempt path (proven in the store's own suite).
    mockReadFileSync.mockImplementation(((path: unknown) => {
      if (String(path).includes('worker-heartbeat-authority')) {
        const error = new Error(`ENOENT: no such file or directory, open '${String(path)}'`) as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      return budgetedDockerTaskJson(path);
    }) as typeof readFileSync);
    installSpawnRouter();
  });

  it('emits ZERO catalog mounts by DEFAULT (flag off) even though both catalogs exist', async () => {
    const backend = new DockerSpawnBackend('/test/project');
    backend.spawn('catalog-mask-default', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([]);
    // No mask source directory is created either — the gate is fully inert.
    expect(mockMkdirSync).not.toHaveBeenCalledWith(MASK_SOURCE, { recursive: true });
  });

  it('threads effective prompt.catalog_mount_mask through the factory into docker argv', async () => {
    const backend = SpawnBackendFactory.create({
      backend: 'docker',
      projectDir: '/test/project',
      effectiveConfig: {
        prompt: {
          ...DEFAULT_PROMPT_CONFIG,
          catalog_mount_mask: true,
        },
      },
    });

    backend.spawn('catalog-mask-factory', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await (backend as DockerSpawnBackend).lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([
      `${MASK_SOURCE}:/workspace/.claude/skills:ro`,
      `${MASK_SOURCE}:/workspace/.claude/agents:ro`,
    ]);
  });

  it('masks both catalogs read-only when the flag is on and both exist on the host', async () => {
    const backend = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backend.spawn('catalog-mask-on', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([
      `${MASK_SOURCE}:/workspace/.claude/skills:ro`,
      `${MASK_SOURCE}:/workspace/.claude/agents:ro`,
    ]);
    expect(mockMkdirSync).toHaveBeenCalledWith(MASK_SOURCE, { recursive: true });
  });

  it('skips a catalog missing on the host (no phantom .claude/agents in the repo)', async () => {
    absentPaths = new Set([AGENTS_HOST]);
    const backend = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backend.spawn('catalog-mask-partial', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([
      `${MASK_SOURCE}:/workspace/.claude/skills:ro`,
    ]);
  });

  it('emits no catalog mount at all when NEITHER catalog exists on the host', async () => {
    absentPaths = new Set([SKILLS_HOST, AGENTS_HOST]);
    const backend = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backend.spawn('catalog-mask-none', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    expect(capturedDockerRunArgs.length).toBe(1);
    expect(catalogMountArgs(capturedDockerRunArgs[0]!)).toEqual([]);
    expect(mockMkdirSync).not.toHaveBeenCalledWith(MASK_SOURCE, { recursive: true });
  });

  it('keeps every pre-existing mount byte-identical — the mask is purely additive', async () => {
    const backend = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backend.spawn('catalog-mask-parity', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backend.lastSpawnCompletion;

    const argv = capturedDockerRunArgs[0]!;
    // Project root still read-write, .tasks/ and .locks/ untouched, dist/ still :ro.
    expect(argv).toContain('/test/project:/workspace');
    expect(argv).toContain('/test/project/.tasks:/workspace/.tasks');
    expect(argv).toContain('/test/project/.locks:/workspace/.locks');
    expect(argv).toContain('/test/project/dist:/workspace/dist:ro');
  });

  it('produces argv identical to the unmasked spawn except for the mask args', async () => {
    // The per-spawn random promptId legitimately differs between two spawns (it rides
    // the git-guard dir name and IDEMPOTENCY_KEY); normalize ONLY those two tokens so
    // the comparison measures the mask's argv impact and nothing else.
    const normalize = (argv: string[]): string[] => argv.map(a => a
      .replace(/IDEMPOTENCY_KEY=[0-9a-f]+$/, 'IDEMPOTENCY_KEY=<promptId>')
      .replace(/(deckent-git-guard\/[^:]*?)-[0-9a-f]{8}:/, '$1-<promptId>:'));

    const backendOff = new DockerSpawnBackend('/test/project');
    backendOff.spawn('catalog-parity-off', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backendOff.lastSpawnCompletion;
    const offArgv = normalize(capturedDockerRunArgs[0]!);

    installSpawnRouter();
    const backendOn = new DockerSpawnBackend('/test/project', { catalogMountMask: true });
    backendOn.spawn('catalog-parity-off', 'claude-sonnet-5', 'prompt-body', TEST_EXECUTION_OPTIONS);
    await backendOn.lastSpawnCompletion;
    const onArgv = normalize(capturedDockerRunArgs[0]!);

    // Strip the two `-v <mask>` pairs; what remains must equal the flag-off argv.
    const stripped: string[] = [];
    for (let i = 0; i < onArgv.length; i++) {
      const arg = onArgv[i]!;
      if (arg === '-v' && (onArgv[i + 1] ?? '').includes(':/workspace/.claude/')) {
        i++;
        continue;
      }
      stripped.push(arg);
    }
    expect(stripped).toEqual(offArgv);
    // Sanity: the normalization did not erase the mask itself.
    expect(onArgv.length - stripped.length).toBe(4);
  });
});
