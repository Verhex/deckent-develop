import { createHash, randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  claimExecutionContinuationAtomic,
  claimExecutionContinuationAtomicV2,
  createExecutionContinuationDispatchRefV2,
  createExecutionLandingCustodyRefV2,
  createExecutionLandingPreparationRefV2,
  createExecutionLandingCheckpoint,
  createExecutionLandingCheckpointV2,
  createExecutionLandingOperationalPayloadV2,
  createExecutionLandingResultSourceBindingV2,
  createExecutionLandingVerifiedArtifactBindingV2,
  deriveRemainingExecutionBudget,
  executionAttemptRetirementPath,
  executionContinuationClaimPathV2,
  executionContinuationClaimPath,
  executionLandingCheckpointPath,
  executionLandingCheckpointPathV2,
  listRetiredExecutionLandings,
  readExecutionAttemptRetirement,
  readExecutionAttemptRetirementV2,
  readExecutionContinuationClaim,
  readExecutionContinuationClaimV2,
  readExecutionLandingCheckpoint,
  readExecutionLandingCheckpointV2,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionAttemptRetirementAtomicV2,
  writeExecutionLandingCheckpointAtomic,
  writeExecutionLandingCheckpointAtomicV2,
  type CreateExecutionLandingCheckpointInput,
  type ExecutionLandingCheckpointEnvelopeV1,
  type ExecutionContinuationDispatchRefV2,
  type ExecutionLandingCustodyRefV2,
  type ExecutionLandingDigestV2,
  type ExecutionLandingPreparationRefV2,
  type ExecutionLandingPrivateAttemptIdentityV2,
} from '../../src/core/execution-landing-checkpoint.js';
import {
  createExecutionLandingContextV2,
  openOrCreateExecutionLandingContextV2,
  readExecutionLandingDiskEvidenceV2,
  readExecutionLandingContextV2,
  writeExecutionLandingDiskEvidenceAtomicV2,
  writeExecutionLandingContextAtomicV2,
  writeOrAdoptExecutionLandingContextAtomicV2,
  type CreateExecutionLandingPreparationPayloadV2Input,
} from '../../src/core/execution-landing-context.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; state: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-landing-'));
  roots.push(base);
  const root = join(base, 'project');
  const state = join(base, 'host-state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  process.env.DECKENT_HOME = state;
  return { root, state };
}

function input(overrides: Partial<CreateExecutionLandingCheckpointInput> = {}): CreateExecutionLandingCheckpointInput {
  return {
    taskId: 'task-landing',
    attemptId: randomUUID(),
    tenantId: 'tenant-a',
    originalRequestDigest: '1'.repeat(64),
    taskDigest: '2'.repeat(64),
    role: 'worker',
    kind: 'code-development',
    admissionMode: 'unattended',
    identity: {
      configuredProvider: 'anthropic',
      configuredModel: 'claude-fable-5',
      requestedProvider: 'anthropic',
      requestedModel: 'claude-fable-5',
      resolvedProvider: 'anthropic',
      resolvedModel: 'claude-fable-5',
      calledProvider: 'anthropic',
      calledModel: 'claude-fable-5',
      backend: 'docker',
      auth: 'subscription',
      fallbackReason: null,
    },
    policyDigest: '3'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    hardBudget: {
      maxTokens: 1_000,
      maxTurns: 10,
      maxInputTokens: 500,
      maxOutputTokens: 200,
      maxCacheReadTokens: 1_000,
      maxCacheCreationTokens: 100,
      maxContextTokens: 4_000,
    },
    cumulativeUsage: {
      turns: 3,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 300,
      cacheCreationTokens: 50,
      totalTokens: 500,
      maxContextTokens: 350,
    },
    attemptFence: 'fence-1',
    providerSequence: {
      firstSequence: 4,
      lastSequence: 9,
      eventCount: 6,
      eventDigest: '4'.repeat(64),
    },
    semanticState: {
      summary: 'Budget landing requested after the authority layer was implemented.',
      completedWork: ['Added the owner landing policy.', 'Persisted measured usage evidence.'],
      remainingWork: ['Wire the bounded continuation dispatcher.'],
      nextAction: 'Compile a continuation prompt from this checkpoint and current disk truth.',
      unresolvedRisks: ['Docker capability remains unsupported until binary proof.'],
    },
    scope: {
      filesRead: ['src/core/execution-landing-checkpoint.ts'],
      filesWrite: ['src/core/execution-landing-checkpoint.ts'],
    },
    diskDiffRefs: [`disk-diff:sha256:${'5'.repeat(64)}`],
    evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
    acceptanceCriteria: 'Continuation must preserve cumulative budget and exact task scope.',
    landingRequestedAt: '2026-07-23T18:00:00.000Z',
    landedAt: '2026-07-23T18:00:01.000Z',
    ...overrides,
  };
}

function persist(root: string, value: CreateExecutionLandingCheckpointInput = input()): ExecutionLandingCheckpointEnvelopeV1 {
  const checkpoint = createExecutionLandingCheckpoint(root, value);
  writeExecutionLandingCheckpointAtomic(root, checkpoint);
  return checkpoint;
}

function v2Digest(character: string): ExecutionLandingDigestV2 {
  return `sha256:${character.repeat(64)}`;
}

function v2Identity(root: string, overrides: Partial<ExecutionLandingPrivateAttemptIdentityV2> = {}): ExecutionLandingPrivateAttemptIdentityV2 {
  return {
    schemaVersion: 2,
    backend: 'docker',
    projectRootSha256: createHash('sha256').update(realpathSync.native(root)).digest('hex'),
    projectId: 'project-1',
    taskId: 'task-landing-v2',
    attemptId: '11111111-1111-8111-8111-111111111111',
    generation: 1,
    ...overrides,
  };
}

function v2Custody(
  root: string,
  overrides: Partial<{
    identity: ExecutionLandingPrivateAttemptIdentityV2;
    resultIdentity: ExecutionLandingPrivateAttemptIdentityV2;
    landingIdentity: ExecutionLandingPrivateAttemptIdentityV2;
    resultPolicyDigest: ExecutionLandingDigestV2;
    landingPolicyDigest: ExecutionLandingDigestV2;
    artifactKey: string;
    dispatchRequestId: string;
    admissionReceiptDigest: ExecutionLandingDigestV2;
    providerExecutionAttemptId: string;
    providerStartReceiptRefDigest: ExecutionLandingDigestV2;
    projectionFence: ExecutionLandingDigestV2;
    taskSnapshotDigest: ExecutionLandingDigestV2;
    providerInvocationDigest: ExecutionLandingDigestV2;
    admittedAt: string;
    releasedAt: string;
    providerStartAcceptedAt: string;
  }> = {},
): ExecutionLandingCustodyRefV2 {
  const identity = overrides.identity ?? v2Identity(root);
  const policyDigest = v2Digest('a');
  const admissionReceiptDigest = overrides.admissionReceiptDigest ?? v2Digest('b');
  const preparationRef = createExecutionLandingPreparationRefV2({
    dispatchRequestId: overrides.dispatchRequestId ?? `dreq-${'1'.repeat(64)}`,
    dispatchRequestMaterialDigest: v2Digest('1'),
    privateIdentity: identity,
    admissionReceiptDigest,
    admissionRefDigest: v2Digest('2'),
    admittedAt: overrides.admittedAt ?? '2026-09-01T19:58:00.000Z',
    policyDigest,
    taskSnapshotDigest: overrides.taskSnapshotDigest ?? v2Digest('3'),
    providerInvocationDigest: overrides.providerInvocationDigest ?? v2Digest('4'),
  });
  const resultSource = createExecutionLandingResultSourceBindingV2({
    artifactClass: 'worker-result',
    artifactKey: overrides.artifactKey ?? 'worker-result-primary',
    identity: overrides.resultIdentity ?? identity,
    admissionReceiptDigest,
    policyDigest: overrides.resultPolicyDigest ?? policyDigest,
    artifactReceiptDigest: v2Digest('c'),
    contentDigest: v2Digest('d'),
    byteLength: 128,
    capturedAt: '2026-09-01T20:00:00.000Z',
  });
  const landingArtifact = createExecutionLandingVerifiedArtifactBindingV2({
    artifactClass: 'worker-landing-proposal',
    artifactKey: 'worker-landing-primary',
    identity: overrides.landingIdentity ?? identity,
    admissionReceiptDigest,
    policyDigest: overrides.landingPolicyDigest ?? policyDigest,
    artifactReceiptDigest: v2Digest('e'),
    contentDigest: v2Digest('f'),
    byteLength: 96,
    capturedAt: '2026-09-01T20:01:00.000Z',
    verifiedAt: '2026-09-01T20:02:00.000Z',
  });
  return createExecutionLandingCustodyRefV2({
    dispatchState: 'RELEASED',
    preparationRef,
    providerExecutionAttemptId: overrides.providerExecutionAttemptId
      ?? '22222222-2222-8222-8222-222222222222',
    providerExecutionAttemptIdentityDigest: v2Digest('3'),
    dispatchAuthorityReceiptDigest: v2Digest('4'),
    releaseReceiptRefDigest: v2Digest('5'),
    releaseEvidenceDigest: v2Digest('6'),
    releasedAt: overrides.releasedAt ?? '2026-09-01T19:59:00.000Z',
    providerStartReceiptRefDigest: overrides.providerStartReceiptRefDigest ?? v2Digest('7'),
    providerStartEvidenceDigest: v2Digest('8'),
    providerStartAcceptedAt: overrides.providerStartAcceptedAt
      ?? '2026-09-01T19:59:30.000Z',
    projectionFence: overrides.projectionFence ?? v2Digest('9'),
    resultSource,
    landingArtifact,
  });
}

function v2ContinuationDispatch(
  root: string,
  overrides: Parameters<typeof v2Custody>[1] = {},
): ExecutionContinuationDispatchRefV2 {
  const identity = overrides.identity ?? v2Identity(root);
  const preparationRef = createExecutionLandingPreparationRefV2({
    dispatchRequestId: overrides.dispatchRequestId ?? `dreq-${'1'.repeat(64)}`,
    dispatchRequestMaterialDigest: v2Digest('1'),
    privateIdentity: identity,
    admissionReceiptDigest: overrides.admissionReceiptDigest ?? v2Digest('b'),
    admissionRefDigest: v2Digest('2'),
    admittedAt: overrides.admittedAt ?? '2026-09-01T20:04:05.000Z',
    policyDigest: v2Digest('a'),
    taskSnapshotDigest: overrides.taskSnapshotDigest ?? v2Digest('3'),
    providerInvocationDigest: overrides.providerInvocationDigest ?? v2Digest('4'),
  });
  return createExecutionContinuationDispatchRefV2({
    dispatchState: 'RELEASED',
    preparationRef,
    providerExecutionAttemptId: overrides.providerExecutionAttemptId
      ?? '22222222-2222-8222-8222-222222222222',
    providerExecutionAttemptIdentityDigest: v2Digest('3'),
    dispatchAuthorityReceiptDigest: v2Digest('4'),
    releaseReceiptRefDigest: v2Digest('5'),
    releaseEvidenceDigest: v2Digest('6'),
    releasedAt: overrides.releasedAt ?? '2026-09-01T20:04:15.000Z',
    providerStartReceiptRefDigest: overrides.providerStartReceiptRefDigest ?? v2Digest('7'),
    providerStartEvidenceDigest: v2Digest('8'),
    providerStartAcceptedAt: overrides.providerStartAcceptedAt
      ?? '2026-09-01T20:04:30.000Z',
    projectionFence: overrides.projectionFence ?? v2Digest('9'),
  });
}

function v2PreparationInput(
  preparationRef: ExecutionLandingPreparationRefV2,
): CreateExecutionLandingPreparationPayloadV2Input {
  const base = input({ taskId: preparationRef.privateIdentity.taskId });
  return {
    taskId: preparationRef.privateIdentity.taskId,
    tenantId: base.tenantId,
    originalRequestDigest: base.originalRequestDigest,
    taskDigest: base.taskDigest,
    taskSnapshotDigest: preparationRef.taskSnapshotDigest,
    providerInvocationDigest: preparationRef.providerInvocationDigest,
    role: base.role,
    taskKind: base.kind,
    admissionMode: base.admissionMode,
    approvalEvidenceRef: null,
    identity: base.identity,
    policyDigest: preparationRef.policyDigest.slice('sha256:'.length),
    landingPolicy: base.landingPolicy,
    hardBudget: base.hardBudget,
    parentAttemptId: null,
    parentFence: null,
    parentCheckpointSha256: null,
    attemptFence: base.attemptFence,
    scope: base.scope,
    acceptanceCriteria: base.acceptanceCriteria,
  };
}

function v2OperationalInput(
  custodyRef: ExecutionLandingCustodyRefV2,
  diskEvidenceDigest: ExecutionLandingDigestV2,
): Parameters<typeof createExecutionLandingOperationalPayloadV2>[1] {
  const preparation = v2PreparationInput(custodyRef.preparationRef);
  const operational = {
    ...input({
    taskId: preparation.taskId,
    attemptId: custodyRef.providerExecutionAttemptId,
    tenantId: preparation.tenantId,
    originalRequestDigest: preparation.originalRequestDigest,
    taskDigest: preparation.taskDigest,
    role: preparation.role,
    kind: preparation.taskKind,
    admissionMode: preparation.admissionMode,
    approvalEvidenceRef: preparation.approvalEvidenceRef,
    identity: preparation.identity,
    policyDigest: preparation.policyDigest,
    landingPolicy: preparation.landingPolicy,
    hardBudget: preparation.hardBudget,
    parentAttemptId: preparation.parentAttemptId,
    parentFence: preparation.parentFence,
    parentCheckpointSha256: preparation.parentCheckpointSha256,
    attemptFence: preparation.attemptFence,
    scope: preparation.scope,
    acceptanceCriteria: preparation.acceptanceCriteria,
    landingRequestedAt: '2026-09-01T20:02:00.000Z',
    landedAt: '2026-09-01T20:03:00.000Z',
    }),
    diskEvidenceDigest,
  } as Record<string, unknown>;
  delete operational.diskDiffRefs;
  return operational as Parameters<typeof createExecutionLandingOperationalPayloadV2>[1];
}

function persistV2(root: string, preparedAt = '2026-09-01T19:58:30.000Z') {
  const custodyRef = v2Custody(root);
  const preparationRef = custodyRef.preparationRef;
  const context = openOrCreateExecutionLandingContextV2(root, {
    preparationRef,
    preparationInput: v2PreparationInput(preparationRef),
    preparedAt,
  });
  mkdirSync(join(root, 'src', 'core'), { recursive: true });
  writeFileSync(
    join(root, 'src', 'core', 'execution-landing-checkpoint.ts'),
    'terminal provider effect\n',
    'utf-8',
  );
  const diskEvidence = writeExecutionLandingDiskEvidenceAtomicV2(
    root,
    context,
    custodyRef,
    '2026-09-01T20:02:45.000Z',
  );
  const operationalPayload = createExecutionLandingOperationalPayloadV2(
    root,
    v2OperationalInput(custodyRef, diskEvidence.evidenceDigest),
  );
  const checkpoint = createExecutionLandingCheckpointV2(root, {
    custodyRef,
    operationalPayload,
    contextDigest: context.contextDigest,
    diskEvidenceDigest: diskEvidence.evidenceDigest,
    landedAt: '2026-09-01T20:03:00.000Z',
  });
  writeExecutionLandingCheckpointAtomicV2(root, checkpoint);
  return { preparationRef, custodyRef, context, diskEvidence, checkpoint };
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('host-owned execution landing checkpoint authority', () => {
  it('publishes an immutable digest-verified checkpoint outside the worker project', () => {
    const { root, state } = fixture();
    const checkpoint = persist(root);
    const path = executionLandingCheckpointPath(checkpoint.checkpoint);

    expect(path).toContain(state);
    expect(relative(root, path)).toMatch(/^\.\./);
    expect(readExecutionLandingCheckpoint(root, checkpoint.checkpoint)).toEqual(checkpoint);
    expect(checkpoint.checkpoint).toMatchObject({
      state: 'landed',
      hardBudgetDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      acceptanceDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      remainingBudget: {
        maxTokens: 500,
        maxTurns: 7,
        maxInputTokens: 400,
        maxOutputTokens: 150,
        maxCacheReadTokens: 700,
        maxCacheCreationTokens: 50,
        maxContextTokens: 4_000,
      },
    });

    writeExecutionLandingCheckpointAtomic(root, checkpoint);
    const conflicting = createExecutionLandingCheckpoint(root, {
      ...input({ attemptId: checkpoint.checkpoint.attemptId }),
      evidenceRefs: [`budget-usage:sha256:${'8'.repeat(64)}`],
    });
    expect(() => writeExecutionLandingCheckpointAtomic(root, conflicting))
      .toThrow(/Conflicting immutable/);
  });

  it('publishes schema-validated authority atomically without leaving a sibling temporary file', () => {
    const { root } = fixture();
    const checkpoint = createExecutionLandingCheckpoint(root, input());
    writeExecutionLandingCheckpointAtomic(root, checkpoint);
    const path = executionLandingCheckpointPath(checkpoint.checkpoint);
    const siblings = readdirSync(join(path, '..'));

    expect(readExecutionLandingCheckpoint(root, checkpoint.checkpoint)).toEqual(checkpoint);
    expect(siblings).toEqual(['checkpoint.json']);
  });

  it('fails loudly on tampering, unknown fields and cross-project authority', () => {
    const { root } = fixture();
    const checkpoint = persist(root);
    const path = executionLandingCheckpointPath(checkpoint.checkpoint);
    const tampered = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    const body = tampered.checkpoint as Record<string, unknown>;
    body.taskDigest = '9'.repeat(64);
    writeFileSync(path, JSON.stringify(tampered), 'utf-8');

    expect(() => readExecutionLandingCheckpoint(root, checkpoint.checkpoint))
      .toThrow(/Corrupt execution landing checkpoint/);

    const withUnknown = { ...input(), surprise: true } as CreateExecutionLandingCheckpointInput;
    expect(() => createExecutionLandingCheckpoint(root, withUnknown)).toThrow(/unknown fields/);

    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });
    expect(() => readExecutionLandingCheckpoint(otherRoot, checkpoint.checkpoint))
      .toThrow(/project authority/);
  });

  it('fails closed when the host authority resolves inside the worker-mounted project', () => {
    const { root } = fixture();
    process.env.DECKENT_HOME = join(root, '.host-state');
    expect(() => createExecutionLandingCheckpoint(root, input()))
      .toThrow(/outside the worker-mounted project/);
  });

  it('requires complete lineage and internally consistent cumulative counters', () => {
    const { root } = fixture();
    expect(() => createExecutionLandingCheckpoint(root, input({
      parentAttemptId: randomUUID(),
    }))).toThrow(/parent lineage/);

    expect(() => createExecutionLandingCheckpoint(root, input({
      cumulativeUsage: {
        ...input().cumulativeUsage,
        totalTokens: 999,
      },
    }))).toThrow(/totalTokens/);

    expect(() => createExecutionLandingCheckpoint(root, input({
      identity: {
        ...input().identity,
        alias: 'sonnet',
      } as CreateExecutionLandingCheckpointInput['identity'],
    }))).toThrow(/identity.*unknown fields/);

    expect(() => createExecutionLandingCheckpoint(root, input({
      semanticState: {
        ...input().semanticState,
        nextAction: 'x'.repeat(1_001),
      },
    }))).toThrow(/nextAction exceeds 1000/);

    expect(() => createExecutionLandingCheckpoint(root, input({
      scope: {
        filesRead: ['../outside'],
        filesWrite: [],
      },
    }))).toThrow(/project-relative path/);
  });

  it('derives cumulative remaining ceilings without consuming the per-call context ceiling', () => {
    expect(deriveRemainingExecutionBudget(
      {
        maxTokens: 100,
        maxTurns: 2,
        maxCacheReadTokens: 10,
        maxContextTokens: 8_192,
      },
      {
        turns: 3,
        inputTokens: 10,
        outputTokens: 10,
        cacheReadTokens: 12,
        cacheCreationTokens: 0,
        totalTokens: 32,
        maxContextTokens: 7_000,
      },
    )).toEqual({
      maxTokens: 68,
      maxTurns: 0,
      maxCacheReadTokens: 0,
      maxContextTokens: 8_192,
    });

    expect(() => deriveRemainingExecutionBudget(
      { maxUsd: 10 },
      {
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 0,
        maxContextTokens: 0,
      },
    )).toThrow(/cumulativeUsd/);
  });

  it('keeps LANDED retirement separate from terminal product settlement', () => {
    const { root } = fixture();
    const draft = createExecutionLandingCheckpoint(root, input());

    expect(() => writeExecutionAttemptRetirementAtomic(root, draft.checkpoint, {
      checkpointSha256: draft.checkpointSha256,
      runtimeDisposition: 'stopped-removed',
      resourcesReleased: true,
      evidenceRefs: [`runtime-release:sha256:${'a'.repeat(64)}`],
    })).toThrow(/without its matching landing checkpoint/);

    writeExecutionLandingCheckpointAtomic(root, draft);
    const retirement = writeExecutionAttemptRetirementAtomic(root, draft.checkpoint, {
      checkpointSha256: draft.checkpointSha256,
      runtimeDisposition: 'stopped-removed',
      resourcesReleased: true,
      evidenceRefs: [`runtime-release:sha256:${'a'.repeat(64)}`],
      retiredAt: '2026-07-23T18:00:02.000Z',
    });

    expect(executionAttemptRetirementPath(draft.checkpoint)).not.toContain('.tasks');
    expect(readExecutionAttemptRetirement(root, draft.checkpoint)).toEqual(retirement);
    expect(retirement).toMatchObject({
      state: 'retired',
      disposition: 'landed',
      checkpointSha256: draft.checkpointSha256,
      resourcesReleased: true,
    });
  });

  it('admits exactly one continuation claimant after durable retirement', () => {
    const { root } = fixture();
    const checkpoint = persist(root);
    writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      runtimeDisposition: 'checkpointed-process-exited',
      resourcesReleased: true,
      evidenceRefs: [`runtime-release:sha256:${'b'.repeat(64)}`],
    });
    const winnerAttemptId = randomUUID();
    const winner = claimExecutionContinuationAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      continuationAttemptId: winnerAttemptId,
      continuationFence: 'fence-2',
      claimedAt: '2026-07-23T18:00:03.000Z',
    });
    const adopted = claimExecutionContinuationAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      continuationAttemptId: winnerAttemptId,
      continuationFence: 'fence-2',
      claimedAt: '2026-07-23T18:00:04.000Z',
    });

    expect(adopted).toEqual(winner);
    expect(readExecutionContinuationClaim(
      root,
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    )).toEqual(winner);
    expect(executionContinuationClaimPath(
      checkpoint.checkpoint,
      checkpoint.checkpointSha256,
    )).not.toContain(root);

    expect(() => claimExecutionContinuationAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      continuationAttemptId: randomUUID(),
      continuationFence: 'fence-3',
    })).toThrow(/Conflicting immutable/);
  });

  it('enumerates validated retired checkpoints and their continuation intent', () => {
    const { root } = fixture();
    const checkpoint = persist(root);
    const retirement = writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      runtimeDisposition: 'stopped-removed',
      resourcesReleased: true,
      evidenceRefs: [`runtime-release:sha256:${'c'.repeat(64)}`],
    });

    expect(listRetiredExecutionLandings(root)).toEqual([{
      checkpoint,
      retirement,
      continuationClaim: null,
    }]);

    const claim = claimExecutionContinuationAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      continuationAttemptId: randomUUID(),
      continuationFence: 'fence-enumerated',
    });
    expect(listRetiredExecutionLandings(root)[0]?.continuationClaim).toEqual(claim);
  });

  it('does not admit continuation while predecessor runtime resources remain active', () => {
    const { root } = fixture();
    const checkpoint = persist(root);

    expect(() => claimExecutionContinuationAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      continuationAttemptId: randomUUID(),
      continuationFence: 'fence-2',
    })).toThrow(/landed and retired predecessor/);
  });

  it('persists and restart-rereads a path-free exact V2 context and checkpoint', () => {
    const { root } = fixture();
    const { preparationRef, custodyRef, context, diskEvidence, checkpoint } = persistV2(root);
    const ref = checkpoint.checkpoint.ref;

    expect(readExecutionLandingContextV2(root, preparationRef)).toEqual(context);
    expect(openOrCreateExecutionLandingContextV2(root, {
      preparationRef,
      preparationInput: v2PreparationInput(preparationRef),
      preparedAt: context.context.preparedAt,
    })).toEqual(context);
    expect(openOrCreateExecutionLandingContextV2(root, {
      preparationRef,
      preparationInput: v2PreparationInput(preparationRef),
      preparedAt: '2026-09-01T19:59:20.000Z',
    })).toEqual(context);
    expect(readExecutionLandingDiskEvidenceV2(root, ref, diskEvidence.evidenceDigest))
      .toEqual(diskEvidence);
    expect(diskEvidence.changedPaths).toEqual(['src/core/execution-landing-checkpoint.ts']);
    expect(readExecutionLandingCheckpointV2(root, ref)).toEqual(checkpoint);
    writeExecutionLandingContextAtomicV2(root, context);
    writeExecutionLandingCheckpointAtomicV2(root, checkpoint);
    expect(readExecutionLandingCheckpointV2(root, ref)).toEqual(checkpoint);
    expect(executionLandingCheckpointPathV2(ref)).not.toContain('.tasks');
    expect(executionLandingCheckpointPathV2(ref)).not.toContain(root);
    expect(JSON.stringify(custodyRef)).not.toMatch(/(?:relativePath|absolutePath|\.tasks)/u);
    expect(custodyRef).toMatchObject({
      preparationRef: {
        dispatchRequestId: `dreq-${'1'.repeat(64)}`,
        privateIdentity: { generation: 1 },
      },
      providerExecutionAttemptId: '22222222-2222-8222-8222-222222222222',
      resultSource: {
        bindingDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
      landingArtifact: {
        verificationBindingDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      },
    });
    expect(context.context.preparationPayload).toMatchObject({
      tenantId: 'tenant-a',
      taskSnapshotDigest: preparationRef.taskSnapshotDigest,
      providerInvocationDigest: preparationRef.providerInvocationDigest,
      hardBudget: { maxTokens: 1_000 },
      scope: { filesWrite: ['src/core/execution-landing-checkpoint.ts'] },
    });
    expect(checkpoint.checkpoint.operationalPayload).toMatchObject({
      cumulativeUsage: { totalTokens: 500 },
      remainingBudget: { maxTokens: 500, maxTurns: 7 },
      providerSequence: { firstSequence: 4, lastSequence: 9 },
      semanticState: { remainingWork: ['Wire the bounded continuation dispatcher.'] },
      diskEvidenceDigest: diskEvidence.evidenceDigest,
      evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
    });
    const changedAdmissionRef = createExecutionLandingPreparationRefV2({
      dispatchRequestId: preparationRef.dispatchRequestId,
      dispatchRequestMaterialDigest: preparationRef.dispatchRequestMaterialDigest,
      privateIdentity: preparationRef.privateIdentity,
      admissionReceiptDigest: preparationRef.admissionReceiptDigest,
      admissionRefDigest: preparationRef.admissionRefDigest,
      admittedAt: '2026-09-01T19:58:10.000Z',
      policyDigest: preparationRef.policyDigest,
      taskSnapshotDigest: preparationRef.taskSnapshotDigest,
      providerInvocationDigest: preparationRef.providerInvocationDigest,
    });
    expect(changedAdmissionRef.preparationRefDigest).not.toBe(preparationRef.preparationRefDigest);
    const changedAdmissionContext = createExecutionLandingContextV2(root, {
      preparationRef: changedAdmissionRef,
      preparationInput: v2PreparationInput(changedAdmissionRef),
      preparedAt: '2026-09-01T19:58:30.000Z',
    });
    expect(() => writeExecutionLandingContextAtomicV2(root, changedAdmissionContext))
      .toThrow(/Conflicting immutable/);
    const diskPath = join(dirname(executionLandingCheckpointPathV2(ref)), 'disk-evidence-v2.json');
    const durableDiskBytes = readFileSync(diskPath, 'utf-8');
    const corruptDisk = JSON.parse(durableDiskBytes) as {
      current: { snapshotSha256: string };
    };
    corruptDisk.current.snapshotSha256 = '0'.repeat(64);
    writeFileSync(diskPath, `${JSON.stringify(corruptDisk, null, 2)}\n`, 'utf-8');
    expect(() => readExecutionLandingCheckpointV2(root, ref))
      .toThrow(/Corrupt execution landing V2 disk evidence/);
    writeFileSync(diskPath, durableDiskBytes, 'utf-8');
    expect(readExecutionLandingCheckpointV2(root, ref)).toEqual(checkpoint);

    const conflicting = createExecutionLandingCheckpointV2(root, {
      custodyRef,
      operationalPayload: checkpoint.checkpoint.operationalPayload,
      contextDigest: v2Digest('0'),
      diskEvidenceDigest: diskEvidence.evidenceDigest,
      landedAt: '2026-09-01T20:03:00.000Z',
    });
    expect(() => writeExecutionLandingCheckpointAtomicV2(root, conflicting))
      .toThrow(/(?:Conflicting immutable|Corrupt execution landing V2 context)/);
    const mismatchedOperational = createExecutionLandingOperationalPayloadV2(root, {
      ...v2OperationalInput(custodyRef, diskEvidence.evidenceDigest),
      tenantId: 'tenant-sibling',
    });
    expect(() => writeExecutionLandingCheckpointAtomicV2(root, createExecutionLandingCheckpointV2(
      root,
      {
        custodyRef,
        operationalPayload: mismatchedOperational,
        contextDigest: context.contextDigest,
        diskEvidenceDigest: diskEvidence.evidenceDigest,
        landedAt: '2026-09-01T20:03:00.000Z',
      },
    ))).toThrow(/Corrupt execution landing V2 context/);
    const wrongDiskOperational = createExecutionLandingOperationalPayloadV2(root, {
      ...v2OperationalInput(custodyRef, v2Digest('0')),
    });
    expect(() => createExecutionLandingCheckpointV2(root, {
      custodyRef,
      operationalPayload: wrongDiskOperational,
      contextDigest: context.contextDigest,
      diskEvidenceDigest: diskEvidence.evidenceDigest,
      landedAt: '2026-09-01T20:03:00.000Z',
    })).toThrow(/checkpoint authority binding mismatch/);
  });

  it('adopts the durable V2 context winner across a preparedAt and baseline race', () => {
    const { root } = fixture();
    const preparationRef = v2Custody(root).preparationRef;
    const preparationInput = v2PreparationInput(preparationRef);
    const loser = createExecutionLandingContextV2(root, {
      preparationRef,
      preparationInput,
      preparedAt: '2026-09-01T19:58:30.000Z',
    });
    mkdirSync(join(root, 'src', 'core'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'core', 'execution-landing-checkpoint.ts'),
      'winner baseline\n',
      'utf-8',
    );
    const winner = createExecutionLandingContextV2(root, {
      preparationRef,
      preparationInput,
      preparedAt: '2026-09-01T19:58:40.000Z',
    });
    expect(winner.context.baseline).not.toEqual(loser.context.baseline);
    writeExecutionLandingContextAtomicV2(root, winner);
    expect(writeOrAdoptExecutionLandingContextAtomicV2(
      root,
      loser,
      preparationInput,
    )).toEqual(winner);

    const conflictingInput = { ...preparationInput, tenantId: 'tenant-conflict' };
    const conflictingCandidate = createExecutionLandingContextV2(root, {
      preparationRef,
      preparationInput: conflictingInput,
      preparedAt: '2026-09-01T19:58:50.000Z',
    });
    expect(() => writeOrAdoptExecutionLandingContextAtomicV2(
      root,
      conflictingCandidate,
      conflictingInput,
    )).toThrow(/Conflicting immutable/);
  });

  it('rejects V2 path fields, sibling artifacts, stale digests, wrong generation and policy', () => {
    const { root } = fixture();
    const custodyRef = v2Custody(root);
    const resultInput = { ...custodyRef.resultSource } as Record<string, unknown>;
    delete resultInput.schemaVersion;
    delete resultInput.kind;
    delete resultInput.bindingDigest;
    resultInput.artifactKey = '.tasks/task-001.result';
    expect(() => createExecutionLandingResultSourceBindingV2(
      resultInput as Parameters<typeof createExecutionLandingResultSourceBindingV2>[0],
    )).toThrow(/path-free/);

    const sibling = v2Identity(root, {
      attemptId: '33333333-3333-8333-8333-333333333333',
    });
    expect(() => v2Custody(root, { resultIdentity: sibling }))
      .toThrow(/artifact custody binding mismatch/);
    expect(() => v2Custody(root, { landingPolicyDigest: v2Digest('0') }))
      .toThrow(/artifact custody binding mismatch/);

    expect(() => createExecutionLandingOperationalPayloadV2(root, {
      ...v2OperationalInput(custodyRef, v2Digest('d')),
      evidenceRefs: ['.tasks/result.json'],
    } as Parameters<typeof createExecutionLandingOperationalPayloadV2>[1]))
      .toThrow(/bounded typed digest refs/);
    expect(() => createExecutionLandingOperationalPayloadV2(root, {
      ...v2OperationalInput(custodyRef, v2Digest('d')),
      diskDiffRefs: ['../../forged'],
    } as unknown as Parameters<typeof createExecutionLandingOperationalPayloadV2>[1]))
      .toThrow(/invalid or unknown fields/);

    expect(() => createExecutionLandingContextV2(root, {
      preparationRef: {
        ...custodyRef.preparationRef,
        privateIdentity: { ...custodyRef.preparationRef.privateIdentity, generation: 2 },
      },
      preparationInput: v2PreparationInput(custodyRef.preparationRef),
      preparedAt: '2026-09-01T19:58:30.000Z',
    })).toThrow(/preparation ref digest mismatch/);
    expect(() => createExecutionLandingContextV2(root, {
      preparationRef: {
        ...custodyRef.preparationRef,
        taskSnapshotDigest: v2Digest('0'),
      },
      preparationInput: v2PreparationInput(custodyRef.preparationRef),
      preparedAt: '2026-09-01T19:58:30.000Z',
    })).toThrow(/preparation ref digest mismatch/);
    expect(() => createExecutionLandingContextV2(root, {
      preparationRef: custodyRef.preparationRef,
      preparationInput: v2PreparationInput(custodyRef.preparationRef),
      preparedAt: '2026-09-01T19:58:30.000Z',
      path: '.tasks/forged',
    } as unknown as Parameters<typeof createExecutionLandingContextV2>[1])).toThrow(/unknown fields/);
    expect(() => createExecutionLandingContextV2(root, {
      preparationRef: custodyRef.preparationRef,
      preparationInput: v2PreparationInput(custodyRef.preparationRef),
      preparedAt: '2026-09-01T19:57:59.000Z',
    })).toThrow(/preparedAt must follow admission/);

    let getterCalled = false;
    const accessorInput = { ...v2PreparationInput(custodyRef.preparationRef) };
    Object.defineProperty(accessorInput, 'scope', {
      enumerable: true,
      get() {
        getterCalled = true;
        return { filesRead: [], filesWrite: ['src/core/execution-landing-checkpoint.ts'] };
      },
    });
    expect(() => createExecutionLandingContextV2(root, {
      preparationRef: custodyRef.preparationRef,
      preparationInput: accessorInput,
      preparedAt: '2026-09-01T19:58:30.000Z',
    })).toThrow(/object is invalid/);
    expect(getterCalled).toBe(false);

    const otherRoot = join(root, '..', 'other-v2-project');
    mkdirSync(otherRoot, { recursive: true });
    expect(() => createExecutionLandingContextV2(otherRoot, {
      preparationRef: custodyRef.preparationRef,
      preparationInput: v2PreparationInput(custodyRef.preparationRef),
      preparedAt: '2026-09-01T19:58:30.000Z',
    })).toThrow(/project authority mismatch/);

    const { root: lateRoot } = fixture();
    expect(() => persistV2(lateRoot, '2026-09-01T20:00:00.000Z'))
      .toThrow(/Corrupt execution landing V2 context/);
  });

  it('first-writer persists V2 retirement and one exact generation-bound continuation claim', () => {
    const { root } = fixture();
    const { checkpoint } = persistV2(root);
    const ref = checkpoint.checkpoint.ref;
    const retirementInput = {
      checkpointDigest: checkpoint.checkpointDigest,
      runtimeDisposition: 'checkpointed-process-exited' as const,
      resourcesReleased: true as const,
      evidenceDigests: [v2Digest('a')],
      retiredAt: '2026-09-01T20:04:00.000Z',
    };
    const retirement = writeExecutionAttemptRetirementAtomicV2(root, ref, retirementInput);
    expect(writeExecutionAttemptRetirementAtomicV2(root, ref, retirementInput)).toEqual(retirement);
    expect(readExecutionAttemptRetirementV2(root, ref)).toEqual(retirement);
    expect(() => writeExecutionAttemptRetirementAtomicV2(root, ref, {
      ...retirementInput,
      evidenceDigests: [v2Digest('b')],
    })).toThrow(/Conflicting immutable/);

    const continuationIdentity = v2Identity(root, { generation: ref.generation + 1 });
    const continuationDispatchRef = v2ContinuationDispatch(root, {
      identity: continuationIdentity,
      dispatchRequestId: `dreq-${'2'.repeat(64)}`,
      admissionReceiptDigest: v2Digest('d'),
      providerExecutionAttemptId: '33333333-3333-8333-8333-333333333333',
      providerStartReceiptRefDigest: v2Digest('e'),
      projectionFence: v2Digest('f'),
    });
    const incompleteContinuation = { ...continuationDispatchRef } as Record<string, unknown>;
    delete incompleteContinuation.providerStartReceiptRefDigest;
    expect(() => claimExecutionContinuationAtomicV2(root, ref, {
      checkpointDigest: checkpoint.checkpointDigest,
      retirementReceiptDigest: retirement.receiptDigest,
      continuationDispatchRef: incompleteContinuation as unknown as ExecutionContinuationDispatchRefV2,
      claimedAt: '2026-09-01T20:05:00.000Z',
    })).toThrow(/invalid or unknown fields/);
    expect(readdirSync(join(executionContinuationClaimPathV2(ref), '..')))
      .not.toContain('continuation-claim-v2.json');

    expect(() => claimExecutionContinuationAtomicV2(root, ref, {
      checkpointDigest: checkpoint.checkpointDigest,
      retirementReceiptDigest: retirement.receiptDigest,
      continuationDispatchRef: v2ContinuationDispatch(root, {
        identity: continuationIdentity,
        dispatchRequestId: `dreq-${'7'.repeat(64)}`,
        admittedAt: '2026-09-01T20:03:00.000Z',
        releasedAt: '2026-09-01T20:03:15.000Z',
        providerStartAcceptedAt: '2026-09-01T20:03:30.000Z',
        providerExecutionAttemptId: '77777777-7777-8777-8777-777777777777',
      }),
      claimedAt: '2026-09-01T20:05:00.000Z',
    })).toThrow(/dispatch precedes predecessor retirement/);
    expect(readdirSync(join(executionContinuationClaimPathV2(ref), '..')))
      .not.toContain('continuation-claim-v2.json');

    const claimInput = {
      checkpointDigest: checkpoint.checkpointDigest,
      retirementReceiptDigest: retirement.receiptDigest,
      continuationDispatchRef,
      claimedAt: '2026-09-01T20:05:00.000Z',
    };
    const claim = claimExecutionContinuationAtomicV2(root, ref, claimInput);
    expect(claimExecutionContinuationAtomicV2(root, ref, claimInput)).toEqual(claim);
    expect(readExecutionContinuationClaimV2(root, ref)).toEqual(claim);
    const wrongGenerationIdentity = v2Identity(root, { generation: ref.generation + 2 });
    expect(() => claimExecutionContinuationAtomicV2(root, ref, {
      ...claimInput,
      continuationDispatchRef: v2ContinuationDispatch(root, {
        identity: wrongGenerationIdentity,
        dispatchRequestId: `dreq-${'3'.repeat(64)}`,
        providerExecutionAttemptId: '44444444-4444-8444-8444-444444444444',
      }),
    })).toThrow(/identity\/generation/);
    const siblingIdentity = v2Identity(root, {
      attemptId: randomUUID(),
      generation: ref.generation + 1,
    });
    expect(() => claimExecutionContinuationAtomicV2(root, ref, {
      ...claimInput,
      continuationDispatchRef: v2ContinuationDispatch(root, {
        identity: siblingIdentity,
        dispatchRequestId: `dreq-${'4'.repeat(64)}`,
        providerExecutionAttemptId: '55555555-5555-8555-8555-555555555555',
      }),
    })).toThrow(/identity\/generation/);
    expect(() => claimExecutionContinuationAtomicV2(root, ref, {
      ...claimInput,
      continuationDispatchRef: v2ContinuationDispatch(root, {
        identity: continuationIdentity,
        dispatchRequestId: `dreq-${'2'.repeat(64)}`,
        admissionReceiptDigest: v2Digest('0'),
        providerExecutionAttemptId: '33333333-3333-8333-8333-333333333333',
        providerStartReceiptRefDigest: v2Digest('e'),
        projectionFence: v2Digest('f'),
      }),
    })).toThrow(/Conflicting immutable/);
    expect(() => claimExecutionContinuationAtomicV2(root, ref, {
      ...claimInput,
      continuationDispatchRef: v2ContinuationDispatch(root, {
        identity: continuationIdentity,
        dispatchRequestId: `dreq-${'2'.repeat(64)}`,
        admissionReceiptDigest: v2Digest('d'),
        providerExecutionAttemptId: '33333333-3333-8333-8333-333333333333',
        providerStartReceiptRefDigest: v2Digest('0'),
        projectionFence: v2Digest('f'),
      }),
    })).toThrow(/Conflicting immutable/);
    expect(() => claimExecutionContinuationAtomicV2(root, ref, {
      ...claimInput,
      continuationDispatchRef: v2ContinuationDispatch(root, {
        identity: continuationIdentity,
        dispatchRequestId: `dreq-${'2'.repeat(64)}`,
        admissionReceiptDigest: v2Digest('d'),
        providerExecutionAttemptId: '33333333-3333-8333-8333-333333333333',
        providerStartReceiptRefDigest: v2Digest('e'),
        projectionFence: v2Digest('0'),
      }),
    })).toThrow(/Conflicting immutable/);
  });
});
