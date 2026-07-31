import { createHash } from 'node:crypto';

import { canonicalJson } from '../core/audit-writer.js';
import {
  ApprovalBrokerError,
  isExpiredDecideResult,
  type ApprovalBroker,
  type ApprovalDecideResult,
} from '../core/approval-broker.js';
import type { ApprovalRequest } from '../core/approval-contract.js';
import type { ExecutionRecoveryOutcome } from '../core/execution-recovery.js';
import type {
  ExecutionRecoveryApproval,
  ExecutionRecoveryMutation,
  ExecutionRecoveryMutationResult,
  ExecutionRecoveryService,
  ExecutionRecoveryServiceIdentity,
  ExecutionRecoveryTarget,
} from '../orchestra/execution-recovery-service.js';

const ACTIONABLE_DECISIONS = [
  'STALLED',
  'ORPHANED',
  'PAUSED',
  'HELD',
] as const;

export interface RecoveryImpact {
  readonly code: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RecoveryNotificationInput<TNativeEvidence> {
  readonly target: ExecutionRecoveryTarget<TNativeEvidence>;
  readonly outcome: ExecutionRecoveryOutcome;
  readonly operation: ExecutionRecoveryMutation;
  readonly summary: string;
  readonly productImpact: RecoveryImpact;
  readonly dogfoodImpact: RecoveryImpact;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly tenantId: string;
  readonly userId: string;
}

export interface RecoveryNotificationProposal {
  readonly request: ApprovalRequest;
  readonly created: boolean;
  readonly decisionDigest: string;
  readonly idempotencyKey: string;
}

export type RecoveryNotificationResolution =
  | {
      readonly outcome: 'rejected' | 'expired';
      readonly decision: ApprovalDecideResult;
    }
  | {
      readonly outcome: 'accepted';
      readonly decision: ApprovalDecideResult;
      readonly recovery: ExecutionRecoveryMutationResult;
    };

interface RecoveryRequestBinding {
  readonly executionId: string;
  readonly generation: number;
  readonly taskId: string;
  readonly attemptId: string;
  readonly fenceToken: string;
  readonly decisionDigest: string;
  readonly operation: ExecutionRecoveryMutation;
  readonly idempotencyKey: string;
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function isBoundedCode(value: string): boolean {
  return value.length > 0
    && value.length <= 128
    && /^[a-z0-9][a-z0-9._:-]*$/u.test(value);
}

function operationAllowed(
  outcome: ExecutionRecoveryOutcome,
  operation: ExecutionRecoveryMutation,
): boolean {
  const expected = {
    resume: 'RESUME_EXACT_ATTEMPT',
    settle: 'FINALIZE_EXACT_ATTEMPT',
    abort: 'ABORT_EXACT_ATTEMPT',
    terminate: 'TERMINATE_EXACT_ATTEMPT',
  } as const;
  return outcome.allowedNextOperations.includes(expected[operation]);
}

function bindingFor<TNativeEvidence>(
  input: RecoveryNotificationInput<TNativeEvidence>,
): RecoveryRequestBinding {
  const material = {
    identity: input.target.identity,
    mode: input.target.mode,
    platform: input.target.platform,
    decision: input.outcome.decision,
    reasonCodes: input.outcome.reasonCodes,
    evidenceDigests: input.outcome.evidenceRefs.map(ref => digest(ref)),
    operation: input.operation,
    productImpact: input.productImpact,
    dogfoodImpact: input.dogfoodImpact,
  };
  const decisionDigest = digest(material);
  return {
    executionId: input.target.identity.executionId,
    generation: input.target.identity.generation,
    taskId: input.target.identity.taskId,
    attemptId: input.target.identity.attemptId,
    fenceToken: input.target.identity.fenceToken,
    decisionDigest,
    operation: input.operation,
    idempotencyKey: digest({
      kind: 'execution-recovery',
      decisionDigest,
      operation: input.operation,
    }),
  };
}

function bindingFromRequest(request: ApprovalRequest): RecoveryRequestBinding | null {
  const details = request.details;
  const candidate = {
    executionId: details.executionId,
    generation: details.generation,
    taskId: details.taskId,
    attemptId: details.attemptId,
    fenceToken: details.fenceToken,
    decisionDigest: details.decisionDigest,
    operation: details.operation,
    idempotencyKey: details.idempotencyKey,
  };
  if (
    typeof candidate.executionId !== 'string'
    || typeof candidate.generation !== 'number'
    || typeof candidate.taskId !== 'string'
    || typeof candidate.attemptId !== 'string'
    || typeof candidate.fenceToken !== 'string'
    || typeof candidate.decisionDigest !== 'string'
    || typeof candidate.idempotencyKey !== 'string'
    || !['resume', 'settle', 'abort', 'terminate'].includes(String(candidate.operation))
  ) {
    return null;
  }
  return candidate as RecoveryRequestBinding;
}

function sameBinding(
  left: RecoveryRequestBinding,
  right: RecoveryRequestBinding,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function proposeRecoveryNotification<TNativeEvidence>(
  broker: ApprovalBroker,
  input: RecoveryNotificationInput<TNativeEvidence>,
): RecoveryNotificationProposal {
  if (!ACTIONABLE_DECISIONS.includes(
    input.outcome.decision as (typeof ACTIONABLE_DECISIONS)[number],
  ) || !operationAllowed(input.outcome, input.operation)) {
    throw new Error('Recovery outcome does not authorize the requested operation');
  }
  if (
    !isBoundedCode(input.productImpact.code)
    || !isBoundedCode(input.dogfoodImpact.code)
  ) {
    throw new Error('Recovery impact codes must be bounded machine-readable values');
  }

  const binding = bindingFor(input);
  const id = `recovery-${binding.decisionDigest.slice(0, 24)}`;
  const requestInput = {
    id,
    requester: { role: 'nervous' as const, instanceId: 'execution-recovery' },
    summary: input.summary,
    details: {
      ...binding,
      mode: input.target.mode,
      platform: input.target.platform,
      decision: input.outcome.decision,
      reasonCodes: [...input.outcome.reasonCodes],
      evidenceDigests: input.outcome.evidenceRefs.map(ref => digest(ref)),
      productImpact: input.productImpact,
      dogfoodImpact: input.dogfoodImpact,
    },
    scopeId: input.target.identity.executionId,
    scope: 'lifecycle' as const,
    risk: input.productImpact.severity === 'critical'
      || input.dogfoodImpact.severity === 'critical'
      ? 'critical' as const
      : 'high' as const,
    policy: 'require-approval' as const,
    defaultAction: 'defer' as const,
    tenantId: input.tenantId,
    userId: input.userId,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    maskedArgs: {
      operation: input.operation,
      executionId: input.target.identity.executionId,
      generation: input.target.identity.generation,
    },
    rawArgsRef: null,
  };

  try {
    return {
      request: broker.submit(requestInput),
      created: true,
      decisionDigest: binding.decisionDigest,
      idempotencyKey: binding.idempotencyKey,
    };
  } catch (error) {
    if (!(error instanceof ApprovalBrokerError) || error.code !== 'APR_DUPLICATE_ID') {
      throw error;
    }
    const existing = broker.getRequest(id);
    const existingBinding = existing ? bindingFromRequest(existing) : null;
    if (!existing || !existingBinding || !sameBinding(existingBinding, binding)) {
      throw error;
    }
    return {
      request: existing,
      created: false,
      decisionDigest: binding.decisionDigest,
      idempotencyKey: binding.idempotencyKey,
    };
  }
}

export async function resolveRecoveryNotification<TNativeEvidence>(
  broker: ApprovalBroker,
  service: ExecutionRecoveryService,
  requestId: string,
  resolution: 'accepted' | 'rejected',
  target: ExecutionRecoveryTarget<TNativeEvidence>,
  expectedSequence: number,
  actor: { readonly id: string; readonly channel: string; readonly reason?: string },
  now: Date = new Date(),
): Promise<RecoveryNotificationResolution> {
  const request = broker.getRequest(requestId);
  const binding = request ? bindingFromRequest(request) : null;
  if (!request || !binding) throw new Error('Recovery approval binding is unavailable');

  const expectedIdentity: ExecutionRecoveryServiceIdentity = target.identity;
  if (
    binding.executionId !== expectedIdentity.executionId
    || binding.generation !== expectedIdentity.generation
    || binding.taskId !== expectedIdentity.taskId
    || binding.attemptId !== expectedIdentity.attemptId
    || binding.fenceToken !== expectedIdentity.fenceToken
  ) {
    throw new Error('Recovery approval identity does not match the exact target');
  }

  const decision = broker.decideChecked(requestId, {
    decision: resolution === 'accepted' ? 'allow' : 'deny',
    decidedBy: actor.id,
    channel: actor.channel,
    decidedAt: now.toISOString(),
    reason: actor.reason ?? '',
  }, now);
  if (isExpiredDecideResult(decision)) {
    return { outcome: 'expired', decision };
  }
  if (resolution === 'rejected') {
    return { outcome: 'rejected', decision };
  }

  const approval: ExecutionRecoveryApproval = {
    approvalRef: `approval:${requestId}:${decision.decidedAt}`,
    operation: binding.operation,
    identity: target.identity,
    idempotencyKey: binding.idempotencyKey,
    leaseFence: target.identity.fenceToken,
  };
  return {
    outcome: 'accepted',
    decision,
    recovery: await service.mutate(
      target,
      binding.operation,
      approval,
      expectedSequence,
    ),
  };
}
