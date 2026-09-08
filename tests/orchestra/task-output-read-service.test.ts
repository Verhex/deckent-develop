import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { attendedExecutionProjectId } from '../../src/core/attended-execution-approval.js';
import {
  canonicalTaskAttemptCustodyJson,
  TaskAttemptCustodyHold,
} from '../../src/core/task-attempt-custody-store.js';
import type { TaskOutputReadQuery } from '../../src/core/task-output-read-service.js';
import { deriveProductionWiringApplicability, type Task } from '../../src/core/task-types.js';
import {
  createExactDockerDispatchTaskMaterialAuthority,
  exactDockerDispatchCanonicalDigest,
} from '../../src/orchestra/exact-docker-dispatch-task-authority.js';
import { createExactNormalTaskApprovedMaterialV3 } from '../../src/orchestra/exact-evaluation-policy-authority.js';
import {
  createExactDockerCustodyPolicy,
  createExactDockerPromptDeliveryAuthority,
  createExactDockerTaskOutputReadService,
  DockerSpawnBackend,
} from '../../src/orchestra/spawn-backend-docker.js';

const projectRoot = '/test/exact-output-project';
const projectId = attendedExecutionProjectId(projectRoot);
const digest = (value: string | Uint8Array): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;
const policy = createExactDockerCustodyPolicy();

function taskSnapshot(
  attemptId = 'attempt-1',
  taskId = '719-001',
  sprintId = 'sprint-719',
  tenantId = 'tenant-a',
  generation = 1,
) {
  const scope = { directories: [], filesRead: [], filesWrite: [] };
  const prompt = 'Read exact provider output.';
  const promptCompilePlanId = `prompt-compile-plan:sha256:${'c'.repeat(64)}`;
  const task = createExactDockerDispatchTaskMaterialAuthority({
    id: taskId, title: 'Exact output fixture', description: 'Read sealed custody output.',
    model: 'gpt-5.6-terra', effort: 'normal', priority: 'NORMAL',
    reason: 'custody read fixture', scope,
    productionWiringApplicability: deriveProductionWiringApplicability(scope),
    dependencies: [], goNogo: {
      goCriteria: 'sealed output is returned', noGoCriteria: 'custody is bypassed',
      techDebtAcceptable: 'none',
    },
    status: 'EXECUTING', sprintId, type: 'code-development', provider: 'codex',
    authMode: 'subscription', actor: { id: 'worker', tenantId }, promptCompilePlanId,
  } as Task, 'worker-output-reader', policy);
  const dispatchDigest = exactDockerDispatchCanonicalDigest(task, policy);
  const approved = createExactNormalTaskApprovedMaterialV3({
    sprintId, task, dispatchTaskMaterialDigest: dispatchDigest, policy,
  });
  const lineage = { predecessor: null };
  const delivery = createExactDockerPromptDeliveryAuthority({
    taskId, prompt, promptCompilePlanId, rolePolicyIdentity: 'worker:generic',
    segments: [{ tier: 'T0', kind: 'task', content: prompt }],
  });
  const dispatchRequestId = `dreq-${'a'.repeat(63)}${generation}`;
  const runnerSource = 'readonly fixture runner';
  const scopeBaseline = 'readonly scope baseline';
  const bytes = canonicalTaskAttemptCustodyJson({
    schemaVersion: 2, kind: 'exact-docker-dispatch-snapshot', dispatchRequestId,
    projectId, taskId,
    material: {
      approved, approvedSha256: exactDockerDispatchCanonicalDigest(approved, policy),
      dispatch: task, dispatchSha256: dispatchDigest,
      lineage, lineageSha256: exactDockerDispatchCanonicalDigest(lineage, policy),
    },
    dispatch: {
      model: 'gpt-5.6-terra', provider: 'codex',
      execution: {
        allowedTools: null, availableTools: null, authMode: 'subscription',
        isolatedContext: true, reasoningEffort: null, excludeDynamicPromptSections: false,
        taskTimeoutSeconds: 300, actionId: null, executionBudget: null,
        executionLandingPolicy: null, executionAdmissionMode: null,
        executionApprovalEvidenceRef: null, finalOnlyUsageContainment: null,
      },
      prompt, promptSha256: digest(prompt), promptDeliveryAuthority: delivery,
      systemPromptCore: null, systemPromptCoreSha256: null,
      scopeBaseline, scopeBaselineSha256: digest(scopeBaseline),
      runnerSource, runnerSourceSha256: digest(runnerSource),
      providerInvocationDigest: digest('invocation'),
      releaseIntentNonceSha256: digest('release-intent'),
      releaseCommitNonceSha256: digest('release-commit'),
      providerStartNonceSha256: digest('provider-start'),
      executionCommitNonceSha256: digest('execution-commit'),
    },
  }, policy.jsonBounds);
  return { bytes, sha256: digest(bytes), dispatchRequestId };
}
const identity = (attemptId = 'attempt-1', generation = 1, taskId = '719-001') => ({
  schemaVersion: 2 as const, backend: 'docker' as const, projectRootSha256: digest(projectRoot),
  projectId, taskId, attemptId, generation,
});
const admission = (
  attemptId = 'attempt-1', generation = 1, taskId = '719-001',
  sprintId = 'sprint-719', tenantId = 'tenant-a',
) => {
  const exactIdentity = identity(attemptId, generation, taskId);
  const snapshot = taskSnapshot(attemptId, taskId, sprintId, tenantId, generation);
  const admissionReceiptDigest = digest(`admission-${attemptId}`);
  return {
    state: 'admitted' as const,
    reservation: { identity: exactIdentity },
    admission: {
      identity: exactIdentity, receiptDigest: admissionReceiptDigest,
      taskSnapshot: { sha256: snapshot.sha256 },
    },
    ref: {
      identity: exactIdentity, dispatchRequestId: snapshot.dispatchRequestId,
      admissionReceiptDigest, refDigest: digest(`ref-${attemptId}`),
    },
    snapshot,
  };
};

function query(overrides: Partial<TaskOutputReadQuery> = {}): TaskOutputReadQuery {
  return {
    projectId, taskId: '719-001', caller: { id: 'operator', tenantId: 'tenant-a' },
    strictTenantIsolation: true, ...overrides,
  };
}

function harness(options: {
  admissions?: ReturnType<typeof admission>[];
  direct?: ReturnType<typeof admission> | null;
  tenantId?: string;
  sprintId?: string;
  dispatch?: Record<string, unknown>;
  providerExit?: Record<string, unknown> | null;
  receipt?: Record<string, unknown> | null;
  bytes?: Uint8Array;
  reconstructError?: Error;
} = {}) {
  const admissions = options.admissions ?? [admission(
    'attempt-1', 1, '719-001', options.sprintId ?? 'sprint-719',
    options.tenantId ?? 'tenant-a',
  )];
  const bytes = options.bytes ?? Buffer.from('provider raw\noutput\n');
  const providerExit = options.providerExit === undefined ? {
    containerId: 'container-private', observedAt: '2026-09-09T10:00:00.000Z',
    observationReceiptDigest: digest('provider-exit'),
  } : options.providerExit;
  const receipt = options.receipt === undefined ? {
    receiptDigest: digest('stream-receipt'), capturedAt: providerExit?.observedAt,
    identity: admissions[0]!.ref.identity,
    artifactClass: 'pristine-provider-stream', artifactKey: `provider-${admissions[0]!.ref.identity.attemptId}`,
    admissionReceiptDigest: admissions[0]!.ref.admissionReceiptDigest,
    policyDigest: policy.policyDigest,
    artifact: { sha256: digest(bytes), byteLength: bytes.byteLength },
  } : options.receipt;
  const writes = [vi.fn(), vi.fn(), vi.fn()];
  const openAttemptAccess = vi.fn();
  const store = {
    readDispatchAdmission: vi.fn(() => options.direct === null
      ? { state: 'absent' } : options.direct ?? admissions[0]),
    listDispatchAdmissions: vi.fn(() => ({ entries: admissions })),
    readTaskSnapshot: vi.fn(({ identity: readIdentity }: { identity: { attemptId: string } }) => {
      const selected = admissions.find(entry => entry.ref.identity.attemptId === readIdentity.attemptId);
      return selected ? { bytes: selected.snapshot.bytes, proof: { sha256: selected.snapshot.sha256 } } : null;
    }),
    readDispatchAuthority: vi.fn(() => options.dispatch ?? {
      state: 'terminal', authority: {
        state: 'RELEASED', receiptDigest: digest('dispatch'), releaseReceiptDigest: digest('release'),
        projectionFence: digest('fence'), providerExecutionAttempt: {
          providerExecutionAttemptId: 'provider-attempt-1', identityDigest: digest('provider-attempt'),
        }, backendExecutionId: 'container-private', releaseEvidence: { imageDigest: digest('image') },
      },
    }),
    readArtifactReceipt: vi.fn(() => receipt),
    readVerifiedArtifact: vi.fn(() => receipt ? { receipt, bytes } : null),
    openAttemptAccess,
    reserveDispatchAdmission: writes[0], publishHostArtifact: writes[1], appendChain: writes[2],
  };
  const backend = new DockerSpawnBackend(projectRoot, { custodyStateDir: '/missing' });
  const internal = backend as unknown as {
    openExactDockerRecoveryStore: () => unknown;
    readExactDockerRecoveryProviderExit: () => unknown;
  };
  internal.openExactDockerRecoveryStore = () => ({ store, policy });
  if (options.reconstructError) store.readTaskSnapshot.mockImplementation(() => {
    throw options.reconstructError;
  });
  internal.readExactDockerRecoveryProviderExit = () => providerExit;
  const result = { backend, store, writes, openAttemptAccess, admissions, bytes, receipt, providerExit };
  openedHarnesses.push(result);
  return result;
}

const openedHarnesses: ReturnType<typeof harness>[] = [];
afterEach(() => {
  for (const h of openedHarnesses.splice(0)) {
    expect(h.openAttemptAccess).not.toHaveBeenCalled();
    expect(h.writes.every(write => write.mock.calls.length === 0)).toBe(true);
  }
});

describe('exact task output read service', () => {
  it('returns immutable sealed provider bytes with exact receipt identity and no writes', () => {
    const h = harness();
    const result = h.backend.readExactDockerTaskOutput(query());
    expect(result).toMatchObject({ state: 'sealed', source: 'pristine-provider-stream',
      content: 'provider raw\noutput\n', identity: { projectId, taskId: '719-001',
        sprintId: 'sprint-719', attemptId: 'attempt-1', tenantId: 'tenant-a',
        provider: 'codex', model: 'gpt-5.6-terra' },
      receiptDigest: h.receipt?.receiptDigest,
      providerExitReceiptDigest: h.providerExit?.observationReceiptDigest });
    expect(Object.isFrozen(result)).toBe(true);
    expect(h.writes.every(write => write.mock.calls.length === 0)).toBe(true);
  });

  it.each([
    ['project', query({ projectId: 'foreign-project' }), 'project-mismatch'],
    ['tenant', query({ caller: { id: 'operator', tenantId: 'tenant-b' } }), 'tenant-mismatch'],
    ['sprint', query({ sprintId: 'sprint-720' }), 'sprint-mismatch'],
    ['attempt', query({ attemptId: 'stale-attempt' }), 'attempt-mismatch'],
  ])('denies %s mismatch', (_label, input, reasonCode) => {
    expect(harness().backend.readExactDockerTaskOutput(input)).toEqual({ state: 'denied', reasonCode });
  });

  it('refuses missing strict tenant identity', () => {
    const h = harness({ tenantId: '' });
    expect(h.backend.readExactDockerTaskOutput(query())).toEqual({
      state: 'denied', reasonCode: 'tenant-unresolved',
    });
  });

  it('holds task-only lookup with multiple verified generations instead of guessing latest', () => {
    const h = harness({ admissions: [admission('attempt-1', 1), admission('attempt-2', 2)] });
    expect(h.backend.readExactDockerTaskOutput(query())).toEqual({
      state: 'ambiguous', reasonCode: 'multiple-exact-attempts', candidateCount: 2,
    });
  });

  it('preserves NOT_DISPATCHED without treating RELEASED as worker completion', () => {
    const notDispatched = harness({ dispatch: { state: 'terminal', authority: {
      state: 'NOT_DISPATCHED', receiptDigest: digest('zero'), reasonCode: 'DISPATCH_NOT_STARTED',
    } } }).backend.readExactDockerTaskOutput(query());
    expect(notDispatched).toMatchObject({ state: 'not-dispatched', reasonCode: 'DISPATCH_NOT_STARTED' });
    const pending = harness({ providerExit: null }).backend.readExactDockerTaskOutput(query());
    expect(pending).toMatchObject({ state: 'pending', phase: 'provider-exit' });
    expect((pending as { capability: unknown }).capability).toBeTruthy();
    expect(Object.keys((pending as { capability: object }).capability)).toEqual([]);
  });

  it('keeps an unsealed provider stream pending behind the opaque capability', () => {
    expect(harness({ receipt: null }).backend.readExactDockerTaskOutput(query()))
      .toMatchObject({ state: 'pending', phase: 'stream-seal' });
  });

  it('refuses a provider-exit container not bound to the released execution', () => {
    expect(harness({ providerExit: {
      containerId: 'foreign-container', observedAt: '2026-09-09T10:00:00.000Z',
      observationReceiptDigest: digest('foreign-provider-exit'),
    } }).backend.readExactDockerTaskOutput(query())).toEqual({
      state: 'unavailable', reasonCode: 'custody-read-hold',
    });
  });

  it('returns typed unavailable for missing admission, tamper, and malformed UTF-8', () => {
    expect(harness({ direct: null }).backend.readExactDockerTaskOutput(query({
      dispatchRequestId: `dreq-${'a'.repeat(64)}`,
    }))).toEqual({ state: 'unavailable', reasonCode: 'admission-not-found' });
    expect(harness({ reconstructError: new TaskAttemptCustodyHold('ARTIFACT_CHANGED', 'read') })
      .backend.readExactDockerTaskOutput(query())).toEqual({
        state: 'unavailable', reasonCode: 'custody-read-hold', detailCode: 'ARTIFACT_CHANGED',
      });
    expect(harness({ bytes: Uint8Array.from([0xc3, 0x28]) }).backend.readExactDockerTaskOutput(query()))
      .toEqual({ state: 'unavailable', reasonCode: 'custody-read-hold' });
  });

  it('exports a production factory that opens no missing custody root', () => {
    expect(createExactDockerTaskOutputReadService(projectRoot, { custodyStateDir: '/missing' })
      .read(query())).toEqual({ state: 'unavailable', reasonCode: 'store-unavailable' });
  });
});
