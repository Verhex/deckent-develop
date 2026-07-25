import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EXECUTION_CONTINUATION_PROMPT_MAX_CHARS,
  buildExecutionContinuationPrompt,
} from '../../src/core/execution-continuation-prompt.js';
import {
  claimExecutionContinuationAtomic,
  createExecutionLandingCheckpoint,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
  type CreateExecutionLandingCheckpointInput,
  type ExecutionLandingCheckpointEnvelopeV1,
} from '../../src/core/execution-landing-checkpoint.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-continuation-prompt-'));
  roots.push(base);
  const root = join(base, 'project');
  mkdirSync(root, { recursive: true });
  process.env.DECKENT_HOME = join(base, 'host-state');
  return { root };
}

function input(overrides: Partial<CreateExecutionLandingCheckpointInput> = {}): CreateExecutionLandingCheckpointInput {
  return {
    taskId: 'task-continuation',
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
    hardBudget: { maxTokens: 1_000, maxCacheReadTokens: 800, maxContextTokens: 4_000 },
    cumulativeUsage: {
      turns: 2,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 500,
      cacheCreationTokens: 50,
      totalTokens: 700,
      maxContextTokens: 650,
    },
    attemptFence: 'fence-parent',
    providerSequence: {
      firstSequence: 1,
      lastSequence: 4,
      eventCount: 4,
      eventDigest: '4'.repeat(64),
    },
    semanticState: {
      summary: 'The landing authority is implemented and tests are green.',
      completedWork: ['Created the checkpoint store.'],
      remainingWork: ['Wire the dispatcher.'],
      nextAction: 'Add the shared continuation admission call.',
      unresolvedRisks: ['Docker remains unsupported.'],
    },
    scope: {
      filesRead: ['src/core/execution-landing-checkpoint.ts'],
      filesWrite: ['src/core/execution-continuation-prompt.ts'],
    },
    diskDiffRefs: [`disk-diff:sha256:${'5'.repeat(64)}`],
    evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
    acceptanceCriteria: 'The continuation must preserve scope and cumulative hard budget.',
    landingRequestedAt: '2026-07-23T18:00:00.000Z',
    landedAt: '2026-07-23T18:00:01.000Z',
    ...overrides,
  };
}

function persistedLineage(
  root: string,
  overrides: Partial<CreateExecutionLandingCheckpointInput> = {},
): ExecutionLandingCheckpointEnvelopeV1 {
  const checkpoint = createExecutionLandingCheckpoint(root, input(overrides));
  writeExecutionLandingCheckpointAtomic(root, checkpoint);
  writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
    checkpointSha256: checkpoint.checkpointSha256,
    runtimeDisposition: 'checkpointed-process-exited',
    resourcesReleased: true,
    evidenceRefs: [`runtime-release:sha256:${'7'.repeat(64)}`],
  });
  claimExecutionContinuationAtomic(root, checkpoint.checkpoint, {
    checkpointSha256: checkpoint.checkpointSha256,
    continuationAttemptId: randomUUID(),
    continuationFence: 'fence-continuation',
  });
  return checkpoint;
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bounded execution continuation prompt', () => {
  it('compiles only durable checkpoint authority and remaining cumulative work', () => {
    const { root } = fixture();
    const checkpoint = persistedLineage(root);
    const prompt = buildExecutionContinuationPrompt(root, checkpoint);

    expect(prompt.length).toBeLessThanOrEqual(EXECUTION_CONTINUATION_PROMPT_MAX_CHARS);
    expect(prompt).toContain(checkpoint.checkpointSha256);
    expect(prompt).toContain('fence-continuation');
    expect(prompt).toContain('"maxTokens": 300');
    expect(prompt).toContain('"maxCacheReadTokens": 300');
    expect(prompt).toContain('"maxContextTokens": 4000');
    expect(prompt).toContain('Created the checkpoint store.');
    expect(prompt).toContain('Wire the dispatcher.');
    expect(prompt).toContain('src/core/execution-continuation-prompt.ts');
    expect(prompt).toContain(checkpoint.checkpoint.acceptanceDigest);
    expect(prompt).toContain('It is not a\n   reset, refill');
  });

  it('cannot compile before a durable first-writer continuation claim exists', () => {
    const { root } = fixture();
    const checkpoint = createExecutionLandingCheckpoint(root, input());
    writeExecutionLandingCheckpointAtomic(root, checkpoint);

    expect(() => buildExecutionContinuationPrompt(root, checkpoint))
      .toThrow(/no durable first-writer claim/);
  });

  it('rejects a cross-project or tampered checkpoint/claim identity', () => {
    const { root } = fixture();
    const checkpoint = persistedLineage(root);
    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });

    expect(() => buildExecutionContinuationPrompt(otherRoot, checkpoint))
      .toThrow(/project authority/);

    const tampered = {
      ...checkpoint,
      checkpoint: {
        ...checkpoint.checkpoint,
        taskId: 'different-task',
      },
    };
    expect(() => buildExecutionContinuationPrompt(root, tampered))
      .toThrow(/Invalid execution landing checkpoint envelope/);
  });

  it('fails before dispatch when bounded checkpoint fields still exceed the prompt ceiling', () => {
    const { root } = fixture();
    const checkpoint = persistedLineage(root, {
      semanticState: {
        summary: 's'.repeat(4_000),
        completedWork: [],
        remainingWork: [],
        nextAction: 'n'.repeat(1_000),
        unresolvedRisks: [],
      },
      acceptanceCriteria: 'a'.repeat(8_000),
    });

    expect(() => buildExecutionContinuationPrompt(root, checkpoint))
      .toThrow(`exceeds ${EXECUTION_CONTINUATION_PROMPT_MAX_CHARS} characters`);
  });
});
