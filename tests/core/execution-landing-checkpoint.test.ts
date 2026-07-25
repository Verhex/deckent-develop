import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  claimExecutionContinuationAtomic,
  createExecutionLandingCheckpoint,
  deriveRemainingExecutionBudget,
  executionAttemptRetirementPath,
  executionContinuationClaimPath,
  executionLandingCheckpointPath,
  listRetiredExecutionLandings,
  readExecutionAttemptRetirement,
  readExecutionContinuationClaim,
  readExecutionLandingCheckpoint,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
  type CreateExecutionLandingCheckpointInput,
  type ExecutionLandingCheckpointEnvelopeV1,
} from '../../src/core/execution-landing-checkpoint.js';

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
});
