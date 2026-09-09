import { describe, expect, it } from 'vitest';
import { assertExecutionCustodySubject, assertGoalSubjectMatchesReservation, custodySubjectKey, type GoalExecutionCustodySubjectV1 } from '../../src/core/execution-custody-subject.js';

const subject: GoalExecutionCustodySubjectV1 = {
  kind: 'goal', goalId: 'goal-1', missionId: 'mission-1', purpose: 'goal-authoring',
  round: 1, invocationId: 'invocation-1', attemptId: '11111111-1111-4111-8111-111111111111',
};
const reservation = { taskId: null, runId: subject.missionId, callId: 'goal-authoring:1', attemptId: subject.attemptId };
describe('ExecutionCustodySubjectV1', () => {
  it('preserves task bytes and derives goal custody from invocation identity', () => {
    expect(custodySubjectKey({ kind: 'task', taskId: 'task:α/path' })).toBe('task:α/path');
    expect(custodySubjectKey(subject)).toBe('\u0000goal-invocation:invocation-1');
    expect(custodySubjectKey(subject)).not.toBe(custodySubjectKey({ kind: 'task', taskId: 'goal-invocation:invocation-1' }));
    expect(() => custodySubjectKey({ kind: 'task', taskId: custodySubjectKey(subject) })).toThrow();
    expect(() => assertGoalSubjectMatchesReservation(subject, reservation)).not.toThrow();
  });
  it.each([null, {}, { kind: 'task', taskId: '' }, { kind: 'task', taskId: 'x', goalId: 'g' },
    { ...subject, round: 0 }, { ...subject, round: 1.5 }, { ...subject, round: Number.MAX_SAFE_INTEGER + 1 },
    { ...subject, purpose: 'worker' }, { ...subject, invocationId: ' x' }, { ...subject, attemptId: 'x\n' },
    { ...subject, taskId: 'fake' }, { ...subject, goalId: 1 },
  ])('rejects malformed or mixed identity %#', value => {
    expect(() => assertExecutionCustodySubject(value)).toThrow();
  });
  it.each([{ taskId: 'fake' }, { runId: 'other' }, { callId: 'goal-acceptance:1' }, { attemptId: 'other' }])(
    'rejects reservation mismatch %#', patch => {
      expect(() => assertGoalSubjectMatchesReservation(subject, { ...reservation, ...patch })).toThrow();
    },
  );
});
