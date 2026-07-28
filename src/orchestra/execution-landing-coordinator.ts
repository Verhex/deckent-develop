import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
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
  readExecutionLandingProposal,
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
  const prompt = input.terminalProtocol === 'xverify-v2-host-only'
    ? input.prompt
    : `${buildExecutionLandingProposalPromptSegment(
        input.task.id,
        input.settlementRef.attemptId,
        input.terminalProtocol === 'xverify-v1' ? 'finite-adjudication' : 'continuous',
      )}\n\n## Primary Task Prompt\n\n${input.prompt}`;
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
  const proposalEnvelope = readExecutionLandingProposal(input.projectRoot, {
    taskId: ref.taskId,
    attemptId: ref.attemptId,
    notBefore: context.preparedAt,
  });
  const diskEvidence = writeExecutionLandingDiskEvidenceAtomic(
    input.projectRoot,
    contextEnvelope,
    input.landing.requestedAt,
  );
  if (diskEvidence.changedPaths.length > 0) {
    if (proposalEnvelope.proposal.sequence < 2) {
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
      summary: proposalEnvelope.proposal.summary,
      completedWork: proposalEnvelope.proposal.completedWork,
      remainingWork: proposalEnvelope.proposal.remainingWork,
      nextAction: proposalEnvelope.proposal.nextAction,
      unresolvedRisks: proposalEnvelope.proposal.unresolvedRisks,
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
