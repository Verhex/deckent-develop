import type { ProviderLimitReservation } from './provider-limit-truth.js';

export interface GoalExecutionCustodySubjectV1 {
  readonly kind: 'goal';
  readonly goalId: string;
  readonly missionId: string;
  readonly purpose: 'goal-authoring' | 'goal-acceptance';
  readonly round: number;
  readonly invocationId: string;
  readonly attemptId: string;
}

export type ExecutionCustodySubjectV1 =
  | { readonly kind: 'task'; readonly taskId: string }
  | GoalExecutionCustodySubjectV1;

export class ExecutionCustodySubjectError extends Error {
  readonly code = 'INVALID_INPUT';
}

function validIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512
    && value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function assertExecutionCustodySubject(value: unknown): asserts value is ExecutionCustodySubjectV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExecutionCustodySubjectError('Execution custody subject must be an object');
  }
  const subject = value as Record<string, unknown>;
  const fields = subject.kind === 'task' ? ['kind', 'taskId']
    : ['kind', 'goalId', 'missionId', 'purpose', 'round', 'invocationId', 'attemptId'];
  if (Object.keys(subject).length !== fields.length
    || Object.keys(subject).some(key => !fields.includes(key))
    || (subject.kind !== 'task' && subject.kind !== 'goal')
    || (subject.kind === 'task' ? !validIdentity(subject.taskId)
      : !validIdentity(subject.goalId) || !validIdentity(subject.missionId)
        || !validIdentity(subject.invocationId) || !validIdentity(subject.attemptId)
        || !['goal-authoring', 'goal-acceptance'].includes(subject.purpose as string)
        || !Number.isSafeInteger(subject.round) || (subject.round as number) < 1)) {
    throw new ExecutionCustodySubjectError('Execution custody subject is not canonical');
  }
}

export function custodySubjectKey(subject: ExecutionCustodySubjectV1): string {
  assertExecutionCustodySubject(subject);
  // NUL cannot occur in a canonical task identity, so task bytes remain
  // unchanged while goal keys occupy a disjoint hash/evidence domain.
  return subject.kind === 'task' ? subject.taskId : `\u0000goal-invocation:${subject.invocationId}`;
}

export function assertGoalSubjectMatchesReservation(
  subject: ExecutionCustodySubjectV1,
  reservation: Pick<ProviderLimitReservation, 'taskId' | 'runId' | 'callId' | 'attemptId'>,
): asserts subject is GoalExecutionCustodySubjectV1 {
  assertExecutionCustodySubject(subject);
  if (subject.kind !== 'goal' || reservation.taskId !== null
    || reservation.runId !== subject.missionId
    || reservation.callId !== `${subject.purpose}:${subject.round}`
    || reservation.attemptId !== subject.attemptId) {
    throw new ExecutionCustodySubjectError('Goal custody subject does not match the reservation');
  }
}
