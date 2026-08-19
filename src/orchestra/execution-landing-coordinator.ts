import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { canonicalJson } from '../core/audit-writer.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import {
  createExecutionLandingContext,
  executionLandingContextRef,
  executionLandingDiskEvidenceRef,
  readExecutionLandingContext,
  writeExecutionLandingContextAtomic,
  writeExecutionLandingDiskEvidenceAtomic,
  type ExecutionLandingContextEnvelopeV1,
} from '../core/execution-landing-context.js';
import {
  createExecutionLandingCheckpoint,
  writeExecutionLandingCheckpointAtomic,
  type ExecutionLandingCheckpointEnvelopeV1,
  type ExecutionLandingCheckpointRefV1,
} from '../core/execution-landing-checkpoint.js';
import {
  buildExecutionLandingProposalPromptSegment,
  executionLandingProposalPath,
  EXECUTION_LANDING_PROPOSAL_MAX_BYTES,
  parseLandingProposalV2,
  readExecutionLandingProposal,
  writeExecutionLandingProposal,
} from '../core/execution-landing-proposal.js';
import { hasLiveUsageCeiling } from '../core/live-execution-budget.js';
import {
  taskResultSettlementActiveClaimDigest,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import type { Task } from '../core/task-types.js';
import type {
  RuntimeBudgetLandingEvidence,
  RuntimeBudgetUsageEvidence,
} from './runtime-budget-monitor.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function landingRef(ref: TaskResultSettlementRefV1): ExecutionLandingCheckpointRefV1 {
  return {
    schemaVersion: 1,
    projectId: ref.projectRootSha256,
    taskId: ref.taskId,
    attemptId: ref.attemptId,
  };
}

function acceptanceCriteria(task: Task): string {
  return [
    `GO:\n${task.goNogo.goCriteria}`,
    `NO-GO:\n${task.goNogo.noGoCriteria}`,
    `TECH-DEBT:\n${task.goNogo.techDebtAcceptable}`,
  ].join('\n\n');
}

export interface PreparedDockerExecutionLanding {
  prompt: string;
  context: ExecutionLandingContextEnvelopeV1 | null;
}

interface DockerLandingProposalEvidence {
  readonly proposalSha256: string;
  readonly observedMtime: string;
  readonly sequence: number;
  readonly semanticState: {
    readonly summary: string;
    readonly completedWork: string[];
    readonly remainingWork: string[];
    readonly nextAction: string;
    readonly unresolvedRisks: string[];
  };
}

/**
 * Docker workers may propose semantic progress, but never publish the durable
 * landing envelope themselves. The host validates the bounded proposal and
 * atomically re-publishes it with the exact settled attempt identity.
 */
function writeDockerLandingProposal(input: {
  readonly projectRoot: string;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly notBefore: string;
}): DockerLandingProposalEvidence {
  const path = executionLandingProposalPath(input.projectRoot, input.settlementRef.taskId);
  const stat = lstatSync(path);
  if (
    !stat.isFile()
    || stat.isSymbolicLink()
    || stat.size <= 0
    || stat.size > EXECUTION_LANDING_PROPOSAL_MAX_BYTES
  ) {
    throw createExecutionAuthorityError(
      'Docker execution landing proposal file is absent, unsafe, empty, or exceeds its byte ceiling',
    );
  }
  const notBeforeMs = Date.parse(input.notBefore);
  if (!Number.isFinite(notBeforeMs) || stat.mtimeMs + 1 < notBeforeMs) {
    throw createExecutionAuthorityError('Docker execution landing proposal file predates the current attempt');
  }

  const candidate = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  const semanticState = (
    candidate !== null
    && typeof candidate === 'object'
    && !Array.isArray(candidate)
    && (candidate as Record<string, unknown>).version === 2
  )
    ? parseLandingProposalV2(candidate)
    : readExecutionLandingProposal(input.projectRoot, {
        taskId: input.settlementRef.taskId,
        attemptId: input.settlementRef.attemptId,
        notBefore: input.notBefore,
      }).proposal;

  if (
    semanticState.taskId !== input.settlementRef.taskId
    || semanticState.attemptId !== input.settlementRef.attemptId
  ) {
    throw createExecutionAuthorityError(
      'Docker execution landing proposal conflicts with the host-owned settlement attempt',
    );
  }

  const written = writeExecutionLandingProposal(input.projectRoot, {
    version: 2,
    taskId: input.settlementRef.taskId,
    attemptId: input.settlementRef.attemptId,
    generation: 1,
    sequence: semanticState.sequence,
    resultReference: {
      taskId: input.settlementRef.taskId,
      attemptId: input.settlementRef.attemptId,
      generation: 1,
      relativePath: `.tasks/task-${input.settlementRef.taskId}.result`,
    },
    summary: semanticState.summary,
    completedWork: semanticState.completedWork,
    remainingWork: semanticState.remainingWork,
    nextAction: semanticState.nextAction,
    unresolvedRisks: semanticState.unresolvedRisks,
    updatedAt: semanticState.updatedAt,
  });
  return {
    proposalSha256: written.proposalSha256,
    observedMtime: written.observedMtime,
    sequence: semanticState.sequence,
    semanticState: {
      summary: semanticState.summary,
      completedWork: semanticState.completedWork,
      remainingWork: semanticState.remainingWork,
      nextAction: semanticState.nextAction,
      unresolvedRisks: semanticState.unresolvedRisks,
    },
  };
}

/**
 * Capture all worker-writable inputs before Docker gains access to the project
 * mount, persist them outside that mount, and front-load one attempt-bound T2
 * protocol before the primary task prompt.
 */
export function prepareDockerExecutionLanding(input: {
  projectRoot: string;
  task: Task;
  prompt: string;
  calledProvider: string;
  calledModel: string;
  auth: string;
  settlementRef: TaskResultSettlementRefV1;
  executionContinuation?: {
    readonly version: 1;
    readonly checkpointSha256: string;
    readonly parentAttemptId: string;
    readonly continuationAttemptId: string;
    readonly continuationFence: string;
  };
  /** Existing closed host protocol; selects a finite checkpoint cadence only. */
  terminalProtocol?: 'xverify-v1' | 'xverify-v2-host-only';
}): PreparedDockerExecutionLanding {
  const budgetPolicy = input.task.budgetPolicy;
  const policy = budgetPolicy?.landingPolicy;
  if (
    !policy
    || !hasLiveUsageCeiling(input.task.budget)
    || input.executionContinuation
  ) {
    return { prompt: input.prompt, context: null };
  }
  if (!input.task.type) {
    throw createExecutionAuthorityError(
      'Budget landing requires a canonical task kind before Docker dispatch',
    );
  }
  const policyDigest = budgetPolicy.policyDigest;
  if (!policyDigest) {
    throw createExecutionAuthorityError(
      'Budget landing requires an immutable execution policy digest',
    );
  }
  const mode = budgetPolicy.admissionMode;
  // 7094-F1a (owner-approved, 2026-08-19): the landing segment embeds a
  // per-attempt nonce (taskId + attemptId at ~byte 209), so placing it FIRST
  // broke the provider prompt-cache prefix for everything after it — the
  // byte-identical ~15.2KB skills/context block never got a cache hit
  // (measured, sprint-565 archive; Sol seal cross-verify-verdict:…f4e859).
  // The segment now rides AFTER the task prompt: same content, same host
  // enforcement (mtime barrier), stable-prefix-friendly order. The segment
  // carries its own protocol heading, so the old Primary-Task-Prompt divider
  // line is no longer emitted anywhere.
  const prompt = input.terminalProtocol === 'xverify-v2-host-only'
    ? input.prompt
    : `${input.prompt}\n\n${buildExecutionLandingProposalPromptSegment(
        input.task.id,
        input.settlementRef.attemptId,
        input.terminalProtocol === 'xverify-v1' ? 'finite-adjudication' : 'continuous',
      )}`;
  const requestedProvider = input.task.provider ?? input.calledProvider;
  const requestedModel = input.task.forceModel ?? input.task.model;
  const resolvedProvider = budgetPolicy.resolvedProvider === 'unknown'
    ? input.calledProvider
    : budgetPolicy.resolvedProvider;
  const fallbackReason = requestedProvider === input.calledProvider
    && requestedModel === input.calledModel
    ? null
    : `requested ${requestedProvider}/${requestedModel}; called ${input.calledProvider}/${input.calledModel}`;
  const context = createExecutionLandingContext(input.projectRoot, {
    ...landingRef(input.settlementRef),
    tenantId: input.task.actor?.tenantId ?? 'local',
    originalRequestDigest: sha256(prompt),
    taskDigest: sha256(canonicalJson(input.task)),
    role: budgetPolicy.role,
    kind: input.task.type,
    admissionMode: mode,
    approvalEvidenceRef: budgetPolicy.approvalEvidenceRef ?? null,
    identity: {
      configuredProvider: null,
      configuredModel: null,
      requestedProvider,
      requestedModel,
      resolvedProvider,
      resolvedModel: input.task.model,
      calledProvider: input.calledProvider,
      calledModel: input.calledModel,
      backend: 'docker',
      auth: input.auth,
      fallbackReason,
    },
    policyDigest,
    landingPolicy: { ...policy },
    hardBudget: { ...input.task.budget! },
    parentAttemptId: null,
    parentFence: null,
    parentCheckpointSha256: null,
    scope: {
      filesRead: [...input.task.scope.filesRead],
      filesWrite: [...input.task.scope.filesWrite],
    },
    acceptanceCriteria: acceptanceCriteria(input.task),
  });
  writeExecutionLandingContextAtomic(input.projectRoot, context);
  return { prompt, context };
}

export function stampDockerExecutionLandingCheckpoint(input: {
  projectRoot: string;
  settlementRef: TaskResultSettlementRefV1;
  landing: RuntimeBudgetLandingEvidence;
  terminalUsage: RuntimeBudgetUsageEvidence | null;
  landedAt?: string;
}): ExecutionLandingCheckpointEnvelopeV1 {
  const ref = landingRef(input.settlementRef);
  const contextEnvelope = readExecutionLandingContext(input.projectRoot, ref);
  const { context } = contextEnvelope;
  if (
    input.landing.taskId !== ref.taskId
    || input.landing.attemptId !== ref.attemptId
    || input.landing.projectId !== ref.projectId
  ) {
    throw createExecutionAuthorityError(
      'Runtime budget landing evidence does not match execution context',
    );
  }
  const terminalUsage = input.terminalUsage;
  if (
    !terminalUsage?.terminal
    || terminalUsage.projectId !== ref.projectId
    || terminalUsage.taskId !== ref.taskId
    || terminalUsage.attemptId !== ref.attemptId
    || terminalUsage.budgetFingerprint !== input.landing.budgetFingerprint
  ) {
    throw createExecutionAuthorityError(
      'Terminal runtime budget evidence does not match the exact landing attempt',
    );
  }
  if (
    terminalUsage.decision.state === 'exceeded'
    || terminalUsage.decision.state === 'unmeasurable'
  ) {
    throw createExecutionAuthorityError(
      `Terminal runtime budget state ${terminalUsage.decision.state} cannot mint LANDED`,
    );
  }
  for (const field of [
    'turns',
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheCreationTokens',
    'totalTokens',
    'maxContextTokens',
  ] as const) {
    if (terminalUsage.decision.counters[field] < input.landing.decision.counters[field]) {
      throw createExecutionAuthorityError(
        `Terminal runtime budget counter ${field} predates landing evidence`,
      );
    }
  }
  const proposalEnvelope = writeDockerLandingProposal({
    projectRoot: input.projectRoot,
    settlementRef: input.settlementRef,
    notBefore: context.preparedAt,
  });
  const diskEvidence = writeExecutionLandingDiskEvidenceAtomic(
    input.projectRoot,
    contextEnvelope,
    input.landing.requestedAt,
  );
  if (diskEvidence.changedPaths.length > 0) {
    if (proposalEnvelope.sequence < 2) {
      throw createExecutionAuthorityError(
        'Execution landing proposal did not advance after scoped disk changes',
      );
    }
    const proposalMtimeMs = Date.parse(proposalEnvelope.observedMtime);
    for (const changedPath of diskEvidence.changedPaths) {
      const absolutePath = resolve(input.projectRoot, changedPath);
      if (
        existsSync(absolutePath)
        && statSync(absolutePath).mtimeMs > proposalMtimeMs + 1
      ) {
        throw createExecutionAuthorityError(
          `Execution landing proposal predates scoped disk change: ${changedPath}`,
        );
      }
    }
  }
  const checkpoint = createExecutionLandingCheckpoint(input.projectRoot, {
    taskId: ref.taskId,
    attemptId: ref.attemptId,
    tenantId: context.tenantId,
    originalRequestDigest: context.originalRequestDigest,
    taskDigest: context.taskDigest,
    role: context.role,
    kind: context.kind,
    admissionMode: context.admissionMode,
    approvalEvidenceRef: context.approvalEvidenceRef,
    identity: context.identity,
    policyDigest: context.policyDigest,
    landingPolicy: context.landingPolicy,
    hardBudget: context.hardBudget,
    cumulativeUsage: terminalUsage.decision.counters,
    parentAttemptId: context.parentAttemptId,
    parentFence: context.parentFence,
    parentCheckpointSha256: context.parentCheckpointSha256,
    attemptFence: taskResultSettlementActiveClaimDigest(input.settlementRef),
    providerSequence: input.landing.providerSequence,
    semanticState: {
      summary: proposalEnvelope.semanticState.summary,
      completedWork: proposalEnvelope.semanticState.completedWork,
      remainingWork: proposalEnvelope.semanticState.remainingWork,
      nextAction: proposalEnvelope.semanticState.nextAction,
      unresolvedRisks: proposalEnvelope.semanticState.unresolvedRisks,
    },
    scope: context.scope,
    diskDiffRefs: [
      `scope-baseline:sha256:${diskEvidence.baseline.snapshotSha256}`,
      `scope-current:sha256:${diskEvidence.current.snapshotSha256}`,
      `scope-diff:sha256:${diskEvidence.diffSha256}`,
    ],
    evidenceRefs: [
      executionLandingContextRef(contextEnvelope),
      executionLandingDiskEvidenceRef(diskEvidence),
      `runtime-budget-landing:${input.landing.projectId}/${input.landing.taskId}/${input.landing.attemptId}`,
      `runtime-budget-terminal:${terminalUsage.projectId}/${terminalUsage.taskId}/${terminalUsage.attemptId}`,
      `worker-landing-proposal:sha256:${proposalEnvelope.proposalSha256}`,
    ],
    acceptanceCriteria: context.acceptanceCriteria,
    landingRequestedAt: input.landing.requestedAt,
    ...(input.landedAt ? { landedAt: input.landedAt } : {}),
  });
  writeExecutionLandingCheckpointAtomic(input.projectRoot, checkpoint);
  return checkpoint;
}
